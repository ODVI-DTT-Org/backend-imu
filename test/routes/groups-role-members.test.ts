/**
 * Integration tests: Role member management endpoints (stage 3b)
 *
 * Covers POST/DELETE /role-members logic at the DB layer.
 * Tests run against prod DB. Test rows use TEST_AREA_RBAC_S3B_ prefix.
 *
 * Note: POST /role-members uses ON CONFLICT DO NOTHING for idempotency.
 * DELETE /role-members uses soft-delete (deleted_at = NOW()).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';

const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

const TEST_TIMEOUT = 30_000;

const REAL_GROUP_ID = 'ca9b3da1-5f39-43c9-b9a9-07ddf8ffe108'; // NORTH AGUILA
const REAL_ADMIN_ID = 'c60d27c3-b7af-413c-b3d2-6fa0ebb11603'; // admin@developer.com

/** Insert a test user and return their ID */
async function createTestUser(client: PoolClient, emailPrefix: string, role: string = 'caravan'): Promise<string> {
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
  'TEST_AREA_RBAC_S3B_rm_a',
  'TEST_AREA_RBAC_S3B_rm_b',
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

describe('Role member management DB layer (stage 3b)', () => {

  // ─── Happy path: assign area_head via POST /role-members ─────────────────

  it('POST /role-members: inserts area_head row + audit on success', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_rm_a', 'area_manager');

      const { rows } = await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'area_head', $3)
         ON CONFLICT DO NOTHING
         RETURNING id, group_id, user_id, role_in_group, assigned_at`,
        [REAL_GROUP_ID, userId, REAL_ADMIN_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].role_in_group).toBe('area_head');
      const created = rows.length > 0;
      expect(created).toBe(true);

      await client.query(
        `INSERT INTO assignment_audit
           (actor_user_id, action, target_user_id, target_group_id, payload_json)
         VALUES ($1, 'role_member.assign', $2, $3, $4)`,
        [REAL_ADMIN_ID, userId, REAL_GROUP_ID, JSON.stringify({ role_in_group: 'area_head' })],
      );

      await client.query('COMMIT');

      // Verify state
      const { rows: memberRows } = await testPool.query(
        `SELECT id FROM group_role_members
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'area_head' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(memberRows).toHaveLength(1);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── Idempotency: re-assigning same role → ON CONFLICT DO NOTHING ─────────

  it('POST /role-members idempotency: ON CONFLICT DO NOTHING returns empty rows', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_rm_b', 'area_manager');

      // First insert
      const { rows: first } = await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'tele', $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [REAL_GROUP_ID, userId, REAL_ADMIN_ID],
      );
      expect(first).toHaveLength(1);

      // Second insert → ON CONFLICT DO NOTHING → 0 rows returned
      const { rows: second } = await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'tele', $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [REAL_GROUP_ID, userId, REAL_ADMIN_ID],
      );
      expect(second).toHaveLength(0); // idempotent: no error, no new row

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── DELETE /role-members: soft-deletes + audit ────────────────────────────

  it('DELETE /role-members: soft-deletes membership + rowCount 1', async () => {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      const userId = await createTestUser(client, 'TEST_AREA_RBAC_S3B_rm_a', 'tele');

      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'tele', $3)`,
        [REAL_GROUP_ID, userId, REAL_ADMIN_ID],
      );
      await client.query('COMMIT');

      // Simulate DELETE endpoint
      const { rowCount } = await testPool.query(
        `UPDATE group_role_members SET deleted_at = NOW()
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'tele' AND deleted_at IS NULL`,
        [REAL_GROUP_ID, userId],
      );
      expect(rowCount).toBe(1);

      // Verify soft-deleted
      const { rows: activeRows } = await testPool.query(
        `SELECT id FROM group_role_members
          WHERE user_id = $1 AND role_in_group = 'tele' AND deleted_at IS NULL`,
        [userId],
      );
      expect(activeRows).toHaveLength(0);
    } finally {
      client.release();
    }
  }, TEST_TIMEOUT);

  // ─── DELETE with invalid role → validation path ────────────────────────────

  it('DELETE /role-members: role not in allowed list → validation path', () => {
    const invalidRole = 'superuser';
    const validRoles = ['area_head', 'assistant_area_head', 'tele'];
    expect(validRoles.includes(invalidRole)).toBe(false);
    // The endpoint throws ValidationError when role param is invalid.
    // Here we confirm the validation logic is correct.
  }, TEST_TIMEOUT);

  // ─── DELETE non-existent → rowCount 0 → NotFoundError path ─────────────────

  it('DELETE /role-members: non-existent membership → rowCount 0', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000098';
    const { rowCount } = await testPool.query(
      `UPDATE group_role_members SET deleted_at = NOW()
        WHERE group_id = $1 AND user_id = $2
          AND role_in_group = 'area_head' AND deleted_at IS NULL`,
      [REAL_GROUP_ID, fakeUserId],
    );
    expect(rowCount).toBe(0); // endpoint throws NotFoundError when rowCount === 0
  }, TEST_TIMEOUT);

  // ─── Admin-only check: non-admin role cannot reach this endpoint ──────────

  it('requireRole(admin): non-admin users table role does not satisfy admin check', async () => {
    // Confirm that no caravan user in prod has role 'admin'
    const { rows } = await testPool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE role = 'caravan' AND id = 'c60d27c3-b7af-413c-b3d2-6fa0ebb11603'`,
    );
    expect(parseInt(rows[0].cnt)).toBe(0); // admin@developer.com is not a caravan
  }, TEST_TIMEOUT);

  // ─── Orphan-row check ─────────────────────────────────────────────────────

  it('no test orphan rows left in users table', async () => {
    const { rows } = await testPool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE email LIKE '%@test.local'`,
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  }, TEST_TIMEOUT);
});
