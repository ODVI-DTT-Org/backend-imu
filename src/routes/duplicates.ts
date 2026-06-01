import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { pool } from '../db/index.js';

/**
 * Admin duplicate-review API.
 *
 * Detection (scripts/detect-duplicates.ts) writes clients.duplicate_metadata
 * (migration 108). This router lets an admin review those flags and either mark
 * a client as unique or confirm it as a duplicate and MERGE it into a canonical
 * client. Review state lives in the columns added by migration 109.
 *
 * Merge re-points every table that has a `client_id` column from the duplicate
 * to the canonical client, then soft-deletes the duplicate (recording
 * merged_into). The child tables are discovered from the live DB catalog so the
 * merge stays correct as the schema evolves. The merge is a no-op preview unless
 * `dry_run: false` is explicitly sent.
 */

const duplicates = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);

/**
 * Tables (other than clients itself) that carry a `client_id` column. Discovered
 * from information_schema so FK-less denormalized references are covered too.
 * Backup/temp tables are excluded. Names are validated as plain identifiers
 * before they are interpolated into SQL.
 */
async function discoverChildTables(dbc: any): Promise<string[]> {
  const result = await dbc.query(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'client_id'
      AND table_name <> 'clients'
      AND table_name NOT LIKE '%\\_backup'
      AND table_name NOT LIKE 'temp\\_%'
    ORDER BY table_name
  `);
  return result.rows
    .map((row: any) => row.table_name as string)
    .filter((t: string) => /^[a-z_][a-z0-9_]*$/.test(t));
}

// GET /api/duplicates — list possible-duplicate clients for review.
// Query: filter = needs_review (default) | unique | duplicate | all; page; per_page; search.
duplicates.get('/', authMiddleware, requireRole('admin'), async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
  const offset = (page - 1) * perPage;
  const filter = q.filter || 'needs_review';

  const flagged = `(c.duplicate_metadata->>'is_possible_duplicate') = 'true'`;
  let where: string;
  switch (filter) {
    case 'unique':
      where = `c.deleted_at IS NULL AND ${flagged} AND c.duplicate_review_status = 'unique'`;
      break;
    case 'duplicate':
      // Confirmed duplicates are soft-deleted, so don't require deleted_at IS NULL.
      where = `c.duplicate_review_status = 'duplicate'`;
      break;
    case 'all':
      where = `${flagged} AND (c.deleted_at IS NULL OR c.duplicate_review_status = 'duplicate')`;
      break;
    case 'needs_review':
    default:
      where = `c.deleted_at IS NULL AND ${flagged} AND c.duplicate_review_status IS NULL`;
      break;
  }

  const params: any[] = [];
  let idx = 1;
  let searchClause = '';
  if (q.search && q.search.trim()) {
    searchClause = ` AND c.full_name ILIKE $${idx}`;
    params.push(`%${q.search.trim()}%`);
    idx++;
  }

  const dbc = await pool.connect();
  try {
    const countResult = await dbc.query(
      `SELECT COUNT(*)::int AS total FROM clients c WHERE ${where}${searchClause}`,
      params,
    );
    const totalItems = countResult.rows[0].total as number;

    const dataResult = await dbc.query(
      `SELECT c.id, c.first_name, c.last_name, c.middle_name, c.full_name,
              c.birth_date, c.agency_name, c.municipality, c.province, c.barangay,
              c.duplicate_metadata, c.duplicate_review_status, c.merged_into,
              c.duplicate_reviewed_by, c.duplicate_reviewed_at, c.created_at
       FROM clients c
       WHERE ${where}${searchClause}
       ORDER BY (c.duplicate_metadata->>'confidence_score')::numeric DESC NULLS LAST,
                c.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, perPage, offset],
    );

    return c.json({
      items: dataResult.rows,
      page,
      perPage,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
    });
  } finally {
    dbc.release();
  }
});

/**
 * Per-client counts of the history tables that a merge would move, so the admin
 * can see how much data each client carries before confirming.
 */
async function recordCountsByClient(
  dbc: any,
  ids: string[],
): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  for (const id of ids) out[id] = {};
  if (ids.length === 0) return out;
  for (const table of ['touchpoints', 'visits', 'calls', 'releases']) {
    const r = await dbc.query(
      `SELECT client_id, COUNT(*)::int AS cnt FROM "${table}" WHERE client_id = ANY($1) GROUP BY client_id`,
      [ids],
    );
    for (const row of r.rows) {
      if (!out[row.client_id]) out[row.client_id] = {};
      out[row.client_id][table] = row.cnt;
    }
  }
  return out;
}

const DETAIL_COLUMNS = `id, first_name, last_name, middle_name, full_name,
  birth_date, agency_name, pension_type, pan,
  municipality, province, barangay, full_address, created_at`;

/** Up to `perClient` most recent visits per client, for the review comparison. */
async function recentVisitsByClient(
  dbc: any,
  ids: string[],
  perClient = 5,
): Promise<Record<string, Array<{ date: string | null; type: string | null; address: string | null; status: string | null }>>> {
  const out: Record<string, any[]> = {};
  for (const id of ids) out[id] = [];
  if (ids.length === 0) return out;
  const r = await dbc.query(
    `SELECT client_id, time_in, type, address, status, created_at FROM (
       SELECT client_id, time_in, type, address, status, created_at,
              ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at DESC) AS rn
       FROM visits WHERE client_id = ANY($1)
     ) t WHERE rn <= $2`,
    [ids, perClient],
  );
  for (const row of r.rows) {
    if (!out[row.client_id]) out[row.client_id] = [];
    out[row.client_id].push({
      date: row.time_in ?? row.created_at,
      type: row.type,
      address: row.address,
      status: row.status,
    });
  }
  return out;
}

// GET /api/duplicates/incomplete — clients missing one or more of:
// phone number, primary address, or PSGC location. Used by the Clients
// Review > Incomplete Information tab so admins can fix data quality
// issues that block downstream features (geofencing, calling, location
// filtering). Filter values: `all` | `phone` | `address` | `psgc`.
duplicates.get('/incomplete', authMiddleware, requireRole('admin'), async (c) => {
  const q = c.req.query();
  const page = Math.max(1, parseInt(q.page || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
  const offset = (page - 1) * perPage;
  const search = (q.search || '').trim();
  const filter = (q.filter || 'all').toLowerCase();

  // Missing address: no full_address on the client OR no rows in addresses table.
  const missingAddressSql = `
    (COALESCE(NULLIF(c.full_address, ''), NULL) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM addresses a
       WHERE a.client_id = c.id AND a.deleted_at IS NULL
     ))
  `;
  // Missing PSGC: no psgc_id on the client OR no addresses with a psgc_id.
  const missingPsgcSql = `
    (c.psgc_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM addresses a
       WHERE a.client_id = c.id AND a.psgc_id IS NOT NULL AND a.deleted_at IS NULL
     ))
  `;
  // Missing phone: no phone on the client OR no rows in phone_numbers table.
  const missingPhoneSql = `
    (COALESCE(NULLIF(c.phone, ''), NULL) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM phone_numbers p
       WHERE p.client_id = c.id AND p.deleted_at IS NULL
     ))
  `;

  let predicate: string;
  switch (filter) {
    case 'phone':   predicate = missingPhoneSql; break;
    case 'address': predicate = missingAddressSql; break;
    case 'psgc':    predicate = missingPsgcSql; break;
    default:        predicate = `(${missingPhoneSql} OR ${missingAddressSql} OR ${missingPsgcSql})`;
  }

  const params: any[] = [perPage, offset];
  let searchSql = '';
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    searchSql = `AND (
      LOWER(COALESCE(c.full_name, c.first_name || ' ' || c.last_name)) LIKE $3
      OR LOWER(COALESCE(c.agency_name, '')) LIKE $3
    )`;
  }

  const where = `c.deleted_at IS NULL AND ${predicate} ${searchSql}`;

  const sql = `
    WITH base AS (
      SELECT
        c.id, c.first_name, c.last_name, c.middle_name, c.full_name,
        c.birth_date, c.agency_name, c.municipality, c.province, c.barangay,
        c.psgc_id, c.phone, c.created_at,
        ${missingPhoneSql}   AS missing_phone,
        ${missingAddressSql} AS missing_address,
        ${missingPsgcSql}    AS missing_psgc
      FROM clients c
      WHERE ${where}
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM base
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;

  const result = await pool.query(sql, params);
  const totalItems = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));

  return c.json({
    items: result.rows.map((r: any) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      middle_name: r.middle_name,
      full_name: r.full_name,
      birth_date: r.birth_date,
      agency_name: r.agency_name,
      municipality: r.municipality,
      province: r.province,
      barangay: r.barangay,
      missing_phone: !!r.missing_phone,
      missing_address: !!r.missing_address,
      missing_psgc: !!r.missing_psgc,
    })),
    page,
    perPage,
    totalItems,
    totalPages,
  });
});

// GET /api/duplicates/:id/detail — the flagged client plus its candidate matches,
// each with key fields and history-record counts, for the admin to compare before merging.
duplicates.get('/:id/detail', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'Invalid client id' }, 400);

  const dbc = await pool.connect();
  try {
    const base = await dbc.query(
      `SELECT ${DETAIL_COLUMNS}, duplicate_metadata, duplicate_review_status, merged_into
       FROM clients WHERE id = $1`,
      [id],
    );
    if (base.rows.length === 0) return c.json({ error: 'Client not found' }, 404);
    const client = base.rows[0];

    const similar: Array<{ id: string; name?: string; score?: number; similarity_method?: string }> =
      client.duplicate_metadata?.similar_clients ?? [];
    const similarIds = similar.map((s) => s.id).filter(Boolean);

    let candidates: any[] = [];
    if (similarIds.length > 0) {
      const cand = await dbc.query(`SELECT ${DETAIL_COLUMNS} FROM clients WHERE id = ANY($1) AND deleted_at IS NULL`, [similarIds]);
      const byId = new Map(cand.rows.map((r: any) => [r.id, r]));
      candidates = similar
        .map((s) => {
          const row = byId.get(s.id);
          if (!row) return null; // candidate was deleted/merged away — skip
          return { ...row, score: s.score, similarity_method: s.similarity_method };
        })
        .filter(Boolean);
    }

    const ids = [id, ...candidates.map((x) => x.id)];
    const counts = await recordCountsByClient(dbc, ids);
    const visits = await recentVisitsByClient(dbc, ids);
    client.counts = counts[id] ?? {};
    client.recent_visits = visits[id] ?? [];
    candidates = candidates.map((x) => ({
      ...x,
      counts: counts[x.id] ?? {},
      recent_visits: visits[x.id] ?? [],
    }));

    return c.json({ client, candidates });
  } finally {
    dbc.release();
  }
});

// POST /api/duplicates/:id/mark-unique — admin confirms the client is NOT a duplicate.
duplicates.post('/:id/mark-unique', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) return c.json({ error: 'Invalid client id' }, 400);
  const user = c.get('user');

  const result = await pool.query(
    `UPDATE clients
     SET duplicate_review_status = 'unique',
         duplicate_reviewed_by = $1,
         duplicate_reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [user.sub, id],
  );
  if (result.rowCount === 0) return c.json({ error: 'Client not found' }, 404);
  return c.json({ success: true, id, duplicate_review_status: 'unique' });
});

// POST /api/duplicates/:id/merge — confirm :id is a duplicate of canonical_id and merge.
// Body: { canonical_id: uuid, dry_run?: boolean }. dry_run defaults to TRUE — you must
// send dry_run:false to actually mutate data.
duplicates.post('/:id/merge', authMiddleware, requireRole('admin'), async (c) => {
  const duplicateId = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const canonicalId = body.canonical_id;
  const dryRun = body.dry_run !== false; // execute only when explicitly false

  if (!isUuid(duplicateId) || !isUuid(canonicalId)) {
    return c.json({ error: 'Invalid client id(s)' }, 400);
  }
  if (duplicateId === canonicalId) {
    return c.json({ error: 'Cannot merge a client into itself' }, 400);
  }

  const user = c.get('user');
  const dbc = await pool.connect();
  try {
    const chk = await dbc.query(
      `SELECT id, deleted_at FROM clients WHERE id = ANY($1)`,
      [[duplicateId, canonicalId]],
    );
    const found = new Map(chk.rows.map((r: any) => [r.id, r]));
    if (!found.has(duplicateId)) return c.json({ error: 'Duplicate client not found' }, 404);
    if (!found.has(canonicalId)) return c.json({ error: 'Canonical client not found' }, 404);
    if (found.get(canonicalId).deleted_at) {
      return c.json({ error: 'Canonical client is deleted' }, 400);
    }

    const tables = await discoverChildTables(dbc);

    if (dryRun) {
      const wouldMove: Array<{ table: string; rows: number }> = [];
      for (const t of tables) {
        const r = await dbc.query(`SELECT COUNT(*)::int AS cnt FROM "${t}" WHERE client_id = $1`, [duplicateId]);
        const cnt = r.rows[0].cnt as number;
        if (cnt > 0) wouldMove.push({ table: t, rows: cnt });
      }
      return c.json({
        dry_run: true,
        canonical_id: canonicalId,
        duplicate_id: duplicateId,
        tables_checked: tables.length,
        would_move: wouldMove,
        note: 'No changes made. Send { "dry_run": false } to execute.',
      });
    }

    await dbc.query('BEGIN');

    // client_favorites has a unique (user_id, client_id); drop dup-side rows that
    // would collide with the canonical's before re-pointing the rest.
    if (tables.includes('client_favorites')) {
      await dbc.query(
        `DELETE FROM client_favorites
         WHERE client_id = $1
           AND user_id IN (SELECT user_id FROM client_favorites WHERE client_id = $2)`,
        [duplicateId, canonicalId],
      );
    }

    const moved: Array<{ table: string; rows: number }> = [];
    for (const t of tables) {
      const r = await dbc.query(`UPDATE "${t}" SET client_id = $1 WHERE client_id = $2`, [canonicalId, duplicateId]);
      if ((r.rowCount ?? 0) > 0) moved.push({ table: t, rows: r.rowCount ?? 0 });
    }

    // Soft-delete the duplicate and record the merge link + review decision.
    await dbc.query(
      `UPDATE clients
       SET deleted_at = NOW(), deleted_by = $1,
           duplicate_review_status = 'duplicate',
           duplicate_reviewed_by = $1, duplicate_reviewed_at = NOW(),
           merged_into = $2, updated_at = NOW()
       WHERE id = $3`,
      [user.sub, canonicalId, duplicateId],
    );

    // The canonical record is, by this decision, the confirmed unique client.
    await dbc.query(
      `UPDATE clients
       SET duplicate_review_status = 'unique',
           duplicate_reviewed_by = $1, duplicate_reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [user.sub, canonicalId],
    );

    await dbc.query('COMMIT');
    return c.json({ merged: true, canonical_id: canonicalId, duplicate_id: duplicateId, moved });
  } catch (error: any) {
    await dbc.query('ROLLBACK').catch(() => {});
    console.error('[duplicates/merge] failed:', error);
    return c.json({ error: 'Merge failed', message: error.message }, 500);
  } finally {
    dbc.release();
  }
});

export default duplicates;
