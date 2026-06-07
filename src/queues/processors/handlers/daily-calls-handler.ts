/**
 * Daily Calls Report Handler
 *
 * Sheet 1 "Daily Aggregate": call counts per agent per day (tele touchpoints).
 * Sheet 2 "Per Call": one row per call with full client/agent detail.
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

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateDailyCallsReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: DailyCallsParams,
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
  whereClause += ` AND c.dial_time >= $${paramIndex++}`;
  queryParams.push(startDate);
  whereClause += ` AND c.dial_time <= $${paramIndex++}`;
  queryParams.push(endDate + 'T23:59:59.999Z');

  if (params.userId) {
    whereClause += ` AND c.user_id = $${paramIndex++}`;
    queryParams.push(params.userId);
  }

  await onProgress?.(5, 'Preparing query…');

  // Sheet 1: aggregate counts per agent per day
  const aggregateSql = `
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

  // Sheet 2: one row per call with full detail
  const detailSql = `
    SELECT
      date(c.dial_time)                            AS call_date,
      c.dial_time,
      c.duration,
      u.first_name || ' ' || u.last_name           AS agent_name,
      u.role,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      c.phone_number,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      cl.product_type                              AS client_product_type,
      c.type                                       AS call_type,
      c.reason,
      c.status,
      c.remarks,
      c.notes,
      c.source
    FROM calls c
    JOIN users u ON u.id = c.user_id
    JOIN clients cl ON cl.id = c.client_id
    ${whereClause}
    ORDER BY c.dial_time DESC, agent_name
  `;

  await onProgress?.(20, 'Fetching data…');
  const [aggregateResult, detailResult] = await Promise.all([
    pool.query(aggregateSql, queryParams),
    pool.query(detailSql, queryParams),
  ]);
  await onProgress?.(60, 'Processing rows…');

  // rowCount reflects the detail (per-call) sheet as the primary data set
  const rowCount = detailResult.rows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-calls-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Aggregate',
        columns: [
          { header: 'Call Date',            key: 'call_date',           width: 14 },
          { header: 'Agent Name',           key: 'agent_name',          width: 28 },
          { header: 'Role',                 key: 'role',                width: 14 },
          { header: 'Call Count',           key: 'call_count',          width: 14 },
          { header: 'Regular Call Count',   key: 'regular_call_count',  width: 20 },
          { header: 'Release Call Count',   key: 'release_call_count',  width: 20 },
        ],
        rows: aggregateResult.rows,
      },
      {
        name: 'Per Call',
        columns: [
          { header: 'Call Date',      key: 'call_date',           width: 14 },
          { header: 'Dial Time',      key: 'dial_time',           width: 22 },
          { header: 'Duration (s)',   key: 'duration',            width: 14 },
          { header: 'Agent Name',     key: 'agent_name',          width: 28 },
          { header: 'Role',           key: 'role',                width: 14 },
          { header: 'Client Name',    key: 'client_name',         width: 28 },
          { header: 'Phone Number',   key: 'phone_number',        width: 16 },
          { header: 'Client Agency',  key: 'client_agency',       width: 28 },
          { header: 'Pension Type',   key: 'pension_type',        width: 16 },
          { header: 'Market Type',    key: 'market_type',         width: 16 },
          { header: 'Product Type',   key: 'client_product_type', width: 16 },
          { header: 'Call Type',      key: 'call_type',           width: 16 },
          { header: 'Reason',         key: 'reason',              width: 20 },
          { header: 'Status',         key: 'status',              width: 14 },
          { header: 'Remarks',        key: 'remarks',             width: 30 },
          { header: 'Notes',          key: 'notes',               width: 30 },
          { header: 'Source',         key: 'source',              width: 16 },
        ],
        rows: detailResult.rows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
