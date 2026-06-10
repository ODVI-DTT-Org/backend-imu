/**
 * Releases By Loan Type Report Handler
 *
 * Two sheets: "Releases" (row-level) and "By Loan Type" (aggregate).
 * SQL lifted verbatim from GET /api/reports/releases-by-loan-type.
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';
import { caravanNickname, formatCaravanFullName, formatClientName } from '../../../utils/name-format.js';

export interface ReleasesByLoanTypeParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  loanType?: string;
  productType?: string;
}

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateReleasesByLoanTypeReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: ReleasesByLoanTypeParams,
  onProgress?: ProgressCallback
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string; rowCount: number }> {
  const now = new Date();
  const endDate =
    params.endDate ?? now.toISOString().split('T')[0];
  const startDate =
    params.startDate ??
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

  const queryParams: any[] = [];
  let paramIndex = 1;

  let whereClause = 'WHERE r.visit_id IS NOT NULL';
  whereClause += ` AND r.created_at >= $${paramIndex++}`;
  queryParams.push(startDate);
  whereClause += ` AND r.created_at <= $${paramIndex++}`;
  queryParams.push(endDate + 'T23:59:59.999Z');

  if (params.userId) {
    whereClause += ` AND r.user_id = $${paramIndex++}`;
    queryParams.push(params.userId);
  }

  if (params.loanType) {
    whereClause += ` AND r.loan_type = $${paramIndex++}`;
    queryParams.push(params.loanType);
  }

  if (params.productType) {
    whereClause += ` AND r.product_type = $${paramIndex++}`;
    queryParams.push(params.productType);
  }

  await onProgress?.(5, 'Preparing query…');

  const itemsSql = `
    SELECT
      r.id,
      r.created_at                                 AS released_at,
      r.reference_number,
      cl.first_name                                AS cl_first_name,
      cl.middle_name                               AS cl_middle_name,
      cl.last_name                                 AS cl_last_name,
      cl.ext_name                                  AS cl_ext_name,
      cl.phone                                     AS client_phone,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      cl.municipality                              AS client_municipality,
      cl.province                                  AS client_province,
      u.first_name                                 AS u_first_name,
      u.middle_name                                AS u_middle_name,
      u.last_name                                  AS u_last_name,
      r.loan_type,
      r.product_type,
      r.udi_number,
      r.status,
      r.approved_at,
      r.approval_notes,
      r.remarks,
      (
        SELECT COUNT(*)
        FROM touchpoints t
        WHERE t.client_id = r.client_id
          AND t.created_at <= r.created_at
      )                                            AS touchpoints_before_release
    FROM releases r
    JOIN clients cl ON cl.id = r.client_id
    JOIN users u ON u.id = r.user_id
    ${whereClause}
    ORDER BY released_at DESC
  `;

  await onProgress?.(20, 'Fetching data…');
  const result = await pool.query(itemsSql, queryParams);
  await onProgress?.(60, 'Processing rows…');

  const mappedRows = result.rows.map((row) => ({
    ...row,
    client_name: formatClientName({ first_name: row.cl_first_name, middle_name: row.cl_middle_name, last_name: row.cl_last_name, ext_name: row.cl_ext_name }),
    caravan: caravanNickname({ first_name: row.u_first_name, last_name: row.u_last_name }),
    caravan_name: formatCaravanFullName({ first_name: row.u_first_name, middle_name: row.u_middle_name, last_name: row.u_last_name }),
  }));

  // Build by_loan_type aggregate in-memory (same logic as the GET endpoint)
  const byLoanType: Record<
    string,
    { loan_type: string; count: number; avg_touchpoints_before_release: number }
  > = {};
  for (const row of mappedRows) {
    const lt = row.loan_type || 'unknown';
    if (!byLoanType[lt]) {
      byLoanType[lt] = { loan_type: lt, count: 0, avg_touchpoints_before_release: 0 };
    }
    byLoanType[lt].count += 1;
    byLoanType[lt].avg_touchpoints_before_release +=
      Number(row.touchpoints_before_release) || 0;
  }
  for (const lt of Object.keys(byLoanType)) {
    const entry = byLoanType[lt];
    entry.avg_touchpoints_before_release =
      entry.count > 0
        ? Math.round((entry.avg_touchpoints_before_release / entry.count) * 100) / 100
        : 0;
  }

  // rowCount = individual release rows (the primary sheet)
  const rowCount = mappedRows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `releases-by-loan-type-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Releases',
        columns: [
          { header: 'Released At',                key: 'released_at',                width: 22 },
          { header: 'Reference Number',           key: 'reference_number',           width: 20 },
          { header: 'Client Name',                key: 'client_name',                width: 28 },
          { header: 'Client Phone',               key: 'client_phone',               width: 16 },
          { header: 'Client Agency',              key: 'client_agency',              width: 28 },
          { header: 'Pension Type',               key: 'pension_type',               width: 16 },
          { header: 'Market Type',                key: 'market_type',                width: 16 },
          { header: 'Client Municipality',        key: 'client_municipality',        width: 20 },
          { header: 'Client Province',            key: 'client_province',            width: 20 },
          { header: 'Caravan',                    key: 'caravan',                    width: 16 },
          { header: 'Caravan Name',               key: 'caravan_name',               width: 28 },
          { header: 'Loan Type',                  key: 'loan_type',                  width: 16 },
          { header: 'Product Type',               key: 'product_type',               width: 16 },
          { header: 'UDI Number',                 key: 'udi_number',                 width: 18 },
          { header: 'Status',                     key: 'status',                     width: 14 },
          { header: 'Approved At',                key: 'approved_at',                width: 22 },
          { header: 'Approval Notes',             key: 'approval_notes',             width: 30 },
          { header: 'Remarks',                    key: 'remarks',                    width: 30 },
          { header: 'Touchpoints Before Release', key: 'touchpoints_before_release', width: 28 },
        ],
        rows: mappedRows,
      },
      {
        name: 'By Loan Type',
        columns: [
          { header: 'Loan Type',                          key: 'loan_type',                         width: 20 },
          { header: 'Count',                               key: 'count',                             width: 12 },
          { header: 'Avg Touchpoints Before Release',      key: 'avg_touchpoints_before_release',    width: 32 },
        ],
        rows: Object.values(byLoanType),
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
