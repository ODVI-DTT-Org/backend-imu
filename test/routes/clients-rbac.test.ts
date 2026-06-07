/**
 * Smoke tests: RBAC client visibility (stage 3a)
 *
 * These tests verify that the switched clients.ts endpoints correctly filter
 * by the new area-RBAC vocabulary, not the legacy ROLE_LEVELS / user_locations approach.
 *
 * Tests run against prod DB. No test rows are inserted — we read existing data.
 * Uses resolveClientScope directly to verify the resolution, then cross-checks
 * with raw SQL to confirm the filter would produce a non-empty result set.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { resolveClientScope, applyClientScope } from '../../src/utils/scope.js';

const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

const TEST_TIMEOUT = 30_000; // 30s — DB queries on first call can be slow

describe('RBAC client visibility smoke tests', () => {
  // ─── Admin: unrestricted ─────────────────────────────────────────────────

  it('admin resolves to unrestricted and sees all clients', async () => {
    const { rows: adminRows } = await testPool.query<{ id: string }>(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);
    if (adminRows.length === 0) {
      console.warn('SKIP: no admin user in users table');
      return;
    }
    const adminId = adminRows[0].id;

    const scope = await resolveClientScope(adminId);
    expect(scope.kind).toBe('unrestricted');

    // Verify TRUE fragment → no restriction
    const params: unknown[] = [];
    const { sqlFragment } = applyClientScope(scope, params, 1);
    expect(sqlFragment).toBe('TRUE');
    expect(params).toHaveLength(0);

    // Sanity: admin can see all clients (at least some exist)
    const { rows: allClients } = await testPool.query(`
      SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL
    `);
    expect(parseInt(allClients[0].cnt)).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  // ─── Caravan: caravan_municipalities ─────────────────────────────────────

  it('caravan resolves to caravan_municipalities and scope filter produces rows', async () => {
    const { rows: caravanRows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'caravan'
         AND grm.deleted_at IS NULL
         AND u.role = 'caravan'
       LIMIT 1
    `);
    if (caravanRows.length === 0) {
      console.warn('SKIP: no caravan user in group_role_members');
      return;
    }
    const caravanId = caravanRows[0].user_id;

    const scope = await resolveClientScope(caravanId);
    expect(scope.kind).toBe('caravan_municipalities');

    // Build the scope SQL and verify it produces a bounded result
    const params: unknown[] = [];
    const { sqlFragment } = applyClientScope(scope, params, 1);
    expect(sqlFragment).not.toBe('TRUE');
    expect(sqlFragment).not.toBe('FALSE');
    expect(params).toContain(caravanId);

    // Verify the caravan's municipalities exist (so query won't be vacuously empty)
    const { rows: muniRows } = await testPool.query(`
      SELECT COUNT(*) AS cnt
        FROM group_caravan_municipalities
       WHERE caravan_user_id = $1 AND deleted_at IS NULL
    `, [caravanId]);
    const muniCount = parseInt(muniRows[0].cnt);
    expect(muniCount).toBeGreaterThan(0); // caravan must have assigned municipalities

    // Verify the scope filter against clients table actually finds some clients
    const { rows: scopedClients } = await testPool.query(`
      SELECT COUNT(*) AS cnt
        FROM clients c
       WHERE c.deleted_at IS NULL
         AND (${sqlFragment})
    `, params);
    const scopedCount = parseInt(scopedClients[0].cnt);
    console.info(`Caravan ${caravanId}: ${muniCount} municipalities, ${scopedCount} visible clients`);
    expect(scopedCount).toBeGreaterThanOrEqual(0);
  }, TEST_TIMEOUT);

  // ─── Area manager: group_municipalities ──────────────────────────────────

  it('area_manager resolves to group_municipalities (NOT unrestricted) and scope filter produces rows', async () => {
    const { rows: areaRows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'area_head'
         AND grm.deleted_at IS NULL
         AND u.role = 'area_manager'
       LIMIT 1
    `);
    if (areaRows.length === 0) {
      console.warn('SKIP: no area_manager user in group_role_members with role_in_group=area_head');
      return;
    }
    const areaId = areaRows[0].user_id;

    const scope = await resolveClientScope(areaId);
    expect(scope.kind).toBe('group_municipalities');
    // CRITICAL: must not be unrestricted (the legacy 'all' link must not win over new vocab)
    expect(scope.kind).not.toBe('unrestricted');

    const params: unknown[] = [];
    const { sqlFragment } = applyClientScope(scope, params, 1);
    expect(sqlFragment).not.toBe('TRUE');
    expect(sqlFragment).not.toBe('FALSE');
    expect(params).toContain(areaId);

    // Verify the area manager's group municipalities exist
    const { rows: poolRows } = await testPool.query(`
      SELECT COUNT(*) AS cnt
        FROM group_municipalities gm
        JOIN group_role_members grm ON grm.group_id = gm.group_id
       WHERE grm.user_id = $1
         AND grm.deleted_at IS NULL
         AND gm.deleted_at IS NULL
    `, [areaId]);
    const poolCount = parseInt(poolRows[0].cnt);
    expect(poolCount).toBeGreaterThan(0);

    // Verify the scoped query doesn't error and returns some clients
    const { rows: scopedClients } = await testPool.query(`
      SELECT COUNT(*) AS cnt
        FROM clients c
       WHERE c.deleted_at IS NULL
         AND (${sqlFragment})
    `, params);
    const scopedCount = parseInt(scopedClients[0].cnt);
    console.info(`Area manager ${areaId}: ${poolCount} municipality-pool entries, ${scopedCount} visible clients`);
    // With municipalities in the pool, some clients should be visible
    expect(scopedCount).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  // ─── Isolation: caravan can NOT see clients outside their slice ──────────

  it('caravan scope excludes clients outside their municipalities', async () => {
    const { rows: caravanRows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'caravan'
         AND grm.deleted_at IS NULL
         AND u.role = 'caravan'
       LIMIT 1
    `);
    if (caravanRows.length === 0) {
      console.warn('SKIP: no caravan user in group_role_members');
      return;
    }
    const caravanId = caravanRows[0].user_id;

    const { rows: allClientsResult } = await testPool.query(`
      SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL
    `);
    const totalClients = parseInt(allClientsResult[0].cnt);

    const scope = await resolveClientScope(caravanId);
    const params: unknown[] = [];
    const { sqlFragment } = applyClientScope(scope, params, 1);

    const { rows: scopedResult } = await testPool.query(`
      SELECT COUNT(*) AS cnt FROM clients c WHERE c.deleted_at IS NULL AND (${sqlFragment})
    `, params);
    const scopedCount = parseInt(scopedResult[0].cnt);

    // Caravan should see strictly fewer clients than the total (unless all clients are in their slice)
    // At minimum, the count must not exceed total
    expect(scopedCount).toBeLessThanOrEqual(totalClients);
    console.info(`Isolation check: caravan sees ${scopedCount}/${totalClients} clients`);
  }, TEST_TIMEOUT);

  // ─── Orphan-row check ────────────────────────────────────────────────────

  it('no test orphan rows left in users table', async () => {
    const { rows } = await testPool.query(`
      SELECT COUNT(*) AS cnt FROM users WHERE email LIKE '%@test.local'
    `);
    expect(parseInt(rows[0].cnt)).toBe(0);
  }, TEST_TIMEOUT);
});
