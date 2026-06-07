import { pool } from '../db/index.js';

export type ScopeResolution =
  | { kind: 'unrestricted' }
  | { kind: 'group_municipalities'; sql: string; params: string[] }
  | { kind: 'caravan_municipalities'; sql: string; params: string[] }
  | { kind: 'denied' };

/**
 * Resolve the user's client-visibility scope.
 *
 * Reads role_permissions to find ALL constraint_name values on the
 * (resource='clients', action='read') permission rows for the user's role.
 * Only the area-RBAC vocabulary is consulted:
 *   - 'group_municipalities'   → filter by user's group pool (managers + TL + tele)
 *   - 'caravan_municipalities' → filter by user's own caravan slice
 *   - 'all' or NULL            → unrestricted (admin fallback)
 *   - nothing matching         → denied
 *
 * Precedence (new vocabulary wins over legacy):
 *   1. caravan_municipalities  (most restrictive new-vocab)
 *   2. group_municipalities
 *   3. 'all' / NULL            (legacy unrestricted — only admin has this without new-vocab rows)
 *   4. denied
 *
 * This ordering ensures that area_manager / assistant_area_manager — which have
 * both the legacy 'all' link AND the new 'group_municipalities' link — are
 * correctly scoped to group_municipalities rather than treated as unrestricted.
 * Admin (which was intentionally skipped from new-vocab seeding) falls through
 * to 'all' → unrestricted. Legacy 'own'/'area' constraint values are ignored.
 */
export async function resolveClientScope(userId: string): Promise<ScopeResolution> {
  const result = await pool.query<{ constraint_name: string | null }>(
    `SELECT p.constraint_name
       FROM users u
       JOIN roles r ON r.slug = u.role
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
        AND p.resource = 'clients'
        AND p.action = 'read'
        AND (p.constraint_name IS NULL
          OR p.constraint_name IN ('all', 'group_municipalities', 'caravan_municipalities'))`,
    [userId],
  );

  if (result.rows.length === 0) {
    // No matching permission found → deny (defense in depth; auth middleware
    // should have already gated, but if not, return zero rows)
    return { kind: 'denied' };
  }

  const constraints = result.rows.map(r => r.constraint_name);

  // Precedence: new vocabulary wins over legacy 'all'
  // caravan_municipalities is most restrictive; check it first
  if (constraints.includes('caravan_municipalities')) {
    return {
      kind: 'caravan_municipalities',
      sql: `(province, municipality) IN (
          SELECT province, municipality
            FROM group_caravan_municipalities
           WHERE caravan_user_id = $PLACEHOLDER
             AND deleted_at IS NULL
        )`,
      params: [userId],
    };
  }

  if (constraints.includes('group_municipalities')) {
    return {
      kind: 'group_municipalities',
      sql: `(province, municipality) IN (
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

  // Fallback: legacy 'all' or NULL → unrestricted (admin only after seed migration)
  if (constraints.includes(null) || constraints.includes('all')) {
    return { kind: 'unrestricted' };
  }

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
