/**
 * Daily Visits Report Handler
 *
 * Aggregate visit counts per agent per day (caravan touchpoints).
 * SQL lifted verbatim from GET /api/reports/daily-visits (aggregate branch).
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface DailyVisitsParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateDailyVisitsReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: DailyVisitsParams,
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

  let whereClause = 'WHERE 1=1';
  whereClause += ` AND v.time_in >= $${paramIndex++}`;
  queryParams.push(startDate);
  whereClause += ` AND v.time_in <= $${paramIndex++}`;
  queryParams.push(endDate + 'T23:59:59.999Z');

  if (params.userId) {
    whereClause += ` AND v.user_id = $${paramIndex++}`;
    queryParams.push(params.userId);
  }

  await onProgress?.(5, 'Preparing query…');

  const sql = `
    SELECT
      date(v.time_in)                              AS visit_date,
      v.user_id,
      u.first_name || ' ' || u.last_name           AS agent_name,
      u.role,
      COUNT(*)                                     AS visit_count,
      COUNT(*) FILTER (WHERE v.type = 'release_loan')   AS release_visit_count,
      COUNT(*) FILTER (WHERE v.type = 'regular_visit')  AS regular_visit_count
    FROM visits v
    JOIN users u ON u.id = v.user_id
    ${whereClause}
    GROUP BY date(v.time_in), v.user_id, u.first_name, u.last_name, u.role
    ORDER BY visit_date DESC, agent_name
  `;

  await onProgress?.(20, 'Fetching data…');
  const result = await pool.query(sql, queryParams);
  await onProgress?.(60, 'Processing rows…');

  const rowCount = result.rows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-visits-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Visits',
        columns: [
          { header: 'Visit Date',            key: 'visit_date',           width: 14 },
          { header: 'Agent Name',            key: 'agent_name',           width: 28 },
          { header: 'Role',                  key: 'role',                 width: 14 },
          { header: 'Visit Count',           key: 'visit_count',          width: 14 },
          { header: 'Regular Visit Count',   key: 'regular_visit_count',  width: 20 },
          { header: 'Release Visit Count',   key: 'release_visit_count',  width: 20 },
        ],
        rows: result.rows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
