# RBAC User Synchronization Implementation

> **Date:** 2026-04-02
> **Status:** ✅ Completed
> **Commit:** 510923d

---

## Problem Identified

When admins created users via `POST /api/users`, the system:
- ✅ Created `users` record with `role` column (OLD system)
- ✅ Created `user_profiles` record (PowerSync)
- ❌ **Did NOT create `user_roles` entry** (NEW RBAC system)

This caused **newly created users to lack RBAC permissions** until manually assigned via `POST /api/permissions/users/:userId/roles`.

---

## Solution Implemented

### 1. User Creation Sync

Updated `backend/src/routes/users.ts` to automatically create `user_roles` entry:

```typescript
// After user creation, sync with RBAC
const roleResult = await pool.query(
  'SELECT id FROM roles WHERE slug = $1',
  [validated.role]
);

if (roleResult.rows.length > 0) {
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (user_id, role_id) DO UPDATE SET
       is_active = TRUE,
       assigned_by = $3`,
    [newUser.id, roleResult.rows[0].id, currentUser.sub]
  );
}
```

### 2. User Update Sync

Added RBAC sync when role changes:

```typescript
if (validated.role && oldUser.role !== updatedUser.role) {
  // Deactivate old role assignments
  await pool.query(
    `UPDATE user_roles SET is_active = FALSE WHERE user_id = $1`,
    [id]
  );

  // Create new role assignment
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
     VALUES ($1, $2, $3, TRUE)`,
    [id, newRoleId, currentUser.sub]
  );

  // Clear permission cache
  clearPermissionCache(id);
}
```

### 3. User Profiles Sync

Added `user_profiles` table synchronization:

```typescript
// Update user_profiles when name/role changes
await pool.query(
  `UPDATE user_profiles
   SET name = COALESCE($1, name),
       email = COALESCE($2, email),
       role = COALESCE($3, role),
       area_manager_id = COALESCE($4, area_manager_id),
       assistant_area_manager_id = COALESCE($5, assistant_area_manager_id)
   WHERE user_id = $6`,
  [name, email, role, area_manager_id, assistant_area_manager_id, id]
);
```

---

## Data Fix Applied

Added missing `clients.create` permission for caravan users:

```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource = 'clients'
    AND p.action = 'create'
    AND p.constraint_name IS NULL
)
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

---

## Testing

Created test script `backend/scripts/test-rbac-user-sync.ts`:

```bash
cd backend
DATABASE_URL="..." npx tsx scripts/test-rbac-user-sync.ts
```

**Test Results:**
- ✅ User creation with RBAC sync
- ✅ Role updates with RBAC sync
- ✅ Permission verification (caravan can create clients)
- ✅ Permission verification (tele can only create calls)
- ✅ Permission cache clearing

---

## Error Handling

RBAC sync failures are **non-blocking**:
- User creation/update succeeds even if RBAC sync fails
- Errors are logged for debugging
- Admin can manually fix via permissions API

---

## Verification Commands

```sql
-- Check user has RBAC entry
SELECT u.email, u.role, COUNT(ur.id) as rbac_entries
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
GROUP BY u.id, u.email, u.role;

-- Verify user permissions
SELECT
  u.email,
  has_permission(u.id, 'clients', 'create') as can_create_client,
  has_permission(u.id, 'touchpoints', 'create', 'visit') as can_create_visit
FROM users u
WHERE u.role = 'caravan';
```

---

## Files Modified

1. `backend/src/routes/users.ts` - Added RBAC sync logic
2. `backend/scripts/test-rbac-user-sync.ts` - Test script
3. Database - Added missing caravan permission

---

## Next Steps

1. ✅ User creation now syncs with RBAC automatically
2. ✅ User role changes update RBAC automatically
3. ✅ Permission cache is cleared on role changes
4. ⏳ Consider deprecating `users.role` column in future migration
5. ⏳ Update frontend to use RBAC endpoints for role management

---

## Documentation Updated

- `docs/RBAC_QUICKSTART.md` - User creation flow
- `docs/RBAC_MIGRATION_GUIDE.md` - Sync implementation details
- `docs/RBAC_USER_SYNC_IMPLEMENTATION.md` - This document

---

**Last Updated:** 2026-04-02
**Status:** Production Ready ✅
