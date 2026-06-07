import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_GROUP_NAME_PREFIX = 'TEST_AREA_RBAC_MIRROR_';
const TEST_EMAIL_SUFFIX = '@test.local';

let testGroupId: string;
let testAdminId: string;
let testCaravanId: string;
let testAreaMgrId: string;
let testAsstAreaMgrId: string;

async function cleanup(): Promise<void> {
  // Clean up in dependency order
  await pool.query(`
    DELETE FROM group_role_members WHERE group_id IN
      (SELECT id FROM groups WHERE name LIKE $1)
  `, [`${TEST_GROUP_NAME_PREFIX}%`]);
  await pool.query(`
    DELETE FROM group_members WHERE group_id IN
      (SELECT id FROM groups WHERE name LIKE $1)
  `, [`${TEST_GROUP_NAME_PREFIX}%`]);
  await pool.query(`
    DELETE FROM group_municipalities WHERE group_id IN
      (SELECT id FROM groups WHERE name LIKE $1)
  `, [`${TEST_GROUP_NAME_PREFIX}%`]);
  await pool.query(`DELETE FROM groups WHERE name LIKE $1`, [`${TEST_GROUP_NAME_PREFIX}%`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%${TEST_EMAIL_SUFFIX}`]);
}

async function seed(): Promise<void> {
  const admin = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), $1, 'test-hash', 'Mirror', 'Admin', 'admin')
    RETURNING id
  `, [`mirror-admin${TEST_EMAIL_SUFFIX}`]);
  testAdminId = admin.rows[0].id;

  const caravan = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), $1, 'test-hash', 'Mirror', 'Caravan', 'caravan')
    RETURNING id
  `, [`mirror-caravan${TEST_EMAIL_SUFFIX}`]);
  testCaravanId = caravan.rows[0].id;

  const areaMgr = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), $1, 'test-hash', 'Mirror', 'AreaMgr', 'area_manager')
    RETURNING id
  `, [`mirror-area-mgr${TEST_EMAIL_SUFFIX}`]);
  testAreaMgrId = areaMgr.rows[0].id;

  const asstAreaMgr = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), $1, 'test-hash', 'Mirror', 'AsstAreaMgr', 'assistant_area_manager')
    RETURNING id
  `, [`mirror-asst-area-mgr${TEST_EMAIL_SUFFIX}`]);
  testAsstAreaMgrId = asstAreaMgr.rows[0].id;

  const group = await pool.query<{ id: string }>(`
    INSERT INTO groups (id, name) VALUES (gen_random_uuid(), $1)
    RETURNING id
  `, [`${TEST_GROUP_NAME_PREFIX}BASE`]);
  testGroupId = group.rows[0].id;
}

beforeEach(async () => { await cleanup(); await seed(); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe('Mirror trigger: group_members → group_role_members', () => {
  it('1. INSERT into group_members mirrors into group_role_members with role=caravan', async () => {
    await pool.query(`
      INSERT INTO group_members (group_id, client_id) VALUES ($1, $2)
    `, [testGroupId, testCaravanId]);

    const { rows } = await pool.query(`
      SELECT role_in_group, user_id, deleted_at
        FROM group_role_members
       WHERE group_id = $1 AND user_id = $2
    `, [testGroupId, testCaravanId]);

    expect(rows).toHaveLength(1);
    expect(rows[0].role_in_group).toBe('caravan');
    expect(rows[0].deleted_at).toBeNull();
  });

  it('2. DELETE from group_members soft-deletes the mirror caravan row', async () => {
    await pool.query(`
      INSERT INTO group_members (group_id, client_id) VALUES ($1, $2)
    `, [testGroupId, testCaravanId]);

    // Verify mirrored row exists
    const before = await pool.query(`
      SELECT id FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'caravan' AND deleted_at IS NULL
    `, [testGroupId, testCaravanId]);
    expect(before.rows).toHaveLength(1);

    // Delete from legacy table
    await pool.query(`
      DELETE FROM group_members WHERE group_id = $1 AND client_id = $2
    `, [testGroupId, testCaravanId]);

    // Mirror row should now be soft-deleted
    const after = await pool.query(`
      SELECT id, deleted_at FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'caravan'
    `, [testGroupId, testCaravanId]);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].deleted_at).not.toBeNull();
  });

  it('7. Idempotency: re-inserting via legacy does not duplicate mirror rows', async () => {
    // Insert directly into group_role_members first (simulating backfill)
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group)
      VALUES ($1, $2, 'caravan')
    `, [testGroupId, testCaravanId]);

    // Now trigger via group_members insert — should ON CONFLICT DO NOTHING
    await pool.query(`
      INSERT INTO group_members (group_id, client_id) VALUES ($1, $2)
    `, [testGroupId, testCaravanId]);

    const { rows } = await pool.query(`
      SELECT id FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'caravan' AND deleted_at IS NULL
    `, [testGroupId, testCaravanId]);
    expect(rows).toHaveLength(1);
  });
});

describe('Mirror trigger: groups.area_manager_id / assistant_area_manager_id', () => {
  it('3. UPDATE groups.area_manager_id from NULL → user_id inserts mirror row', async () => {
    // Group starts with no area_manager_id; update it
    await pool.query(`
      UPDATE groups SET area_manager_id = $1 WHERE id = $2
    `, [testAreaMgrId, testGroupId]);

    const { rows } = await pool.query(`
      SELECT role_in_group, deleted_at FROM group_role_members
       WHERE group_id = $1 AND user_id = $2
    `, [testGroupId, testAreaMgrId]);

    expect(rows).toHaveLength(1);
    expect(rows[0].role_in_group).toBe('area_head');
    expect(rows[0].deleted_at).toBeNull();
  });

  it('4. UPDATE groups.area_manager_id from user1 → user2 soft-deletes old + inserts new', async () => {
    // Set initial area manager
    await pool.query(`
      UPDATE groups SET area_manager_id = $1 WHERE id = $2
    `, [testAreaMgrId, testGroupId]);

    // Create a second area manager user
    const areaMgr2 = await pool.query<{ id: string }>(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role)
      VALUES (gen_random_uuid(), $1, 'test-hash', 'Mirror', 'AreaMgr2', 'area_manager')
      RETURNING id
    `, [`mirror-area-mgr2${TEST_EMAIL_SUFFIX}`]);
    const areaMgr2Id = areaMgr2.rows[0].id;

    // Swap to new area manager
    await pool.query(`
      UPDATE groups SET area_manager_id = $1 WHERE id = $2
    `, [areaMgr2Id, testGroupId]);

    // Old manager row should be soft-deleted
    const oldRow = await pool.query(`
      SELECT deleted_at FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'area_head'
    `, [testGroupId, testAreaMgrId]);
    expect(oldRow.rows).toHaveLength(1);
    expect(oldRow.rows[0].deleted_at).not.toBeNull();

    // New manager row should be active
    const newRow = await pool.query(`
      SELECT deleted_at FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'area_head' AND deleted_at IS NULL
    `, [testGroupId, areaMgr2Id]);
    expect(newRow.rows).toHaveLength(1);
    expect(newRow.rows[0].deleted_at).toBeNull();
  });

  it('5. UPDATE groups.area_manager_id from user_id → NULL soft-deletes mirror row', async () => {
    // Set initial area manager
    await pool.query(`
      UPDATE groups SET area_manager_id = $1 WHERE id = $2
    `, [testAreaMgrId, testGroupId]);

    // Clear it
    await pool.query(`
      UPDATE groups SET area_manager_id = NULL WHERE id = $1
    `, [testGroupId]);

    const { rows } = await pool.query(`
      SELECT deleted_at FROM group_role_members
       WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'area_head'
    `, [testGroupId, testAreaMgrId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('6. INSERT new group with area_manager_id populated mirrors immediately', async () => {
    const newGroup = await pool.query<{ id: string }>(`
      INSERT INTO groups (id, name, area_manager_id, assistant_area_manager_id)
      VALUES (gen_random_uuid(), $1, $2, $3)
      RETURNING id
    `, [`${TEST_GROUP_NAME_PREFIX}WITH_MGR`, testAreaMgrId, testAsstAreaMgrId]);
    const newGroupId = newGroup.rows[0].id;

    try {
      const { rows } = await pool.query(`
        SELECT role_in_group, deleted_at FROM group_role_members
         WHERE group_id = $1 ORDER BY role_in_group
      `, [newGroupId]);

      expect(rows).toHaveLength(2);
      const roles = rows.map((r: { role_in_group: string }) => r.role_in_group);
      expect(roles).toContain('area_head');
      expect(roles).toContain('assistant_area_head');
      rows.forEach((r: { deleted_at: unknown }) => expect(r.deleted_at).toBeNull());
    } finally {
      // Extra cleanup for this test's group
      await pool.query(`DELETE FROM group_role_members WHERE group_id = $1`, [newGroupId]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [newGroupId]);
    }
  });
});
