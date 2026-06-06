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

export async function generateCaravanReleasesReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: CaravanReleasesParams
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string }> {
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

  const sql = `
    SELECT
      r.id,
      r.created_at,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      u.first_name || ' ' || u.last_name           AS agent_name,
      r.product_type,
      r.loan_type,
      r.udi_number,
      r.status,
      v.time_in                                    AS visit_time_in,
      v.address                                    AS visit_address
    FROM releases r
    JOIN clients cl ON cl.id = r.client_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN visits v ON v.id = r.visit_id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  const result = await pool.query(sql, queryParams);

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `caravan-releases-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Caravan Releases',
        columns: [
          { header: 'Created At',      key: 'created_at',     width: 22 },
          { header: 'Client Name',     key: 'client_name',    width: 28 },
          { header: 'Agent Name',      key: 'agent_name',     width: 28 },
          { header: 'Product Type',    key: 'product_type',   width: 16 },
          { header: 'Loan Type',       key: 'loan_type',      width: 16 },
          { header: 'UDI Number',      key: 'udi_number',     width: 18 },
          { header: 'Status',          key: 'status',         width: 14 },
          { header: 'Visit Time In',   key: 'visit_time_in',  width: 22 },
          { header: 'Visit Address',   key: 'visit_address',  width: 40 },
        ],
        rows: result.rows,
      },
    ],
  });
}
