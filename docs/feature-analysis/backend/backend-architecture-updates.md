# IMU Backend Architecture & Database Updates

**Date:** 2025-03-26
**Version:** 2.0.0
**Status:** Production Ready

---

## Overview

The IMU backend has been completely refactored from PocketBase to a custom Hono.js + PostgreSQL implementation. This document covers the current architecture, recent database normalization, and audit system implementation.

---

## Current Backend Architecture

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Framework** | Hono.js | ^4.12.8 |
| **Language** | TypeScript | ^5.6.0 |
| **Database** | PostgreSQL | ^15 |
| **ORM** | Native SQL (pg library) | ^8.12.0 |
| **Authentication** | JWT (custom implementation) | - |
| **Validation** | Zod | ^3.22.0 |
| **File Storage** | AWS S3 / Synology NAS | - |

### Server Configuration

```bash
# Environment Variables
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-secret-key
JWT_EXPIRY_HOURS=24
AWS_S3_BUCKET=imu-uploads
AWS_REGION=us-east-1
```

**Development Server:**
```bash
cd backend
pnpm install
pnpm build
pnpm start  # Runs on http://localhost:3000
```

---

## Database Architecture

### Normalized User Management (2025-03-26)

**Key Changes:**
- Eliminated data triplication across `users`, `caravans`, and `user_profiles` tables
- Single source of truth for user data in `users` table
- Caravans/field agents are now users with `role IN ('field_agent', 'caravan')`

**Schema Changes:**
```sql
-- Added is_active column to users table
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_role ON users(role);

-- Updated groups.team_leader_id to reference users instead of caravans
ALTER TABLE groups DROP CONSTRAINT groups_team_leader_id_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_team_leader_id_fkey
  FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL;

-- Renamed for clarity
ALTER TABLE user_municipalities_simple RENAME TO user_locations;
```

**Dropped Tables:**
- `caravans` - Data migrated to users table
- `user_profiles` - Was duplicate of users table
- `user_psgc_assignments` - Unused, replaced by user_locations
- `v_caravans` - No longer needed after cleanup

---

## Current Database Schema

### Core Tables

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL, -- 'admin', 'area_manager', 'assistant_area_manager', 'staff', 'field_agent', 'caravan'
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true, -- NEW: Added for normalization
  area_manager_id UUID REFERENCES users(id),
  assistant_area_manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### user_locations (formerly user_municipalities_simple)
```sql
CREATE TABLE user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  municipality_id TEXT NOT NULL, -- Format: "province-municipality"
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ, -- Soft delete support
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_locations_user ON user_locations(user_id);
CREATE INDEX idx_user_locations_municipality ON user_locations(municipality_id);
CREATE INDEX idx_user_locations_active ON user_locations(deleted_at) WHERE deleted_at IS NULL;
```

#### groups
```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  members JSONB DEFAULT '[]'::jsonb, -- Array of user IDs
  team_leader_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NOW REFERENCES users
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### clients
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  birth_date DATE,
  email TEXT UNIQUE,
  phone TEXT,
  agency_name TEXT,
  department TEXT,
  position TEXT,
  employment_status TEXT,
  payroll_date DATE,
  tenure INTEGER,
  client_type TEXT NOT NULL, -- 'POTENTIAL' | 'EXISTING'
  product_type TEXT,
  market_type TEXT,
  pension_type TEXT,
  pan TEXT,
  facebook_link TEXT,
  remarks TEXT,
  caravan_id UUID REFERENCES users(id), -- NOW REFERENCES users directly
  is_starred BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### audit_logs (NEW)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', etc.
  entity TEXT NOT NULL, -- 'user', 'client', 'caravan', 'agency', etc.
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

## API Endpoints

### Authentication

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|----------------|
| `/api/auth/login` | POST | User login | No |
| `/api/auth/logout` | POST | User logout | Yes |
| `/api/auth/refresh` | POST | Refresh access token | No |
| `/api/auth/forgot-password` | POST | Request password reset | No |
| `/api/auth/reset-password` | POST | Reset password with token | No |

### Users

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|----------------|
| `/api/users` | GET | List users (paginated) | Admin/Staff |
| `/api/users/:id` | GET | Get user by ID | Yes (own or admin/staff) |
| `/api/users` | POST | Create new user | Admin |
| `/api/users/:id` | PUT | Update user | Yes (own or admin) |
| `/api/users/:id` | DELETE | Delete user | Admin |
| `/api/users/:id/change-password` | POST | Change password | Yes (own only) |

### Caravans (Field Agents)

**Note:** Caravans are users with `role IN ('field_agent', 'caravan')`. The API remains backward compatible.

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|----------------|
| `/api/caravans` | GET | List field agents | Yes |
| `/api/caravans/:id` | GET | Get field agent by ID | Yes |
| `/api/caravans` | POST | Create field agent | Admin |
| `/api/caravans/:id` | PUT | Update field agent | Admin |
| `/api/caravans/:id` | DELETE | Delete field agent | Admin |
| `/api/caravans/:id/municipalities` | GET | Get assigned municipalities | Yes |
| `/api/caravans/:id/municipalities` | POST | Assign municipalities | Admin/Manager |
| `/api/caravans/:id/municipalities/:municipalityId` | DELETE | Unassign municipality | Admin/Manager |

### Groups

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|----------------|
| `/api/groups` | GET | List groups | Yes |
| `/api/groups/:id` | GET | Get group by ID | Yes |
| `/api/groups` | POST | Create group | Yes |
| `/api/groups/:id` | PUT | Update group | Yes (own or admin) |
| `/api/groups/:id` | DELETE | Delete group | Yes (own or admin) |
| `/api/groups/:id/members` | POST | Add members to group | Yes |
| `/api/groups/:id/members/:clientId` | DELETE | Remove member from group | Yes |
| `/api/groups/:id/municipalities` | POST | Assign municipalities to group | Admin/Manager |

### Audit Logs

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|----------------|
| `/api/audit-logs` | GET | List audit logs (paginated) | Admin/Staff |
| `/api/audit-logs/stats` | GET | Get audit statistics | Admin |
| `/api/audit-logs/entity/:entity/:id` | GET | Get audit history for entity | Yes (own or admin/staff) |

---

## Audit System

### Purpose

The audit system provides a comprehensive trail of all system operations for:
- **Compliance**: SOC 2, GDPR, HIPAA requirements
- **Security**: Investigating suspicious activities
- **Debugging**: Tracking data changes
- **Performance**: Monitoring system usage

### What Gets Audited

1. **All CRUD Operations**: Users, clients, caravans, groups, agencies, touchpoints, itineraries, targets, attendance
2. **Authentication Events**: Login (success/failure), logout, password changes, password resets
3. **Approval Actions**: Approvals and rejections
4. **Data Changes**: Before/after values for updates and deletes

### Audit Log Entry Structure

```typescript
{
  id: "uuid",
  userId: "uuid",           // Who performed the action
  action: "create",         // What action
  entity: "client",         // What entity type
  entityId: "uuid",         // Which specific entity
  oldValues: {...},         // Previous state (for update/delete)
  newValues: {...},         // New state (for create/update)
  ipAddress: "192.168.1.1", // Where from
  userAgent: "Mozilla...",  // What client
  metadata: {...},          // Additional context
  createdAt: "2025-03-26T10:00:00Z"  // When
}
```

### Viewing Audit Logs

**API Examples:**
```bash
# Get recent audit logs
curl http://localhost:3000/api/audit-logs?page=1&perPage=20

# Get statistics
curl http://localhost:3000/api/audit-logs/stats

# Filter by user
curl http://localhost:3000/api/audit-logs?user_id={user_id}

# Filter by entity
curl http://localhost:3000/api/audit-logs?entity=client

# Filter by action
curl http://localhost:3000/api/audit-logs?action=create

# Get audit history for specific client
curl http://localhost:3000/api/audit-logs/entity/client/{client_id}
```

---

## Key Features & Improvements

### 1. Database Normalization
- ✅ Single source of truth for user data
- ✅ Eliminated data synchronization issues
- ✅ Fixed municipality assignment bug
- ✅ Simplified queries and joins

### 2. Comprehensive Audit Trail
- ✅ All CRUD operations logged
- ✅ Authentication events tracked
- ✅ IP address and user agent capture
- ✅ Before/after values for changes

### 3. API Backward Compatibility
- ✅ Caravan endpoints remain functional
- ✅ Frontend requires no changes
- ✅ Mobile app unaffected

### 4. Enhanced Security
- ✅ Sensitive data filtering (passwords, tokens)
- ✅ Failed login attempt tracking
- ✅ IP address logging for all actions

### 5. Performance Optimizations
- ✅ Strategic indexes on frequently queried columns
- ✅ JSONB for efficient storage of complex data
- ✅ Pagination support for large result sets

---

## Migration Files

| Migration | Description | Date |
|-----------|-------------|------|
| `019_normalize_user_tables.sql` | Normalize user tables, migrate caravans to users | 2025-03-26 |
| `020_drop_redundant_tables.sql` | Drop redundant tables, rename user_municipalities_simple | 2025-03-26 |
| `021_create_audit_logs_table.sql` | Create audit_logs table with proper schema | 2025-03-26 |

---

## Bug Fixes

### Municipality Assignment Bug (FIXED ✅)

**Problem:** Assigning municipalities returned success but `assigned_count` was 0.

**Root Cause:** Caravans table duplicated user data with `user_id` foreign key, causing sync issues.

**Solution:** Database normalization - caravanId now directly references userId in users table.

**Result:** Municipality assignment now works correctly.

### Municipality Assignment Validation (FIXED ✅)

**Problem:** When all municipalities were already assigned, the API returned success with `assigned_count: 0`.

**Solution:** Return 400 error when `assigned_count === 0` with clear message: "No new municipalities were assigned. All selected municipalities are already assigned to this caravan."

---

## Development Guidelines

### When Adding New Features

1. **Database Changes**: Create new migration file
2. **API Endpoints**: Add audit middleware automatically
3. **Authentication**: Use existing middleware from `middleware/auth.js`
4. **Validation**: Use Zod schemas for request validation
5. **Error Handling**: Return appropriate HTTP status codes

### Code Organization

```
backend/src/
├── db/
│   └── index.js              # Database connection pool
├── middleware/
│   ├── auth.js               # JWT authentication & authorization
│   └── audit.js              # Audit logging system
├── routes/
│   ├── auth.ts               # Authentication endpoints
│   ├── users.ts              # User management
│   ├── caravans.ts           # Field agent management
│   ├── clients.ts            # Client management
│   ├── groups.ts             # Group management
│   ├── agencies.ts           # Agency management
│   ├── touchpoints.ts        # Touchpoint tracking
│   ├── itineraries.ts        # Itinerary management
│   ├── targets.ts            # Performance targets
│   ├── attendance.ts         # Attendance tracking
│   ├── approvals.ts          # Approval workflow
│   ├── audit-logs.ts         # Audit log viewing
│   └── ...                   # Other routes
├── migrations/
│   └── *.sql                 # Database migration files
└── index.js                  # Server entry point
```

---

## Testing

### API Testing

```bash
# Test health endpoint (should return 404 without auth)
curl http://localhost:3000/

# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Test with token
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Database Verification

```sql
-- Verify users table has caravan roles
SELECT id, email, first_name, last_name, role, is_active
FROM users
WHERE role IN ('field_agent', 'caravan');

-- Verify groups references users
SELECT g.id, g.name, g.team_leader_id, u.email, u.role
FROM groups g
LEFT JOIN users u ON u.id = g.team_leader_id;

-- Verify user_locations exists
SELECT COUNT(*) FROM user_locations WHERE deleted_at IS NULL;

-- Verify audit logs are being created
SELECT COUNT(*) FROM audit_logs;
```

---

## Deployment Considerations

### Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT signing
- `JWT_EXPIRY_HOURS` - Token expiration time
- `AWS_S3_BUCKET` - S3 bucket for file uploads
- `AWS_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

### Database Migrations

Run migrations in order:
```bash
psql $DATABASE_URL -f backend/src/migrations/019_normalize_user_tables.sql
psql $DATABASE_URL -f backend/src/migrations/020_drop_redundant_tables.sql
psql $DATABASE_URL -f backend/src/migrations/021_create_audit_logs_table.sql
```

### Build & Start

```bash
cd backend
pnpm install
pnpm build
pnpm start  # Production: use node dist/index.js directly
```

---

## Future Enhancements

1. **Audit Log Retention**: Implement automatic cleanup of old audit logs
2. **Real-time Monitoring**: WebSocket-based audit log streaming
3. **Compliance Reports**: Automated SOC 2, GDPR compliance reports
4. **Performance Monitoring**: Query performance analysis and optimization
5. **API Documentation**: OpenAPI/Swagger documentation generation

---

## Support & Troubleshooting

### Common Issues

**Issue:** "remaining connection slots are reserved for roles with the SUPERUSER attribute"
- **Cause:** PostgreSQL connection pool exhausted
- **Solution:** Increase connection limit or use connection pooling (PgBouncer)

**Issue:** "column entity does not exist"
- **Cause:** Audit table has old schema
- **Solution:** Restart backend - audit middleware auto-detects and recreates table

**Issue:** Municipality assignment not working
- **Cause:** Database not normalized
- **Solution:** Run migrations 019 and 020

---

**Last Updated:** 2025-03-26
**Maintained By:** Development Team
