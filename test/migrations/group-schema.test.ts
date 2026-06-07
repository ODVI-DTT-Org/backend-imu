import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

describe('Area-RBAC stage 1 schema', () => {
  it('group_role_members table exists with expected columns', async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'group_role_members'
    `);
    const cols = rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id','group_id','user_id','role_in_group',
      'assigned_at','assigned_by','deleted_at',
    ]));
  });

  it('group_role_members has the three required unique indexes', async () => {
    const { rows } = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'group_role_members'
        AND indexname LIKE 'uq_group_role_members_%'
      ORDER BY indexname
    `);
    expect(rows.map(r => r.indexname)).toEqual([
      'uq_group_role_members_no_dup_per_group',
      'uq_group_role_members_one_group_for_caravan',
      'uq_group_role_members_one_group_for_tl',
    ]);
  });

  it('group_caravan_municipalities table exists with composite location key', async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'group_caravan_municipalities'
    `);
    const cols = rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id','group_id','caravan_user_id','province','municipality',
      'assigned_at','assigned_by','deleted_at',
    ]));
    expect(cols).not.toContain('municipality_id');
  });

  it('group_municipalities now has soft-delete columns', async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'group_municipalities'
        AND column_name IN ('deleted_at','assigned_by','assigned_at')
    `);
    expect(rows.length).toBe(3);
  });

  it('assignment_audit table exists with target_province + target_municipality', async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'assignment_audit'
    `);
    const cols = rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id','actor_user_id','action','target_user_id','target_group_id',
      'target_province','target_municipality','payload_json','created_at',
    ]));
  });

  it('all three invariant triggers are installed', async () => {
    const { rows } = await pool.query<{ tgname: string }>(`
      SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'gcm_validate_insert_update',
          'gm_block_pool_removal_with_dependents',
          'grm_block_caravan_member_removal_with_slices'
        )
      ORDER BY tgname
    `);
    expect(rows.map(r => r.tgname)).toEqual([
      'gcm_validate_insert_update',
      'gm_block_pool_removal_with_dependents',
      'grm_block_caravan_member_removal_with_slices',
    ]);
  });
});
