/**
 * Tele Releases Report Handler
 *
 * Releases originating from a tele call (r.call_id IS NOT NULL).
 * SQL lifted verbatim from GET /api/reports/tele-releases.
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface TeleReleasesParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  productType?: string;
  loanType?: string;
  status?: string;
}

export async function generateTeleReleasesReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: TeleReleasesParams
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

  let whereClause = 'WHERE r.call_id IS NOT NULL';
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
      ca.phone_number                              AS phone_number,
      ca.dial_time                                 AS dial_time,
      ca.duration                                  AS duration
    FROM releases r
    JOIN clients cl ON cl.id = r.client_id
    JOIN users u ON u.id = r.user_id
    LEFT JOIN calls ca ON ca.id = r.call_id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  const result = await pool.query(sql, queryParams);

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `tele-releases-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Tele Releases',
        columns: [
          { header: 'Created At',    key: 'created_at',   width: 22 },
          { header: 'Client Name',   key: 'client_name',  width: 28 },
          { header: 'Agent Name',    key: 'agent_name',   width: 28 },
          { header: 'Product Type',  key: 'product_type', width: 16 },
          { header: 'Loan Type',     key: 'loan_type',    width: 16 },
          { header: 'UDI Number',    key: 'udi_number',   width: 18 },
          { header: 'Status',        key: 'status',       width: 14 },
          { header: 'Phone Number',  key: 'phone_number', width: 18 },
          { header: 'Dial Time',     key: 'dial_time',    width: 22 },
          { header: 'Duration',      key: 'duration',     width: 12 },
        ],
        rows: result.rows,
      },
    ],
  });
}
