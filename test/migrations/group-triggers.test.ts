import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_PROVINCE = 'TEST_AREA_RBAC_PROVINCE';
const TEST_MUNICIPALITY = 'TEST_AREA_RBAC_MUNICIPALITY';
const TEST_GROUP_NAME = 'TEST_AREA_RBAC_GROUP';
const TEST_EMAIL_SUFFIX = '@test.local';

let testGroupId: string;
let testAdminId: string;
let testCaravanId: string;

async function cleanup(): Promise<void> {
  await pool.query(`
    DELETE FROM group_caravan_municipalities
    WHERE province = $1 AND municipality = $2
  `, [TEST_PROVINCE, TEST_MUNICIPALITY]);
  await pool.query(`
    DELETE FROM group_role_members WHERE group_id IN
      (SELECT id FROM groups WHERE name LIKE 'TEST_AREA_RBAC_%')
  `);
  await pool.query(`
    DELETE FROM group_municipalities WHERE group_id IN
      (SELECT id FROM groups WHERE name LIKE 'TEST_AREA_RBAC_%')
  `);
  await pool.query(`DELETE FROM groups WHERE name LIKE 'TEST_AREA_RBAC_%'`);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%${TEST_EMAIL_SUFFIX}`]);
}

async function seed(): Promise<void> {
  const admin = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), 'trigger-admin' || $1, 'test-hash', 'Test', 'Admin', 'admin')
    RETURNING id
  `, [TEST_EMAIL_SUFFIX]);
  testAdminId = admin.rows[0].id;

  const caravan = await pool.query<{ id: string }>(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role)
    VALUES (gen_random_uuid(), 'trigger-caravan' || $1, 'test-hash', 'Test', 'Caravan', 'caravan')
    RETURNING id
  `, [TEST_EMAIL_SUFFIX]);
  testCaravanId = caravan.rows[0].id;

  const group = await pool.query<{ id: string }>(`
    INSERT INTO groups (id, name) VALUES (gen_random_uuid(), $1)
    RETURNING id
  `, [TEST_GROUP_NAME]);
  testGroupId = group.rows[0].id;

  await pool.query(`
    INSERT INTO group_municipalities (group_id, province, municipality, assigned_by)
    VALUES ($1, $2, $3, $4)
  `, [testGroupId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId]);
}

beforeEach(async () => { await cleanup(); await seed(); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe('Trigger gcm_validate_insert_update', () => {
  it('rejects insert when (province, municipality) is not in group pool', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);

    await expect(pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, 'NOT_IN_POOL', 'NOT_IN_POOL', $3)
    `, [testGroupId, testCaravanId, testAdminId])).rejects.toThrow(/municipality_not_in_group_pool/);
  });

  it('rejects insert when caravan is not a member of the group', async () => {
    await expect(pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [testGroupId, testCaravanId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId])).rejects.toThrow(/caravan_not_member_of_group/);
  });

  it('accepts insert when both invariants are satisfied', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);

    const { rowCount } = await pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [testGroupId, testCaravanId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId]);
    expect(rowCount).toBe(1);
  });
});

describe('Trigger gm_block_pool_removal_with_dependents', () => {
  it('blocks soft-deleting a municipality that a caravan is assigned to', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);
    await pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [testGroupId, testCaravanId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId]);

    await expect(pool.query(`
      UPDATE group_municipalities SET deleted_at = NOW()
      WHERE group_id = $1 AND province = $2 AND municipality = $3
    `, [testGroupId, TEST_PROVINCE, TEST_MUNICIPALITY])).rejects.toThrow(/group_pool_has_dependents/);
  });

  it('allows soft-deleting a municipality with no dependents', async () => {
    const { rowCount } = await pool.query(`
      UPDATE group_municipalities SET deleted_at = NOW()
      WHERE group_id = $1 AND province = $2 AND municipality = $3
    `, [testGroupId, TEST_PROVINCE, TEST_MUNICIPALITY]);
    expect(rowCount).toBe(1);
  });
});

describe('Trigger grm_block_caravan_member_removal_with_slices', () => {
  it('blocks soft-deleting a caravan member who still has slices', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);
    await pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [testGroupId, testCaravanId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId]);

    await expect(pool.query(`
      UPDATE group_role_members SET deleted_at = NOW()
      WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'caravan'
    `, [testGroupId, testCaravanId])).rejects.toThrow(/caravan_member_has_active_slices/);
  });

  it('allows soft-deleting a caravan member after their slices are removed', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);
    await pool.query(`
      INSERT INTO group_caravan_municipalities
        (group_id, caravan_user_id, province, municipality, assigned_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [testGroupId, testCaravanId, TEST_PROVINCE, TEST_MUNICIPALITY, testAdminId]);

    await pool.query(`
      UPDATE group_caravan_municipalities SET deleted_at = NOW()
      WHERE group_id = $1 AND caravan_user_id = $2
    `, [testGroupId, testCaravanId]);

    const { rowCount } = await pool.query(`
      UPDATE group_role_members SET deleted_at = NOW()
      WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'caravan'
    `, [testGroupId, testCaravanId]);
    expect(rowCount).toBe(1);
  });

  it('does NOT block soft-deleting a non-caravan member with no slice check', async () => {
    const tl = await pool.query<{ id: string }>(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role)
      VALUES (gen_random_uuid(), 'trigger-tl' || $1, 'test-hash', 'Test', 'TL', 'team_leader')
      RETURNING id
    `, [TEST_EMAIL_SUFFIX]);
    const tlId = tl.rows[0].id;
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'team_leader', $3)
    `, [testGroupId, tlId, testAdminId]);

    const { rowCount } = await pool.query(`
      UPDATE group_role_members SET deleted_at = NOW()
      WHERE group_id = $1 AND user_id = $2 AND role_in_group = 'team_leader'
    `, [testGroupId, tlId]);
    expect(rowCount).toBe(1);
  });
});

describe('Cardinality unique indexes', () => {
  it('prevents the same caravan from being assigned to two groups simultaneously', async () => {
    await pool.query(`
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES ($1, $2, 'caravan', $3)
    `, [testGroupId, testCaravanId, testAdminId]);

    const otherGroup = await pool.query<{ id: string }>(`
      INSERT INTO groups (id, name) VALUES (gen_random_uuid(), $1)
      RETURNING id
    `, [TEST_GROUP_NAME + '_OTHER']);
    try {
      await expect(pool.query(`
        INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
        VALUES ($1, $2, 'caravan', $3)
      `, [otherGroup.rows[0].id, testCaravanId, testAdminId])).rejects.toThrow(/uq_group_role_members_one_group_for_caravan|duplicate key/);
    } finally {
      await pool.query(`DELETE FROM group_role_members WHERE group_id = $1`, [otherGroup.rows[0].id]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [otherGroup.rows[0].id]);
    }
  });
});
