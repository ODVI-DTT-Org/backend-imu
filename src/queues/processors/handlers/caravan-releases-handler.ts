/**
 * Caravan Releases Report Handler
 *
 * Releases originating from a caravan visit (r.visit_id IS NOT NULL).
 * SQL lifted verbatim from GET /api/reports/caravan-releases.
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface CaravanReleasesParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  productType?: string;
  loanType?: string;
  status?: string;
}

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateCaravanReleasesReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: CaravanReleasesParams,
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

  if (params.productType) {
    whereClause += ` AND r.product_type = $${paramIndex++}`;
    queryParams.push(params.productType);
  }

  if (params.loanType) {
    whereClause += ` AND r.loan_type = $${paramIndex++}`;
    queryParams.push(params.loanType);
  }

  if (params.status) {
    whereClause += ` AND r.status = $${paramIndex++}`;
    queryParams.push(params.status);
  }

  await onProgress?.(5, 'Preparing query…');

  const sql = `
    SELECT
      r.created_at,
      r.reference_number,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      cl.phone                                     AS client_phone,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      u.first_name || ' ' || u.last_name           AS agent_name,
      r.product_type,
      r.loan_type,
      r.udi_number,
      r.status,
      r.approved_at,
      r.approval_notes,
      r.remarks,
      v.time_in                                    AS visit_time_in,
      v.time_out                                   AS visit_time_out,
      v.reason                                     AS visit_reason,
      v.status                                     AS visit_status,
      v.remarks                                    AS visit_remarks,
      v.address                                    AS visit_address,
      v.barangay                                   AS visit_barangay,
      v.municipality                               AS visit_municipality,
      v.province                                   AS visit_province,
      v.region                                     AS visit_region,
      v.latitude                                   AS visit_latitude,
      v.longitude                                  AS visit_longitude,
      v.odometer_departure,
      v.odometer_arrival,
      v.kilometers_traveled
    FROM releases r
    JOIN clients cl ON cl.id = r.client_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN visits v ON v.id = r.visit_id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  await onProgress?.(20, 'Fetching data…');
  const result = await pool.query(sql, queryParams);
  await onProgress?.(60, 'Processing rows…');

  const rowCount = result.rows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `caravan-releases-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Caravan Releases',
        columns: [
          { header: 'Created At',           key: 'created_at',          width: 22 },
          { header: 'Reference Number',     key: 'reference_number',    width: 20 },
          { header: 'Client Name',          key: 'client_name',         width: 28 },
          { header: 'Client Phone',         key: 'client_phone',        width: 16 },
          { header: 'Client Agency',        key: 'client_agency',       width: 28 },
          { header: 'Pension Type',         key: 'pension_type',        width: 16 },
          { header: 'Market Type',          key: 'market_type',         width: 16 },
          { header: 'Agent Name',           key: 'agent_name',          width: 28 },
          { header: 'Product Type',         key: 'product_type',        width: 16 },
          { header: 'Loan Type',            key: 'loan_type',           width: 16 },
          { header: 'UDI Number',           key: 'udi_number',          width: 18 },
          { header: 'Status',               key: 'status',              width: 14 },
          { header: 'Approved At',          key: 'approved_at',         width: 22 },
          { header: 'Approval Notes',       key: 'approval_notes',      width: 30 },
          { header: 'Remarks',              key: 'remarks',             width: 30 },
          { header: 'Visit Time In',        key: 'visit_time_in',       width: 22 },
          { header: 'Visit Time Out',       key: 'visit_time_out',      width: 22 },
          { header: 'Visit Reason',         key: 'visit_reason',        width: 20 },
          { header: 'Visit Status',         key: 'visit_status',        width: 14 },
          { header: 'Visit Remarks',        key: 'visit_remarks',       width: 30 },
          { header: 'Visit Address',        key: 'visit_address',       width: 40 },
          { header: 'Visit Barangay',       key: 'visit_barangay',      width: 20 },
          { header: 'Visit Municipality',   key: 'visit_municipality',  width: 20 },
          { header: 'Visit Province',       key: 'visit_province',      width: 20 },
          { header: 'Visit Region',         key: 'visit_region',        width: 16 },
          { header: 'Visit Latitude',       key: 'visit_latitude',      width: 14 },
          { header: 'Visit Longitude',      key: 'visit_longitude',     width: 14 },
          { header: 'Odometer Departure',   key: 'odometer_departure',  width: 20 },
          { header: 'Odometer Arrival',     key: 'odometer_arrival',    width: 18 },
          { header: 'KM Traveled',          key: 'kilometers_traveled', width: 14 },
        ],
        rows: result.rows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
