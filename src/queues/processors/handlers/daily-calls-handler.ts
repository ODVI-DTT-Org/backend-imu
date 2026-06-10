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
import { caravanNickname, formatCaravanFullName, formatClientName } from '../../../utils/name-format.js';

export interface DailyCallsParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  /** Filter to agents belonging to these group IDs (via group_role_members caravan role). */
  group_ids?: string[];
  /** Filter to these specific user IDs. */
  user_ids?: string[];
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

  // Normalize filters: null means "no filter" (include all)
  const groupIds = params.group_ids?.length ? params.group_ids : null;
  const userIds  = params.user_ids?.length  ? params.user_ids  : null;

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

  // Team filter: EXISTS to avoid JOIN multiplication (users may have multiple grm rows)
  if (groupIds) {
    whereClause += ` AND EXISTS (
      SELECT 1 FROM group_role_members grm
      WHERE grm.user_id = c.user_id
        AND grm.role_in_group = 'caravan'
        AND grm.deleted_at IS NULL
        AND grm.group_id = ANY($${paramIndex++}::uuid[])
    )`;
    queryParams.push(groupIds);
  }

  // Individual user filter
  if (userIds) {
    whereClause += ` AND c.user_id = ANY($${paramIndex++}::uuid[])`;
    queryParams.push(userIds);
  }

  await onProgress?.(5, 'Preparing query…');

  // Sheet 1: aggregate counts per agent per day — raw name parts for JS formatting
  const aggregateSql = `
    SELECT
      date(c.dial_time)                            AS call_date,
      c.user_id,
      u.first_name                                 AS u_first_name,
      u.middle_name                                AS u_middle_name,
      u.last_name                                  AS u_last_name,
      u.role,
      COUNT(DISTINCT c.id)                                     AS call_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.type = 'release_loan')  AS release_call_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.type = 'regular_call')  AS regular_call_count
    FROM calls c
    JOIN users u ON u.id = c.user_id
    ${whereClause}
    GROUP BY date(c.dial_time), c.user_id, u.first_name, u.middle_name, u.last_name, u.role
    ORDER BY call_date DESC, u.last_name, u.first_name
  `;

  // Sheet 2: one row per call with full detail — raw name parts for JS formatting
  const detailSql = `
    SELECT
      date(c.dial_time)                            AS call_date,
      c.dial_time,
      c.duration,
      u.first_name                                 AS u_first_name,
      u.middle_name                                AS u_middle_name,
      u.last_name                                  AS u_last_name,
      u.role,
      cl.first_name                                AS c_first_name,
      cl.middle_name                               AS c_middle_name,
      cl.last_name                                 AS c_last_name,
      cl.ext_name                                  AS c_ext_name,
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
    ORDER BY c.dial_time DESC, u.last_name, u.first_name
  `;

  await onProgress?.(20, 'Fetching data…');
  const [aggregateResult, detailResult] = await Promise.all([
    pool.query(aggregateSql, queryParams),
    pool.query(detailSql, queryParams),
  ]);
  await onProgress?.(60, 'Processing rows…');

  // Map raw name parts to formatted display names
  const aggregateRows = aggregateResult.rows.map(r => ({
    ...r,
    caravan:      caravanNickname({ first_name: r.u_first_name, last_name: r.u_last_name }),
    caravan_name: formatCaravanFullName({ first_name: r.u_first_name, middle_name: r.u_middle_name, last_name: r.u_last_name }),
  }));

  const detailRows = detailResult.rows.map(r => ({
    ...r,
    caravan:      caravanNickname({ first_name: r.u_first_name, last_name: r.u_last_name }),
    caravan_name: formatCaravanFullName({ first_name: r.u_first_name, middle_name: r.u_middle_name, last_name: r.u_last_name }),
    client_name:  formatClientName({ first_name: r.c_first_name, middle_name: r.c_middle_name, last_name: r.c_last_name, ext_name: r.c_ext_name }),
  }));

  // rowCount reflects the detail (per-call) sheet as the primary data set
  const rowCount = detailRows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-calls-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Aggregate',
        columns: [
          { header: 'Call Date',            key: 'call_date',           width: 14 },
          { header: 'Caravan',              key: 'caravan',             width: 18 },
          { header: 'Caravan Name',         key: 'caravan_name',        width: 30 },
          { header: 'Role',                 key: 'role',                width: 14 },
          { header: 'Call Count',           key: 'call_count',          width: 14 },
          { header: 'Regular Call Count',   key: 'regular_call_count',  width: 20 },
          { header: 'Release Call Count',   key: 'release_call_count',  width: 20 },
        ],
        rows: aggregateRows,
      },
      {
        name: 'Per Call',
        columns: [
          { header: 'Call Date',      key: 'call_date',           width: 14 },
          { header: 'Dial Time',      key: 'dial_time',           width: 22 },
          { header: 'Duration (s)',   key: 'duration',            width: 14 },
          { header: 'Caravan',        key: 'caravan',             width: 18 },
          { header: 'Caravan Name',   key: 'caravan_name',        width: 30 },
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
        rows: detailRows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
