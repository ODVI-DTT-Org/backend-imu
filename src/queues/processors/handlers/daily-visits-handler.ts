/**
 * Daily Visits Report Handler
 *
 * Sheet 1 "Daily Aggregate": visit counts per agent per day (caravan touchpoints).
 * Sheet 2 "Per Visit": one row per visit with full client/agent detail.
 * SQL lifted verbatim from GET /api/reports/daily-visits (aggregate branch).
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';
import { caravanNickname, formatCaravanFullName, formatClientName } from '../../../utils/name-format.js';

export interface DailyVisitsParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  /** Filter to agents belonging to these group IDs (via group_role_members caravan role). */
  group_ids?: string[];
  /** Filter to these specific user IDs. */
  user_ids?: string[];
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

  // Normalize filters: null means "no filter" (include all)
  const groupIds = params.group_ids?.length ? params.group_ids : null;
  const userIds  = params.user_ids?.length  ? params.user_ids  : null;

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

  // Team filter: EXISTS to avoid JOIN multiplication (users may have multiple grm rows)
  if (groupIds) {
    whereClause += ` AND EXISTS (
      SELECT 1 FROM group_role_members grm
      WHERE grm.user_id = v.user_id
        AND grm.role_in_group = 'caravan'
        AND grm.deleted_at IS NULL
        AND grm.group_id = ANY($${paramIndex++}::uuid[])
    )`;
    queryParams.push(groupIds);
  }

  // Individual user filter
  if (userIds) {
    whereClause += ` AND v.user_id = ANY($${paramIndex++}::uuid[])`;
    queryParams.push(userIds);
  }

  await onProgress?.(5, 'Preparing query…');

  // Sheet 1: aggregate counts per agent per day — raw name parts for JS formatting
  const aggregateSql = `
    SELECT
      date(v.time_in)                              AS visit_date,
      v.user_id,
      u.first_name                                 AS u_first_name,
      u.middle_name                                AS u_middle_name,
      u.last_name                                  AS u_last_name,
      COALESCE(g.name, 'UNASSIGNED')               AS team_name,
      COUNT(DISTINCT v.id)                                     AS visit_count,
      COUNT(DISTINCT v.id) FILTER (WHERE v.type = 'release_loan')   AS release_visit_count,
      COUNT(DISTINCT v.id) FILTER (WHERE v.type = 'regular_visit')  AS regular_visit_count
    FROM visits v
    JOIN users u ON u.id = v.user_id
    LEFT JOIN group_role_members grm
           ON grm.user_id = u.id AND grm.role_in_group = 'caravan' AND grm.deleted_at IS NULL
    LEFT JOIN groups g ON g.id = grm.group_id
    ${whereClause}
    GROUP BY date(v.time_in), v.user_id, u.first_name, u.middle_name, u.last_name, g.name
    ORDER BY visit_date DESC, u.last_name, u.first_name
  `;

  // Sheet 2: one row per visit with full detail — raw name parts for JS formatting
  const detailSql = `
    SELECT
      date(v.time_in)                              AS visit_date,
      v.created_at,
      v.time_in,
      v.time_out,
      u.first_name                                 AS u_first_name,
      u.middle_name                                AS u_middle_name,
      u.last_name                                  AS u_last_name,
      COALESCE(g.name, 'UNASSIGNED')               AS team_name,
      cl.first_name                                AS c_first_name,
      cl.middle_name                               AS c_middle_name,
      cl.last_name                                 AS c_last_name,
      cl.ext_name                                  AS c_ext_name,
      cl.phone                                     AS client_phone,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      cl.product_type                              AS client_product_type,
      v.type                                       AS visit_type,
      tr.label                                     AS touchpoint_reason,
      tr.category                                  AS touchpoint_category,
      v.status,
      v.address,
      v.barangay,
      v.municipality,
      v.province,
      v.odometer_departure,
      v.odometer_arrival,
      v.kilometers_traveled,
      v.remarks
    FROM visits v
    JOIN users u ON u.id = v.user_id
    JOIN clients cl ON cl.id = v.client_id
    LEFT JOIN group_role_members grm
           ON grm.user_id = u.id AND grm.role_in_group = 'caravan' AND grm.deleted_at IS NULL
    LEFT JOIN groups g ON g.id = grm.group_id
    LEFT JOIN touchpoint_reasons tr
           ON tr.reason_code = v.reason
          AND tr.touchpoint_type = 'Visit'
    ${whereClause}
    ORDER BY v.time_in DESC, u.last_name, u.first_name
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

  // rowCount reflects the detail (per-visit) sheet as the primary data set
  const rowCount = detailRows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-visits-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Aggregate',
        columns: [
          { header: 'Visit Date',            key: 'visit_date',           width: 14 },
          { header: 'Caravan',               key: 'caravan',              width: 18 },
          { header: 'Caravan Name',          key: 'caravan_name',         width: 30 },
          { header: 'Team Name',             key: 'team_name',            width: 20 },
          { header: 'Visit Count',           key: 'visit_count',          width: 14 },
          { header: 'Regular Visit Count',   key: 'regular_visit_count',  width: 20 },
          { header: 'Release Visit Count',   key: 'release_visit_count',  width: 20 },
        ],
        rows: aggregateRows,
      },
      {
        name: 'Per Visit',
        columns: [
          { header: 'Visit Date',            key: 'visit_date',           width: 14 },
          { header: 'Created At',            key: 'created_at',           width: 22 },
          { header: 'Time In',               key: 'time_in',              width: 22 },
          { header: 'Time Out',              key: 'time_out',             width: 22 },
          { header: 'Caravan',               key: 'caravan',              width: 18 },
          { header: 'Caravan Name',          key: 'caravan_name',         width: 30 },
          { header: 'Team Name',             key: 'team_name',            width: 20 },
          { header: 'Client Name',           key: 'client_name',          width: 28 },
          { header: 'Client Phone',          key: 'client_phone',         width: 16 },
          { header: 'Client Agency',         key: 'client_agency',        width: 28 },
          { header: 'Pension Type',          key: 'pension_type',         width: 16 },
          { header: 'Market Type',           key: 'market_type',          width: 16 },
          { header: 'Product Type',          key: 'client_product_type',  width: 16 },
          { header: 'Visit Type',            key: 'visit_type',           width: 16 },
          { header: 'Touchpoint Reason',     key: 'touchpoint_reason',    width: 28 },
          { header: 'Touchpoint Category',   key: 'touchpoint_category',  width: 20 },
          { header: 'Status',                key: 'status',               width: 14 },
          { header: 'Address',               key: 'address',              width: 40 },
          { header: 'Barangay',              key: 'barangay',             width: 20 },
          { header: 'Municipality',          key: 'municipality',         width: 20 },
          { header: 'Province',              key: 'province',             width: 20 },
          { header: 'Odometer Departure',    key: 'odometer_departure',   width: 20 },
          { header: 'Odometer Arrival',      key: 'odometer_arrival',     width: 18 },
          { header: 'KM Traveled',           key: 'kilometers_traveled',  width: 14 },
          { header: 'Remarks',               key: 'remarks',              width: 30 },
        ],
        rows: detailRows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
