# Tele Role and Call-Only Touchpoint Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Tele" (telemarketer) role to the IMU system that can only create Call touchpoints (2, 3, 5, 6) via the web admin, while Caravan users can only create Visit touchpoints (1, 4, 7) via the mobile app, with strict backend validation and immediate activation (no approval workflow).

**Architecture:** Three-tier implementation with database migrations (PostgreSQL), backend API updates (Hono/TypeScript), frontend Vue 3 admin panel additions, and Flutter mobile app changes. The touchpoints table is refactored from role-specific `caravan_id` to generic `user_id`, and the approval system is completely removed in favor of immediate activation with role-based validation.

**Tech Stack:** PostgreSQL, Hono (Node.js backend), Vue 3 + TypeScript + Pinia (web admin), Flutter + Dart (mobile), Tailwind CSS, PowerSync (offline sync)

---

## File Structure Overview

**Database Migrations (3 new files):**
- `backend/src/migrations/026_add_tele_role.sql` - Add tele role to role constraints
- `backend/src/migrations/027_rename_caravan_id_to_user_id.sql` - Refactor touchpoints table
- `backend/src/migrations/028_remove_touchpoint_approval.sql` - Remove approval workflow with archival

**Backend API (2 modified files):**
- `backend/src/routes/touchpoints.ts` - Update all references, add validation, remove approval endpoints
- `backend/src/routes/approvals.ts` - Enable Tele client edit workflow

**Frontend Types (1 modified file):**
- `imu-web-vue/src/lib/types.ts` - Update User role type, Touchpoint/Approval interfaces

**Frontend Permissions (1 modified file):**
- `imu-web-vue/src/composables/usePermission.ts` - Add Tele-specific permissions

**Frontend Store (1 new file):**
- `imu-web-vue/src/stores/calls.ts` - Call queue management with auto-advance

**Frontend Views (4 new files):**
- `imu-web-vue/src/views/tele/ClientsView.vue` - Tele client management
- `imu-web-vue/src/views/tele/CallsView.vue` - Call queue with tabs
- `imu-web-vue/src/views/tele/components/ClientDetailModal.vue` - Full client history
- `imu-web-vue/src/views/tele/components/CallFormModal.vue` - Call touchpoint creation

**Frontend Navigation (2 modified files):**
- `imu-web-vue/src/router/index.ts` - Add Tele routes
- `imu-web-vue/src/components/shared/Sidebar.vue` - Tele menu items

**Mobile App (4 modified files):**
- `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart` - Add display fields
- `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart` - Role-based validation
- `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` - Role-based UI
- `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart` - Update SQL

**Tests (5 new files):**
- `backend/src/routes/__tests__/touchpoints.validation.test.ts` - Validation tests
- `backend/src/routes/__tests__/approvals.tele.test.ts` - Tele approval tests
- `imu-web-vue/src/stores/__tests__/calls.spec.ts` - Store tests
- `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service_test.dart` - Validation tests
- `integration/touchpoint-sequence.e2e.test.ts` - End-to-end tests

---

## Phase 1: Backend Database Migrations

### Task 1: Create Tele Role Migration

**Files:**
- Create: `backend/src/migrations/026_add_tele_role.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add 'tele' role to the system
-- Migration 026: Add Tele role

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS role_check,
  ADD CONSTRAINT role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'));

SELECT 'Migration 026: Tele role added successfully!' as result;
```

- [ ] **Step 2: Verify SQL syntax**

Open: `backend/src/migrations/026_add_tele_role.sql`
Expected: Valid PostgreSQL with constraint checks

- [ ] **Step 3: Commit**

```bash
git add backend/src/migrations/026_add_tele_role.sql
git commit -m "feat(db): add migration 026 for Tele role support"
```

---

### Task 2: Create Rename caravan_id to user_id Migration

**Files:**
- Create: `backend/src/migrations/027_rename_caravan_id_to_user_id.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration: Rename caravan_id to user_id in touchpoints table
-- This supports both Caravan and Tele users creating touchpoints
-- Migration 027

BEGIN;

-- 1. Rename column
ALTER TABLE touchpoints RENAME COLUMN caravan_id TO user_id;

-- 2. Update column comment
COMMENT ON COLUMN touchpoints.user_id IS 'The user (caravan or tele) who created this touchpoint';

-- 3. Update foreign key references
ALTER TABLE touchpoints
  DROP CONSTRAINT IF EXISTS touchpoints_caravan_id_fkey,
  ADD CONSTRAINT touchpoints_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Update indexes
DROP INDEX IF EXISTS idx_touchpoints_caravan_id;
CREATE INDEX idx_touchpoints_user_id ON touchpoints(user_id);

COMMIT;

SELECT 'Migration 027: caravan_id renamed to user_id successfully!' as result;
```

- [ ] **Step 2: Verify SQL syntax**

Open: `backend/src/migrations/027_rename_caravan_id_to_user_id.sql`
Expected: Valid PostgreSQL with transaction wrapper

- [ ] **Step 3: Commit**

```bash
git add backend/src/migrations/027_rename_caravan_id_to_user_id.sql
git commit -m "feat(db): add migration 027 to rename caravan_id to user_id"
```

---

### Task 3: Create Remove Touchpoint Approval Migration

**Files:**
- Create: `backend/src/migrations/028_remove_touchpoint_approval.sql`

- [ ] **Step 1: Write migration SQL with archival logic**

```sql
-- Migration: Remove touchpoint approval fields
-- Archives rejected/deleted touchpoints before removing approval fields
-- Migration 028

BEGIN;

-- Step 1: Create archival table for rejected/deleted touchpoints
CREATE TABLE IF NOT EXISTS touchpoints_archived (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  user_id UUID REFERENCES users(id),
  touchpoint_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  photo_url TEXT,
  audio_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  time_in TIME,
  time_in_gps_lat NUMERIC,
  time_in_gps_lng NUMERIC,
  time_in_gps_address TEXT,
  time_out TIME,
  time_out_gps_lat NUMERIC,
  time_out_gps_lng NUMERIC,
  time_out_gps_address TEXT,
  next_visit_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  original_edit_status TEXT,
  rejection_reason TEXT,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Archive rejected and deleted touchpoints
INSERT INTO touchpoints_archived (
  id, client_id, user_id, touchpoint_number, type, date, reason, status,
  notes, photo_url, audio_url, latitude, longitude, time_in,
  time_in_gps_lat, time_in_gps_lng, time_in_gps_address, time_out,
  time_out_gps_lat, time_out_gps_lng, time_out_gps_address, next_visit_date,
  created_at, updated_at, original_edit_status, rejection_reason
)
SELECT
  id, client_id, caravan_id as user_id, touchpoint_number, type, date, reason, status,
  notes, photo_url, audio_url, latitude, longitude, time_in,
  time_in_gps_lat, time_in_gps_lng, time_in_gps_address, time_out,
  time_out_gps_lat, time_out_gps_lng, time_out_gps_address, next_visit_date,
  created, updated, edit_status, rejection_reason
FROM touchpoints
WHERE edit_status IN ('rejected', 'deleted');

-- Step 3: Delete archived touchpoints from main table
DELETE FROM touchpoints
WHERE edit_status IN ('rejected', 'deleted');

-- Step 4: Restore touchpoints with pending_deletion (cancel pending deletions)
UPDATE touchpoints
SET edit_status = NULL,
    rejection_reason = NULL,
    edited_at = NULL,
    edited_by = NULL,
    proposed_changes = NULL
WHERE edit_status = 'pending_deletion';

-- Step 5: Remove approval-related fields
ALTER TABLE touchpoints
  DROP COLUMN IF EXISTS edit_status,
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS edited_by,
  DROP COLUMN IF EXISTS proposed_changes,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS is_synced,
  DROP COLUMN IF EXISTS synced_at;

COMMIT;

SELECT 'Migration 028: Touchpoint approval fields removed successfully!' as result;
```

- [ ] **Step 2: Verify SQL syntax**

Open: `backend/src/migrations/028_remove_touchpoint_approval.sql`
Expected: Valid PostgreSQL with archival logic

- [ ] **Step 3: Commit**

```bash
git add backend/src/migrations/028_remove_touchpoint_approval.sql
git commit -m "feat(db): add migration 028 to remove touchpoint approval fields"
```

---

### Task 4: Update Base Schema Files

**Files:**
- Modify: `backend/src/schema.sql:101-115`
- Modify: `backend/scripts/seed-digital-ocean.sql:105-120`

- [ ] **Step 1: Read current schema**

Open: `backend/src/schema.sql`
Find: Lines 101-115 (touchpoints table definition)

- [ ] **Step 2: Update touchpoints table definition**

Replace caravan_id with user_id, remove approval fields:

```sql
CREATE TABLE IF NOT EXISTS touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  touchpoint_number INTEGER NOT NULL CHECK (touchpoint_number BETWEEN 1 AND 7),
  type TEXT NOT NULL CHECK (type IN ('Visit', 'Call')),
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Interested', 'Undecided', 'Not Interested', 'Completed')),
  notes TEXT,
  photo_url TEXT,
  audio_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  time_in TIME,
  time_in_gps_lat NUMERIC,
  time_in_gps_lng NUMERIC,
  time_in_gps_address TEXT,
  time_out TIME,
  time_out_gps_lat NUMERIC,
  time_out_gps_lng NUMERIC,
  time_out_gps_address TEXT,
  next_visit_date DATE,
  created TIMESTAMPTZ DEFAULT NOW(),
  updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX idx_touchpoints_user_id ON touchpoints(user_id);
CREATE INDEX idx_touchpoints_touchpoint_number ON touchpoints(touchpoint_number);
CREATE INDEX idx_touchpoints_date ON touchpoints(date);
```

- [ ] **Step 3: Update role constraints**

Find: Lines with role CHECK constraints (search for 'role IN')
Add 'tele' to all role constraints:

```sql
-- In users table
CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))

-- In user_profiles table
CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
```

- [ ] **Step 4: Repeat for seed file**

Open: `backend/scripts/seed-digital-ocean.sql`
Apply same changes to lines 105-120

- [ ] **Step 5: Commit**

```bash
git add backend/src/schema.sql backend/scripts/seed-digital-ocean.sql
git commit -m "feat(db): update base schema for Tele role and user_id changes"
```

---

## Phase 2: Backend API Changes

### Task 5: Update Touchpoints Route - Schema and Constants

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:1-80`

- [ ] **Step 1: Read current file**

Open: `backend/src/routes/touchpoints.ts`
Find: Lines 1-80 (imports, constants, schema definitions)

- [ ] **Step 2: Add TOUCHPOINT_SEQUENCE constant**

After line 15 (after imports), add:

```typescript
// Define touchpoint sequence (1-indexed)
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;
```

- [ ] **Step 3: Update createTouchpointSchema**

Find: Line ~69 (createTouchpointSchema definition)
Replace caravan_id with user_id and make it required:

```typescript
const createTouchpointSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(), // Now required, was caravan_id.optional()
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(Date.parse),
  reason: z.string().min(1),
  status: z.enum(['Interested', 'Undecided', 'Not Interested', 'Completed']),
  notes: z.string().optional(),
  photo_url: z.string().url().optional(),
  audio_url: z.string().url().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  time_in: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  time_in_gps_lat: z.number().optional(),
  time_in_gps_lng: z.number().optional(),
  time_in_gps_address: z.string().optional(),
  time_out: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  time_out_gps_lat: z.number().optional(),
  time_out_gps_lng: z.number().optional(),
  time_out_gps_address: z.string().optional(),
  next_visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): update touchpoint schema for user_id and sequence constant"
```

---

### Task 6: Add Validation Function to Touchpoints Route

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:80-120`

- [ ] **Step 1: Add canCreateTouchpoint validation function**

After the TOUCHPOINT_SEQUENCE constant, add:

```typescript
/**
 * Validates if a user can create a specific touchpoint type based on their role
 * and the expected touchpoint sequence
 */
function canCreateTouchpoint(
  userRole: string,
  touchpointNumber: number,
  touchpointType: 'Visit' | 'Call'
): boolean {
  const expectedType = TOUCHPOINT_SEQUENCE[touchpointNumber - 1];

  if (userRole === 'caravan') {
    // Caravan: Only Visit types allowed (1, 4, 7)
    if (expectedType !== 'Visit' || touchpointType !== 'Visit') {
      return false;
    }
    return true;
  }

  if (userRole === 'tele') {
    // Tele: Only Call types allowed (2, 3, 5, 6)
    if (expectedType !== 'Call' || touchpointType !== 'Call') {
      return false;
    }
    return true;
  }

  // Admin/Manager: Any type allowed
  return true;
}

/**
 * Gets the next expected touchpoint number for a client
 * @param clientId - The client ID
 * @returns The next expected touchpoint number (1-7) or null if all 7 are completed
 */
async function getNextTouchpointNumber(clientId: string): Promise<number | null> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT touchpoint_number) as count
     FROM touchpoints
     WHERE client_id = $1`,
    [clientId]
  );
  const count = parseInt(result.rows[0].count);

  if (count >= 7) {
    return null; // All 7 touchpoints completed
  }

  return count + 1; // Next expected touchpoint number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): add touchpoint validation functions"
```

---

### Task 7: Update Touchpoint Creation Endpoint with Validation

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:340-450`

- [ ] **Step 1: Find POST /touchpoints handler**

Open: `backend/src/routes/touchpoints.ts`
Find: Line ~340 (POST handler starting with `touchpoints.post('/'`)

- [ ] **Step 2: Add validation after schema validation**

After line ~350 (after `const validated = createTouchpointSchema.parse(body)`), add:

```typescript
    // Validate touchpoint type against user role and sequence
    if (!canCreateTouchpoint(user.role, validated.touchpoint_number, validated.type)) {
      let reason = '';
      if (user.role === 'caravan') {
        reason = 'Caravan users can only create Visit touchpoints (1, 4, 7)';
      } else if (user.role === 'tele') {
        reason = 'Tele users can only create Call touchpoints (2, 3, 5, 6)';
      } else {
        reason = `Touchpoint #${validated.touchpoint_number} must be a ${TOUCHPOINT_SEQUENCE[validated.touchpoint_number - 1]}`;
      }

      return c.json({
        message: reason,
        errorCode: 'INVALID_TOUCHPOINT_TYPE_FOR_ROLE',
        touchpointNumber: validated.touchpoint_number,
        requestedType: validated.type,
        userRole: user.role,
      }, 403);
    }

    // Check if this is the next expected touchpoint number for the client
    const nextTouchpointNumber = await getNextTouchpointNumber(validated.client_id);
    if (nextTouchpointNumber === null) {
      return c.json({
        message: 'All 7 touchpoints have been completed for this client',
        errorCode: 'ALL_TOUCHPOINTS_COMPLETED',
        clientId: validated.client_id,
      }, 400);
    }

    if (validated.touchpoint_number !== nextTouchpointNumber) {
      return c.json({
        message: `Touchpoint #${validated.touchpoint_number} cannot be created yet. Next expected is #${nextTouchpointNumber}`,
        errorCode: 'INVALID_TOUCHPOINT_SEQUENCE',
        requestedNumber: validated.touchpoint_number,
        expectedNumber: nextTouchpointNumber,
      }, 400);
    }
```

- [ ] **Step 3: Update INSERT statement to use user_id**

Find: Line ~410 (INSERT statement)
Replace `caravan_id` with `user_id`:

```typescript
    const result = await pool.query(
      `INSERT INTO touchpoints (
        client_id, user_id, touchpoint_number, type, date,
        reason, status, notes, photo_url, audio_url, latitude, longitude,
        time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address,
        time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address,
        next_visit_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING *`,
      [
        validated.client_id,
        validated.user_id,
        validated.touchpoint_number,
        validated.type,
        validated.date,
        validated.reason,
        validated.status,
        validated.notes,
        validated.photo_url,
        validated.audio_url,
        validated.latitude,
        validated.longitude,
        validated.time_in,
        validated.time_in_gps_lat,
        validated.time_in_gps_lng,
        validated.time_in_gps_address,
        validated.time_out,
        validated.time_out_gps_lat,
        validated.time_out_gps_lng,
        validated.time_out_gps_address,
        validated.next_visit_date,
      ]
    );
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): add role validation to touchpoint creation"
```

---

### Task 8: Update Touchpoint List Query - Remove edit_status Filtering

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:160-190`

- [ ] **Step 1: Find GET /touchpoints handler**

Open: `backend/src/routes/touchpoints.ts`
Find: Line ~160 (GET handler with WHERE conditions)

- [ ] **Step 2: Remove edit_status filtering**

Find and remove lines with `edit_status` conditions:

```typescript
// REMOVE these lines:
conditions.push(`t.edit_status = 'approved'`);

// REMOVE these lines:
if (status === 'pending') {
  conditions.push(`t.edit_status IN ('pending_approval', 'pending_deletion')`);
} else {
  conditions.push(`t.edit_status = $${paramIndex}`);
  params.push(status);
  paramIndex++;
}

// REPLACE with simple status filter:
if (status && status !== 'all') {
  conditions.push(`t.status = $${paramIndex}`);
  params.push(status);
  paramIndex++;
}
```

- [ ] **Step 3: Update JOIN clause**

Find: Line ~233 (LEFT JOIN users)
Replace `t.caravan_id` with `t.user_id`:

```typescript
conditions.push(
  `t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN users u ON u.id = t.user_id`
);
```

- [ ] **Step 4: Update map function**

Find: Line ~248 (map function in response)
Remove edit_status fields:

```typescript
const touchpoint = {
  id: row.id,
  clientId: row.client_id,
  userId: row.user_id,
  touchpointNumber: row.touchpoint_number,
  type: row.type,
  date: row.date,
  reason: row.reason,
  status: row.status,
  notes: row.notes,
  photoUrl: row.photo_url,
  audioUrl: row.audio_url,
  latitude: row.latitude,
  longitude: row.longitude,
  timeIn: row.time_in,
  timeInGpsLat: row.time_in_gps_lat,
  timeInGpsLng: row.time_in_gps_lng,
  timeInGpsAddress: row.time_in_gps_address,
  timeOut: row.time_out,
  timeOutGpsLat: row.time_out_gps_lat,
  timeOutGpsLng: row.time_out_gps_lng,
  timeOutGpsAddress: row.time_out_gps_address,
  nextVisitDate: row.next_visit_date,
  createdAt: row.created,
  updatedAt: row.updated,
  // Removed: edit_status, edited_at, edited_by, proposed_changes, is_synced, synced_at
};
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): remove edit_status filtering from touchpoint list"
```

---

### Task 9: Update Touchpoint Update and Delete Handlers

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:460-600`

- [ ] **Step 1: Find PUT /touchpoints/:id handler**

Open: `backend/src/routes/touchpoints.ts`
Find: Line ~460 (PUT handler)

- [ ] **Step 2: Remove approval workflow from UPDATE**

Find and remove approval-related code:

```typescript
// REMOVE these entire sections:
- ALL updates require approval - store in proposed_changes
- Cannot update rejected touchpoints check
- Mark as pending_approval

// REPLACE with simple direct update:
const updateResult = await pool.query(
  `UPDATE touchpoints
   SET client_id = $1, user_id = $2, touchpoint_number = $3, type = $4, date = $5,
       reason = $6, status = $7, notes = $8, photo_url = $9, audio_url = $10,
       latitude = $11, longitude = $12, time_in = $13, time_in_gps_lat = $14,
       time_in_gps_lng = $15, time_in_gps_address = $16, time_out = $17,
       time_out_gps_lat = $18, time_out_gps_lng = $19, time_out_gps_address = $20,
       next_visit_date = $21, updated = NOW()
   WHERE id = $22
   RETURNING *`,
  [
    validated.client_id, validated.user_id, validated.touchpoint_number, validated.type,
    validated.date, validated.reason, validated.status, validated.notes,
    validated.photo_url, validated.audio_url, validated.latitude, validated.longitude,
    validated.time_in, validated.time_in_gps_lat, validated.time_in_gps_lng,
    validated.time_in_gps_address, validated.time_out, validated.time_out_gps_lat,
    validated.time_out_gps_lng, validated.time_out_gps_address, validated.next_visit_date,
    id
  ]
);
```

- [ ] **Step 3: Update DELETE handler**

Find: Line ~560 (DELETE handler)
Remove pending deletion workflow:

```typescript
// REMOVE: Soft delete with edit_status, pending deletion workflow

// REPLACE with hard delete:
const deleteResult = await pool.query(
  'DELETE FROM touchpoints WHERE id = $1 RETURNING *',
  [id]
);

if (deleteResult.rows.length === 0) {
  return c.json({ message: 'Touchpoint not found' }, 404);
}

return c.json({ message: 'Touchpoint deleted successfully' }, 200);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): remove approval workflow from touchpoint update/delete"
```

---

### Task 10: Remove Touchpoint Approval Endpoints

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:640-820`

- [ ] **Step 1: Find approval endpoints**

Open: `backend/src/routes/touchpoints.ts`
Find: Lines with `touchpoints.post('/:id/approve'` and `touchpoints.post('/:id/reject'`

- [ ] **Step 2: Remove approval endpoints entirely**

Delete these entire route handlers:
- `POST /api/touchpoints/:id/approve` (~100 lines)
- `POST /api/touchpoints/:id/reject` (~100 lines)
- `GET /api/touchpoints/pending` (if exists)

- [ ] **Step 3: Remove GET pending endpoint if exists**

Find and delete any endpoint that returns pending approvals

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/touchpoints.ts
git commit -m "feat(api): remove touchpoint approval endpoints"
```

---

### Task 11: Update Approvals Route for Tele Client Edits

**Files:**
- Modify: `backend/src/routes/approvals.ts:1-50`

- [ ] **Step 1: Read current approvals route**

Open: `backend/src/routes/approvals.ts`
Find: Lines 1-50 (imports and constants)

- [ ] **Step 2: Add Tele role to allowed roles**

Find: Role check constants (search for 'FIELD_AGENT_ROLES' or similar)
Add 'tele' to allowed roles for client approvals:

```typescript
const TELE_CLIENT_ROLES = ['tele'];
const CLIENT_APPROVAL_ROLES = ['admin', 'area_manager', 'assistant_area_manager', 'tele'];
```

- [ ] **Step 3: Update client approval schema validation**

Find: Client approval schema (search for 'clientApprovalSchema')
Add role field validation:

```typescript
const clientApprovalSchema = z.object({
  type: z.enum(['client', 'udi']),
  role: z.enum(['admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele']).optional(),
  clientId: z.string().uuid().optional(),
  // ... rest of fields
});
```

- [ ] **Step 4: Add Tele client field restrictions**

After the schema, add field restriction logic:

```typescript
/**
 * Fields that Tele users can edit on clients
 */
const TELE_EDITABLE_FIELDS = [
  'first_name',
  'middle_name',
  'last_name',
  'email',
  'phone',
  'client_type',
  'product_type',
  'market_type',
  'pension_type',
  'agency_name',
  'department',
  'position',
  'employment_status',
  'pan',
  'facebook_link',
  'remarks',
];

/**
 * Fields that require special handling for Tele users
 */
const TELE_RESTRICTED_FIELDS = [
  'caravan_id', // Tele users CANNOT assign caravans
  'addresses',  // Requires separate approval
  'phone_numbers', // Requires separate approval
];

function validateTeleClientEdits(proposedChanges: Record<string, unknown>, userRole: string): void {
  if (userRole === 'tele') {
    // Check for restricted fields
    for (const field of TELE_RESTRICTED_FIELDS) {
      if (field in proposedChanges) {
        throw new Error(`Tele users cannot modify the ${field} field`);
      }
    }

    // Validate that all proposed fields are editable
    for (const field of Object.keys(proposedChanges)) {
      if (!TELE_EDITABLE_FIELDS.includes(field)) {
        throw new Error(`Tele users cannot modify the ${field} field`);
      }
    }
  }
}
```

- [ ] **Step 5: Call validation in POST handler**

Find: POST /approvals handler
After parsing body, add validation:

```typescript
// After const validated = clientApprovalSchema.parse(body)

// Validate Tele user field restrictions
if (validated.role === 'tele' && validated.proposed_changes) {
  try {
    validateTeleClientEdits(validated.proposed_changes as Record<string, unknown>, user.role);
  } catch (error) {
    return c.json({
      message: error instanceof Error ? error.message : 'Invalid field for Tele user',
      errorCode: 'INVALID_TELE_FIELD',
    }, 403);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/approvals.ts
git commit -m "feat(api): enable Tele client edits with field restrictions"
```

---

### Task 11.5: Add Tele User Assignment Helper Functions

**Files:**
- Modify: `backend/src/routes/users.ts` or `backend/src/routes/locations.ts`

- [ ] **Step 1: Read current user/location routes**

Open: `backend/src/routes/users.ts`
Find: Existing user-related route handlers

- [ ] **Step 2: Add Tele user assignment helper functions**

Add these helper functions:

```typescript
/**
 * Get assigned municipalities for a Tele user
 * @param userId - The user ID
 * @returns Array of municipality IDs
 */
async function getAssignedMunicipalities(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT municipality_id FROM user_locations WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map(row => row.municipality_id);
}

/**
 * Get clients for a Tele user based on assigned municipalities
 * @param userId - The Tele user ID
 * @returns Array of clients in assigned municipalities
 */
async function getClientsForTeleUser(userId: string): Promise<any[]> {
  const municipalities = await getAssignedMunicipalities(userId);

  if (municipalities.length === 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT DISTINCT c.*, ca.municipality_id
     FROM clients c
     LEFT JOIN client_addresses ca ON c.id = ca.client_id
     WHERE ca.municipality_id = ANY($1)
     ORDER BY c.last_name, c.first_name`,
    [municipalities]
  );

  return result.rows;
}

/**
 * Get clients with Call touchpoints pending for a Tele user
 * @param userId - The Tele user ID
 * @returns Array of clients with pending Call touchpoints
 */
async function getPendingCallClientsForTeleUser(userId: string): Promise<any[]> {
  const municipalities = await getAssignedMunicipalities(userId);

  // Get the next expected touchpoint number for each client
  const result = await pool.query(
    `WITH client_touchpoint_counts AS (
      SELECT
        c.id as client_id,
        c.first_name,
        c.last_name,
        c.email,
        ca.municipality_id,
        COUNT(DISTINCT tp.touchpoint_number) as completed_count
      FROM clients c
      LEFT JOIN client_addresses ca ON c.id = ca.client_id
      LEFT JOIN touchpoints tp ON c.id = tp.client_id
      WHERE ca.municipality_id = ANY($1) OR ($1 = '{}' AND ca.municipality_id IS NULL)
      GROUP BY c.id, c.first_name, c.last_name, c.email, ca.municipality_id
    )
    SELECT
      client_id,
      first_name,
      last_name,
      email,
      municipality_id,
      completed_count + 1 as next_touchpoint_number,
      CASE
        WHEN completed_count + 1 IN (2, 3, 5, 6) THEN 'Call'
        ELSE 'Visit'
      END as next_touchpoint_type
    FROM client_touchpoint_counts
    WHERE completed_count < 7
      AND (completed_count + 1 IN (2, 3, 5, 6)) -- Only Call touchpoints
    ORDER BY next_touchpoint_number, last_name, first_name`,
    [municipalities.length > 0 ? municipalities : []]
  );

  return result.rows;
}
```

- [ ] **Step 3: Add API endpoints for Tele user queries**

Add these route handlers:

```typescript
// GET /api/users/:id/assigned-municipalities
users.get('/:id/assigned-municipalities', async (c) => {
  const user = c.get('user') as User;
  const { id } = c.req.param();

  // Only users can view their own assignments, or admins can view any
  if (user.role !== 'admin' && user.role !== 'area_manager' && user.id !== id) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  try {
    const municipalities = await getAssignedMunicipalities(id);
    return c.json({ municipalities });
  } catch (error) {
    console.error('Error fetching assigned municipalities:', error);
    return c.json({ message: 'Failed to fetch assigned municipalities' }, 500);
  }
});

// GET /api/users/:id/pending-calls
users.get('/:id/pending-calls', async (c) => {
  const user = c.get('user') as User;
  const { id } = c.req.param();

  // Only Tele users can view their own pending calls, or admins can view any
  if (user.role !== 'admin' && user.role !== 'area_manager' && user.id !== id) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  if (user.role !== 'tele' && user.role !== 'admin' && user.role !== 'area_manager') {
    return c.json({ message: 'Only Tele users have pending calls' }, 403);
  }

  try {
    const clients = await getPendingCallClientsForTeleUser(id);
    return c.json({ clients });
  } catch (error) {
    console.error('Error fetching pending calls:', error);
    return c.json({ message: 'Failed to fetch pending calls' }, 500);
  }
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/users.ts
git commit -m "feat(api): add Tele user assignment helper functions and endpoints"
```

---

### Task 11.6: Create Pre-Migration Validation Script

**Files:**
- Create: `backend/src/migrations/pre_migration_validation.sql`

- [ ] **Step 1: Write pre-migration validation script**

```sql
-- Pre-Migration Validation Script for Tele Role Implementation
-- Run this BEFORE executing migrations 026, 027, 028
-- This script checks for potential issues that could affect migration success

\echo 'Starting pre-migration validation...'
\echo ''

-- Check 1: Verify current migration version
\echo 'Check 1: Current migration version'
SELECT MAX(id) as current_migration FROM schema_migrations;

-- Check 2: Check for orphaned touchpoints (caravan_id references non-existent users)
\echo 'Check 2: Orphaned touchpoints (caravan_id references non-existent users)'
SELECT
  COUNT(*) as orphaned_touchpoints
FROM touchpoints t
LEFT JOIN users u ON t.caravan_id = u.id
WHERE t.caravan_id IS NOT NULL AND u.id IS NULL;

-- If this returns > 0, you need to fix orphans before migration:
-- UPDATE touchpoints SET caravan_id = NULL WHERE caravan_id IN (orphan_ids);

-- Check 3: Check existing touchpoint edit_status distribution
\echo 'Check 3: Touchpoint edit_status distribution'
SELECT
  edit_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM touchpoints
GROUP BY edit_status
ORDER BY count DESC;

-- Check 4: Check for touchpoints with null caravan_id
\echo 'Check 4: Touchpoints with null caravan_id'
SELECT COUNT(*) as null_caravan_touchpoints
FROM touchpoints
WHERE caravan_id IS NULL;

-- Check 5: Verify user roles are consistent between users and user_profiles tables
\echo 'Check 5: User role consistency'
SELECT
  u.role as users_role,
  up.role as profiles_role,
  COUNT(*) as count
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE u.role != up.role
GROUP BY u.role, up.role;

-- Check 6: Check for clients with duplicate touchpoint numbers
\echo 'Check 6: Duplicate touchpoint numbers per client'
SELECT
  client_id,
  touchpoint_number,
  COUNT(*) as count
FROM touchpoints
WHERE edit_status IN ('approved', 'pending_approval')
GROUP BY client_id, touchpoint_number
HAVING COUNT(*) > 1
LIMIT 10;

-- Check 7: Verify touchpoint sequence integrity
\echo 'Check 7: Touchpoint sequence integrity (clients with gaps)'
WITH numbered_touchpoints AS (
  SELECT
    client_id,
    touchpoint_number,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY touchpoint_number) as row_num
  FROM touchpoints
  WHERE edit_status IN ('approved', 'pending_approval')
)
SELECT
  client_id,
  touchpoint_number,
  row_num,
  CASE
    WHEN touchpoint_number != row_num THEN 'GAP DETECTED'
    ELSE 'OK'
  END as status
FROM numbered_touchpoints
WHERE touchpoint_number != row_num
LIMIT 10;

-- Check 8: Count total touchpoints for migration impact assessment
\echo 'Check 8: Total touchpoints count'
SELECT
  COUNT(*) as total_touchpoints,
  COUNT(*) FILTER (WHERE edit_status = 'approved') as approved,
  COUNT(*) FILTER (WHERE edit_status = 'pending_approval') as pending_approval,
  COUNT(*) FILTER (WHERE edit_status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE edit_status = 'deleted') as deleted,
  COUNT(*) FILTER (WHERE edit_status = 'pending_deletion') as pending_deletion
FROM touchpoints;

-- Check 9: Verify all required indexes exist
\echo 'Check 9: Existing indexes'
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'touchpoints'
ORDER BY indexname;

-- Check 10: Check foreign key constraints
\echo 'Check 10: Touchpoint foreign key constraints'
SELECT
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE c.conrelid = 'touchpoints'::regclass
  AND c.contype = 'f';

\echo ''
\echo 'Pre-migration validation complete!'
\echo 'Review the results above before proceeding with migrations.'
\echo 'If any checks show issues, address them before running migrations 026-028.'
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/pre_migration_validation.sql
git commit -m "feat(db): add pre-migration validation script"
```

---

## Phase 3: Frontend Type Updates

### Task 12: Update User Type Definition

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts:1-15`

- [ ] **Step 1: Read current User type**

Open: `imu-web-vue/src/lib/types.ts`
Find: Lines 1-15 (User interface definition)

- [ ] **Step 2: Update User role type**

Replace line 6 with:

```typescript
  role: 'admin' | 'area_manager' | 'assistant_area_manager' | 'caravan' | 'tele';
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(types): add tele role to User type definition"
```

---

### Task 13: Update Touchpoint Type - caravan_id to user_id

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts:116-135`

- [ ] **Step 1: Find Touchpoint interface**

Open: `imu-web-vue/src/lib/types.ts`
Find: Lines 116-135 (Touchpoint interface)

- [ ] **Step 2: Replace caravan_id with user_id**

```typescript
export interface Touchpoint {
  id: string;
  client_id: string;
  user_id: string; // was caravan_id
  touchpoint_number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  type: 'Visit' | 'Call';
  date: string;
  reason: string;
  status: 'Interested' | 'Undecided' | 'Not Interested' | 'Completed';
  notes?: string;
  photo_url?: string;
  audio_url?: string;
  latitude?: number;
  longitude?: number;
  time_in?: string;
  time_out?: string;
  next_visit_date?: string;
  created: string;
  updated: string;
  expand?: {
    client_id?: Client;
    user_id?: User; // was caravan_id?: Caravan
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(types): rename caravan_id to user_id in Touchpoint"
```

---

### Task 14: Update Approval Type - caravan_id to user_id

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts:214-245`

- [ ] **Step 1: Find Approval interface**

Open: `imu-web-vue/src/lib/types.ts`
Find: Lines 214-245 (Approval interface)

- [ ] **Step 2: Replace caravan_id with user_id**

```typescript
export interface Approval {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  client_id: string;
  user_id?: string; // was caravan_id
  touchpoint_number?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  role?: string;
  reason?: string;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created: string;
  updated: string;
  expand?: {
    client_id?: Client;
    user_id?: User; // was caravan_id?: Caravan
    approved_by?: User;
    rejected_by?: User;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(types): rename caravan_id to user_id in Approval"
```

---

### Task 15: Update Itinerary Type - caravan_id to user_id

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts:144-165`

- [ ] **Step 1: Find Itinerary interface**

Open: `imu-web-vue/src/lib/types.ts`
Find: Lines 144-165 (Itinerary interface)

- [ ] **Step 2: Replace caravan_id with user_id**

```typescript
export interface Itinerary {
  id: string;
  title?: string;
  user_id: string; // was caravan_id
  client_id: string;
  scheduled_date: string;
  scheduled_time?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high';
  notes?: string;
  is_recurring: boolean;
  recurring_pattern?: 'daily' | 'weekly' | 'monthly';
  created: string;
  updated: string;
  created_by?: string;
  expand?: {
    user_id?: Caravan; // was caravan_id?: Caravan, but should be User
    client_id?: Client;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(types): rename caravan_id to user_id in Itinerary"
```

---

## Phase 4: Frontend Permissions

### Task 16: Update Permissions Composable

**Files:**
- Modify: `imu-web-vue/src/composables/usePermission.ts`

- [ ] **Step 1: Read current permissions**

Open: `imu-web-vue/src/composables/usePermission.ts`
Find: Permissions object definition

- [ ] **Step 2: Add Tele-specific permissions**

Add these permissions to the permissions object:

```typescript
const permissions = {
  // ... existing permissions ...

  // Tele permissions
  'view_calls_page': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'create_call_touchpoint': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'create_visit_touchpoint': ['admin', 'area_manager', 'assistant_area_manager', 'caravan'],
  'edit_clients': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'edit_client_caravan': ['admin', 'area_manager', 'assistant_area_manager'],
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/composables/usePermission.ts
git commit -m "feat(permissions): add Tele-specific permissions"
```

---

## Phase 5: Frontend Calls Store

### Task 17: Create Calls Store

**Files:**
- Create: `imu-web-vue/src/stores/calls.ts`

- [ ] **Step 1: Write calls store**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api-client'
import type { Touchpoint, Client } from '@/lib/types'

export interface CallQueueItem {
  id: string
  clientId: string
  clientName: string
  touchpointNumber: number
  type: 'Call'
  status: 'pending' | 'completed'
  municipality?: string
  priority: 'high' | 'normal' | 'low'
}

export interface CallFormData {
  clientId: string
  touchpointNumber: number
  date: string
  time?: string
  reason: string
  notes?: string
  outcome: 'Interested' | 'Undecided' | 'Not Interested'
  remarks?: string
}

export const useCallsStore = defineStore('calls', () => {
  // State
  const callsQueue = ref<CallQueueItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Auto-advance preference (persisted in localStorage)
  const storedAutoAdvance = localStorage.getItem('tele-auto-advance') === 'true'
  const autoAdvance = ref(storedAutoAdvance)

  // Computed
  const assignedAreasCount = computed(() =>
    callsQueue.value.filter(c => c.municipality).length
  )

  const unassignedCount = computed(() =>
    callsQueue.value.filter(c => !c.municipality).length
  )

  // Actions
  async function fetchAssignedAreaCalls(userId: string) {
    loading.value = true
    error.value = null

    try {
      const response = await api.get(`/touchpoints?tab=assigned&userId=${userId}`)
      callsQueue.value = response.data.map((tp: any) => ({
        id: tp.id,
        clientId: tp.client_id,
        clientName: tp.expand?.client_id?.first_name + ' ' + tp.expand?.client_id?.last_name || 'Unknown',
        touchpointNumber: tp.touchpoint_number,
        type: 'Call' as const,
        status: 'pending',
        municipality: tp.expand?.client_id?.addresses?.[0]?.municipality,
        priority: 'normal',
      }))
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch calls'
      console.error('Error fetching assigned area calls:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchUnassignedClientCalls() {
    loading.value = true
    error.value = null

    try {
      const response = await api.get('/touchpoints?tab=unassigned')
      callsQueue.value = response.data.map((tp: any) => ({
        id: tp.id,
        clientId: tp.client_id,
        clientName: tp.expand?.client_id?.first_name + ' ' + tp.expand?.client_id?.last_name || 'Unknown',
        touchpointNumber: tp.touchpoint_number,
        type: 'Call' as const,
        status: 'pending',
        municipality: undefined,
        priority: 'normal',
      }))
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch unassigned calls'
      console.error('Error fetching unassigned calls:', err)
    } finally {
      loading.value = false
    }
  }

  async function createCallTouchpoint(data: CallFormData, userId: string) {
    loading.value = true
    error.value = null

    try {
      const response = await api.post('/touchpoints', {
        client_id: data.clientId,
        user_id: userId,
        touchpoint_number: data.touchpointNumber,
        type: 'Call',
        date: data.date,
        time: data.time,
        reason: data.reason,
        status: data.outcome,
        notes: data.notes,
      })

      // Remove from queue if auto-advance is on
      if (autoAdvance.value) {
        const index = callsQueue.value.findIndex(c => c.clientId === data.clientId)
        if (index > -1) {
          callsQueue.value.splice(index, 1)
        }
      }

      return response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to create call'
      console.error('Error creating call:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  function toggleAutoAdvance() {
    autoAdvance.value = !autoAdvance.value
    localStorage.setItem('tele-auto-advance', String(autoAdvance.value))
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    callsQueue,
    loading,
    error,
    autoAdvance,

    // Computed
    assignedAreasCount,
    unassignedCount,

    // Actions
    fetchAssignedAreaCalls,
    fetchUnassignedClientCalls,
    createCallTouchpoint,
    toggleAutoAdvance,
    clearError,
  }
})
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd imu-web-vue && npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/calls.ts
git commit -m "feat(store): add calls store with queue management"
```

---

## Phase 6: Frontend Tele Pages

### Task 18: Create Tele Clients View

**Files:**
- Create: `imu-web-vue/src/views/tele/ClientsView.vue`

- [ ] **Step 1: Write Tele Clients View component**

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useClientsStore } from '@/stores/clients'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import DataTable from '@/components/ui/DataTable.vue'
import Button from '@/components/ui/Button.vue'
import SearchInput from '@/components/shared/SearchInput.vue'

const router = useRouter()
const clientsStore = useClientsStore()
const authStore = useAuthStore()
const { can } = usePermission()
const toast = useToast()

// State
const search = ref('')
const loading = ref(false)

// Computed
const filteredClients = computed(() => {
  if (!search.value) return clientsStore.clients
  const query = search.value.toLowerCase()
  return clientsStore.clients.filter(c =>
    c.first_name?.toLowerCase().includes(query) ||
    c.last_name?.toLowerCase().includes(query) ||
    c.email?.toLowerCase().includes(query)
  )
})

// Actions
onMounted(() => {
  fetchClients()
})

async function fetchClients() {
  loading.value = true
  try {
    await clientsStore.fetchClients()
  } catch (err: any) {
    toast.error(err.message || 'Failed to fetch clients')
  } finally {
    loading.value = false
  }
}

function handleAddClient() {
  router.push('/clients/new')
}

function handleEditClient(clientId: string) {
  router.push(`/clients/${clientId}/edit`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900">Clients</h1>
        <p class="text-sm text-neutral-600 mt-1">Manage client information (requires approval)</p>
      </div>
      <Button
        v-if="can('edit_clients')"
        variant="primary"
        @click="handleAddClient"
      >
        Add Client
      </Button>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-4">
      <SearchInput
        v-model="search"
        placeholder="Search by name or email..."
        class="w-64"
      />
    </div>

    <!-- Clients Table -->
    <DataTable
      :data="filteredClients"
      :loading="loading || clientsStore.loading"
      :columns="[
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
        { key: 'client_type', header: 'Type' },
        { key: 'actions', header: 'Actions' }
      ]"
      :empty-message="'No clients found'"
    >
      <template #actions="{ item }">
        <Button
          variant="ghost"
          size="sm"
          @click="handleEditClient(item.id)"
        >
          Edit
        </Button>
      </template>
    </DataTable>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/tele/ClientsView.vue
git commit -m "feat(view): add Tele Clients view"
```

---

### Task 19: Create Tele Calls View

**Files:**
- Create: `imu-web-vue/src/views/tele/CallsView.vue`

- [ ] **Step 1: Write Tele Calls View component**

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useCallsStore } from '@/stores/calls'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import DataTable from '@/components/ui/DataTable.vue'
import Button from '@/components/ui/Button.vue'
import CallFormModal from '@/views/tele/components/CallFormModal.vue'

const callsStore = useCallsStore()
const authStore = useAuthStore()
const toast = useToast()
const { can } = usePermission()

// State
const activeTab = ref<'assigned' | 'unassigned'>('assigned')
const showCallForm = ref(false)
const selectedClient = ref<any>(null)
const selectedTouchpointNumber = ref(2)

// Computed
const currentQueue = computed(() => {
  return activeTab.value === 'assigned'
    ? callsStore.callsQueue.filter(c => c.municipality)
    : callsStore.callsQueue.filter(c => !c.municipality)
})

// Actions
onMounted(() => {
  fetchCalls()
})

async function fetchCalls() {
  if (activeTab.value === 'assigned') {
    await callsStore.fetchAssignedAreaCalls(authStore.user.id)
  } else {
    await callsStore.fetchUnassignedClientCalls()
  }
}

function switchTab(tab: 'assigned' | 'unassigned') {
  activeTab.value = tab
  fetchCalls()
}

function handleCall(clientId: string, touchpointNumber: number, clientName: string) {
  selectedClient.value = { id: clientId, name: clientName }
  selectedTouchpointNumber.value = touchpointNumber
  showCallForm.value = true
}

async function handleCallSubmit(data: any) {
  try {
    await callsStore.createCallTouchpoint(data, authStore.user.id)
    toast.success('Call touchpoint created successfully')
    showCallForm.value = false

    if (callsStore.autoAdvance) {
      // Auto-advance to next call
      if (currentQueue.value.length > 0) {
        const nextCall = currentQueue.value[0]
        handleCall(nextCall.clientId, nextCall.touchpointNumber, nextCall.clientName)
      }
    }
  } catch (err: any) {
    toast.error(err.message || 'Failed to create call')
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900">Calls</h1>
        <p class="text-sm text-neutral-600 mt-1">Manage call touchpoints for your assigned areas</p>
      </div>

      <!-- Auto-advance toggle -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-neutral-600">Auto-advance</span>
        <button
          @click="callsStore.toggleAutoAdvance()"
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            callsStore.autoAdvance ? 'bg-primary-600' : 'bg-neutral-300'
          ]"
        >
          <span
            :class="[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              callsStore.autoAdvance ? 'translate-x-6' : 'translate-x-1'
            ]"
          />
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-2 bg-neutral-100 p-1 rounded-lg">
      <button
        @click="switchTab('assigned')"
        :class="[
          'px-4 py-2 text-sm font-medium rounded-md transition-colors',
          activeTab === 'assigned'
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-600 hover:text-neutral-900'
        ]"
      >
        My Assigned Areas ({{ callsStore.assignedAreasCount }})
      </button>
      <button
        @click="switchTab('unassigned')"
        :class="[
          'px-4 py-2 text-sm font-medium rounded-md transition-colors',
          activeTab === 'unassigned'
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-600 hover:text-neutral-900'
        ]"
      >
        Unassigned Clients ({{ callsStore.unassignedCount }})
      </button>
    </div>

    <!-- Call Queue Table -->
    <DataTable
      :data="currentQueue"
      :loading="callsStore.loading"
      :columns="[
        { key: 'actions', header: 'Actions' },
        { key: 'clientName', header: 'Client Name' },
        { key: 'touchpointNumber', header: 'Touchpoint' },
        { key: 'municipality', header: 'Municipality' },
        { key: 'priority', header: 'Priority' }
      ]"
      :empty-message="activeTab === 'assigned' ? 'No calls in your assigned areas' : 'No unassigned clients'"
    >
      <template #actions="{ item }">
        <Button
          variant="primary"
          size="sm"
          @click="handleCall(item.clientId, item.touchpointNumber, item.clientName)"
        >
          Call
        </Button>
      </template>

      <template #touchpointNumber="{ item }">
        <span class="text-sm">
          {{ item.touchpointNumber }}<sup>{{ ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][item.touchpointNumber - 1] }}</sup> Touchpoint
        </span>
      </template>

      <template #municipality="{ item }">
        <span class="text-sm text-neutral-600">
          {{ item.municipality || 'Unassigned' }}
        </span>
      </template>
    </DataTable>

    <!-- Call Form Modal -->
    <CallFormModal
      v-if="showCallForm"
      :client="selectedClient"
      :touchpoint-number="selectedTouchpointNumber"
      @close="showCallForm = false"
      @submit="handleCallSubmit"
    />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/tele/CallsView.vue
git commit -m "feat(view): add Tele Calls view with queue management"
```

---

### Task 20: Create Call Form Modal Component

**Files:**
- Create: `imu-web-vue/src/views/tele/components/CallFormModal.vue`

- [ ] **Step 1: Write Call Form Modal component**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  client: { id: string; name: string } | null
  touchpointNumber: number
}>()

const emit = defineEmits<{
  close: []
  submit: [data: any]
}>()

const toast = useToast()

// Form state
const formData = ref({
  date: new Date().toISOString().split('T')[0],
  time: '',
  reason: '',
  notes: '',
  outcome: 'Interested' as 'Interested' | 'Undecided' | 'Not Interested',
  remarks: '',
})

const loading = ref(false)

// Touchpoint reasons (25+ options)
const touchpointReasons = [
  'Initial Introduction',
  'Product Information',
  'Benefits Discussion',
  'Pension Comparison',
  'Application Assistance',
  'Document Requirements',
  'Follow-up Call',
  'Appointment Reminder',
  'Clarification Inquiry',
  'Concerns Resolution',
  'Feedback Collection',
  'Referral Request',
  'Testimonial Sharing',
  'Promotional Offer',
  'Policy Renewal',
  'Account Update',
  'Payment Inquiry',
  'Complaint Handling',
  'Service Upgrade',
  'Cross-selling Opportunity',
  'Customer Satisfaction',
  'Market Research',
  'Event Invitation',
  'Holiday Greeting',
  'General Update',
]

// Computed
const touchpointLabel = computed(() => {
  const suffix = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][props.touchpointNumber - 1]
  return `${props.touchpointNumber}${suffix} Touchpoint`
})

// Actions
function handleSubmit() {
  if (!formData.value.reason) {
    toast.error('Please select a reason for the call')
    return
  }

  loading.value = true

  emit('submit', {
    clientId: props.client?.id,
    touchpointNumber: props.touchpointNumber,
    date: formData.value.date,
    time: formData.value.time,
    reason: formData.value.reason,
    notes: formData.value.notes,
    outcome: formData.value.outcome,
    remarks: formData.value.remarks,
  })

  loading.value = false
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-neutral-200">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-neutral-900">New Call Touchpoint</h2>
            <p class="text-sm text-neutral-600 mt-1">
              {{ client?.name }} - {{ touchpointLabel }}
            </p>
          </div>
          <button
            @click="handleClose"
            class="text-neutral-400 hover:text-neutral-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Form -->
      <div class="px-6 py-4 space-y-4">
        <!-- Date -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Date <span class="text-red-500">*</span>
          </label>
          <input
            v-model="formData.date"
            type="date"
            class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          />
        </div>

        <!-- Time -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Time
          </label>
          <input
            v-model="formData.time"
            type="time"
            class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <!-- Reason -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Reason <span class="text-red-500">*</span>
          </label>
          <select
            v-model="formData.reason"
            class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          >
            <option value="">Select a reason...</option>
            <option v-for="reason in touchpointReasons" :key="reason" :value="reason">
              {{ reason }}
            </option>
          </select>
        </div>

        <!-- Call Outcome -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Call Outcome <span class="text-red-500">*</span>
          </label>
          <div class="flex items-center gap-4">
            <label class="flex items-center">
              <input
                v-model="formData.outcome"
                type="radio"
                value="Interested"
                class="mr-2"
              />
              <span class="text-sm">Interested</span>
            </label>
            <label class="flex items-center">
              <input
                v-model="formData.outcome"
                type="radio"
                value="Undecided"
                class="mr-2"
              />
              <span class="text-sm">Undecided</span>
            </label>
            <label class="flex items-center">
              <input
                v-model="formData.outcome"
                type="radio"
                value="Not Interested"
                class="mr-2"
              />
              <span class="text-sm">Not Interested</span>
            </label>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Notes
          </label>
          <textarea
            v-model="formData.notes"
            rows="3"
            class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Enter call notes..."
          />
        </div>

        <!-- Remarks -->
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">
            Remarks
          </label>
          <textarea
            v-model="formData.remarks"
            rows="2"
            class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Additional remarks..."
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          @click="handleClose"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          @click="handleSubmit"
          :disabled="loading"
        >
          {{ loading ? 'Saving...' : 'Save Call' }}
        </Button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/tele/components/CallFormModal.vue
git commit -m "feat(component): add Call Form modal for Tele users"
```

---

### Task 21: Create Client Detail Modal Component

**Files:**
- Create: `imu-web-vue/src/views/tele/components/ClientDetailModal.vue`

- [ ] **Step 1: Write Client Detail Modal component**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api-client'
import type { Client, Touchpoint } from '@/lib/types'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  clientId: string
}>()

const emit = defineEmits<{
  close: []
}>()

// State
const loading = ref(false)
const client = ref<Client | null>(null)
const touchpoints = ref<Touchpoint[]>([])

// Computed
const touchpointSummary = computed(() => {
  const summary = {
    total: 0,
    completed: 0,
    visits: 0,
    calls: 0,
  }

  touchpoints.value.forEach(tp => {
    summary.total++
    if (tp.status === 'Completed') summary.completed++
    if (tp.type === 'Visit') summary.visits++
    if (tp.type === 'Call') summary.calls++
  })

  return summary
})

// Actions
onMounted(() => {
  fetchClientDetails()
})

async function fetchClientDetails() {
  loading.value = true
  try {
    const [clientRes, touchpointsRes] = await Promise.all([
      api.get(`/clients/${props.clientId}`),
      api.get(`/touchpoints?client_id=${props.clientId}`),
    ])
    client.value = clientRes.data
    touchpoints.value = touchpointsRes.data
  } catch (err) {
    console.error('Error fetching client details:', err)
  } finally {
    loading.value = false
  }
}

function getTouchpointLabel(num: number): string {
  const suffix = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][num - 1]
  return `${num}${suffix}`
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 my-8">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-neutral-200 sticky top-0 bg-white rounded-t-xl">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-neutral-900">Client Details</h2>
          <button
            @click="handleClose"
            class="text-neutral-400 hover:text-neutral-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="px-6 py-4 space-y-6">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="text-sm text-neutral-600 mt-2">Loading client details...</p>
        </div>

        <!-- Client Info -->
        <div v-if="client">
          <h3 class="text-sm font-medium text-neutral-700 mb-3">Basic Information</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-neutral-600">Name:</span>
              <span class="ml-2 font-medium">{{ client.first_name }} {{ client.middle_name }} {{ client.last_name }}</span>
            </div>
            <div>
              <span class="text-neutral-600">Email:</span>
              <span class="ml-2">{{ client.email || '-' }}</span>
            </div>
            <div>
              <span class="text-neutral-600">Client Type:</span>
              <span class="ml-2">{{ client.client_type }}</span>
            </div>
            <div>
              <span class="text-neutral-600">Product Type:</span>
              <span class="ml-2">{{ client.product_type || '-' }}</span>
            </div>
          </div>
        </div>

        <!-- Touchpoint Summary -->
        <div v-if="touchpoints.length > 0">
          <h3 class="text-sm font-medium text-neutral-700 mb-3">Touchpoint Progress</h3>
          <div class="grid grid-cols-4 gap-4">
            <div class="bg-neutral-50 rounded-lg p-3 text-center">
              <div class="text-2xl font-semibold text-primary-600">{{ touchpointSummary.total }}</div>
              <div class="text-xs text-neutral-600">Total</div>
            </div>
            <div class="bg-neutral-50 rounded-lg p-3 text-center">
              <div class="text-2xl font-semibold text-green-600">{{ touchpointSummary.completed }}</div>
              <div class="text-xs text-neutral-600">Completed</div>
            </div>
            <div class="bg-neutral-50 rounded-lg p-3 text-center">
              <div class="text-2xl font-semibold text-blue-600">{{ touchpointSummary.visits }}</div>
              <div class="text-xs text-neutral-600">Visits</div>
            </div>
            <div class="bg-neutral-50 rounded-lg p-3 text-center">
              <div class="text-2xl font-semibold text-purple-600">{{ touchpointSummary.calls }}</div>
              <div class="text-xs text-neutral-600">Calls</div>
            </div>
          </div>
        </div>

        <!-- Touchpoint History -->
        <div v-if="touchpoints.length > 0">
          <h3 class="text-sm font-medium text-neutral-700 mb-3">Touchpoint History</h3>
          <div class="space-y-2">
            <div
              v-for="touchpoint in touchpoints.sort((a, b) => a.touchpoint_number - b.touchpoint_number)"
              :key="touchpoint.id"
              class="flex items-center justify-between p-3 bg-neutral-50 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <div
                  :class="[
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                    touchpoint.type === 'Visit' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  ]"
                >
                  {{ getTouchpointLabel(touchpoint.touchpoint_number) }}
                </div>
                <div>
                  <div class="text-sm font-medium">{{ touchpoint.type }}</div>
                  <div class="text-xs text-neutral-600">{{ touchpoint.date }}</div>
                </div>
              </div>
              <div class="text-right">
                <div
                  :class="[
                    'text-xs font-medium px-2 py-1 rounded',
                    touchpoint.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  ]"
                >
                  {{ touchpoint.status }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="!loading && touchpoints.length === 0" class="text-center py-8">
          <p class="text-sm text-neutral-600">No touchpoints recorded yet</p>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/tele/components/ClientDetailModal.vue
git commit -m "feat(component): add Client Detail modal for Tele users"
```

---

### Task 22: Update Router with Tele Routes

**Files:**
- Modify: `imu-web-vue/src/router/index.ts`

- [ ] **Step 1: Read current router**

Open: `imu-web-vue/src/router/index.ts`
Find: Routes array definition

- [ ] **Step 2: Add Tele routes**

Add these routes to the routes array:

```typescript
{
  path: '/clients',
  name: 'tele-clients',
  component: () => import('@/views/tele/ClientsView.vue'),
  meta: {
    permissions: ['edit_clients'],
    title: 'Clients'
  }
},
{
  path: '/calls',
  name: 'tele-calls',
  component: () => import('@/views/tele/CallsView.vue'),
  meta: {
    permissions: ['view_calls_page'],
    title: 'Calls'
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/router/index.ts
git commit -m "feat(router): add Tele routes for Clients and Calls pages"
```

---

### Task 23: Update Sidebar for Tele Menu Items

**Files:**
- Modify: `imu-web-vue/src/components/shared/Sidebar.vue`

- [ ] **Step 1: Read current Sidebar**

Open: `imu-web-vue/src/components/shared/Sidebar.vue`
Find: Menu items array definition

- [ ] **Step 2: Add Tele menu items**

Add Tele menu items conditionally based on user role:

```typescript
// In the menu items computation, add:
const teleMenuItems = [
  {
    name: 'Clients',
    path: '/clients',
    icon: 'users',
    permission: 'edit_clients',
  },
  {
    name: 'Calls',
    path: '/calls',
    icon: 'phone',
    permission: 'view_calls_page',
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: 'cog',
    permission: 'view_settings',
  },
]

// Update menu items computation to filter by role
const menuItems = computed(() => {
  if (authStore.user?.role === 'tele') {
    return teleMenuItems.filter(item => can(item.permission))
  }
  // ... existing menu items for other roles
})
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/components/shared/Sidebar.vue
git commit -m "feat(ui): add Tele menu items to Sidebar"
```

---

## Phase 7: Mobile App Changes

### Task 24: Update Mobile Touchpoint Model

**Files:**
- Modify: `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart:400-420`

- [ ] **Step 1: Find Touchpoint class**

Open: `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`
Find: Lines 400-420 (Touchpoint class definition)

- [ ] **Step 2: Add display fields**

After the existing fields, add:

```dart
  /// Display name of the user who created this touchpoint
  final String? userName;

  /// Role of the user who created this touchpoint ('Caravan' or 'Tele')
  final String? userRole;
```

- [ ] **Step 3: Update fromJson factory**

Add the new fields to the fromJson map:

```dart
      userName: json['user_name'] as String?,
      userRole: json['user_role'] as String?,
```

- [ ] **Step 4: Update toJson method**

Add the new fields to the toJson map:

```dart
      if (userName != null) 'user_name': userName!,
      if (userRole != null) 'user_role': userRole!,
```

- [ ] **Step 5: Commit**

```bash
git add mobile/imu_flutter/lib/features/clients/data/models/client_model.dart
git commit -m "feat(model): add userName and userRole to Touchpoint model"
```

---

### Task 25: Update Mobile Touchpoint Validation Service

**Files:**
- Modify: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart`

- [ ] **Step 1: Read current service**

Open: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart`
Find: Existing validation functions

- [ ] **Step 2: Add role-based validation**

Add the canCreateTouchpoint function:

```dart
  /// Validates if a user can create a specific touchpoint type based on their role
  static TouchpointCanCreateResult canCreateTouchpoint({
    required String userRole,
    required int touchpointNumber,
    required TouchpointType touchpointType,
  }) {
    final expectedType = getExpectedTouchpointType(touchpointNumber);

    if (userRole == 'caravan') {
      // Caravan: Can ONLY create Visit types (1, 4, 7)
      if (touchpointType != TouchpointType.visit) {
        return TouchpointCanCreateResult(
          canCreate: false,
          reason: 'Caravan users can only create Visit touchpoints (1, 4, 7)',
        );
      }

      // Also check if the expected type matches
      if (expectedType != TouchpointType.visit) {
        return TouchpointCanCreateResult(
          canCreate: false,
          reason: 'Touchpoint #$touchpointNumber must be a Visit',
        );
      }

      return TouchpointCanCreateResult(canCreate: true);
    }

    if (userRole == 'tele') {
      // Tele: Can ONLY create Call types (2, 3, 5, 6)
      // But Tele users don't use mobile app, so this shouldn't happen
      return TouchpointCanCreateResult(
        canCreate: false,
        reason: 'Tele users must use the web admin panel',
      );
    }

    // Admin/Manager: Any type allowed
    return TouchpointCanCreateResult(canCreate: true);
  }
```

- [ ] **Step 3: Add result class**

Add the TouchpointCanCreateResult class:

```dart
class TouchpointCanCreateResult {
  final bool canCreate;
  final String? reason;

  TouchpointCanCreateResult({
    required this.canCreate,
    this.reason,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart
git commit -m "feat(service): add role-based validation to touchpoint service"
```

---

### Task 26: Update Mobile Touchpoint Form UI

**Files:**
- Modify: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

- [ ] **Step 1: Find type selector**

Open: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`
Find: Type dropdown selector widget

- [ ] **Step 2: Add getAvailableTypes function**

Add this helper function:

```dart
  /// Get available touchpoint types based on user role and touchpoint number
  List<TouchpointType> getAvailableTypes(int touchpointNumber, String? userRole) {
    final expectedType = TouchpointValidationService.getExpectedTouchpointType(touchpointNumber);

    if (userRole == 'caravan') {
      // Caravan: Only show Visit option for valid touchpoints (1, 4, 7)
      if (expectedType == TouchpointType.visit) {
        return [TouchpointType.visit];
      }
      // Wrong type for caravan - return empty to hide form
      return [];
    }

    // Admin/Manager - show both options
    return TouchpointType.values;
  }
```

- [ ] **Step 3: Update type dropdown to use available types**

Replace the hardcoded types with the computed list:

```dart
// Get available types
final availableTypes = getAvailableTypes(
  widget.touchpointNumber,
  userRole,
);

// Show warning if no types available
if (availableTypes.isEmpty) {
  return Container(
    padding: EdgeInsets.all(16),
    child: Text(
      'Touchpoint #${widget.touchpointNumber} is not available for your role',
      style: theme.textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.error,
      ),
    ),
  );
}

// Build dropdown with available types
DropdownButtonFormField<TouchpointType>(
  // ... existing dropdown code
  items: availableTypes.map((type) {
    return DropdownMenuItem(
      value: type,
      child: Text(type.displayName),
    );
  }).toList(),
)
```

- [ ] **Step 4: Commit**

```bash
git add mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart
git commit -m "feat(widget): add role-based type filtering to touchpoint form"
```

---

### Task 28: Update Mobile API Service

**Files:**
- Modify: `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`

- [ ] **Step 1: Read current API service**

Open: `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`
Find: All API calls related to touchpoints

- [ ] **Step 2: Search for caravan_id references**

Search: `caravan_id` in the file

- [ ] **Step 3: Replace all caravan_id with user_id**

Update all request/response models:

```dart
// Before
class TouchpointRequest {
  final String clientId;
  final String? caravanId;
  // ...
}

// After
class TouchpointRequest {
  final String clientId;
  final String userId; // Changed from caravanId
  // ...
}

// Update toJson method
Map<String, dynamic> toJson() => {
  'client_id': clientId,
  'user_id': userId, // Changed from caravan_id
  // ...
};

// Update fromJson method
factory TouchpointRequest.fromJson(Map<String, dynamic> json) => TouchpointRequest(
  clientId: json['client_id'],
  userId: json['user_id'], // Changed from caravan_id
  // ...
);
```

- [ ] **Step 4: Verify no remaining caravan_id references**

Search again to ensure all references are updated

- [ ] **Step 5: Commit**

```bash
git add mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart
git commit -m "feat(api): update touchpoint API service to use user_id"
```

---

### Task 29: Update PowerSync Schema

**Files:**
- Modify: `mobile/imu_flutter/lib/services/sync/powersync_service.dart`

- [ ] **Step 1: Read current PowerSync schema**

Open: `mobile/imu_flutter/lib/services/sync/powersync_service.dart`
Find: Sync schema SQL definition (search for `touchpoints` table)

- [ ] **Step 2: Update touchpoints table schema**

Replace `caravan_id` with `user_id`:

```dart
// Before
static const String syncSchema = '''
  CREATE TABLE IF NOT EXISTS touchpoints (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    caravan_id TEXT,
    touchpoint_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    photo_url TEXT,
    audio_url TEXT,
    latitude REAL,
    longitude REAL,
    time_in TEXT,
    time_out TEXT,
    next_visit_date TEXT,
    created TEXT,
    updated TEXT
  );
''';

// After
static const String syncSchema = '''
  CREATE TABLE IF NOT EXISTS touchpoints (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT,
    touchpoint_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    photo_url TEXT,
    audio_url TEXT,
    latitude REAL,
    longitude REAL,
    time_in TEXT,
    time_out TEXT,
    next_visit_date TEXT,
    created TEXT,
    updated TEXT
  );
''';
```

- [ ] **Step 3: Update sync query to use user_id**

Find the sync query that filters touchpoints:

```dart
// Before
final syncQuery = '''
  SELECT * FROM touchpoints
  WHERE caravan_id = ?
''';

// After
final syncQuery = '''
  SELECT * FROM touchpoints
  WHERE user_id = ?
''';
```

- [ ] **Step 4: Update sync rules**

Find sync rules configuration and update:

```dart
// Update sync rules
final syncRules = [
  SyncRule(
    table: 'touchpoints',
    bucket: 'touchpoints',
    where: "user_id = ?",  // Changed from caravan_id
  ),
  // ... other rules
];
```

- [ ] **Step 5: Update insert/update operations**

Find any INSERT or UPDATE statements and update column names:

```dart
// Before
await db.execute(
  'INSERT INTO touchpoints (id, client_id, caravan_id, ...) VALUES (?, ?, ?, ...)',
  [touchpoint.id, touchpoint.clientId, touchpoint.caravanId, ...]
);

// After
await db.execute(
  'INSERT INTO touchpoints (id, client_id, user_id, ...) VALUES (?, ?, ?, ...)',
  [touchpoint.id, touchpoint.clientId, touchpoint.userId, ...]
);
```

- [ ] **Step 6: Verify PowerSync configuration**

Ensure the PowerSync dashboard configuration also uses `user_id` instead of `caravan_id`

- [ ] **Step 7: Commit**

```bash
git add mobile/imu_flutter/lib/services/sync/powersync_service.dart
git commit -m "feat(powersync): update schema to use user_id instead of caravan_id"
```

---

### Task 30: Write Backend Validation Tests

**Files:**
- Modify: `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart`

- [ ] **Step 1: Find INSERT statement**

Open: `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart`
Find: Line ~98 (INSERT statement)

- [ ] **Step 2: Replace caravan_id with user_id**

In the INSERT statement, replace `caravan_id` with `user_id`:

```dart
    final result = await db.execute(
      '''INSERT INTO touchpoints (
        id, client_id, user_id, touchpoint_number, type, date,
        reason, status, notes, photo_url, audio_url, latitude, longitude,
        time_in, time_out, created, updated
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )''',
      [
        touchpoint.id,
        touchpoint.clientId,
        touchpoint.agentId, // This maps to user_id
        touchpoint.touchpointNumber,
        touchpoint.type.name,
        touchpoint.date.toIso8601String(),
        // ... rest of fields
      ],
    );
```

- [ ] **Step 3: Find UPDATE statement**

Find: Line ~164 (UPDATE statement)
Replace `caravan_id` with `user_id`

- [ ] **Step 4: Find map function**

Find: Line ~248 (map function for query results)
Update the mapping:

```dart
      agentId: row['user_id'], // was caravan_id
```

- [ ] **Step 5: Commit**

```bash
git add mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart
git commit -m "feat(repo): update touchpoint repository to use user_id"
```

---

## Phase 8: Testing

### Task 28: Write Backend Validation Tests

**Files:**
- Create: `backend/src/routes/__tests__/touchpoints.validation.test.ts`

- [ ] **Step 1: Write validation tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import request from 'supertest'
import { app } from '../index'
import { pool } from '../../db'

describe('Touchpoint Role Validation', () => {
  let caravanToken: string
  let teleToken: string
  let adminToken: string
  let testClientId: string

  beforeAll(async () => {
    // Create test users
    const caravanUser = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      ['caravan-test@example.com', 'Test Caravan', 'caravan']
    )

    const teleUser = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      ['tele-test@example.com', 'Test Tele', 'tele']
    )

    const adminUser = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      ['admin-test@example.com', 'Test Admin', 'admin']
    )

    // Create test client
    const client = await pool.query(
      `INSERT INTO clients (first_name, last_name, client_type) VALUES ($1, $2, $3) RETURNING id`,
      ['Test', 'Client', 'POTENTIAL']
    )
    testClientId = client.rows[0].id

    // Get tokens (simplified - in real test, use auth endpoint)
    caravanToken = 'mock-caravan-token'
    teleToken = 'mock-tele-token'
    adminToken = 'mock-admin-token'
  })

  afterAll(async () => {
    await pool.query('DELETE FROM touchpoints WHERE client_id = $1', [testClientId])
    await pool.query("DELETE FROM users WHERE email LIKE '%-test@example.com'")
    await pool.query("DELETE FROM clients WHERE first_name = 'Test'")
  })

  it('should allow Caravan to create Visit touchpoint #1', async () => {
    const response = await request(app)
      .post('/api/touchpoints')
      .set('Authorization', `Bearer ${caravanToken}`)
      .send({
        client_id: testClientId,
        user_id: caravanToken, // Simplified
        touchpoint_number: 1,
        type: 'Visit',
        date: '2026-03-26',
        reason: 'Test',
        status: 'Interested',
      })

    expect(response.status).toBe(201)
    expect(response.body.type).toBe('Visit')
  })

  it('should reject Caravan creating Call touchpoint #2', async () => {
    const response = await request(app)
      .post('/api/touchpoints')
      .set('Authorization', `Bearer ${caravanToken}`)
      .send({
        client_id: testClientId,
        user_id: caravanToken,
        touchpoint_number: 2,
        type: 'Call',
        date: '2026-03-26',
        reason: 'Test',
        status: 'Interested',
      })

    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('INVALID_TOUCHPOINT_TYPE_FOR_ROLE')
    expect(response.body.message).toContain('Caravan users can only create Visit touchpoints')
  })

  it('should reject Caravan creating Visit touchpoint #2 (wrong sequence)', async () => {
    const response = await request(app)
      .post('/api/touchpoints')
      .set('Authorization', `Bearer ${caravanToken}`)
      .send({
        client_id: testClientId,
        user_id: caravanToken,
        touchpoint_number: 2,
        type: 'Visit',
        date: '2026-03-26',
        reason: 'Test',
        status: 'Interested',
      })

    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('INVALID_TOUCHPOINT_TYPE_FOR_ROLE')
  })

  it('should allow Admin to create any touchpoint type', async () => {
    const response = await request(app)
      .post('/api/touchpoints')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        client_id: testClientId,
        user_id: adminToken,
        touchpoint_number: 2,
        type: 'Call',
        date: '2026-03-26',
        reason: 'Test',
        status: 'Interested',
      })

    expect(response.status).toBe(201)
    expect(response.body.type).toBe('Call')
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/__tests__/touchpoints.validation.test.ts
git commit -m "test(api): add touchpoint role validation tests"
```

---

### Task 31: Write Mobile Validation Tests

**Files:**
- Create: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service_test.dart`

- [ ] **Step 1: Write validation tests**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/services/touchpoint/touchpoint_validation_service.dart';
import 'package:imu_flutter/features/clients/data/models/client_model.dart';

void main() {
  group('TouchpointValidationService.canCreateTouchpoint', () {
    test('Caravan can create Visit touchpoint #1', () {
      final result = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'caravan',
        touchpointNumber: 1,
        touchpointType: TouchpointType.visit,
      );

      expect(result.canCreate, true);
      expect(result.reason, null);
    });

    test('Caravan cannot create Call touchpoint #2', () {
      final result = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'caravan',
        touchpointNumber: 2,
        touchpointType: TouchpointType.call,
      );

      expect(result.canCreate, false);
      expect(result.reason, contains('Caravan users can only create Visit touchpoints'));
    });

    test('Caravan cannot create Visit touchpoint #2 (wrong sequence)', () {
      final result = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'caravan',
        touchpointNumber: 2,
        touchpointType: TouchpointType.visit,
      );

      expect(result.canCreate, false);
      expect(result.reason, contains('must be a Visit'));
    });

    test('Tele users are rejected (mobile app)', () {
      final result = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'tele',
        touchpointNumber: 2,
        touchpointType: TouchpointType.call,
      );

      expect(result.canCreate, false);
      expect(result.reason, contains('web admin panel'));
    });

    test('Admin can create any touchpoint type', () {
      final visitResult = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'admin',
        touchpointNumber: 1,
        touchpointType: TouchpointType.visit,
      );

      final callResult = TouchpointValidationService.canCreateTouchpoint(
        userRole: 'admin',
        touchpointNumber: 2,
        touchpointType: TouchpointType.call,
      );

      expect(visitResult.canCreate, true);
      expect(callResult.canCreate, true);
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service_test.dart
git commit -m "test(mobile): add touchpoint validation service tests"
```

---

### Task 32: Create E2E Testing Checklist

**Files:**
- Create: `tests/e2e/tele-role-touchpoints.e2e.test.md`

- [ ] **Step 1: Write E2E test scenarios**

```markdown
# Tele Role and Call-Only Touchpoint Access - E2E Test Checklist

## Prerequisites
- Tele user account created and assigned municipalities
- Test client with existing touchpoints
- Caravan user account for comparison

## Test Scenarios

### E2E-1: Caravan Visit Flow (Mobile App)
**Steps:**
1. Log in as Caravan user via mobile app
2. Navigate to client with touchpoint #1 (expected: Visit)
3. Verify touchpoint form shows only "Visit" option
4. Fill form and submit
5. Verify touchpoint created with user_id
6. Verify touchpoint #2 now shows as "Call" type expected

**Expected Results:**
- Caravan can create Visit touchpoints (1, 4, 7)
- Caravan cannot create Call touchpoints
- Touchpoint #2 is marked as "Call" type for Tele

### E2E-2: Tele Call Flow (Web Admin)
**Steps:**
1. Log in as Tele user via web admin
2. Navigate to Calls → "My Assigned Areas" tab
3. Verify only clients in assigned municipalities appear
4. Select client with touchpoint #2 (expected: Call)
5. Click "Call" button to open Call form
6. Fill form with date, reason, notes, outcome
7. Submit form
8. Verify call created and queue auto-advances (if enabled)

**Expected Results:**
- Tele can create Call touchpoints (2, 3, 5, 6)
- Tele cannot create Visit touchpoints
- Call queue sorted by touchpoint number
- Auto-advance toggles to next call

### E2E-3: Sequence Enforcement (API Level)
**Steps:**
1. As Caravan user, attempt to create touchpoint #2 as Call
   - Request: POST /api/touchpoints with type='Call', touchpoint_number=2
   - Expected: 403 Forbidden with error message
2. As Caravan user, attempt to create touchpoint #1 as Call
   - Request: POST /api/touchpoints with type='Call', touchpoint_number=1
   - Expected: 403 Forbidden with error message
3. As Tele user, attempt to create touchpoint #1 as Visit
   - Request: POST /api/touchpoints with type='Visit', touchpoint_number=1
   - Expected: 403 Forbidden with error message

**Expected Results:**
- All invalid role/sequence combinations rejected
- Clear error messages indicate expected types

### E2E-4: Client Approval Workflow
**Steps:**
1. As Tele user, navigate to Clients page
2. Click "Add Client" button
3. Fill client form and submit
4. Verify client goes to Approvals page (status: pending)
5. As Admin, navigate to Approvals → Client tab
6. Approve the pending client
7. Verify client created in clients table

**Expected Results:**
- Tele users can add clients (via approval)
- Tele users cannot assign caravans
- Admin approval creates client

### E2E-5: Location Assignment Filtering
**Steps:**
1. Assign municipality "Makati" to Tele user
2. Create 2 clients: one in Makati, one in Quezon City
3. As Tele user, navigate to Calls → "My Assigned Areas"
4. Verify only Makati client appears
5. Switch to "Unassigned Clients" tab
6. Verify Quezon City client appears

**Expected Results:**
- Assigned Areas tab filters by municipality
- Unassigned Clients tab shows clients without municipality
- Tele users can call both assigned and unassigned clients

### E2E-6: Simultaneous Touchpoint Creation Prevention
**Steps:**
1. Prepare client with touchpoint #2 pending
2. As Tele user A, start creating touchpoint #2
3. As Tele user B (or same user in different tab), attempt to create same touchpoint
4. Submit both requests

**Expected Results:**
- First request succeeds
- Second request gets 409 Conflict error
- Clear error message about duplicate touchpoint

### E2E-7: Touchpoint Sequence Progression
**Steps:**
1. Start with client at touchpoint #1
2. As Caravan, create touchpoint #1 (Visit)
3. Verify next expected is #2 (Call)
4. As Tele, create touchpoint #2 (Call)
5. Verify next expected is #3 (Call)
6. As Tele, create touchpoint #3 (Call)
7. Verify next expected is #4 (Visit)
8. Continue through all 7 touchpoints

**Expected Results:**
- Sequence enforced correctly
- Roles match expected types
- After #7, no more touchpoints allowed

### E2E-8: Admin Override (Any Type)
**Steps:**
1. As Admin user, create touchpoint #1 as Call (wrong type)
2. As Admin user, create touchpoint #2 as Visit (wrong type)
3. Verify both succeed

**Expected Results:**
- Admin can create any touchpoint type regardless of sequence
- Useful for data correction scenarios

## Regression Tests

### R-1: Existing Caravan Users
- Verify existing Caravan users can still create Visit touchpoints
- Verify existing touchpoints accessible with user_id mapping

### R-2: Location Assignments
- Verify Caravan location assignments still work
- Verify Tele location assignments work identically

### R-3: Mobile App Auth
- Verify Tele users cannot log into mobile app
- Verify appropriate error message shown

### R-4: Reports and Analytics
- Verify Tele users cannot access Reports page
- Verify Tele users restricted to Clients/Calls pages

## Test Data Cleanup

After testing:
```sql
-- Delete test touchpoints
DELETE FROM touchpoints WHERE client_id IN (test_client_ids);

-- Delete test clients
DELETE FROM clients WHERE first_name = 'Test' AND last_name = 'Client';

-- Delete test users
DELETE FROM users WHERE email LIKE '%-test@example.com';
```
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/tele-role-touchpoints.e2e.test.md
git commit -m "test(e2e): add Tele role E2E test scenarios"
```

---

### Task 33: Run All Tests

**Files:**
- Test: All test files

- [ ] **Step 1: Run backend tests**

```bash
cd backend
npm test
```

Expected: All tests pass

- [ ] **Step 2: Run mobile tests**

```bash
cd mobile/imu_flutter
flutter test
```

Expected: All tests pass

- [ ] **Step 3: Run frontend tests (if exists)**

```bash
cd imu-web-vue
npm run test
```

Expected: All tests pass

- [ ] **Step 4: Commit test results**

```bash
git add .
git commit -m "test: all tests passing for Tele role implementation"
```

---

## Phase 9: Final Integration and Documentation

### Task 34: Update CLAUDE.md with Tele Role Information

**Files:**
- Modify: `C:\odvi-apps\IMU\CLAUDE.md`

- [ ] **Step 1: Find role definitions**

Open: `CLAUDE.md`
Find: Section describing user roles

- [ ] **Step 2: Add Tele role description**

Add to the roles section:

```markdown
### User Roles

- **admin** - Full system access, can manage all resources
- **area_manager** - Can manage assigned geographic areas and teams
- **assistant_area_manager** - Supports area managers with limited permissions
- **caravan** - Field agents who create Visit touchpoints (1, 4, 7) via mobile app
- **tele** - Telemarketers who create Call touchpoints (2, 3, 5, 6) via web admin
```

- [ ] **Step 3: Add touchpoint sequence documentation**

Add to the architecture section:

```markdown
### Touchpoint Sequence

Touchpoints follow a fixed 7-step pattern:
1. Visit (Caravan only)
2. Call (Tele only)
3. Call (Tele only)
4. Visit (Caravan only)
5. Call (Tele only)
6. Call (Tele only)
7. Visit (Caravan only)

Backend validation enforces that users can only create touchpoint types
matching their role and the expected sequence.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Tele role information"
```

---

### Task 35: Create Migration Rollback Script

**Files:**
- Create: `backend/src/migrations/rollback_026_028.sql`

- [ ] **Step 1: Write rollback script**

```sql
-- Rollback script for migrations 026, 027, 028
-- This restores the system to its previous state

BEGIN;

-- 1. Restore role constraints (remove tele)
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS role_check,
  ADD CONSTRAINT role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

-- 2. Restore caravan_id column
ALTER TABLE touchpoints
  DROP CONSTRAINT IF EXISTS touchpoints_user_id_fkey;

ALTER TABLE touchpoints RENAME COLUMN user_id TO caravan_id;

ALTER TABLE touchpoints
  ADD CONSTRAINT touchpoints_caravan_id_fkey
  FOREIGN KEY (caravan_id) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Restore indexes
DROP INDEX IF EXISTS idx_touchpoints_user_id;
CREATE INDEX idx_touchpoints_caravan_id ON touchpoints(caravan_id);

-- 4. Restore approval fields (this is a simplified rollback)
-- Note: In production, you would restore data from touchpoints_archived first
ALTER TABLE touchpoints
  ADD COLUMN IF NOT EXISTS edit_status TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID,
  ADD COLUMN IF NOT EXISTS proposed_changes JSONB,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

-- Set all existing touchpoints to approved
UPDATE touchpoints
SET edit_status = 'approved',
    is_synced = true,
    synced_at = NOW()
WHERE edit_status IS NULL;

COMMIT;

SELECT 'Rollback complete: System restored to pre-Tele state' as result;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/rollback_026_028.sql
git commit -m "feat(db): add rollback script for Tele migrations"
```

---

### Task 36: Verify Implementation Completeness

**Files:**
- Check: All modified files

- [ ] **Step 1: Run pre-migration validation**

Connect to database and run validation queries from design document section 5.3:

```bash
psql -U your_user -d your_database -f backend/src/migrations/pre_migration_validation.sql
```

Expected: No critical issues found

- [ ] **Step 2: Deploy migrations in order**

```bash
# Migration 026: Add Tele role
psql -U your_user -d your_database -f backend/src/migrations/026_add_tele_role.sql

# Migration 027: Rename caravan_id to user_id
psql -U your_user -d your_database -f backend/src/migrations/027_rename_caravan_id_to_user_id.sql

# Migration 028: Remove approval fields
psql -U your_user -d your_database -f backend/src/migrations/028_remove_touchpoint_approval.sql
```

Expected: All migrations complete successfully

- [ ] **Step 3: Verify post-migration state**

Run post-migration validation queries:

```bash
psql -U your_user -d your_database -c "SELECT COUNT(*) FROM users WHERE role = 'tele';"
psql -U your_user -d your_database -c "SELECT COUNT(*) FROM touchpoints WHERE user_id IS NOT NULL;"
```

Expected: Tele role exists, all touchpoints have user_id

- [ ] **Step 4: Deploy backend changes**

```bash
cd backend
npm run build
npm run start:prod
```

Expected: Backend starts without errors

- [ ] **Step 5: Deploy frontend changes**

```bash
cd imu-web-vue
npm run build
npm run preview
```

Expected: Frontend builds successfully

- [ ] **Step 6: Deploy mobile changes**

```bash
cd mobile/imu_flutter
flutter build apk --release
flutter build ios --release
```

Expected: Mobile apps build successfully

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: complete Tele role and Call-only touchpoint implementation"
```

---

## Summary

**Total Tasks:** 36
**Estimated Time:** 10-14 hours (depending on familiarity with codebase)

**Task Breakdown:**
- Phase 1: Database Migrations (4 tasks)
- Phase 2: Backend API Changes (8 tasks) - includes Tele assignment helpers
- Phase 3: Frontend Type Updates (4 tasks)
- Phase 4: Frontend Permissions (1 task)
- Phase 5: Frontend Calls Store (1 task)
- Phase 6: Frontend Tele Pages (6 tasks)
- Phase 7: Mobile App Changes (5 tasks) - includes PowerSync update
- Phase 8: Testing (4 tasks) - includes E2E checklist
- Phase 9: Integration and Documentation (3 tasks)

**Rollback Plan:** If issues arise, use `backend/src/migrations/rollback_026_028.sql` to revert database changes.

**Next Steps After Implementation:**
1. Create Tele user accounts via admin panel
2. Assign municipalities to Tele users
3. Train Tele users on the Calls page workflow
4. Monitor error logs for validation failures
5. Gather user feedback and iterate

---

**End of Implementation Plan**
