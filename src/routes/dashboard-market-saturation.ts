import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { getCacheService, CACHE_TTL } from '../services/cache/redis-cache.js';

const marketSaturation = new Hono();

const VALID_MUNI_FILTERS = [
  'interested', 'not_interested', 'undecided', 'untouched',
  'virgin', 'favorable', 'others', 'existing',
] as const;
type MuniFilter = typeof VALID_MUNI_FILTERS[number];

interface TotalRow {
  interested: string; not_interested: string; undecided: string; untouched: string;
  tp_total: string;
  virgin: string; favorable: string; others: string; existing: string;
  cat_total: string;
}

interface MunicipalityRow {
  municipality: string;
  interested: string; not_interested: string; undecided: string; untouched: string;
  virgin: string; favorable: string; others: string; existing: string;
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
    by_municipality: { items: [], page: 1, per_page: 20, total_items: 0, total_pages: 0 },
    clients: null,
  };
}

// Builds a HAVING clause from whitelisted filter names — no user input reaches the SQL.
function buildHavingClause(filters: MuniFilter[]): string {
  if (filters.length === 0) return '';
  const statusSet = new Set(['interested', 'not_interested', 'undecided', 'untouched']);
  const conditions = filters.map(f =>
    statusSet.has(f)
      ? `COUNT(*) FILTER (WHERE tp_status = '${f}') > 0`
      : `COUNT(*) FILTER (WHERE market_category = '${f}') > 0`
  );
  return `HAVING (${conditions.join(' OR ')})`;
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

  const muniPage = Math.max(1, parseInt(c.req.query('muni_page') || '1', 10));
  const muniPerPage = Math.min(100, Math.max(1, parseInt(c.req.query('muni_per_page') || '20', 10)));
  const muniFiltersRaw = c.req.query('muni_filters') || '';
  const muniFilters = muniFiltersRaw
    .split(',')
    .map(f => f.trim())
    .filter((f): f is MuniFilter => (VALID_MUNI_FILTERS as readonly string[]).includes(f));

  const clientPage = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const clientPerPage = 20;

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

  // Cache key scoped per user to avoid area_manager cache collisions
  const scope = user.role === 'area_manager' ? user.sub : 'all';
  const cacheKey = `msat:${scope}:${dateFrom}:${dateTo}:${municipality}:${clientType}:${muniFilters.join(',')}:${muniPage}:${muniPerPage}`;

  const cache = getCacheService();

  // Params: $1=date_from, $2=date_to, $3=territory[], $4=municipality, $5=client_type
  const baseParams: any[] = [dateFrom, dateTo, territoryMunicipalities, municipality, clientType];

  const baseCte = `
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
  `;

  const havingClause = buildHavingClause(muniFilters);

  // Municipality aggregation CTE — shared between count and data queries
  const muniAggCte = `
    ${baseCte},
    muni_agg AS (
      SELECT
        municipality,
        COUNT(*) FILTER (WHERE tp_status = 'interested')      AS interested,
        COUNT(*) FILTER (WHERE tp_status = 'not_interested')  AS not_interested,
        COUNT(*) FILTER (WHERE tp_status = 'undecided')       AS undecided,
        COUNT(*) FILTER (WHERE tp_status = 'untouched')       AS untouched,
        COUNT(*) FILTER (WHERE market_category = 'virgin')    AS virgin,
        COUNT(*) FILTER (WHERE market_category = 'favorable') AS favorable,
        COUNT(*) FILTER (WHERE market_category = 'others')    AS others,
        COUNT(*) FILTER (WHERE market_category = 'existing')  AS existing
      FROM client_data
      GROUP BY municipality
      ${havingClause}
    )
  `;

  type MainData = ReturnType<typeof buildMainData>;
  function buildMainData(
    t: TotalRow | undefined,
    muniItems: MunicipalityRow[],
    muniTotalItems: number
  ) {
    const interested    = parseInt(t?.interested    ?? '0');
    const notInterested = parseInt(t?.not_interested ?? '0');
    const undecided     = parseInt(t?.undecided     ?? '0');
    const untouched     = parseInt(t?.untouched     ?? '0');
    const tpTotal       = parseInt(t?.tp_total      ?? '0');
    const virgin        = parseInt(t?.virgin        ?? '0');
    const favorable     = parseInt(t?.favorable     ?? '0');
    const others        = parseInt(t?.others        ?? '0');
    const existing      = parseInt(t?.existing      ?? '0');
    const catTotal      = parseInt(t?.cat_total     ?? '0');
    const totalPages    = Math.ceil(muniTotalItems / muniPerPage) || 1;

    return {
      status_breakdown: {
        interested:     { count: interested,    pct: pct(interested,    tpTotal) },
        not_interested: { count: notInterested, pct: pct(notInterested, tpTotal) },
        undecided:      { count: undecided,     pct: pct(undecided,     tpTotal) },
        untouched:      { count: untouched,     pct: pct(untouched,     tpTotal) },
      },
      category_breakdown: {
        virgin:   { count: virgin,    pct: pct(virgin,    catTotal) },
        favorable: { count: favorable, pct: pct(favorable, catTotal) },
        others:   { count: others,    pct: pct(others,    catTotal) },
        existing: { count: existing,  pct: pct(existing,  catTotal) },
      },
      by_municipality: {
        items: muniItems.map(r => ({
          municipality:   r.municipality,
          interested:     parseInt(r.interested),
          not_interested: parseInt(r.not_interested),
          undecided:      parseInt(r.undecided),
          untouched:      parseInt(r.untouched),
          virgin:         parseInt(r.virgin),
          favorable:      parseInt(r.favorable),
          others:         parseInt(r.others),
          existing:       parseInt(r.existing),
        })),
        page: muniPage,
        per_page: muniPerPage,
        total_items: muniTotalItems,
        total_pages: totalPages,
      },
    };
  }

  // Attempt cache hit for the main (non-drill) portion
  let mainData = await cache.get<MainData>(cacheKey);

  if (!mainData) {
    const totalSql = `
      ${baseCte}
      SELECT
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
    `;

    const muniCountSql = `${muniAggCte} SELECT COUNT(*) AS count FROM muni_agg`;

    const muniOffset = (muniPage - 1) * muniPerPage;
    const muniDataSql = `
      ${muniAggCte}
      SELECT * FROM muni_agg
      ORDER BY municipality
      LIMIT $6 OFFSET $7
    `;

    const [totalResult, muniCountResult, muniDataResult] = await Promise.all([
      pool.query<TotalRow>(totalSql, baseParams),
      pool.query<{ count: string }>(muniCountSql, baseParams),
      pool.query<MunicipalityRow>(muniDataSql, [...baseParams, muniPerPage, muniOffset]),
    ]);

    const muniTotalItems = parseInt(muniCountResult.rows[0]?.count ?? '0');
    mainData = buildMainData(totalResult.rows[0], muniDataResult.rows, muniTotalItems);

    await cache.set(cacheKey, mainData, CACHE_TTL.SHORT);
  }

  // Client drill list — only when segment is specified (never cached)
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
      baseParams
    );
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / clientPerPage) || 1;
    const offset = (clientPage - 1) * clientPerPage;

    const clientResult = await pool.query<ClientRow>(
      `${clientSql} LIMIT ${clientPerPage} OFFSET ${offset}`,
      baseParams
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
      page: clientPage,
      per_page: clientPerPage,
      total_items: totalItems,
      total_pages: totalPages,
    };
  }

  return c.json({ ...mainData, clients: clientsPayload });
});

export default marketSaturation;
