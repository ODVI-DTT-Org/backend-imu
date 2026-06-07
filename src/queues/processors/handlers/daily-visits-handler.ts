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

  // Sheet 1: aggregate counts per agent per day
  const aggregateSql = `
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

  // Sheet 2: one row per visit with full detail
  const detailSql = `
    SELECT
      date(v.time_in)                              AS visit_date,
      v.time_in,
      v.time_out,
      u.first_name || ' ' || u.last_name           AS agent_name,
      u.role,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      cl.phone                                     AS client_phone,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      cl.product_type                              AS client_product_type,
      v.type                                       AS visit_type,
      v.reason,
      v.status,
      v.address,
      v.barangay,
      v.municipality,
      v.province,
      v.region,
      v.latitude,
      v.longitude,
      v.odometer_departure,
      v.odometer_arrival,
      v.kilometers_traveled,
      v.remarks,
      v.notes,
      v.source
    FROM visits v
    JOIN users u ON u.id = v.user_id
    JOIN clients cl ON cl.id = v.client_id
    ${whereClause}
    ORDER BY v.time_in DESC, agent_name
  `;

  await onProgress?.(20, 'Fetching data…');
  const [aggregateResult, detailResult] = await Promise.all([
    pool.query(aggregateSql, queryParams),
    pool.query(detailSql, queryParams),
  ]);
  await onProgress?.(60, 'Processing rows…');

  // rowCount reflects the detail (per-visit) sheet as the primary data set
  const rowCount = detailResult.rows.length;
  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `daily-visits-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Daily Aggregate',
        columns: [
          { header: 'Visit Date',            key: 'visit_date',           width: 14 },
          { header: 'Agent Name',            key: 'agent_name',           width: 28 },
          { header: 'Role',                  key: 'role',                 width: 14 },
          { header: 'Visit Count',           key: 'visit_count',          width: 14 },
          { header: 'Regular Visit Count',   key: 'regular_visit_count',  width: 20 },
          { header: 'Release Visit Count',   key: 'release_visit_count',  width: 20 },
        ],
        rows: aggregateResult.rows,
      },
      {
        name: 'Per Visit',
        columns: [
          { header: 'Visit Date',           key: 'visit_date',           width: 14 },
          { header: 'Time In',              key: 'time_in',              width: 22 },
          { header: 'Time Out',             key: 'time_out',             width: 22 },
          { header: 'Agent Name',           key: 'agent_name',           width: 28 },
          { header: 'Role',                 key: 'role',                 width: 14 },
          { header: 'Client Name',          key: 'client_name',          width: 28 },
          { header: 'Client Phone',         key: 'client_phone',         width: 16 },
          { header: 'Client Agency',        key: 'client_agency',        width: 28 },
          { header: 'Pension Type',         key: 'pension_type',         width: 16 },
          { header: 'Market Type',          key: 'market_type',          width: 16 },
          { header: 'Product Type',         key: 'client_product_type',  width: 16 },
          { header: 'Visit Type',           key: 'visit_type',           width: 16 },
          { header: 'Reason',               key: 'reason',               width: 20 },
          { header: 'Status',               key: 'status',               width: 14 },
          { header: 'Address',              key: 'address',              width: 40 },
          { header: 'Barangay',             key: 'barangay',             width: 20 },
          { header: 'Municipality',         key: 'municipality',         width: 20 },
          { header: 'Province',             key: 'province',             width: 20 },
          { header: 'Region',               key: 'region',               width: 16 },
          { header: 'Latitude',             key: 'latitude',             width: 14 },
          { header: 'Longitude',            key: 'longitude',            width: 14 },
          { header: 'Odometer Departure',   key: 'odometer_departure',   width: 20 },
          { header: 'Odometer Arrival',     key: 'odometer_arrival',     width: 18 },
          { header: 'KM Traveled',          key: 'kilometers_traveled',  width: 14 },
          { header: 'Remarks',              key: 'remarks',              width: 30 },
          { header: 'Notes',               key: 'notes',                width: 30 },
          { header: 'Source',               key: 'source',               width: 16 },
        ],
        rows: detailResult.rows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
