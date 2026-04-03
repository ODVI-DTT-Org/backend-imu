# IMU Roles and Permissions Documentation

> **Generated:** 2026-04-02
> **Version:** 2.0
> **Status:** RBAC System Implemented (Migration 039)

---

## Overview

IMU uses a **role-based access control (RBAC)** system with five predefined roles. Permissions are currently implicit based on roles, enforced at the middleware and route handler level.

---

## Table of Contents

1. [Role Definitions](#role-definitions)
2. [Permission Matrix](#permission-matrix)
3. [RBAC Architecture](#rbac-architecture)
4. [Usage Patterns](#usage-patterns)
5. [Migration Notes](#migration-notes)
6. [RBAC Implementation Details](#rbac-implementation-details)

---

## Role Definitions

### 1. Admin (`admin`)

**Description:** Full system access with no restrictions

**Capabilities:**
- All user management (CRUD)
- All client management (CRUD)
- All itinerary management
- All report access
- System configuration
- Agency management
- Group management
- Target management
- Audit log access

**Assigned To:** System administrators

---

### 2. Area Manager (`area_manager`)

**Description:** Regional oversight with full access to assigned areas

**Capabilities:**
- View all users in assigned area
- Create/edit caravan and tele users
- All client management in assigned area
- All itinerary management in assigned area
- View reports for assigned area
- Assign municipalities to users
- Manage targets for area users

**Assigned To:** Regional managers

---

### 3. Assistant Area Manager (`assistant_area_manager`)

**Description:** Area management support with limited permissions

**Capabilities:**
- View users in assigned area (read-only)
- Create caravan and tele users
- Client management in assigned area
- Itinerary management in assigned area
- View reports for assigned area
- Assign municipalities to caravan/tele users

**Assigned To:** Assistant regional managers

---

### 4. Caravan (`caravan`)

**Description:** Field agents who conduct in-person client visits

**Capabilities:**
- View assigned clients only
- Create/edit own clients
- Create touchpoints (Visit type only: numbers 1, 4, 7)
- View own itineraries
- Mark own attendance
- View own targets

**Touchpoint Restrictions:**
- **CAN create:** Visit touchpoints (numbers 1, 4, 7)
- **CANNOT create:** Call touchpoints (numbers 2, 3, 5, 6)

**Assigned To:** Field agents (formerly called `field_agent`)

---

### 5. Tele (`tele`)

**Description:** Telemarketers who conduct phone-based outreach

**Capabilities:**
- View assigned clients only
- View assigned clients (read-only)
- Create touchpoints (Call type only: numbers 2, 3, 5, 6)
- View assigned clients only
- View own itineraries
- View own targets

**Touchpoint Restrictions:**
- **CAN create:** Call touchpoints (numbers 2, 3, 5, 6)
- **CANNOT create:** Visit touchpoints (numbers 1, 4, 7)

**Assigned To:** Telemarketers

---

## Permission Matrix

| Resource/Action | Admin | Area Manager | Asst. Area Manager | Caravan | Tele |
|-----------------|-------|--------------|-------------------|---------|------|
| **Users** | | | | | |
| View all users | ✅ | ✅ (area) | ✅ (area) | ❌ | ❌ |
| Create users | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Clients** | | | | | |
| View all clients | ✅ | ✅ (area) | ✅ (area) | ✅ (assigned) | ✅ (assigned) |
| Create clients | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit clients | ✅ | ✅ | ✅ | ✅ (own) | ❌ |
| Delete clients | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Touchpoints** | | | | | |
| Create Visit (1,4,7) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create Call (2,3,5,6) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Edit own touchpoints | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit any touchpoint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete touchpoints | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Itineraries** | | | | | |
| View all itineraries | ✅ | ✅ (area) | ✅ (area) | ✅ (own) | ✅ (assigned) |
| Create itineraries | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit itineraries | ✅ | ✅ | ✅ | ✅ (own) | ✅ (assigned) |
| Delete itineraries | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Reports** | | | | | |
| View all reports | ✅ | ✅ (area) | ✅ (area) | ❌ | ❌ |
| Export reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| **System** | | | | | |
| Manage agencies | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage groups | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign municipalities | ✅ | ✅ | ✅ | ❌ | ❌ |
| Set targets | ✅ | ✅ | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## RBAC Architecture

### Database Schema

**Users Table:**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL,
    -- other fields...
    CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);
```

**User Profiles Table (PowerSync):**
```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    CONSTRAINT role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);
```

### Middleware Authorization

**Location:** `backend/src/middleware/auth.ts`

```typescript
// Role-based authorization middleware
export const requireRole = (...allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ message: 'Forbidden - Insufficient permissions' }, 403);
    }

    await next();
  };
};
```

**Usage in Routes:**
```typescript
import { requireRole } from '../middleware/auth.js';

clients.get('/', requireRole('admin', 'area_manager', 'assistant_area_manager'), async (c) => {
  // Handler code
});
```

### Role Constants

**Location:** `backend/src/routes/caravans.ts` and `backend/src/routes/users.ts`

```typescript
// Current: Supports both for migration compatibility
const CARAVAN_ROLES = ['caravan', 'field_agent'];

// TODO: Remove 'field_agent' after migration complete
const CARAVAN_ROLES = ['caravan'];
```

---

## Usage Patterns

### Pattern 1: Role-Based Route Protection

```typescript
// Only allow admins and area managers
import { requireRole } from '../middleware/auth.js';

agencies.get('/', requireRole('admin', 'area_manager'), async (c) => {
  const agencies = await pool.query('SELECT * FROM agencies');
  return c.json(agencies.rows);
});
```

### Pattern 2: Touchpoint Type Validation

**Location:** `mobile/imu_flutter/lib/services/touchpoint_validation_service.dart`

```dart
bool isValidTouchpointNumber(int number, TouchpointType type) {
  final visitNumbers = [1, 4, 7];
  final callNumbers = [2, 3, 5, 6];

  if (type == TouchpointType.visit) {
    return visitNumbers.contains(number);
  } else {
    return callNumbers.contains(number);
  }
}

bool validateTouchpointForRole(int number, TouchpointType type, String userRole) {
  if (userRole == 'caravan') {
    return type == TouchpointType.visit;
  } else if (userRole == 'tele') {
    return type == TouchpointType.call;
  }
  // Admin roles can create both
  return true;
}
```

### Pattern 3: Area-Based Filtering

```typescript
// Area managers and assistants only see users in their assigned municipalities
const userMunicipalities = await pool.query(
  'SELECT municipality_id FROM user_locations WHERE user_id = $1 AND deleted_at IS NULL',
  [userId]
);

// Filter clients by assigned municipalities
const clients = await pool.query(
  `SELECT c.* FROM clients c
   JOIN user_locations ul ON c.municipality_id = ul.municipality_id
   WHERE ul.user_id = $1 AND ul.deleted_at IS NULL`,
  [userId]
);
```

### Pattern 4: Ownership Checks

```typescript
// Caravan and tele users can only edit their own records
const touchpoint = await pool.query(
  'SELECT * FROM touchpoints WHERE id = $1',
  [touchpointId]
);

if (user.role === 'caravan' || user.role === 'tele') {
  if (touchpoint.rows[0].user_id !== user.id) {
    return c.json({ message: 'Forbidden - Not your touchpoint' }, 403);
  }
}
```

---

## Migration Notes

### Legacy: `field_agent` Role

**History:**
- Originally named: `field_agent`
- Renamed to: `caravan` in Migration 008
- Reason: Better naming consistency

**Migration 008:**
```sql
-- Update role values in users table
UPDATE users
SET role = 'caravan'
WHERE role = 'field_agent';

-- Add check constraint for new role values
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));
```

**Backward Compatibility:**
```typescript
// CARAVAN_ROLES includes both for migration period
const CARAVAN_ROLES = ['caravan', 'field_agent'];
```

**Action Required:**
- ✅ Migration 008 executed
- ✅ All `field_agent` references removed from codebase (2026-04-02)
- ✅ RBAC system implemented (Migration 039)

### Role Evolution

| Date | Change | Migration |
|------|--------|-----------|
| 2024-01-15 | Initial roles: admin, caravan, field_agent | - |
| 2024-03-01 | Added area_manager role | Migration 005 |
| 2024-03-15 | Renamed field_agent → caravan | Migration 008 |
| 2024-06-01 | Added assistant_area_manager role | Migration 015 |
| 2024-09-01 | Added tele role | Migration 026 |
| 2026-04-02 | Implemented RBAC system with fine-grained permissions | Migration 039 |

---

## RBAC Implementation Details

### Overview

The IMU system now includes a fully implemented RBAC (Role-Based Access Control) system as of **Migration 039**. This provides fine-grained permission checking while maintaining backward compatibility with the existing role-based system.

### Implemented Architecture

The RBAC system consists of the following tables:

```sql
-- Roles table (instead of hardcoded roles)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    level INTEGER DEFAULT 0, -- For hierarchy (admin=100, area_manager=50, etc.)
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions table
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource TEXT NOT NULL, -- e.g., 'clients', 'users', 'reports'
    action TEXT NOT NULL,   -- e.g., 'create', 'read', 'update', 'delete'
    description TEXT,
    constraint_name TEXT,   -- Optional: e.g., 'own', 'area', 'all'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource, action, constraint_name)
);

-- Role permissions junction table
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

-- User roles junction table (for multiple roles per user)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ, -- For temporary role assignments
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);
```

### Views and Functions

The RBAC system includes several views and functions for permission checking:

**user_permissions_view** - Flattened view for easy permission querying:
```sql
CREATE VIEW user_permissions_view AS
SELECT
    ur.user_id,
    r.slug AS role_slug,
    r.name AS role_name,
    p.resource,
    p.action,
    p.constraint_name,
    r.level AS role_level
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE ur.is_active = TRUE
  AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
```

**has_permission()** - Check if user has specific permission:
```sql
SELECT has_permission(
    '<user_id>'::UUID,
    '<resource>'::TEXT,
    '<action>'::TEXT,
    '<constraint>'::TEXT  -- Optional
);
```

**get_user_permissions()** - Get all permissions for a user:
```sql
SELECT * FROM get_user_permissions('<user_id>'::UUID);
```

**has_role()** - Check if user has a specific role:
```sql
SELECT has_role('<user_id>'::UUID, '<role_slug>'::TEXT);
```

**users_with_roles** - Backward compatibility view:
```sql
-- This view maintains backward compatibility with the old users.role column
-- It returns all user columns plus their primary role from user_roles
```

### Middleware Implementation

The permission middleware automatically detects whether RBAC is installed and falls back to role-based checks if not:

```typescript
// Permission-based middleware (with backward compatibility)
export const requirePermission = (
  resource: string,
  action: string,
  constraint?: string
) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ message: 'Unauthorized - No token provided' }, 401);
    }

    // Check permission (with automatic fallback to role-based if RBAC not installed)
    const hasPerms = await hasPermission(user.sub, resource, action, constraint);

    if (!hasPerms) {
      return c.json(
        {
          message: 'Forbidden - Insufficient permissions',
          required: { resource, action, constraint },
        },
        403
      );
    }

    await next();
  };
};
```

### Usage Examples

```typescript
// Instead of role-based checks
clients.get('/', requireRole('admin', 'area_manager'), async (c) => { });

// Use permission-based checks
clients.get('/', requirePermission('clients', 'read'), async (c) => { });
clients.post('/', requirePermission('clients', 'create'), async (c) => { });
clients.put('/:id', requirePermission('clients', 'update'), async (c) => { });
clients.delete('/:id', requirePermission('clients', 'delete'), async (c) => { });
```

#### Benefits

1. **Fine-grained control:** Define permissions at resource/action level
2. **Flexibility:** Add new permissions without code changes
3. **Auditability:** Track who granted which permissions
4. **Dynamic roles:** Create custom roles via UI
5. **Temporary access:** Set expiration dates for role assignments
6. **Multiple roles:** Users can have multiple roles simultaneously

#### Migration Strategy

1. **Phase 1:** Create new tables (non-breaking)
2. **Phase 2:** Migrate existing roles to new format
3. **Phase 3:** Add new permission middleware (alongside existing)
4. **Phase 4:** Gradually migrate routes to use permissions
5. **Phase 5:** Deprecate old role-based middleware
6. **Phase 6:** Remove old role columns from users table

---

## Best Practices

### 1. Always Check Permissions on the Server

❌ **Bad:** Client-side only checks
```typescript
// Client-side check (can be bypassed)
if (user.role === 'admin') {
  showAdminPanel();
}
```

✅ **Good:** Server-side enforcement
```typescript
// Server-side middleware (cannot be bypassed)
app.get('/admin', requireRole('admin'), adminHandler);
```

### 2. Use Specific Role Lists

❌ **Bad:** Overly permissive
```typescript
if (['admin', 'area_manager', 'assistant_area_manager'].includes(user.role)) {
  // Allow access
}
```

✅ **Good:** Explicit allowed roles
```typescript
const MANAGEMENT_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;
if (MANAGEMENT_ROLES.includes(user.role as any)) {
  // Allow access
}
```

### 3. Validate Touchpoint Numbers

❌ **Bad:** No validation
```typescript
async function createTouchpoint(touchpoint: Touchpoint) {
  await db.touchpoints.create(touchpoint);
}
```

✅ **Good:** Role and type validation
```typescript
async function createTouchpoint(touchpoint: Touchpoint, userRole: string) {
  if (!TouchpointValidationService.validateTouchpointForRole(
    touchpoint.touchpointNumber,
    touchpoint.type,
    userRole
  )) {
    throw new Error('Invalid touchpoint type for user role');
  }
  await db.touchpoints.create(touchpoint);
}
```

### 4. Check Ownership for Non-Admins

❌ **Bad:** Anyone can edit any touchpoint
```typescript
app.put('/touchpoints/:id', async (c) => {
  await updateTouchpoint(c.req.param('id'), await c.req.json());
});
```

✅ **Good:** Ownership check for caravan/tele
```typescript
app.put('/touchpoints/:id', async (c) => {
  const touchpoint = await getTouchpoint(c.req.param('id'));
  const user = c.get('user');

  if (['caravan', 'tele'].includes(user.role) && touchpoint.user_id !== user.id) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  await updateTouchpoint(c.req.param('id'), await c.req.json());
});
```

---

## Testing Permissions

### Unit Test Example

```typescript
describe('Permission Middleware', () => {
  it('should allow admin to access any resource', async () => {
    const user = { id: '1', role: 'admin' };
    const middleware = requireRole('admin', 'area_manager');

    const ctx = createMockContext({ user });
    const next = jest.fn();

    await middleware(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should deny caravan from accessing admin resources', async () => {
    const user = { id: '2', role: 'caravan' };
    const middleware = requireRole('admin');

    const ctx = createMockContext({ user });
    const next = jest.fn();

    await middleware(ctx, next);

    expect(ctx.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

---

## Common Issues

### Issue 1: "field_agent" Role Still Exists

**Symptoms:**
- Validation script warns about `field_agent` role
- Users cannot login after role rename

**Solution:**
```sql
UPDATE users SET role = 'caravan' WHERE role = 'field_agent';
UPDATE user_profiles SET role = 'caravan' WHERE role = 'field_agent';
```

### Issue 2: Touchpoint Creation Fails for Caravan/Tele

**Symptoms:**
- API returns "Invalid touchpoint type for user role"
- Caravan cannot create Visit touchpoints

**Solution:**
Check touchpoint number and type:
- Caravan: Only Visit touchpoints (1, 4, 7)
- Tele: Only Call touchpoints (2, 3, 5, 6)

### Issue 3: Area Manager Sees All Data

**Symptoms:**
- Area managers can see users outside their assigned areas

**Solution:**
Add municipality filtering to queries:
```typescript
const area = await pool.query(
  'SELECT * FROM user_locations WHERE user_id = $1',
  [areaManagerId]
);

const users = await pool.query(
  `SELECT u.* FROM users u
   JOIN user_locations ul ON u.id = ul.user_id
   WHERE ul.municipality_id = ANY($1)`,
  [area.rows.map(r => r.municipality_id)]
);
```

---

## References

- **Migration 008:** `backend/src/migrations/008_update_role_enum.sql`
- **Auth Middleware:** `backend/src/middleware/auth.ts`
- **Touchpoint Validation:** `mobile/imu_flutter/lib/services/touchpoint_validation_service.dart`
- **Validation Script:** `backend/scripts/validate-pre-migration.ts`

---

**Last Updated:** 2026-04-02
**Next Review:** After RBAC system implementation
