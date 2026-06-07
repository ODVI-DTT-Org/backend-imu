/**
 * Integration tests: Team leader management endpoints (stage 3b)
 *
 * Covers POST/DELETE /team-leaders logic at the DB layer.
 * Tests run against prod DB. Test rows use TEST_AREA_RBAC_S3B_ prefix.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';

const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

const TEST_TIMEOUT = 30_000;

const REAL_GROUP_ID = 'ca9b3da1-5f39-43c9-b9a9-07ddf8ffe108'; // NORTH AGUILA
const REAL_AREA_HEAD_ID = '42166cdb-4304-404a-a833-2894c4ec8af9'; // area_head actor

/** Insert a test user and return their ID */
async function createTestUser(client: PoolClient, emailPrefix: string): Promise<string> {
  const email = `${emailPrefix}@test.local`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, role, password_hash)
     VALUES ($1, 'Test', 'S3b', 'team_leader', 'test-hash')
     ON CONFLICT (email) DO UPDATE SET is_active = TRUE
     RETURNING id`,
    [email],
  );
  return rows[0].id;
}

async function cleanupTestUserByEmail(emailPrefix: string): Promise<void> {
  const email = `${emailPrefix}@test.local`;
  const { rows } = await testPool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (rows.length === 0) return;
  const userId = rows[0].id;
  await testPool.query(
    `UPDATE group_role_members SET deleted_at = NOW()
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  await testPool.query(`DELETE FROM assignment_audit WHERE target_user_id = $1`, [userId]);
  await testPool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

const TEST_EMAIL_PREFIXES = [
  'TEST_AREA_RBAC_S3B_tl_a',
  'TEST_AREA_RBAC_S3B_tl_b',
];

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

describe('Team leader management DB layer (stage 3b)', () => {

  // ─── Happy path: assign TL ────────────────────────────────────────────────

  it('inserts team_leader row in group_role_members + audit', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_tl_a');

      const { rows } = await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'team_leader', $3)
         RETURNING id, group_id, user_id, role_in_group, assigned_at`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].role_in_group).toBe('team_leader');

      await client.query(
        `INSERT INTO assignment_audit
           (actor_user_id, action, target_user_id, target_group_id)
         VALUES ($1, 'team_leader.assign', $2, $3)`,
        [REAL_AREA_HEAD_ID, userId, REAL_GROUP_ID],
      );

      await client.query('COMMIT');

      // Verify membership
      const { rows: memberRows } = await testPool.query(
        `SELECT id FROM group_role_members
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'team_leader' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(memberRows).toHaveLength(1);

      // Verify audit
      const { rows: auditRows } = await testPool.query(
        `SELECT action FROM assignment_audit
          WHERE target_user_id = $1 AND action = 'team_leader.assign'`,
        [userId],
      );
      expect(auditRows).toHaveLength(1);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Cardinality: TL cannot be in two groups ──────────────────────────────

  it('uq_group_role_members_one_group_for_tl blocks TL in two groups', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_tl_b');

      // Assign to first group
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'team_leader', $3)`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );

      // Get a second group
      const { rows: otherGroups } = await client.query<{ id: string }>(
        `SELECT id FROM groups WHERE id != $1 LIMIT 1`,
        [REAL_GROUP_ID],
      );
      const secondGroupId = otherGroups[0]?.id;
      expect(secondGroupId).toBeDefined();

      // Try second group → should hit uq_group_role_members_one_group_for_tl
      let caughtError: any = null;
      try {
        await client.query(
          `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
           VALUES ($1, $2, 'team_leader', $3)`,
          [secondGroupId, userId, REAL_AREA_HEAD_ID],
        );
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.code).toBe('23505');
      expect(caughtError.constraint).toMatch(/one_group_for_tl/);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Happy path: remove TL ────────────────────────────────────────────────

  it('soft-deletes TL membership + writes audit row', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_tl_a');

      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'team_leader', $3)`,
        [REAL_GROUP_ID, userId, REAL_AREA_HEAD_ID],
      );
      await client.query('COMMIT');

      // Now delete
      const { rowCount } = await testPool.query(
        `UPDATE group_role_members SET deleted_at = NOW()
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'team_leader' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(rowCount).toBe(1);

      // Verify soft-deleted
      const { rows: activeRows } = await testPool.query(
        `SELECT id FROM group_role_members
          WHERE user_id = $1 AND role_in_group = 'team_leader' AND deleted_at IS NULL`,
        [userId],
      );
      expect(activeRows).toHaveLength(0);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Not found: removing non-existent TL → rowCount 0 ─────────────────────

  it('DELETE returns rowCount 0 for non-existent TL → NotFoundError path', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000099';
    const { rowCount } = await testPool.query(
      `UPDATE group_role_members SET deleted_at = NOW()
        WHERE group_id = $1 AND user_id = $2
          AND role_in_group = 'team_leader' AND deleted_at IS NULL`,
      [REAL_GROUP_ID, fakeUserId],
    );
    expect(rowCount).toBe(0); // endpoint throws NotFoundError when rowCount === 0
  }, TEST_TIMEOUT);

  // ─── ensureGroupAccess: area_head can manage this group ──────────────────

  it('ensureGroupAccess: real area_head has access to manage NORTH AGUILA', async () => {
    const { rows } = await testPool.query<{ role_in_group: string }>(
      `SELECT role_in_group FROM group_role_members
        WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [REAL_GROUP_ID, REAL_AREA_HEAD_ID],
    );
    const allowed = ['area_head', 'assistant_area_head', 'team_leader'];
    const hasAllowed = rows.some(r => allowed.includes(r.role_in_group));
    expect(hasAllowed).toBe(true);
  }, TEST_TIMEOUT);

  // ─── Orphan-row check ─────────────────────────────────────────────────────

  it('no test orphan rows left in users table', async () => {
    const { rows } = await testPool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE email LIKE '%@test.local'`,
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  }, TEST_TIMEOUT);
});
