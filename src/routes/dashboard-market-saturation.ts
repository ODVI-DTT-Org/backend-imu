import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const marketSaturation = new Hono();

interface BreakdownRow {
  municipality: string | null;
  interested: string; not_interested: string; undecided: string; untouched: string;
  tp_total: string;
  virgin: string; favorable: string; others: string; existing: string;
  cat_total: string;
}

interface ClientRow {
  id: string; full_name: string; municipality: string;
  client_type: string; last_touchpoint_date: string | null; last_touchpoint_status: string | null;
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function emptyResponse() {
  const zero = { count: 0, pct: 0 };
  return {
    status_breakdown: { interested: zero, not_interested: zero, undecided: zero, untouched: zero },
    category_breakdown: { virgin: zero, favorable: zero, others: zero, existing: zero },
    by_municipality: [],
    clients: null,
  };
}

marketSaturation.get('/', authMiddleware, async (c) => {
  const user = c.get('user') as { sub: string; role: string };

  if (!['admin', 'area_manager'].includes(user.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const dateFrom = c.req.query('date_from') || null;
  const dateTo = c.req.query('date_to') || null;
  const municipality = c.req.query('municipality') || null;
  const clientType = c.req.query('client_type') || null;
  const segment = c.req.query('segment') || null;
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const perPage = 20;

  // Territory scoping: area_manager → their assigned municipalities only
  let territoryMunicipalities: string[] | null = null;
  if (user.role === 'area_manager') {
    const locResult = await pool.query<{ municipality: string }>(
      `SELECT municipality FROM user_locations WHERE user_id = $1 AND deleted_at IS NULL`,
      [user.sub]
    );
    territoryMunicipalities = locResult.rows.map(r => r.municipality);
    if (territoryMunicipalities.length === 0) {
      return c.json(emptyResponse());
    }
  }

  // Params: $1=date_from, $2=date_to, $3=territory[], $4=municipality, $5=client_type
  const params: any[] = [dateFrom, dateTo, territoryMunicipalities, municipality, clientType];

  const mainSql = `
    WITH base AS (
      SELECT
        c.municipality,
        c.loan_released,
        (
          SELECT tp->>'status'
          FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
          WHERE ($1::date IS NULL OR (tp->>'date')::date >= $1)
            AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
          ORDER BY (tp->>'date')::date DESC
          LIMIT 1
        ) AS recent_status,
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
          WHERE tp->>'type' = 'Visit'
            AND ($1::date IS NULL OR (tp->>'date')::date >= $1)
            AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
        ) AS has_visit,
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
          WHERE tp->>'type' = 'Visit' AND tp->>'status' = 'Interested'
            AND ($1::date IS NULL OR (tp->>'date')::date >= $1)
            AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
        ) AS has_interested_visit
      FROM clients c
      WHERE c.deleted_at IS NULL
        AND ($3::text[] IS NULL OR c.municipality = ANY($3))
        AND ($4::text   IS NULL OR c.municipality = $4)
        AND ($5::text   IS NULL OR c.client_type  = $5)
    ),
    client_data AS (
      SELECT
        municipality,
        CASE
          WHEN recent_status = 'Interested'     THEN 'interested'
          WHEN recent_status = 'Not Interested' THEN 'not_interested'
          WHEN recent_status = 'Undecided'      THEN 'undecided'
          ELSE 'untouched'
        END AS tp_status,
        CASE
          WHEN loan_released        THEN 'existing'
          WHEN has_interested_visit THEN 'favorable'
          WHEN has_visit            THEN 'others'
          ELSE                           'virgin'
        END AS market_category
      FROM base
    )
    SELECT
      municipality,
      COUNT(*) FILTER (WHERE tp_status = 'interested')      AS interested,
      COUNT(*) FILTER (WHERE tp_status = 'not_interested')  AS not_interested,
      COUNT(*) FILTER (WHERE tp_status = 'undecided')       AS undecided,
      COUNT(*) FILTER (WHERE tp_status = 'untouched')       AS untouched,
      COUNT(*)                                              AS tp_total,
      COUNT(*) FILTER (WHERE market_category = 'virgin')    AS virgin,
      COUNT(*) FILTER (WHERE market_category = 'favorable') AS favorable,
      COUNT(*) FILTER (WHERE market_category = 'others')    AS others,
      COUNT(*) FILTER (WHERE market_category = 'existing')  AS existing,
      COUNT(*)                                              AS cat_total
    FROM client_data
    GROUP BY ROLLUP(municipality)
    ORDER BY municipality NULLS LAST
  `;

  const result = await pool.query<BreakdownRow>(mainSql, params);
  const rows = result.rows;

  // ROLLUP produces a NULL-municipality row as the grand total
  const totalRow = rows.find(r => r.municipality === null);
  const municipalityRows = rows.filter(r => r.municipality !== null);

  const interested    = parseInt(totalRow?.interested    ?? '0');
  const notInterested = parseInt(totalRow?.not_interested ?? '0');
  const undecided     = parseInt(totalRow?.undecided     ?? '0');
  const untouched     = parseInt(totalRow?.untouched     ?? '0');
  const tpTotal       = parseInt(totalRow?.tp_total      ?? '0');

  const virgin   = parseInt(totalRow?.virgin   ?? '0');
  const favorable = parseInt(totalRow?.favorable ?? '0');
  const others   = parseInt(totalRow?.others   ?? '0');
  const existing = parseInt(totalRow?.existing ?? '0');
  const catTotal = parseInt(totalRow?.cat_total ?? '0');

  // Client drill list — only when segment is specified
  let clientsPayload = null;
  if (segment) {
    const [segType, segValue] = segment.split(':');
    let segCondition = '';
    if (segType === 'status') {
      const statusMap: Record<string, string> = {
        Interested: 'interested', 'Not Interested': 'not_interested',
        Undecided: 'undecided', Untouched: 'untouched',
      };
      const mapped = statusMap[segValue] ?? segValue.toLowerCase().replace(' ', '_');
      segCondition = `AND cd.tp_status = '${mapped}'`;
    } else if (segType === 'category') {
      segCondition = `AND cd.market_category = '${segValue.toLowerCase()}'`;
    }

    const clientSql = `
      WITH base AS (
        SELECT
          c.id,
          c.first_name || ' ' || c.last_name AS full_name,
          c.municipality,
          c.client_type,
          c.loan_released,
          (
            SELECT tp->>'status'
            FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
            WHERE ($1::date IS NULL OR (tp->>'date')::date >= $1)
              AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
            ORDER BY (tp->>'date')::date DESC
            LIMIT 1
          ) AS recent_status,
          (
            SELECT tp->>'date'
            FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
            WHERE ($1::date IS NULL OR (tp->>'date')::date >= $1)
              AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
            ORDER BY (tp->>'date')::date DESC
            LIMIT 1
          ) AS last_touchpoint_date,
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
            WHERE tp->>'type' = 'Visit'
              AND ($1::date IS NULL OR (tp->>'date')::date >= $1)
              AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
          ) AS has_visit,
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) tp
            WHERE tp->>'type' = 'Visit' AND tp->>'status' = 'Interested'
              AND ($1::date IS NULL OR (tp->>'date')::date >= $1)
              AND ($2::date IS NULL OR (tp->>'date')::date <= $2)
          ) AS has_interested_visit
        FROM clients c
        WHERE c.deleted_at IS NULL
          AND ($3::text[] IS NULL OR c.municipality = ANY($3))
          AND ($4::text   IS NULL OR c.municipality = $4)
          AND ($5::text   IS NULL OR c.client_type  = $5)
      ),
      client_data AS (
        SELECT
          id, full_name, municipality, client_type, last_touchpoint_date,
          recent_status AS last_touchpoint_status,
          CASE
            WHEN recent_status = 'Interested'     THEN 'interested'
            WHEN recent_status = 'Not Interested' THEN 'not_interested'
            WHEN recent_status = 'Undecided'      THEN 'undecided'
            ELSE 'untouched'
          END AS tp_status,
          CASE
            WHEN loan_released        THEN 'existing'
            WHEN has_interested_visit THEN 'favorable'
            WHEN has_visit            THEN 'others'
            ELSE                           'virgin'
          END AS market_category
        FROM base
      )
      SELECT cd.*
      FROM client_data cd
      WHERE 1=1 ${segCondition}
      ORDER BY cd.full_name
    `;

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM (${clientSql}) sub`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / perPage) || 1;
    const offset = (page - 1) * perPage;

    const clientResult = await pool.query<ClientRow>(
      `${clientSql} LIMIT ${perPage} OFFSET ${offset}`,
      params
    );

    clientsPayload = {
      items: clientResult.rows.map(r => ({
        id: r.id,
        name: r.full_name,
        municipality: r.municipality,
        client_type: r.client_type,
        last_touchpoint_date:   r.last_touchpoint_date   ?? null,
        last_touchpoint_status: r.last_touchpoint_status ?? null,
      })),
      page,
      per_page: perPage,
      total_items: totalItems,
      total_pages: totalPages,
    };
  }

  return c.json({
    status_breakdown: {
      interested:    { count: interested,    pct: pct(interested,    tpTotal) },
      not_interested: { count: notInterested, pct: pct(notInterested, tpTotal) },
      undecided:     { count: undecided,     pct: pct(undecided,     tpTotal) },
      untouched:     { count: untouched,     pct: pct(untouched,     tpTotal) },
    },
    category_breakdown: {
      virgin:   { count: virgin,   pct: pct(virgin,   catTotal) },
      favorable: { count: favorable, pct: pct(favorable, catTotal) },
      others:   { count: others,   pct: pct(others,   catTotal) },
      existing: { count: existing, pct: pct(existing, catTotal) },
    },
    by_municipality: municipalityRows.map(r => ({
      municipality:   r.municipality!,
      interested:     parseInt(r.interested),
      not_interested: parseInt(r.not_interested),
      undecided:      parseInt(r.undecided),
      untouched:      parseInt(r.untouched),
      virgin:         parseInt(r.virgin),
      favorable:      parseInt(r.favorable),
      others:         parseInt(r.others),
      existing:       parseInt(r.existing),
    })),
    clients: clientsPayload,
  });
});

export default marketSaturation;
