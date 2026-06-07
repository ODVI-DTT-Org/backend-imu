import { pool } from '../db/index.js';

export type ScopeResolution =
  | { kind: 'unrestricted' }
  | { kind: 'group_municipalities'; sql: string; params: string[] }
  | { kind: 'caravan_municipalities'; sql: string; params: string[] }
  | { kind: 'denied' };

/**
 * Resolve the user's client-visibility scope.
 *
 * IMPORTANT — DO NOT use users.role as the role authority. In production,
 * users.role is 'caravan' for everyone except real admins (demo workaround
 * documented in feature_area_rbac.md). The real role lives in
 * group_role_members.role_in_group. The lookup order is:
 *
 *   1. If users.role = 'admin' → unrestricted
 *      (only path that uses users.role; admins are not in group_role_members)
 *   2. If user has any group_role_members row with role_in_group IN
 *      ('area_head','assistant_area_head','team_leader','tele')
 *      → group_municipalities scope
 *   3. Else if user has a group_role_members row with role_in_group='caravan'
 *      → caravan_municipalities scope
 *   4. Else → denied (defense in depth; no clients returned)
 */
export async function resolveClientScope(userId: string): Promise<ScopeResolution> {
  // Step 1: admin check via users.role (the one role we can trust)
  const adminCheck = await pool.query<{ is_admin: boolean }>(
    `SELECT (role = 'admin') AS is_admin FROM users WHERE id = $1`,
    [userId],
  );
  if (adminCheck.rows[0]?.is_admin) {
    return { kind: 'unrestricted' };
  }

  // Step 2 + 3: classify by group_role_members
  const roleRows = await pool.query<{ role_in_group: string }>(
    `SELECT role_in_group FROM group_role_members
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  const roles = roleRows.rows.map(r => r.role_in_group);
  const isManager = roles.some(r =>
    ['area_head', 'assistant_area_head', 'team_leader', 'tele'].includes(r),
  );
  if (isManager) {
    return {
      kind: 'group_municipalities',
      sql: `
        (province, municipality) IN (
          SELECT gm.province, gm.municipality
            FROM group_municipalities gm
            JOIN group_role_members grm ON grm.group_id = gm.group_id
           WHERE grm.user_id = $PLACEHOLDER
             AND grm.deleted_at IS NULL
             AND gm.deleted_at IS NULL
        )`,
      params: [userId],
    };
  }

  const isCaravan = roles.includes('caravan');
  if (isCaravan) {
    return {
      kind: 'caravan_municipalities',
      sql: `
        (province, municipality) IN (
          SELECT province, municipality
            FROM group_caravan_municipalities
           WHERE caravan_user_id = $PLACEHOLDER
             AND deleted_at IS NULL
        )`,
      params: [userId],
    };
  }

  // Step 4: user has no group_role_members rows and isn't admin → denied
  return { kind: 'denied' };
}

/**
 * Splice the resolved scope into a parameterized query.
 *
 * Caller passes the existing params array and the next parameter index ($N).
 * The returned fragment uses concrete $N placeholders and is ready to be
 * spliced into an existing WHERE clause (e.g. `AND (${fragment})`).
 *
 * For 'unrestricted' → returns 'TRUE' (no-op filter).
 * For 'denied'       → returns 'FALSE' (zero rows).
 */
export function applyClientScope(
  resolution: ScopeResolution,
  currentParams: unknown[],
  startIndex: number,
): { sqlFragment: string; nextIndex: number } {
  if (resolution.kind === 'unrestricted') {
    return { sqlFragment: 'TRUE', nextIndex: startIndex };
  }
  if (resolution.kind === 'denied') {
    return { sqlFragment: 'FALSE', nextIndex: startIndex };
  }
  let idx = startIndex;
  let fragment = resolution.sql;
  for (const p of resolution.params) {
    fragment = fragment.replace('$PLACEHOLDER', `$${idx}`);
    currentParams.push(p);
    idx += 1;
  }
  return { sqlFragment: fragment.trim(), nextIndex: idx };
}
