/**
 * Client Pipeline Category Report Handler
 *
 * Generates a per-client pivot table showing the pipeline category
 * (existing / favorable / others / blank) for each calendar month in
 * the requested range.
 *
 * Columns:  Client Name | <Month 1> | <Month 2> | … | <Month N>
 * One row per client who has at least one Visit touchpoint anywhere in the range.
 * A month with no visit entry is left blank (not null/undefined).
 */

import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { generateSimpleXlsxReport } from './simple-report-helper.js';
import { formatClientName } from '../../../utils/name-format.js';
import type { ProgressCallback } from './daily-visits-handler.js';

// ---------------------------------------------------------------------------
// INTERESTED_REASONS — mirrors the list in dashboard-market-saturation.ts.
// All comparisons are done lowercase; values here are already lowercase.
// ---------------------------------------------------------------------------
const INTERESTED_REASONS_LOWER = [
  'interested',
  'loan inquiry',
  'for processing / approval / request',
  'for processing/approval/request',
  'for verification',
  'for update',
  'for ada authentication',
  'apply for pusu membership',
  'ci/bi',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM-DD" → Date at local midnight (avoids UTC-shift on timezone offsets). */
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight, no UTC shift
}

/** Parse "YYYY-MM" → Date at midnight local (first day of month). */
function firstDayOfMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Last day of a calendar month given its first-day Date. */
function lastDayOfMonth(first: Date): Date {
  return new Date(first.getFullYear(), first.getMonth() + 1, 0);
}

/** "YYYY-MM-DD" string from a Date. */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Format a month header, e.g. "Jan 2026". */
function formatMonthHeader(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Build a sorted list of "YYYY-MM" strings covering [startYM, endYM] inclusive. */
function buildMonthRange(startYM: string, endYM: string): string[] {
  const months: string[] = [];
  let [y, m] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ClientPipelineCategoryParams {
  startMonth?: string; // "YYYY-MM"
  endMonth?: string;   // "YYYY-MM"
}

interface TouchpointEntry {
  type: string;
  date: string; // "YYYY-MM-DD"
  visit?: { reason?: string };
}

interface ClientRow {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  ext_name: string | null;
  loan_released: boolean;
  loan_released_at: string | null; // date string or null
  touchpoint_summary: TouchpointEntry[] | null;
}

export async function generateClientPipelineCategoryReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  params: ClientPipelineCategoryParams,
  onProgress?: ProgressCallback
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string; rowCount: number }> {
  // ── Determine date range ─────────────────────────────────────────────────────
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const startYM = params.startMonth ?? defaultYM;
  const endYM   = params.endMonth   ?? defaultYM;

  const months = buildMonthRange(startYM, endYM);
  if (months.length === 0) {
    // Degenerate range: endMonth < startMonth
    const months2 = [startYM];
    return generateReport(pool, s3Client, s3Bucket, startYM, endYM, months2, onProgress);
  }

  return generateReport(pool, s3Client, s3Bucket, startYM, endYM, months, onProgress);
}

async function generateReport(
  pool: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  startYM: string,
  endYM: string,
  months: string[],
  onProgress?: ProgressCallback
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string; rowCount: number }> {
  const startDate = toDateStr(firstDayOfMonth(startYM));
  const endDate   = toDateStr(lastDayOfMonth(firstDayOfMonth(endYM)));

  await onProgress?.(5, 'Preparing query…');

  // ── Single query: fetch all clients with ≥1 Visit in the full range ─────────
  const sql = `
    SELECT
      c.first_name,
      c.middle_name,
      c.last_name,
      c.ext_name,
      c.loan_released,
      c.loan_released_at::text AS loan_released_at,
      c.touchpoint_summary
    FROM clients c
    WHERE c.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
        WHERE tp->>'type' = 'Visit'
          AND (tp->>'date')::date >= $1::date
          AND (tp->>'date')::date <= $2::date
      )
    ORDER BY c.last_name, c.first_name
  `;

  await onProgress?.(10, 'Fetching clients…');
  const result = await pool.query<ClientRow>(sql, [startDate, endDate]);
  await onProgress?.(60, 'Computing categories…');

  // ── Build rows ────────────────────────────────────────────────────────────────
  const rows = result.rows.map((client) => {
    const name = formatClientName({
      first_name:  client.first_name,
      middle_name: client.middle_name,
      last_name:   client.last_name,
      ext_name:    client.ext_name,
    });

    // loan_released_at: the first month where "existing" applies
    const loanReleasedAt = client.loan_released && client.loan_released_at
      ? parseDateLocal(client.loan_released_at)
      : null;

    const summary: TouchpointEntry[] = Array.isArray(client.touchpoint_summary)
      ? client.touchpoint_summary
      : [];

    const row: Record<string, string> = { name };

    for (const ym of months) {
      const monthFirst = firstDayOfMonth(ym);
      const monthLast  = lastDayOfMonth(monthFirst);

      // "existing" if loan_released and loan_released_at falls on or before the last day of this month
      if (loanReleasedAt !== null && loanReleasedAt <= monthLast) {
        row[ym] = 'existing';
        continue;
      }

      // Gather Visit entries in this month
      const visitsThisMonth = summary.filter((tp) => {
        if (tp.type !== 'Visit') return false;
        if (!tp.date) return false;
        const d = parseDateLocal(tp.date);
        return d >= monthFirst && d <= monthLast;
      });

      if (visitsThisMonth.length === 0) {
        row[ym] = '';
        continue;
      }

      // Favorable = any visit reason is in INTERESTED_REASONS (case-insensitive)
      const hasFavorable = visitsThisMonth.some((tp) => {
        const reason = (tp.visit?.reason ?? '').toLowerCase().trim();
        return INTERESTED_REASONS_LOWER.includes(reason);
      });

      row[ym] = hasFavorable ? 'favorable' : 'others';
    }

    return row;
  });

  await onProgress?.(75, 'Building spreadsheet…');

  // ── Build dynamic columns ─────────────────────────────────────────────────────
  const columns = [
    { header: 'Client Name', key: 'name', width: 35 },
    ...months.map((ym) => ({
      header: formatMonthHeader(ym),
      key: ym,
      width: 14,
    })),
  ];

  const rowCount = rows.length;

  return generateSimpleXlsxReport({
    s3Client,
    s3Bucket,
    fileNamePrefix: `client-pipeline-category-${startYM}-${endYM}`,
    sheets: [
      {
        name: 'Pipeline Category',
        columns,
        rows,
      },
    ],
  }).then(async (r) => {
    await onProgress?.(90, 'Uploading…');
    return { ...r, rowCount };
  });
}
