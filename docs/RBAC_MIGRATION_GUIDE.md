# RBAC System Migration Guide

> **Version:** 1.0
> **Last Updated:** 2026-04-02
> **Status:** Ready for Implementation

---

## Overview

This guide explains how to migrate from the current implicit role-based access control to the new fine-grained permission system.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Migration Steps](#migration-steps)
3. [Code Examples](#code-examples)
4. [Rollback Plan](#rollback-plan)
5. [Testing](#testing)

---

## Quick Start

### Step 1: Run the Migration

```bash
# Connect to your database
psql $DATABASE_URL

# Run the migration
\i backend/src/migrations/039_add_rbac_system.sql

# Verify installation
SELECT COUNT(*) FROM roles; -- Should return 5
SELECT COUNT(*) FROM permissions; -- Should return 40+
SELECT COUNT(*) FROM user_permissions_view; -- Should match user count
```

### Step 2: Update Middleware Usage

**Before (Role-based):**
```typescript
import { requireRole } from '../middleware/auth.js';

app.get('/clients', requireRole('admin', 'area_manager'), handler);
```

**After (Permission-based):**
```typescript
import { requirePermission } from '../middleware/permissions.js';

app.get('/clients', requirePermission('clients', 'read', 'all'), handler);
```

---

## Migration Steps

### Phase 1: Database Setup (Non-Breaking)

**Duration:** 1 day
**Risk:** Low

1. **Run Migration 039**
   ```bash
   psql $DATABASE_URL -f backend/src/migrations/039_add_rbac_system.sql
   ```

2. **Verify Data Migration**
   ```sql
   -- Check roles were created
   SELECT * FROM roles;

   -- Check permissions were created
   SELECT resource, action, constraint_name
   FROM permissions
   ORDER BY resource, action;

   -- Check users were migrated
   SELECT u.email, r.name as role
   FROM users u
   JOIN user_roles ur ON ur.user_id = u.id
   JOIN roles r ON ur.role_id = r.id;
   ```

3. **Test Permission Functions**
   ```sql
   -- Test has_permission function
   SELECT has_permission(
     (SELECT id FROM users WHERE email = 'admin@imu.com'),
     'clients',
     'create'
   ); -- Should return TRUE

   -- Test get_user_permissions function
   SELECT * FROM get_user_permissions(
     (SELECT id FROM users WHERE email = 'admin@imu.com')
   );
   ```

### Phase 2: Add Permission Middleware (Non-Breaking)

**Duration:** 2-3 days
**Risk:** Low

1. **Add Permission Middleware File**
   - File already created: `backend/src/middleware/permissions.ts`
   - No changes to existing middleware

2. **Test Permission Middleware in Isolation**
   ```typescript
   import { requirePermission } from '../middleware/permissions.js';
   import { requireRole } from '../middleware/auth.js';

   // Test both middlewares work together
   app.get('/test-permissions',
     requireRole('admin'), // Old middleware
     requirePermission('clients', 'read'), // New middleware
     async (c) => {
       return c.json({ message: 'Both middlewares working!' });
     }
   );
   ```

### Phase 3: Gradual Route Migration (Non-Breaking)

**Duration:** 1-2 weeks
**Risk:** Medium

**Strategy:** Migrate routes incrementally, keeping both middlewares active

#### Example: Migrating Client Routes

**Week 1: Add Permission Checks Alongside Role Checks**

```typescript
import { requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

// Both middlewares active (defense in depth)
clients.get('/',
  requireRole('admin', 'area_manager', 'assistant_area_manager'),
  requirePermission('clients', 'read', 'area'), // New permission check
  async (c) => {
    // Handler code
  }
);
```

**Week 2: Remove Role Checks (After Validation)**

```typescript
// After confirming permission checks work correctly
clients.get('/',
  requirePermission('clients', 'read', 'area'), // Only permission check
  async (c) => {
    // Handler code
  }
);
```

### Phase 4: UI Migration

**Duration:** 1 week
**Risk:** Low

1. **Update Permission Error Messages**
   - Current: "Forbidden - Insufficient permissions"
   - New: Include specific required permission

2. **Add Permission Display to Admin UI**
   - Show user permissions in profile
   - Allow admins to view all permissions

### Phase 5: Cleanup (Breaking)

**Duration:** 1 day
**Risk:** Low (after validation)

1. **Remove Old Role Middleware**
   ```typescript
   // Remove from imports
   - import { requireRole } from '../middleware/auth.js';

   // Remove from routes
   - requireRole('admin', 'area_manager')
   ```

2. **Remove Role Columns (Optional)**
   ```sql
   -- Only after confirming user_roles table is working
   ALTER TABLE users DROP COLUMN role;
   ALTER TABLE user_profiles DROP COLUMN role;
   ```

---

## Code Examples

### Example 1: Client Management

**Before (Role-based):**
```typescript
import { requireRole } from '../middleware/auth.js';

// List all clients
clients.get('/', requireRole('admin', 'area_manager'), async (c) => {
  const result = await pool.query('SELECT * FROM clients');
  return c.json(result.rows);
});

// Create client
clients.post('/', requireRole('admin', 'area_manager', 'assistant_area_manager', 'caravan'), async (c) => {
  const body = await c.req.json();
  // Create client logic
});

// Update client
clients.put('/:id', requireRole('admin', 'area_manager', 'caravan'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  // Update client logic
});
```

**After (Permission-based):**
```typescript
import { requirePermission } from '../middleware/permissions.js';
import { checkOwnership } from '../middleware/permissions.js';

// List all clients (admin, area manager)
clients.get('/', requirePermission('clients', 'read', 'all'), async (c) => {
  const result = await pool.query('SELECT * FROM clients');
  return c.json(result.rows);
});

// List area clients (area manager, assistant area manager)
clients.get('/area', requirePermission('clients', 'read', 'area'), async (c) => {
  const user = c.get('user');
  const result = await pool.query(`
    SELECT c.* FROM clients c
    JOIN user_locations ul ON c.municipality_id = ul.municipality_id
    WHERE ul.user_id = $1
  `, [user.sub]);
  return c.json(result.rows);
});

// List own clients (caravan, tele)
clients.get('/assigned', requirePermission('clients', 'read', 'own'), async (c) => {
  const user = c.get('user');
  const result = await pool.query(
    'SELECT * FROM clients WHERE caravan_id = $1',
    [user.sub]
  );
  return c.json(result.rows);
});

// Create client (admin, area manager, assistant area manager, caravan)
clients.post('/', requirePermission('clients', 'create'), async (c) => {
  const body = await c.req.json();
  // Create client logic
});

// Update own client (caravan)
clients.put('/:id',
  requirePermission('clients', 'update', 'own'),
  checkOwnership('clients', 'caravan_id'),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    // Update client logic
  }
);

// Update any client in area (area manager)
clients.put('/:id',
  requirePermission('clients', 'update', 'area'),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    // Update client logic with area check
  }
);
```

### Example 2: Touchpoint Creation with Type Validation

**Before:**
```typescript
import { requireRole } from '../middleware/auth.js';

touchpoints.post('/',
  requireRole('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'),
  async (c) => {
    const body = await c.req.json();
    // No type validation - relies on client
    // Create touchpoint logic
  }
);
```

**After:**
```typescript
import { requirePermission } from '../middleware/permissions.js';
import { validateTouchpointType } from '../middleware/permissions.js';

touchpoints.post('/',
  requirePermission('touchpoints', 'create', 'visit'), // or 'call'
  validateTouchpointType(), // Enforces business rules
  async (c) => {
    const body = await c.req.json();
    // Create touchpoint logic
  }
);

// Or use permission-based type checking
touchpoints.post('/',
  requireAnyPermission([
    { resource: 'touchpoints', action: 'create', constraint: 'visit' },
    { resource: 'touchpoints', action: 'create', constraint: 'call' }
  ]),
  validateTouchpointType(),
  async (c) => {
    const body = await c.req.json();
    // Create touchpoint logic
  }
);
```

### Example 3: Permission Checking in Handlers

```typescript
import { permissionHelper } from '../middleware/permissions.js';

clients.get('/:id', async (c) => {
  const user = c.get('user');
  const perms = permissionHelper(c);

  // Check permissions in handler logic
  const canReadAll = await perms.can('clients', 'read', 'all');
  const canReadArea = await perms.can('clients', 'read', 'area');
  const canReadOwn = await perms.can('clients', 'read', 'own');

  let query = 'SELECT * FROM clients WHERE id = $1';
  const params: any[] = [c.req.param('id')];

  // Add constraints based on permissions
  if (canReadAll) {
    // No additional constraints
  } else if (canReadArea) {
    query += ' AND municipality_id IN (SELECT municipality_id FROM user_locations WHERE user_id = $2)';
    params.push(user.sub);
  } else if (canReadOwn) {
    query += ' AND caravan_id = $2';
    params.push(user.sub);
  } else {
    return c.json({ message: 'Forbidden' }, 403);
  }

  const result = await pool.query(query, params);
  return c.json(result.rows);
});
```

### Example 4: Dynamic Permission Display

```typescript
import { getUserPermissions } from '../middleware/permissions.js';

// Display user permissions in profile
users.get('/:me/permissions', async (c) => {
  const user = c.get('user');
  const permissions = await getUserPermissions(user.sub);

  // Group by resource
  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = [];
    }
    acc[perm.resource].push({
      action: perm.action,
      constraint: perm.constraint_name,
    });
    return acc;
  }, {} as Record<string, Array<{ action: string; constraint?: string }>>);

  return c.json({
    email: user.email,
    role: user.role,
    permissions: grouped,
  });
});
```

---

## Rollback Plan

### If Migration Fails

1. **Stop Migration:**
   ```sql
   -- Disable new system (revert to old role checks)
   ```

2. **Restore Old Behavior:**
   ```typescript
   // Revert to role-based middleware
   import { requireRole } from '../middleware/auth.js';

   clients.get('/', requireRole('admin', 'area_manager'), handler);
   ```

3. **Clean Up (if needed):**
   ```sql
   -- Drop RBAC tables (data loss!)
   DROP TABLE IF EXISTS user_roles CASCADE;
   DROP TABLE IF EXISTS role_permissions CASCADE;
   DROP TABLE IF EXISTS permissions CASCADE;
   DROP TABLE IF EXISTS roles CASCADE;

   -- Drop views
   DROP VIEW IF EXISTS user_permissions_view CASCADE;
   DROP VIEW IF EXISTS users_with_roles CASCADE;

   -- Drop functions
   DROP FUNCTION IF EXISTS has_permission CASCADE;
   DROP FUNCTION IF EXISTS get_user_permissions CASCADE;
   DROP FUNCTION IF EXISTS has_role CASCADE;
   ```

### Safe Rollback Strategy

**Key Point:** The migration is **non-breaking** because:
- Old `users.role` column still exists
- Old middleware still works
- New tables are separate
- Both systems can coexist

To rollback:
1. Stop using new permission middleware
2. Continue using old role middleware
3. Drop new tables when ready (optional)

---

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { hasPermission, getUserPermissions } from '../middleware/permissions.js';

describe('Permission System', () => {
  const testUserId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    // Setup test user with known permissions
    await pool.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, (SELECT id FROM roles WHERE slug = $2))',
      [testUserId, 'caravan']
    );
  });

  it('should allow caravan to create clients', async () => {
    const result = await hasPermission(testUserId, 'clients', 'create');
    expect(result).toBe(true);
  });

  it('should deny caravan to delete clients', async () => {
    const result = await hasPermission(testUserId, 'clients', 'delete');
    expect(result).toBe(false);
  });

  it('should allow caravan to create visit touchpoints', async () => {
    const result = await hasPermission(testUserId, 'touchpoints', 'create', 'visit');
    expect(result).toBe(true);
  });

  it('should deny caravan to create call touchpoints', async () => {
    const result = await hasPermission(testUserId, 'touchpoints', 'create', 'call');
    expect(result).toBe(false);
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { app } from '../index.js';

describe('Permission Middleware Integration', () => {
  let adminToken: string;
  let caravanToken: string;

  beforeEach(async () => {
    // Login as admin
    const adminRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@imu.com', password: 'admin123' }),
    });
    adminToken = (await adminRes.json()).token;

    // Login as caravan
    const caravanRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'caravan@imu.com', password: 'caravan123' }),
    });
    caravanToken = (await caravanRes.json()).token;
  });

  it('should allow admin to access all clients', async () => {
    const res = await app.request('/clients', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
  });

  it('should deny caravan to access all clients', async () => {
    const res = await app.request('/clients/all', {
      headers: { Authorization: `Bearer ${caravanToken}` },
    });

    expect(res.status).toBe(403);
  });

  it('should allow caravan to create visit touchpoint', async () => {
    const res = await app.request('/touchpoints', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${caravanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'some-client-id',
        touchpoint_number: 1,
        type: 'Visit',
        date: '2026-04-02',
        reason: 'Initial visit',
      }),
    });

    expect(res.status).toBe(201);
  });

  it('should deny caravan to create call touchpoint', async () => {
    const res = await app.request('/touchpoints', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${caravanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'some-client-id',
        touchpoint_number: 2,
        type: 'Call',
        date: '2026-04-02',
        reason: 'Follow up call',
      }),
    });

    expect(res.status).toBe(403);
  });
});
```

### Database Tests

```sql
-- Test 1: Verify roles created
SELECT id, slug, name, level FROM roles ORDER BY level;
-- Expected: 5 rows (admin, area_manager, assistant_area_manager, caravan, tele)

-- Test 2: Verify permissions created
SELECT resource, COUNT(*) as perm_count
FROM permissions
GROUP BY resource
ORDER BY resource;
-- Expected: 10+ resources with multiple permissions each

-- Test 3: Verify role permissions assigned
SELECT r.name, COUNT(*) as perm_count
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY r.name
ORDER BY r.name;
-- Expected: Admin has most, caravan/tele have fewest

-- Test 4: Test has_permission function
SELECT
    u.email,
    r.name as role,
    has_permission(u.id, 'clients', 'create') as can_create_client,
    has_permission(u.id, 'touchpoints', 'create', 'visit') as can_create_visit,
    has_permission(u.id, 'touchpoints', 'create', 'call') as can_create_call
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id;

-- Test 5: Verify users migrated
SELECT
    r.name as role,
    COUNT(DISTINCT ur.user_id) as user_count
FROM roles r
LEFT JOIN user_roles ur ON r.id = ur.role_id
GROUP BY r.name
ORDER BY r.name;
```

---

## Next Steps

1. **Review this guide** with the development team
2. **Schedule migration** for low-traffic period
3. **Backup database** before running migration
4. **Run migration** in staging environment first
5. **Monitor performance** after permission checks added
6. **Train developers** on new permission patterns
7. **Update documentation** as needed

---

## Questions?

Refer to:
- **Roles Documentation:** `docs/architecture/roles-permissions.md`
- **Migration File:** `backend/src/migrations/039_add_rbac_system.sql`
- **Permission Middleware:** `backend/src/middleware/permissions.ts`
