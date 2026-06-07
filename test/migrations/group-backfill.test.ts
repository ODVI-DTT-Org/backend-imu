import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

describe('Area-RBAC stage 2 backfill', () => {
  it('every group has at least one area_head', async () => {
    const { rows } = await pool.query<{ groups_without_ah: string }>(`
      SELECT COUNT(*)::text AS groups_without_ah FROM groups g
      WHERE NOT EXISTS (
        SELECT 1 FROM group_role_members grm
        WHERE grm.group_id = g.id AND grm.role_in_group = 'area_head' AND grm.deleted_at IS NULL
      )
    `);
    expect(parseInt(rows[0].groups_without_ah, 10)).toBe(0);
  });

  it('every caravan slice has a matching pool row', async () => {
    const { rows } = await pool.query<{ orphan_slices: string }>(`
      SELECT COUNT(*)::text AS orphan_slices FROM group_caravan_municipalities gcm
      WHERE gcm.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM group_municipalities gm
          WHERE gm.group_id = gcm.group_id
            AND gm.province = gcm.province
            AND gm.municipality = gcm.municipality
            AND gm.deleted_at IS NULL
        )
    `);
    expect(parseInt(rows[0].orphan_slices, 10)).toBe(0);
  });

  it('every caravan in a slice is a live group_role_members caravan', async () => {
    const { rows } = await pool.query<{ orphan_caravans: string }>(`
      SELECT COUNT(*)::text AS orphan_caravans FROM group_caravan_municipalities gcm
      WHERE gcm.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM group_role_members grm
          WHERE grm.group_id = gcm.group_id
            AND grm.user_id = gcm.caravan_user_id
            AND grm.role_in_group = 'caravan'
            AND grm.deleted_at IS NULL
        )
    `);
    expect(parseInt(rows[0].orphan_caravans, 10)).toBe(0);
  });

  it('no user is both caravan and another role in the same group', async () => {
    const { rows } = await pool.query<{ conflict_count: string }>(`
      SELECT COUNT(*)::text AS conflict_count FROM (
        SELECT group_id, user_id
          FROM group_role_members
         WHERE deleted_at IS NULL
         GROUP BY group_id, user_id
        HAVING COUNT(*) > 1
      ) t
    `);
    expect(parseInt(rows[0].conflict_count, 10)).toBe(0);
  });

  it('role counts match the cue card expectations', async () => {
    const { rows } = await pool.query<{ role: string; n: string }>(`
      SELECT role_in_group AS role, COUNT(*)::text AS n
        FROM group_role_members
       WHERE deleted_at IS NULL
       GROUP BY role_in_group
       ORDER BY role_in_group
    `);
    const map = Object.fromEntries(rows.map(r => [r.role, parseInt(r.n, 10)]));
    expect(map.area_head).toBe(6);
    expect(map.assistant_area_head).toBe(2);
    expect(map.team_leader).toBe(8);
    expect(map.caravan).toBeGreaterThanOrEqual(25);
    expect(map.caravan).toBeLessThanOrEqual(45);
  });

  it('every team leader is in exactly one group', async () => {
    const { rows } = await pool.query<{ dup_tls: string }>(`
      SELECT COUNT(*)::text AS dup_tls FROM (
        SELECT user_id FROM group_role_members
         WHERE role_in_group = 'team_leader' AND deleted_at IS NULL
         GROUP BY user_id HAVING COUNT(*) > 1
      ) t
    `);
    expect(parseInt(rows[0].dup_tls, 10)).toBe(0);
  });
});
