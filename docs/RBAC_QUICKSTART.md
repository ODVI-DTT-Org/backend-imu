# RBAC System Quick Start Guide

> **Version:** 1.0
> **Last Updated:** 2026-04-02
> **Prerequisites:** Migration 039 must be run

---

## Quick Start (5 Minutes)

### Step 1: Run the Migration

```bash
# Connect to your database
psql $DATABASE_URL

# Run the RBAC migration
\i backend/src/migrations/039_add_rbac_system.sql

# Verify installation
SELECT COUNT(*) FROM roles; -- Should return 5
SELECT COUNT(*) FROM permissions; -- Should return 40+
```

### Step 2: Test Permission Endpoints

```bash
# Start the backend server
cd backend
pnpm dev

# Test permission endpoints (with admin token)
curl http://localhost:3000/api/permissions/roles \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test current user permissions
curl http://localhost:3000/api/permissions/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 3: Use Permission Middleware

```typescript
import { requirePermission } from '../middleware/permissions.js';

// Instead of role-based checks
app.get('/clients', requireRole('admin', 'area_manager'), handler);

// Use permission-based checks
app.get('/clients', requirePermission('clients', 'read', 'all'), handler);
```

---

## Common Permission Patterns

### 1. Resource Access by Constraint

```typescript
// All clients (admin only)
clients.get('/all', requirePermission('clients', 'read', 'all'), handler);

// Area clients (area managers)
clients.get('/area', requirePermission('clients', 'read', 'area'), handler);

// Own clients (caravan, tele)
clients.get('/assigned', requirePermission('clients', 'read', 'own'), handler);
```

### 2. Touchpoint Type Validation

```typescript
import { validateTouchpointType } from '../middleware/permissions.js';

// Enforces business rules automatically
touchpoints.post('/',
  requirePermission('touchpoints', 'create', 'visit'),
  validateTouchpointType(), // Validates caravan=visit, tele=call
  handler
);
```

### 3. Ownership Checks

```typescript
import { checkOwnership } from '../middleware/permissions.js';

// Only allow users to edit their own resources
touchpoints.put('/:id',
  requirePermission('touchpoints', 'update', 'own'),
  checkOwnership('touchpoints', 'user_id'),
  handler
);
```

---

## Permission Matrix

| Resource | Action | Constraint | Admin | Area Mgr | Asst | Caravan | Tele |
|----------|--------|------------|-------|----------|------|---------|------|
| **clients** | create | - | ✅ | ✅ | ✅ | ✅ | ❌ |
| **clients** | read | all | ✅ | ✅ | ❌ | ❌ | ❌ |
| **clients** | read | area | ✅ | ✅ | ✅ | ❌ | ❌ |
| **clients** | read | own | ✅ | ✅ | ✅ | ✅ | ✅ |
| **clients** | update | all | ✅ | ✅ | ❌ | ❌ | ❌ |
| **clients** | update | area | ✅ | ✅ | ✅ | ❌ | ❌ |
| **clients** | update | own | ✅ | ✅ | ✅ | ✅ | ❌ |
| **touchpoints** | create | visit | ✅ | ✅ | ✅ | ✅ | ❌ |
| **touchpoints** | create | call | ✅ | ✅ | ✅ | ❌ | ✅ |
| **users** | create | - | ✅ | ✅ | ✅ | ❌ | ❌ |
| **users** | assign_role | - | ✅ | ✅ | ❌ | ❌ | ❌ |
| **reports** | read | all | ✅ | ❌ | ❌ | ❌ | ❌ |
| **reports** | read | area | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## API Endpoints

### Get All Roles

```bash
GET /api/permissions/roles

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "System Administrator",
      "slug": "admin",
      "level": 100,
      "permission_count": 45
    },
    ...
  ]
}
```

### Get Current User Permissions

```bash
GET /api/permissions/me

Response:
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "role": "caravan",
    "permissions": {
      "clients": [
        { "action": "create", "constraint": null },
        { "action": "read", "constraint": "own" },
        { "action": "update", "constraint": "own" }
      ],
      "touchpoints": [
        { "action": "create", "constraint": "visit" },
        { "action": "read", "constraint": "own" }
      ]
    }
  }
}
```

### Check Permissions

```bash
POST /api/permissions/check
Content-Type: application/json

{
  "permissions": [
    { "resource": "clients", "action": "delete" },
    { "resource": "clients", "action": "create" }
  ]
}

Response:
{
  "success": true,
  "has_permission": false,
  "permissions": [
    { "resource": "clients", "action": "delete", "granted": false },
    { "resource": "clients", "action": "create", "granted": true }
  ]
}
```

### Get Permission Matrix

```bash
GET /api/permissions/matrix

Response:
{
  "success": true,
  "data": {
    "admin": {
      "name": "System Administrator",
      "permissions": {
        "clients": [
          { "action": "create", "constraint": null },
          { "action": "read", "constraint": "all" },
          { "action": "update", "constraint": "all" },
          { "action": "delete", "constraint": null }
        ],
        ...
      }
    },
    "caravan": {
      "name": "Caravan (Field Agent)",
      "permissions": {
        "clients": [
          { "action": "create", "constraint": null },
          { "action": "read", "constraint": "own" },
          { "action": "update", "constraint": "own" }
        ],
        ...
      }
    }
  }
}
```

---

## Error Handling

### Permission Denied (403)

```json
{
  "message": "Forbidden - Insufficient permissions",
  "required": {
    "resource": "clients",
    "action": "delete",
    "constraint": "all"
  }
}
```

### Touchpoint Type Validation Error (403)

```json
{
  "message": "Caravan users can only create Visit touchpoints",
  "allowed_numbers": [1, 4, 7]
}
```

```json
{
  "message": "Invalid touchpoint number for Visit type",
  "allowed_numbers": [1, 4, 7],
  "provided": 2
}
```

---

## Testing Permissions

### Unit Test Example

```typescript
import { hasPermission } from '../middleware/permissions.js';

test('caravan can create clients', async () => {
  const result = await hasPermission(
    'user-uuid',
    'clients',
    'create'
  );
  expect(result).toBe(true);
});

test('caravan cannot delete clients', async () => {
  const result = await hasPermission(
    'user-uuid',
    'clients',
    'delete'
  );
  expect(result).toBe(false);
});
```

### Integration Test Example

```typescript
test('POST /clients with caravan user', async () => {
  const response = await app.request('/api/clients', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${caravanToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      first_name: 'Test',
      last_name: 'Client',
      client_type: 'POTENTIAL',
    }),
  });

  expect(response.status).toBe(201);
});
```

---

## Troubleshooting

### Issue: Permission endpoint returns 404

**Cause:** Permission routes not mounted

**Fix:** Check that `backend/src/index.ts` includes:
```typescript
import permissionsRoutes from './routes/permissions.js';
app.route('/api/permissions', permissionsRoutes);
```

### Issue: Permission check always returns false

**Cause:** Migration not run or user not migrated to RBAC

**Fix:**
```sql
-- Check if migration ran
SELECT COUNT(*) FROM roles;

-- Migrate users to RBAC
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
    u.id,
    r.id,
    u.id
FROM users u
JOIN roles r ON r.slug = u.role
LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = r.id
WHERE ur.id IS NULL;
```

### Issue: Touchpoint validation failing

**Cause:** Touchpoint number doesn't match type

**Fix:**
- Visit touchpoints: numbers 1, 4, 7
- Call touchpoints: numbers 2, 3, 5, 6

### Issue: Permission cache not updating

**Cause:** Permission cache not cleared after role changes

**Fix:**
```typescript
import { clearPermissionCache } from '../middleware/permissions.js';

// After changing user roles
clearPermissionCache(userId);
```

---

## Migration Path

### Phase 1: Non-Breaking (Current)

Both old and new systems work together:

```typescript
// Both work - defense in depth
clients.get('/',
  requireRole('admin', 'area_manager'), // Old
  requirePermission('clients', 'read', 'all'), // New
  handler
);
```

### Phase 2: Gradual Migration

Migrate routes incrementally:

1. Week 1: Low-risk routes (dashboard, reports)
2. Week 2: Medium-risk routes (clients, users)
3. Week 3: High-risk routes (touchpoints, itineraries)

### Phase 3: Remove Old System

After validation:

```typescript
// Remove old imports
- import { requireRole } from '../middleware/auth.js';

// Remove old middleware
- requireRole('admin', 'area_manager')

// Optionally remove old columns
- ALTER TABLE users DROP COLUMN role;
```

---

## Best Practices

### 1. Always Check Permissions on Server

❌ **Bad:** Client-side only checks
```typescript
// Client-side (can be bypassed)
if (user.role === 'admin') showAdminPanel();
```

✅ **Good:** Server-side enforcement
```typescript
// Server-side (cannot be bypassed)
app.get('/admin', requirePermission('system', 'configure'), handler);
```

### 2. Use Specific Constraints

❌ **Bad:** Overly permissive
```typescript
requirePermission('clients', 'read') // No constraint
```

✅ **Good:** Explicit constraints
```typescript
requirePermission('clients', 'read', 'own') // Clear scope
```

### 3. Validate Touchpoint Types

❌ **Bad:** No validation
```typescript
touchpoints.post('/', async (c) => {
  const body = await c.req.json();
  // No type validation
});
```

✅ **Good:** Enforce business rules
```typescript
touchpoints.post('/',
  requirePermission('touchpoints', 'create'),
  validateTouchpointType(), // Validates caravan=visit, tele=call
  handler
);
```

### 4. Check Ownership for Non-Admins

❌ **Bad:** Anyone can edit any touchpoint
```typescript
app.put('/touchpoints/:id', handler);
```

✅ **Good:** Ownership check
```typescript
app.put('/touchpoints/:id',
  requirePermission('touchpoints', 'update', 'own'),
  checkOwnership('touchpoints', 'user_id'),
  handler
);
```

---

## Resources

- **Full Documentation:** `docs/architecture/roles-permissions.md`
- **Migration Guide:** `docs/RBAC_MIGRATION_GUIDE.md`
- **Gap Analysis:** `docs/RBAC_GAPS_ANALYSIS.md`
- **Migration File:** `backend/src/migrations/039_add_rbac_system.sql`
- **Permission Middleware:** `backend/src/middleware/permissions.ts`
- **API Routes:** `backend/src/routes/permissions.ts`
- **TypeScript Types:** `backend/src/types/rbac.ts`

---

**Last Updated:** 2026-04-02
**Status:** Ready for Implementation
