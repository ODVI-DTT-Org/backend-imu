/**
 * Daily Calls Report Handler
 *
 * Aggregate call counts per agent per day (tele touchpoints).
 * SQL lifted verbatim from GET /api/reports/daily-calls (aggregate branch).
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface DailyCallsParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export async function generateDailyCallsReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: DailyCallsParams
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

  let whereClause = 'WHERE 1=1';
  whereClause += ` AND c.dial_time >= $${paramIndex++}`;
  queryParams.push(startDate);
  whereClause += ` AND c.dial_time <= $${paramIndex++}`;
  queryParams.push(endDate + 'T23:59:59.999Z');

  if (params.userId) {
    whereClause += ` AND c.user_id = $${paramIndex++}`;
    queryParams.push(params.userId);
  }

  const sql = `
    SELECT
      date(c.dial_time)                            AS call_date,
      c.user_id,
      u.first_name || ' ' || u.last_name           AS agent_name,
      u.role,
      COUNT(*)                                     AS call_count,
      COUNT(*) FILTER (WHERE c.type = 'release_loan')  AS release_call_count,
      COUNT(*) FILTER (WHERE c.type = 'regular_call')  AS regular_call_count
    FROM calls c
    JOIN users u ON u.id = c.user_id
    ${whereClause}
    GROUP BY date(c.dial_time), c.user_id, u.first_name, u.last_name, u.role
    ORDER BY call_date DESC, agent_name
  `;

  const result = await pool.query(sql, queryParams);

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-calls-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Calls',
        columns: [
          { header: 'Call Date',            key: 'call_date',           width: 14 },
          { header: 'Agent Name',           key: 'agent_name',          width: 28 },
          { header: 'Role',                 key: 'role',                width: 14 },
          { header: 'Call Count',           key: 'call_count',          width: 14 },
          { header: 'Regular Call Count',   key: 'regular_call_count',  width: 20 },
          { header: 'Release Call Count',   key: 'release_call_count',  width: 20 },
        ],
        rows: result.rows,
      },
    ],
  });
}
