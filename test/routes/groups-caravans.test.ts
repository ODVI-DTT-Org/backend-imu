/**
 * Integration tests: Caravan management endpoints (stage 3b)
 *
 * Tests verify the DB-layer logic that the POST/PATCH/DELETE /caravans endpoints
 * exercise: caravan membership inserts, municipality slice management,
 * trigger-enforced pool validation, and soft-delete atomicity.
 *
 * Tests run against prod DB. Test rows use TEST_AREA_RBAC_S3B_ prefix and
 * @test.local email suffix. Cleanup runs in beforeEach + afterAll.
 *
 * Pattern: same as clients-rbac.test.ts — direct SQL with testPool.
 * HTTP layer is not exercised here because authMiddleware requires
 * POWERSYNC_PUBLIC_KEY at import time. The endpoint logic is thin
 * orchestration; the DB invariants are tested here.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';

const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

const TEST_TIMEOUT = 30_000;

// Fixed real data from prod
const REAL_GROUP_ID = 'ca9b3da1-5f39-43c9-b9a9-07ddf8ffe108'; // NORTH AGUILA
const REAL_AREA_HEAD_ID = '42166cdb-4304-404a-a833-2894c4ec8af9'; // mquinto@pcni.com.ph
const POOL_MUN_1 = { province: 'Apayao', municipality: 'Calanasan' };
const POOL_MUN_2 = { province: 'Apayao', municipality: 'Conner' };
// A municipality NOT in the NORTH AGUILA pool
const NOT_IN_POOL_MUN = { province: 'Metro Manila', municipality: 'Makati' };

/** Insert a test user and return their ID. Uses 'caravan' role (valid per users.role_check). */
async function createTestUser(
  client: PoolClient,
  emailPrefix: string,
  role: string = 'caravan',
): Promise<string> {
  const email = `${emailPrefix}@test.local`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, role, password_hash)
     VALUES ($1, 'Test', 'S3b', $2, 'test-hash')
     ON CONFLICT (email) DO UPDATE SET is_active = TRUE
     RETURNING id`,
    [email, role],
  );
  return rows[0].id;
}

/** Clean up all test rows for a given email prefix (uses pool directly — no shared client) */
async function cleanupTestUserByEmail(emailPrefix: string): Promise<void> {
  const email = `${emailPrefix}@test.local`;
  const { rows } = await testPool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (rows.length === 0) return;
  const userId = rows[0].id;
  await testPool.query(
    `UPDATE group_caravan_municipalities SET deleted_at = NOW()
     WHERE caravan_user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  await testPool.query(
    `UPDATE group_role_members SET deleted_at = NOW()
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  await testPool.query(`DELETE FROM assignment_audit WHERE target_user_id = $1`, [userId]);
  await testPool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

const TEST_EMAIL_PREFIXES = [
  'TEST_AREA_RBAC_S3B_caravan_a',
  'TEST_AREA_RBAC_S3B_caravan_b',
  'TEST_AREA_RBAC_S3B_caravan_dup',
];

// Clean up before each test to ensure a fresh slate
beforeEach(async () => {
  for (const prefix of TEST_EMAIL_PREFIXES) {
    await cleanupTestUserByEmail(prefix);
  }
});

afterAll(async () => {
  for (const prefix of TEST_EMAIL_PREFIXES) {
    await cleanupTestUserByEmail(prefix);
  }
});

describe('Caravan management DB layer (stage 3b)', () => {

  // ─── Scenario 1: Municipality not in pool → trigger raises ───────────────

  it('trigger raises municipality_not_in_group_pool for invalid municipality', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_caravan_a');

      // Insert caravan membership first
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3)`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );

      // Attempt to insert a municipality NOT in the group's pool
      let caughtError: any = null;
      try {
        await client.query(
          `INSERT INTO group_caravan_municipalities
             (group_id, caravan_user_id, province, municipality, assigned_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [REAL_GROUP_ID, userId, NOT_IN_POOL_MUN.province, NOT_IN_POOL_MUN.municipality, REAL_AREA_HEAD_ID],
        );
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toMatch(/municipality_not_in_group_pool/);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Scenario 2: Valid insert → membership + slice rows created + audit ──

  it('POST /caravans logic: inserts caravan membership + slice + audit row', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_caravan_a');

      // Insert caravan membership
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3)
         ON CONFLICT DO NOTHING`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );

      // Insert valid municipality slice
      const { rows: sliceRows } = await client.query<{ province: string; municipality: string }>(
        `INSERT INTO group_caravan_municipalities
           (group_id, caravan_user_id, province, municipality, assigned_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING province, municipality`,
        [REAL_GROUP_ID, userId, POOL_MUN_1.province, POOL_MUN_1.municipality, REAL_AREA_HEAD_ID],
      );
      expect(sliceRows).toHaveLength(1);
      expect(sliceRows[0].province).toBe(POOL_MUN_1.province);
      expect(sliceRows[0].municipality).toBe(POOL_MUN_1.municipality);

      // Write audit row
      await client.query(
        `INSERT INTO assignment_audit
           (actor_user_id, action, target_user_id, target_group_id, payload_json)
         VALUES ($1, 'caravan.assign', $2, $3, $4)`,
        [REAL_AREA_HEAD_ID, userId, REAL_GROUP_ID, JSON.stringify({ municipalities: sliceRows })],
      );

      // Verify membership exists
      const { rows: memberRows } = await client.query(
        `SELECT id FROM group_role_members
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'caravan' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(memberRows).toHaveLength(1);

      // Verify audit row written
      const { rows: auditRows } = await client.query(
        `SELECT action FROM assignment_audit
          WHERE target_user_id = $1 AND target_group_id = $2
            AND action = 'caravan.assign'`,
        [userId, REAL_GROUP_ID],
      );
      expect(auditRows).toHaveLength(1);

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Scenario 3: Caravan already in another group → unique index blocks ──

  it('unique index blocks caravan assigned to two groups simultaneously', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_caravan_dup');

      // Assign to NORTH AGUILA first
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3)`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );

      // Get a second different group
      const { rows: otherGroups } = await client.query<{ id: string }>(
        `SELECT id FROM groups WHERE id != $1 LIMIT 1`,
        [REAL_GROUP_ID],
      );
      const secondGroupId = otherGroups[0]?.id;
      expect(secondGroupId).toBeDefined();

      // Try to assign to a second group → should hit uq_group_role_members_one_group_for_caravan
      let caughtError: any = null;
      try {
        await client.query(
          `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
           VALUES ($1, $2, 'caravan', $3)`,
          [secondGroupId, userId, REAL_AREA_HEAD_ID],
        );
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.code).toBe('23505');
      expect(caughtError.constraint).toMatch(/one_group_for_caravan/);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Scenario 4: PATCH /municipalities replaces correctly ────────────────

  it('PATCH /municipalities: soft-deletes removed, inserts added', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_caravan_a');

      // Setup: caravan with MUN_1
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3) ON CONFLICT DO NOTHING`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );
      await client.query(
        `INSERT INTO group_caravan_municipalities
           (group_id, caravan_user_id, province, municipality, assigned_by)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [REAL_GROUP_ID, userId, POOL_MUN_1.province, POOL_MUN_1.municipality, REAL_AREA_HEAD_ID],
      );

      await client.query('COMMIT');

      // Now simulate PATCH: replace MUN_1 with MUN_2
      await client.query('BEGIN');

      const { rows: existing } = await client.query<{ province: string; municipality: string }>(
        `SELECT province, municipality FROM group_caravan_municipalities
          WHERE group_id = $1 AND caravan_user_id = $2 AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );

      const newMunicipalities = [POOL_MUN_2];
      const existingSet = new Set(existing.map(e => `${e.province}|${e.municipality}`));
      const newSet = new Set(newMunicipalities.map(m => `${m.province}|${m.municipality}`));

      const toRemove = existing.filter(e => !newSet.has(`${e.province}|${e.municipality}`));
      const toAdd = newMunicipalities.filter(m => !existingSet.has(`${m.province}|${m.municipality}`));

      for (const r of toRemove) {
        await client.query(
          `UPDATE group_caravan_municipalities SET deleted_at = NOW()
            WHERE group_id = $1 AND caravan_user_id = $2
              AND province = $3 AND municipality = $4 AND deleted_at IS NULL`,
          [REAL_GROUP_ID, userId, r.province, r.municipality],
        );
      }
      for (const a of toAdd) {
        await client.query(
          `INSERT INTO group_caravan_municipalities
             (group_id, caravan_user_id, province, municipality, assigned_by)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [REAL_GROUP_ID, userId, a.province, a.municipality, REAL_AREA_HEAD_ID],
        );
      }

      expect(toRemove).toHaveLength(1);
      expect(toRemove[0].municipality).toBe(POOL_MUN_1.municipality);
      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].municipality).toBe(POOL_MUN_2.municipality);

      await client.query('COMMIT');

      // Verify final state: only MUN_2 active
      const { rows: finalRows } = await testPool.query(
        `SELECT province, municipality FROM group_caravan_municipalities
          WHERE group_id = $1 AND caravan_user_id = $2 AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(finalRows).toHaveLength(1);
      expect(finalRows[0].municipality).toBe(POOL_MUN_2.municipality);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Scenario 5: DELETE /caravans soft-deletes member + slices atomically ─

  it('DELETE /caravans: soft-deletes member + slices atomically', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_caravan_b');

      // Setup: caravan with two slices
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3)`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );
      await client.query(
        `INSERT INTO group_caravan_municipalities
           (group_id, caravan_user_id, province, municipality, assigned_by)
         VALUES ($1, $2, $3, $4, $5), ($1, $2, $6, $7, $5)`,
        [REAL_GROUP_ID, userId, POOL_MUN_1.province, POOL_MUN_1.municipality,
         REAL_AREA_HEAD_ID, POOL_MUN_2.province, POOL_MUN_2.municipality],
      );

      await client.query('COMMIT');

      // Now simulate DELETE: soft-delete slices first, then membership
      await client.query('BEGIN');

      await client.query(
        `UPDATE group_caravan_municipalities SET deleted_at = NOW()
          WHERE group_id = $1 AND caravan_user_id = $2 AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );

      const { rowCount } = await client.query(
        `UPDATE group_role_members SET deleted_at = NOW()
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'caravan' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(rowCount).toBe(1);

      await client.query('COMMIT');

      // Verify: no active slices, no active membership
      const { rows: activeSlices } = await testPool.query(
        `SELECT id FROM group_caravan_municipalities
          WHERE caravan_user_id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      expect(activeSlices).toHaveLength(0);

      const { rows: activeMembership } = await testPool.query(
        `SELECT id FROM group_role_members
          WHERE user_id = $1 AND role_in_group = 'caravan' AND deleted_at IS NULL`,
        [userId],
      );
      expect(activeMembership).toHaveLength(0);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Scenario 6: ensureGroupAccess rejects non-eligible actor ─────────────

  it('ensureGroupAccess: tele-only user does not have area_head/asst/TL access', async () => {
    // A tele user should NOT be in group_role_members with role area_head/asst/TL
    const { rows } = await testPool.query<{ user_id: string }>(
      `SELECT grm.user_id
         FROM group_role_members grm
        WHERE grm.group_id = $1
          AND grm.role_in_group = 'tele'
          AND grm.deleted_at IS NULL
        LIMIT 1`,
      [REAL_GROUP_ID],
    );

    if (rows.length === 0) {
      console.warn('SKIP: no tele member in NORTH AGUILA; check backfill');
      return;
    }

    const teleUserId = rows[0].user_id;

    // Simulate ensureGroupAccess check: look for area_head/asst/TL roles for this user
    const { rows: allowedRoles } = await testPool.query<{ role_in_group: string }>(
      `SELECT role_in_group FROM group_role_members
        WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [REAL_GROUP_ID, teleUserId],
    );

    const allowed = ['area_head', 'assistant_area_head', 'team_leader'];
    const hasAllowed = allowedRoles.some(r => allowed.includes(r.role_in_group));
    expect(hasAllowed).toBe(false); // Tele user should NOT have management access
  }, TEST_TIMEOUT);

  // ─── Orphan-row check ─────────────────────────────────────────────────────

  it('no test orphan rows left in users table', async () => {
    const { rows } = await testPool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE email LIKE '%@test.local'`,
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  }, TEST_TIMEOUT);
});
