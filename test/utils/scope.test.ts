import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { resolveClientScope, applyClientScope } from '../../src/utils/scope.js';

// Tests run against prod DB with the same pattern as Stage 1 migration tests.
// No test rows are inserted here — we read existing role_permissions (seeded by
// migration 129) and existing group_role_members (seeded by Stage 2 backfill).

const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

// ─── Unit tests: applyClientScope SQL splicing (no DB required) ──────────────

describe('applyClientScope SQL splicing', () => {
  it('unrestricted → TRUE, no params added', () => {
    const params: unknown[] = [];
    const r = applyClientScope({ kind: 'unrestricted' }, params, 1);
    expect(r.sqlFragment).toBe('TRUE');
    expect(r.nextIndex).toBe(1);
    expect(params).toEqual([]);
  });

  it('denied → FALSE, no params added', () => {
    const params: unknown[] = [];
    const r = applyClientScope({ kind: 'denied' }, params, 1);
    expect(r.sqlFragment).toBe('FALSE');
    expect(r.nextIndex).toBe(1);
    expect(params).toEqual([]);
  });

  it('caravan_municipalities replaces $PLACEHOLDER with $N and appends param', () => {
    const params: unknown[] = ['existing-param'];
    const r = applyClientScope(
      {
        kind: 'caravan_municipalities',
        sql: '(province, municipality) IN (SELECT 1 WHERE user_id = $PLACEHOLDER)',
        params: ['user-uuid'],
      },
      params,
      2,
    );
    expect(r.sqlFragment).toContain('$2');
    expect(r.sqlFragment).not.toContain('$PLACEHOLDER');
    expect(r.nextIndex).toBe(3);
    expect(params).toEqual(['existing-param', 'user-uuid']);
  });

  it('group_municipalities replaces $PLACEHOLDER with $N when startIndex > 1', () => {
    const params: unknown[] = ['p1', 'p2'];
    const r = applyClientScope(
      {
        kind: 'group_municipalities',
        sql: 'grm.user_id = $PLACEHOLDER',
        params: ['user-uuid'],
      },
      params,
      3,
    );
    expect(r.sqlFragment).toBe('grm.user_id = $3');
    expect(r.nextIndex).toBe(4);
    expect(params[2]).toBe('user-uuid');
  });
});

// ─── Integration tests: resolveClientScope against prod DB ───────────────────

describe('resolveClientScope against prod DB', () => {
  it('caravan role resolves to caravan_municipalities', async () => {
    // Find a caravan user via group_role_members backfill
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'caravan'
         AND grm.deleted_at IS NULL
         AND u.role = 'caravan'
       LIMIT 1
    `);
    if (rows.length === 0) {
      console.warn('SKIP: no caravan user found in group_role_members');
      return;
    }
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('caravan_municipalities');
  });

  it('area_manager (area_head in grm) resolves to group_municipalities, NOT unrestricted', async () => {
    // area_manager has both a legacy 'all' link AND the new 'group_municipalities' link.
    // New vocabulary must win — should NOT resolve to unrestricted.
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'area_head'
         AND grm.deleted_at IS NULL
         AND u.role = 'area_manager'
       LIMIT 1
    `);
    if (rows.length === 0) {
      console.warn('SKIP: no area_manager user found in group_role_members');
      return;
    }
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('group_municipalities');
    // Explicitly assert it did NOT fall through to unrestricted (the legacy 'all' bug)
    expect(scope.kind).not.toBe('unrestricted');
  });

  it('assistant_area_manager resolves to group_municipalities, NOT unrestricted', async () => {
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'assistant_area_head'
         AND grm.deleted_at IS NULL
         AND u.role = 'assistant_area_manager'
       LIMIT 1
    `);
    if (rows.length === 0) {
      console.warn('SKIP: no assistant_area_manager user found in group_role_members');
      return;
    }
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('group_municipalities');
    expect(scope.kind).not.toBe('unrestricted');
  });

  it('admin user resolves to unrestricted', async () => {
    // Admin has no new-vocab links → falls through to 'all' → unrestricted
    const { rows } = await testPool.query<{ id: string }>(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);
    if (rows.length === 0) {
      console.warn('SKIP: no admin user found');
      return;
    }
    const scope = await resolveClientScope(rows[0].id);
    expect(scope.kind).toBe('unrestricted');
  });

  it('team_leader resolves to group_municipalities', async () => {
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'team_leader'
         AND grm.deleted_at IS NULL
         AND u.role = 'team_leader'
       LIMIT 1
    `);
    if (rows.length === 0) {
      console.warn('SKIP: no team_leader found in group_role_members');
      return;
    }
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('group_municipalities');
  });

  it('REGRESSION: area_head whose users.role=caravan still gets group_municipalities scope', async () => {
    // Find a user who is area_head in group_role_members but whose users.role
    // is 'caravan' (demo workaround). Production has 6 such users.
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'area_head'
         AND grm.deleted_at IS NULL
         AND u.role = 'caravan'
       LIMIT 1
    `);
    if (rows.length === 0) {
      // No such user in this DB; skip (CI environment may not have demo data)
      return;
    }
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('group_municipalities');
  });

  it('REGRESSION: team_leader whose users.role=caravan gets group_municipalities scope', async () => {
    const { rows } = await testPool.query<{ user_id: string }>(`
      SELECT grm.user_id
        FROM group_role_members grm
        JOIN users u ON u.id = grm.user_id
       WHERE grm.role_in_group = 'team_leader'
         AND grm.deleted_at IS NULL
         AND u.role = 'caravan'
       LIMIT 1
    `);
    if (rows.length === 0) return;
    const scope = await resolveClientScope(rows[0].user_id);
    expect(scope.kind).toBe('group_municipalities');
  });

  it('user with no group_role_members rows AND not admin → denied', async () => {
    // Use a synthetic UUID that doesn't exist in users
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const scope = await resolveClientScope(fakeUserId);
    expect(scope.kind).toBe('denied');
  });
});
