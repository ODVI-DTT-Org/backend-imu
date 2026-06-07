/**
 * Odometer Report Handler
 *
 * Two sheets: "Daily Totals" (per agent per day) and "Per Visit" (raw visit rows).
 * SQL lifted verbatim from GET /api/reports/odometer.
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface OdometerParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateOdometerReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: OdometerParams,
  onProgress?: ProgressCallback
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
  whereClause += ` AND v.time_in >= $${paramIndex++}`;
  queryParams.push(startDate);
  whereClause += ` AND v.time_in <= $${paramIndex++}`;
  queryParams.push(endDate + 'T23:59:59.999Z');

  if (params.userId) {
    whereClause += ` AND v.user_id = $${paramIndex++}`;
    queryParams.push(params.userId);
  }

  await onProgress?.(5, 'Preparing query…');

  // Per-visit detail — caravan-first ordering so a single agent's visits stay
  // grouped together; within an agent, newest first.
  const detailSql = `
    SELECT
      v.id,
      date(v.time_in)                              AS visit_date,
      u.first_name || ' ' || u.last_name           AS agent_name,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      v.odometer_departure,
      v.odometer_arrival,
      v.kilometers_traveled,
      NULLIF(v.odometer_arrival, '')::numeric
        - NULLIF(v.odometer_departure, '')::numeric AS estimated_km
    FROM visits v
    JOIN users u ON u.id = v.user_id
    JOIN clients cl ON cl.id = v.client_id
    ${whereClause}
    ORDER BY agent_name ASC, v.time_in DESC
  `;

  // Daily breakdown — caravan-first ordering so each agent's days stay together.
  const dailySql = `
    SELECT
      v.user_id,
      u.first_name || ' ' || u.last_name           AS agent_name,
      date(v.time_in)                              AS visit_date,
      COUNT(*)                                     AS visit_count,
      SUM(
        COALESCE(
          NULLIF(v.kilometers_traveled, '')::numeric,
          NULLIF(v.odometer_arrival, '')::numeric
            - NULLIF(v.odometer_departure, '')::numeric,
          0
        )
      )                                            AS total_km
    FROM visits v
    JOIN users u ON u.id = v.user_id
    ${whereClause}
    GROUP BY v.user_id, u.first_name, u.last_name, date(v.time_in)
    ORDER BY agent_name ASC, visit_date DESC
  `;

  // Per-caravan totals across the whole date range — one row per agent.
  const caravanTotalsSql = `
    SELECT
      v.user_id,
      u.first_name || ' ' || u.last_name           AS agent_name,
      COUNT(DISTINCT date(v.time_in))              AS days_active,
      COUNT(*)                                     AS visit_count,
      SUM(
        COALESCE(
          NULLIF(v.kilometers_traveled, '')::numeric,
          NULLIF(v.odometer_arrival, '')::numeric
            - NULLIF(v.odometer_departure, '')::numeric,
          0
        )
      )                                            AS total_km
    FROM visits v
    JOIN users u ON u.id = v.user_id
    ${whereClause}
    GROUP BY v.user_id, u.first_name, u.last_name
    ORDER BY total_km DESC NULLS LAST, agent_name ASC
  `;

  await onProgress?.(20, 'Fetching data…');
  const [detailResult, dailyResult, caravanResult] = await Promise.all([
    pool.query(detailSql, queryParams),
    pool.query(dailySql, queryParams),
    pool.query(caravanTotalsSql, queryParams),
  ]);
  await onProgress?.(60, 'Processing rows…');

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `odometer-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Per Caravan Totals',
        columns: [
          { header: 'Agent Name',  key: 'agent_name',  width: 28 },
          { header: 'Days Active', key: 'days_active', width: 14 },
          { header: 'Visit Count', key: 'visit_count', width: 14 },
          { header: 'Total KM',    key: 'total_km',    width: 14 },
        ],
        rows: caravanResult.rows,
      },
      {
        name: 'Daily Totals',
        columns: [
          { header: 'Agent Name',    key: 'agent_name',   width: 28 },
          { header: 'Visit Date',    key: 'visit_date',   width: 14 },
          { header: 'Visit Count',   key: 'visit_count',  width: 14 },
          { header: 'Total KM',      key: 'total_km',     width: 14 },
        ],
        rows: dailyResult.rows,
      },
      {
        name: 'Per Visit',
        columns: [
          { header: 'Agent Name',          key: 'agent_name',          width: 28 },
          { header: 'Visit Date',          key: 'visit_date',          width: 14 },
          { header: 'Client Name',         key: 'client_name',         width: 28 },
          { header: 'Odometer Departure',  key: 'odometer_departure',  width: 20 },
          { header: 'Odometer Arrival',    key: 'odometer_arrival',    width: 18 },
          { header: 'KM Traveled',         key: 'kilometers_traveled', width: 14 },
          { header: 'Estimated KM',        key: 'estimated_km',        width: 14 },
        ],
        rows: detailResult.rows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return r; });
}
