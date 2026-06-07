/**
 * Touchpoints to Loan Release Report Handler
 *
 * Three sheets:
 *   "Releases"     — per-release rows with Visit / Call / Total counts before release
 *   "Distribution" — bucketed counts of touchpoints_before_release (0–6, 7+)
 *   "By Loan Type" — aggregate averages per loan type
 *
 * The shadow touchpoint (rejection_reason = 'Loan Release') is excluded from all counts.
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';

export interface TouchpointsToReleaseParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  loanType?: string;
  productType?: string;
}

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateTouchpointsToReleaseReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: TouchpointsToReleaseParams,
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

  if (params.loanType) {
    whereClause += ` AND r.loan_type = $${paramIndex++}`;
    queryParams.push(params.loanType);
  }

  if (params.productType) {
    whereClause += ` AND r.product_type = $${paramIndex++}`;
    queryParams.push(params.productType);
  }

  await onProgress?.(5, 'Preparing query…');

  const itemsSql = `
    SELECT
      r.id,
      r.created_at                                 AS released_at,
      r.reference_number,
      cl.first_name || ' ' || cl.last_name         AS client_name,
      cl.phone                                     AS client_phone,
      cl.agency_name                               AS client_agency,
      cl.pension_type,
      cl.market_type,
      cl.municipality                              AS client_municipality,
      cl.province                                  AS client_province,
      u.first_name || ' ' || u.last_name           AS agent_name,
      r.loan_type,
      r.product_type,
      r.udi_number,
      r.status,
      (SELECT MIN(t.created_at) FROM touchpoints t
        WHERE t.client_id = r.client_id
          AND t.created_at <= r.created_at
          AND COALESCE(t.rejection_reason, '') <> 'Loan Release')           AS first_touchpoint_at,
      (SELECT COUNT(*) FROM touchpoints t
        WHERE t.client_id = r.client_id
          AND t.created_at <= r.created_at
          AND COALESCE(t.rejection_reason, '') <> 'Loan Release'
          AND t.type = 'Visit')                                              AS visits_before_release,
      (SELECT COUNT(*) FROM touchpoints t
        WHERE t.client_id = r.client_id
          AND t.created_at <= r.created_at
          AND COALESCE(t.rejection_reason, '') <> 'Loan Release'
          AND t.type = 'Call')                                               AS calls_before_release,
      (SELECT COUNT(*) FROM touchpoints t
        WHERE t.client_id = r.client_id
          AND t.created_at <= r.created_at
          AND COALESCE(t.rejection_reason, '') <> 'Loan Release')            AS touchpoints_before_release
    FROM releases r
    JOIN clients cl ON cl.id = r.client_id
    JOIN users u ON u.id = r.user_id
    ${whereClause}
    ORDER BY released_at DESC
  `;

  await onProgress?.(20, 'Fetching data…');
  const result = await pool.query(itemsSql, queryParams);
  await onProgress?.(60, 'Processing rows…');

  // Add computed days_to_release column
  const rows = result.rows.map((row) => {
    const releasedAt: Date | null = row.released_at ? new Date(row.released_at) : null;
    const firstTouchpointAt: Date | null = row.first_touchpoint_at ? new Date(row.first_touchpoint_at) : null;
    let daysToRelease: number | null = null;
    if (releasedAt && firstTouchpointAt) {
      const msPerDay = 24 * 60 * 60 * 1000;
      daysToRelease = Math.floor((releasedAt.getTime() - firstTouchpointAt.getTime()) / msPerDay);
      if (daysToRelease < 0) daysToRelease = 0;
    }
    return { ...row, days_to_release: daysToRelease };
  });

  // Build distribution — 0,1,2,3,4,5,6,7+ buckets
  const bucketLabels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const bucketCounts: Record<string, number> = {};
  for (const label of bucketLabels) bucketCounts[label] = 0;

  for (const row of rows) {
    const n = Number(row.touchpoints_before_release) || 0;
    const label = n >= 7 ? '7+' : String(n);
    bucketCounts[label] = (bucketCounts[label] || 0) + 1;
  }

  const total = rows.length;
  const distributionRows = bucketLabels.map((label) => {
    const count = bucketCounts[label] ?? 0;
    return {
      touchpoints_before_release: label,
      release_count: count,
      pct_of_releases: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    };
  });

  // Build by-loan-type aggregate in-memory
  const byLoanType: Record<
    string,
    {
      loan_type: string;
      count: number;
      sum_touchpoints: number;
      sum_visits: number;
      sum_calls: number;
      sum_days: number;
      days_count: number;
    }
  > = {};

  for (const row of rows) {
    const lt = row.loan_type || 'unknown';
    if (!byLoanType[lt]) {
      byLoanType[lt] = { loan_type: lt, count: 0, sum_touchpoints: 0, sum_visits: 0, sum_calls: 0, sum_days: 0, days_count: 0 };
    }
    byLoanType[lt].count += 1;
    byLoanType[lt].sum_touchpoints += Number(row.touchpoints_before_release) || 0;
    byLoanType[lt].sum_visits += Number(row.visits_before_release) || 0;
    byLoanType[lt].sum_calls += Number(row.calls_before_release) || 0;
    if (row.days_to_release !== null) {
      byLoanType[lt].sum_days += row.days_to_release;
      byLoanType[lt].days_count += 1;
    }
  }

  const byLoanTypeRows = Object.values(byLoanType).map((entry) => ({
    loan_type: entry.loan_type,
    count: entry.count,
    avg_touchpoints_before_release:
      entry.count > 0 ? Math.round((entry.sum_touchpoints / entry.count) * 100) / 100 : 0,
    avg_visits_before_release:
      entry.count > 0 ? Math.round((entry.sum_visits / entry.count) * 100) / 100 : 0,
    avg_calls_before_release:
      entry.count > 0 ? Math.round((entry.sum_calls / entry.count) * 100) / 100 : 0,
    avg_days_to_release:
      entry.days_count > 0 ? Math.round((entry.sum_days / entry.days_count) * 100) / 100 : null,
  }));

  const rowCount = rows.length;

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `touchpoints-to-release-${startDate}-${endDate}`,
    sheets: [
      {
        name: 'Releases',
        columns: [
          { header: 'Released At',                key: 'released_at',                width: 22 },
          { header: 'Reference Number',           key: 'reference_number',           width: 20 },
          { header: 'Client Name',                key: 'client_name',                width: 28 },
          { header: 'Client Phone',               key: 'client_phone',               width: 16 },
          { header: 'Client Agency',              key: 'client_agency',              width: 28 },
          { header: 'Pension Type',               key: 'pension_type',               width: 16 },
          { header: 'Market Type',                key: 'market_type',                width: 16 },
          { header: 'Client Municipality',        key: 'client_municipality',        width: 20 },
          { header: 'Client Province',            key: 'client_province',            width: 20 },
          { header: 'Agent Name',                 key: 'agent_name',                 width: 28 },
          { header: 'Loan Type',                  key: 'loan_type',                  width: 16 },
          { header: 'Product Type',               key: 'product_type',               width: 16 },
          { header: 'UDI Number',                 key: 'udi_number',                 width: 18 },
          { header: 'Status',                     key: 'status',                     width: 14 },
          { header: 'First Touchpoint At',        key: 'first_touchpoint_at',        width: 22 },
          { header: 'Days to Release',            key: 'days_to_release',            width: 16 },
          { header: 'Visits Before Release',      key: 'visits_before_release',      width: 22 },
          { header: 'Calls Before Release',       key: 'calls_before_release',       width: 22 },
          { header: 'Touchpoints Before Release', key: 'touchpoints_before_release', width: 28 },
        ],
        rows,
      },
      {
        name: 'Distribution',
        columns: [
          { header: 'Touchpoints Before Release', key: 'touchpoints_before_release', width: 28 },
          { header: 'Release Count',              key: 'release_count',              width: 16 },
          { header: '% of Releases',              key: 'pct_of_releases',            width: 16 },
        ],
        rows: distributionRows,
      },
      {
        name: 'By Loan Type',
        columns: [
          { header: 'Loan Type',                          key: 'loan_type',                        width: 20 },
          { header: 'Count',                              key: 'count',                            width: 12 },
          { header: 'Avg Touchpoints Before Release',     key: 'avg_touchpoints_before_release',   width: 32 },
          { header: 'Avg Visits Before Release',          key: 'avg_visits_before_release',        width: 28 },
          { header: 'Avg Calls Before Release',           key: 'avg_calls_before_release',         width: 28 },
          { header: 'Avg Days to Release',                key: 'avg_days_to_release',              width: 22 },
        ],
        rows: byLoanTypeRows,
      },
    ],
  }).then(async (r) => { await onProgress?.(80, 'Uploading…'); return { ...r, rowCount }; });
}
