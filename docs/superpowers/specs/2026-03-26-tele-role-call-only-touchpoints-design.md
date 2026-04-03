# Tele Role and Call-Only Touchpoint Access - Design Document

**Date:** 2026-03-26
**Author:** Claude (with user requirements)
**Status:** Draft - v1.1 (Updated after spec review)

## Executive Summary

This document describes the addition of a new "Tele" (telemarketer) role to the IMU system and the implementation of strict touchpoint type enforcement. Tele users are office-based staff who handle Call touchpoints (2, 3, 5, 6) via the web admin, while Caravan (field agents) handle Visit touchpoints (1, 4, 7) via the mobile app.

**Key Changes:**
- Add "tele" role to the system
- Rename `touchpoints.caravan_id` → `touchpoints.user_id` (generic user reference)
- Remove touchpoint approval system (touchpoints immediately active)
- Tele users can add/edit clients (with admin approval)
- Tele users access Calls page with two tabs (assigned areas, unassigned clients)
- Strict validation: Caravan = Visits only, Tele = Calls only

## Table of Contents

1. [Database Schema Changes](#1-database-schema-changes)
2. [Backend API Changes](#2-backend-api-changes)
3. [Frontend Web Admin Changes](#3-frontend-web-admin-changes)
4. [Mobile App Changes](#4-mobile-app-changes)
5. [Migration Strategy](#5-migration-strategy)
6. [Testing Strategy](#6-testing-strategy)
7. [Implementation Tasks](#7-implementation-tasks)

---

## 1. Database Schema Changes

### 1.1 Add Tele Role

**File:** `backend/src/migrations/026_add_tele_role.sql`

```sql
-- Add 'tele' role to the system
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

### 1.2 Rename caravan_id to user_id

**File:** `backend/src/migrations/027_rename_caravan_id_to_user_id.sql`

```sql
-- Migration: Rename caravan_id to user_id in touchpoints table
-- This supports both Caravan and Tele users creating touchpoints

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

### 1.3 Remove Touchpoint Approval Fields

**File:** `backend/src/migrations/028_remove_touchpoint_approval.sql`

**IMPORTANT: Data Migration Strategy**

Before dropping the approval fields, we need to handle existing touchpoints with various `edit_status` values:

```sql
-- First, handle existing touchpoints with different edit_status values
-- 1. Keep 'approved' and 'pending_approval' touchpoints (they become active)
-- 2. Soft-delete 'rejected' touchpoints (mark for archival)
-- 3. Restore 'pending_deletion' touchpoints (cancel pending deletions)
-- 4. Mark 'deleted' touchpoints for archival

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
-- These will become active touchpoints
UPDATE touchpoints
SET edit_status = NULL,
    rejection_reason = NULL,
    edited_at = NULL,
    edited_by = NULL,
    proposed_changes = NULL
WHERE edit_status = 'pending_deletion';

-- Step 5: Now remove approval-related fields
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

### 1.4 Update Schema Files

Update both:
- `backend/src/schema.sql`
- `backend/scripts/seed-digital-ocean.sql`

To reflect the above changes in the base schema.

---

## 2. Backend API Changes

### 2.1 Touchpoints Route Updates

**File:** `backend/src/routes/touchpoints.ts`

**Schema Changes:**
```typescript
const createTouchpointSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(), // Now required, was caravan_id.optional()
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  // ... rest of fields
});
```

**Validation Function:**
```typescript
// Define touchpoint sequence (1-indexed)
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;

function canCreateTouchpoint(userRole: string, touchpointNumber: number, touchpointType: 'Visit' | 'Call'): boolean {
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
```

**Updated getNextTouchpointNumber Function (no edit_status filtering):**
```typescript
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

**Error Responses:**
```typescript
// Role/type validation error
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
```

**Role-based Filtering:**
- Caravan role: See own touchpoints (`user_id = current_user.id`)
- Tele role: See own touchpoints (`user_id = current_user.id`)
- Admin/Manager: See all touchpoints

**All References Updated (24 total):**
- Lines 69, 103, 149, 162, 193, 233, 248, 287, 299, 311, 312, 404, 405, 410, 422, 461, 481, 559, 674, 690, 691, 761

**Remove approval endpoint logic:**
- Remove `edit_status` filtering from all queries
- Remove `proposed_changes` handling
- Remove approval/rejection endpoints
- Touchpoints are immediately active upon creation

### 2.2 Remove Approval Endpoints

**DELETE:**
- `POST /api/touchpoints/:id/approve`
- `POST /api/touchpoints/:id/reject`

### 2.3 Client Approvals for Tele

**File:** `backend/src/routes/approvals.ts`

Enable Tele users to add/edit clients:
- Tele client ADD → `approvals` table (type='client', role='tele')
- Tele client EDIT → `approvals` table (type='client', role='tele')
- Admin approves → client created/updated

**Approval Workflow Details:**

When a Tele user submits a client addition or edit:
1. Client data is stored in `approvals.proposed_changes` as JSON
2. `approvals.type` = 'client'
3. `approvals.role` = 'tele'
4. `approvals.status` = 'pending'
5. Admin sees request in Approvals → Client tab
6. On approval, client is created/updated in `clients` table
7. On rejection, `approvals.rejection_reason` is set

**Fields Tele Users Can Edit:**
- Basic info: `first_name`, `middle_name`, `last_name`
- Contact: `email`, `phone`
- Classification: `client_type`, `product_type`, `market_type`, `pension_type`
- Employment: `agency_name`, `department`, `position`, `employment_status`
- Other: `pan`, `facebook_link`, `remarks`

**Fields Requiring Special Handling:**
- `addresses`: Add/edit requires approval
- `phone_numbers`: Add/edit requires approval
- `caravan_id`: Tele users CANNOT assign caravans (admin only)

### 2.4 Tele User Assignment Workflow

**How Tele Users Get Assigned to Municipalities:**

Tele users follow the same location assignment system as Caravan users:

1. **Admin assigns municipalities to Tele users:**
   - Via Location Assignments page (`/locations`)
   - Select Tele user from dropdown
   - Select municipalities from PSGC list
   - Save assignment

2. **Database storage:**
   - `user_locations` table stores assignments
   - `user_id` references Tele user
   - `municipality_id` references PSGC municipality

3. **Tele user filtering:**
   - "My Assigned Areas" tab: Shows clients in assigned municipalities
   - "Unassigned Clients" tab: Shows clients with NO municipality assignment
   - Can still call unassigned clients (flexibility for outreach)

**Implementation:**
```typescript
// Backend: Get assigned municipalities for Tele user
async function getAssignedMunicipalities(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT municipality_id FROM user_locations WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map(row => row.municipality_id);
}

// Backend: Filter clients by assigned municipalities
async function getClientsForTeleUser(userId: string): Promise<Client[]> {
  const municipalities = await getAssignedMunicipalities(userId);

  const result = await pool.query(
    `SELECT DISTINCT c.* FROM clients c
     LEFT JOIN client_addresses ca ON c.id = ca.client_id
     WHERE ca.municipality_id = ANY($1)
     ORDER BY c.last_name, c.first_name`,
    [municipalities]
  );

  return result.rows;
}
```

---

## 3. Frontend Web Admin Changes

### 3.1 Type Updates

**File:** `imu-web-vue/src/lib/types.ts`

**Update User role type (line 6):**
```typescript
role: 'admin' | 'area_manager' | 'assistant_area_manager' | 'caravan' | 'tele';
```

**Update 7 references from `caravan_id` to `user_id`:**
- `Touchpoint` interface (line 119): `user_id: string` (was `caravan_id: string`)
- `Touchpoint.expand` (line 131): `user_id?: User` (was `caravan_id?: Caravan`)
- `Approval` interface (line 223): `user_id?: string` (was `caravan_id?: string`)
- `Approval.expand` (line 237): `user_id?: User` (was `caravan_id?: User`)
- `Itinerary` interface (line 148): Same updates
- `Itinerary.expand` (line 161): Same updates
- Client-related models

### 3.2 Permissions System

**File:** `imu-web-vue/src/composables/usePermission.ts`

Add Tele-specific permissions:
```typescript
const permissions = {
  'view_dashboard': ['admin', 'area_manager', 'assistant_area_manager'],
  'edit_caravans': ['admin', 'area_manager'],
  'edit_groups': ['admin', 'area_manager'],

  // Tele permissions
  'view_calls_page': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'create_call_touchpoint': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'create_visit_touchpoint': ['admin', 'area_manager', 'assistant_area_manager', 'caravan'],
  'edit_clients': ['admin', 'area_manager', 'assistant_area_manager', 'tele'],
  'edit_client_caravan': ['admin', 'area_manager', 'assistant_area_manager'],
}
```

### 3.3 New Calls Store

**File:** `imu-web-vue/src/stores/calls.ts` (NEW)

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api-client'

export const useCallsStore = defineStore('calls', () => {
  const callsQueue = ref([])
  const loading = ref(false)
  const autoAdvance = ref(true)

  // Fetch calls for assigned areas
  async function fetchAssignedAreaCalls() { }

  // Fetch calls for unassigned clients
  async function fetchUnassignedClientCalls() { }

  // Create Call touchpoint
  async function createCallTouchpoint(data) { }

  // Toggle auto-advance
  function toggleAutoAdvance() {
    autoAdvance.value = !autoAdvance.value
  }

  return {
    callsQueue,
    loading,
    autoAdvance,
    fetchAssignedAreaCalls,
    fetchUnassignedClientCalls,
    createCallTouchpoint,
    toggleAutoAdvance,
  }
})
```

**Auto-Advance Persistence:**

Store the auto-advance preference in localStorage so it persists across browser sessions:

```typescript
// In CallsView.vue or in the store
const autoAdvance = ref(localStorage.getItem('tele-auto-advance') === 'true')

function toggleAutoAdvance() {
  autoAdvance.value = !autoAdvance.value
  localStorage.setItem('tele-auto-advance', String(autoAdvance.value))
}
```

### 3.4 New Tele Pages

**File:** `imu-web-vue/src/views/tele/ClientsView.vue` (NEW)
- List of all clients with search/filter
- Add client button → opens form
- Edit client button → opens form
- Both ADD and EDIT go to approvals

**File:** `imu-web-vue/src/views/tele/CallsView.vue` (NEW)
- Two tabs: "My Assigned Areas" | "Unassigned Clients"
- Call queue sorted by touchpoint number
- Auto-advance toggle switch
- Action buttons in first column: `[Call]`

**File:** `imu-web-vue/src/views/tele/components/ClientDetailModal.vue` (NEW)
- **Basic Info**: Name, contact, addresses, product/market/pension
- **Caravan Visit Details**: Assigned caravan, visit history
- **Touchpoint Details**: All 7 touchpoints with status
- **Tele Call Details**: Call history, outcomes, notes, remarks

**File:** `imu-web-vue/src/views/tele/components/CallFormModal.vue` (NEW)
- Client info display
- Touchpoint number (pre-filled, read-only)
- Date, Time pickers
- Reason dropdown (25+ reasons)
- Notes textarea
- Call outcome radio: Interested | Undecided | Not Interested
- Remarks textarea
- Save → (if auto-advance) → Next call form

### 3.5 Navigation Updates

**File:** `imu-web-vue/src/router/index.ts`

Add Tele routes:
```typescript
{
  path: '/clients',
  name: 'tele-clients',
  component: () => import('@/views/tele/ClientsView.vue'),
  meta: { permissions: ['view_calls_page'] }
},
{
  path: '/calls',
  name: 'tele-calls',
  component: () => import('@/views/tele/CallsView.vue'),
  meta: { permissions: ['view_calls_page'] }
}
```

**File:** `imu-web-vue/src/components/shared/Sidebar.vue`

Show Tele menu items:
- Clients (Tele)
- Calls (Tele)
- Hide: Dashboard, Locations, Users, Caravans, Groups, Itineraries, Reports, Approvals

---

## 4. Mobile App Changes

### 4.1 Model Updates

**File:** `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`

The `Touchpoint` class already uses `agentId` (line 408) which maps to `user_id`. No changes needed to the model definition.

**Add display fields:**
```dart
final String? userName; // "Caravan Alpha" or "Tele Maria"
final String? userRole; // "Caravan" or "Tele"
```

### 4.2 Touchpoint Validation Service

**File:** `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart`

```dart
class TouchpointValidationService {
  static const List<TouchpointType> _sequence = [
    TouchpointType.visit,  // 1st - Caravan ONLY
    TouchpointType.call,   // 2nd - Tele ONLY
    TouchpointType.call,   // 3rd - Tele ONLY
    TouchpointType.visit,  // 4th - Caravan ONLY
    TouchpointType.call,   // 5th - Tele ONLY
    TouchpointType.call,   // 6th - Tele ONLY
    TouchpointType.visit,  // 7th - Caravan ONLY
];

  static TouchpointCanCreateResult canCreateTouchpoint(
    String userRole,
    int touchpointNumber,
    TouchpointType touchpointType
  ) {
    final expectedType = getExpectedTouchpointType(touchpointNumber);

    if (userRole == 'caravan') {
      // Caravan: Can ONLY create Visit types (1, 4, 7)
      if (touchpointType != TouchpointType.visit) {
        return TouchpointCanCreateResult(
          canCreate: false,
          reason: 'Caravan users can only create Visit touchpoints (1, 4, 7)'
        );
      }
    }

    if (userRole == 'tele') {
      // Tele: Can ONLY create Call types (2, 3, 5, 6)
      if (touchpointType != TouchpointType.call) {
        return TouchpointCanCreateResult(
          canCreate: false,
          reason: 'Tele users can only create Call touchpoints (2, 3, 5, 6)'
        );
      }
    }

    // Admin/Manager: Any type allowed
    return TouchpointCanCreateResult(canCreate: true);
  }
}
```

### 4.3 Touchpoint Form UI Updates

**File:** `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

```dart
// Get available types based on user role and touchpoint number
List<TouchpointType> getAvailableTypes(int touchpointNumber, String? role) {
  final expectedType = TouchpointValidationService.getExpectedTouchpointType(touchpointNumber);

  if (role == 'caravan') {
    // Caravan: Only show Visit option (1, 4, 7)
    if (expectedType == TouchpointType.visit) {
      return [TouchpointType.visit];
    }
    return []; // Hide type dropdown - wrong type for caravan
  }

  if (role == 'tele') {
    // Tele: Not applicable - Tele doesn't use mobile app
    return [];
  }

  // Admin/Manager - show both options
  return [TouchpointType.visit, TouchpointType.call];
}
```

**UI Behavior:**
- Caravan users: If touchpoint expects "Visit" → show dropdown with only "Visit"
- Caravan users: If touchpoint expects "Call" → hide touchpoint form entirely
- Tele users: Don't use mobile app at all

### 4.4 Repository Updates

**File:** `mobile/imu_flutter/lib/features/touchpoints/data/repositories/touchpoint_repository.dart`

**SQL Updates:**
```dart
// Line 98 - INSERT statement
caravan_id → user_id

// Line 164 - UPDATE statement
caravan_id → user_id

// Line 248 - Map function
agentId: row['user_id']
```

**File:** `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`

Update all API calls to use `user_id` instead of `caravan_id`.

### 4.5 PowerSync Schema Update

**File:** `mobile/imu_flutter/lib/services/sync/powersync_service.dart`

Update sync schema to use `user_id` instead of `caravan_id`.

**PowerSync Considerations:**

1. **Tele users do NOT use PowerSync:**
   - Tele users are web-only, office-based
   - No mobile app access required
   - No PowerSync token generation needed for Tele role

2. **Caravan PowerSync updates:**
   - Update sync schema SQL: `caravan_id` → `user_id`
   - Update sync queries to filter by `user_id`
   - Update sync rules to map `user_id` correctly

3. **PowerSync sync rules update:**
```sql
-- Before
SELECT * FROM touchpoints WHERE caravan_id = $1

-- After
SELECT * FROM touchpoints WHERE user_id = $1
```

4. **No additional PowerSync configuration needed for Tele users:**
   - Tele users don't sync data to mobile devices
   - All Tele operations are real-time via web API

---

## 5. Migration Strategy

### 5.1 Rollout Plan

**Phase 1: Backend (Zero Downtime)**
1. Deploy database migrations (026, 027, 028)
2. Deploy updated `touchpoints.ts` API routes
3. Remove approval endpoints
4. Add Tele role validation
5. Run database validation queries

**Phase 2: Frontend**
1. Deploy type updates (`types.ts`)
2. Deploy new Tele stores and pages
3. Update navigation/routing
4. Deploy permission updates

**Phase 3: Mobile**
1. Deploy PowerSync schema update
2. Deploy updated validation service
3. Deploy form UI changes
4. Force update mobile app

### 5.2 Rollback Plan

**Reverse Migration:**
```sql
-- Rollback: user_id → caravan_id
ALTER TABLE touchpoints RENAME COLUMN user_id TO caravan_id;

-- Restore foreign key
ALTER TABLE touchpoints
  DROP CONSTRAINT IF EXISTS touchpoints_user_id_fkey,
  ADD CONSTRAINT touchpoints_caravan_id_fkey
  FOREIGN KEY (caravan_id) REFERENCES users(id) ON DELETE SET NULL;

-- Restore indexes
DROP INDEX IF EXISTS idx_touchpoints_user_id;
CREATE INDEX idx_touchpoints_caravan_id ON touchpoints(caravan_id);

-- Restore role constraints
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS role_check,
  ADD CONSTRAINT role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));
```

### 5.3 Pre-Migration Data Validation

**Before running migrations, run these validation queries:**

```sql
-- Check for orphaned touchpoints (caravan_id references non-existent users)
SELECT COUNT(*) as orphaned_touchpoints
FROM touchpoints t
LEFT JOIN users u ON t.caravan_id = u.id
WHERE t.caravan_id IS NOT NULL AND u.id IS NULL;

-- Check existing touchpoint edit_status distribution
SELECT
  edit_status,
  COUNT(*) as count
FROM touchpoints
GROUP BY edit_status
ORDER BY count DESC;

-- Check for touchpoints with null caravan_id
SELECT COUNT(*) as null_caravan_touchpoints
FROM touchpoints
WHERE caravan_id IS NULL;

-- Verify user roles are consistent
SELECT
  u.role,
  up.role as profile_role,
  COUNT(*) as count
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE u.role != up.role
GROUP BY u.role, up.role;

-- Check for clients with duplicate touchpoint numbers
SELECT
  client_id,
  touchpoint_number,
  COUNT(*) as count
FROM touchpoints
WHERE edit_status IN ('approved', 'pending_approval')
GROUP BY client_id, touchpoint_number
HAVING COUNT(*) > 1;
```

**Expected Results:**
- `orphaned_touchpoints`: Should be 0 (or fix orphans before migration)
- `edit_status` distribution: Will help assess impact of removing approval fields
- `null_caravan_touchpoints`: Should be 0 (or decide how to handle)
- `role` consistency: Should be 0 mismatches
- `duplicate` touchpoint numbers: Should be 0 (indicates data quality issue)

### 5.4 Data Validation Query

```sql
-- Verify migration success
SELECT
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) as with_user,
  COUNT(*) FILTER (WHERE user_id IS NULL) as without_user,
  COUNT(*) as total_touchpoints
FROM touchpoints;

-- Verify Tele role exists
SELECT COUNT(*) FROM users WHERE role = 'tele';
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Backend:**
- `touchpoints.test.ts`: Role validation, type enforcement, duplicate prevention
- `approvals.test.ts`: Tele client approval workflow

**Frontend:**
- `calls.spec.ts`: Call queue, auto-advance, form submission
- Permissions: Tele user access control

**Mobile:**
- `touchpoint_validation_service_test.dart`: Role-based type restrictions

### 6.2 Integration Tests

**API Integration:**
- Create touchpoint as Caravan → verify saved with user_id
- Create touchpoint as Tele → verify saved with user_id
- Invalid type/role combo → verify rejected

**Approval Workflow:**
- Tele adds client → verify in approvals
- Admin approves → verify client created
- Tele edits client → verify in approvals

### 6.3 End-to-End Tests

**E2E 1: Caravan Visit Flow**
1. Caravan logs into mobile app
2. Navigates to client with touchpoint #1 (Visit)
3. Form shows only "Visit" option
4. Submits Visit touchpoint
5. Verify created with user_id, #2 now shows as "Call"

**E2E 2: Tele Call Flow**
1. Tele logs into web admin
2. Opens Calls → "My Assigned Areas" tab
3. Sees client with touchpoint #2 (Call)
4. Clicks Call → Opens Call form
5. Form shows only "Call" option
6. Fills form, submits
7. Call created, auto-advances to next call

**E2E 3: Sequence Enforcement**
1. Try to create touchpoint #2 as Visit → Rejected
2. Try to create touchpoint #1 as Tele → Rejected
3. Try to create touchpoint #4 as Tele → Rejected

**E2E 4: Client Approval**
1. Tele adds client → Goes to approvals
2. Admin approves → Client created
3. Tele edits client → Goes to approvals
4. Admin approves → Client updated

### 6.4 Regression Tests

- Caravan users can still create Visit touchpoints
- Admin/Manager can create any touchpoint type
- Existing touchpoints still accessible with user_id mapping
- Location assignments still work for Caravan
- Tele users cannot access mobile app
- Tele users cannot access Reports/Analytics

---

## 7. Implementation Tasks

### 7.1 Backend Tasks (7)

1. Create migration script `026_add_tele_role.sql`
2. Create migration script `027_rename_caravan_id_to_user_id.sql`
3. Create migration script `028_remove_touchpoint_approval.sql` (with archival logic)
4. Update `schema.sql` and seed files
5. Update `touchpoints.ts` route (24 references to user_id)
6. Remove approval endpoints from `touchpoints.ts`
7. Add Tele role validation to `touchpoints.ts` with error responses
8. Update `approvals.ts` for Tele client edits (field restrictions)
9. Add Tele user assignment functions to `routes/users.ts` or `routes/locations.ts`
10. Add backend unit & integration tests

### 7.2 Frontend Web Admin Tasks (8)

1. Update `types.ts` (7 references: caravan_id → user_id)
2. Update `usePermission.ts` composable with Tele permissions
3. Create `stores/calls.ts` store
4. Create `views/tele/ClientsView.vue` page
5. Create `views/tele/CallsView.vue` page
6. Create `views/tele/components/ClientDetailModal.vue`
7. Create `views/tele/components/CallFormModal.vue`
8. Update router with Tele routes
9. Update `Sidebar.vue` to show Tele menu items
10. Add frontend unit tests

### 7.3 Mobile App Tasks (5)

1. Update `touchpoint_repository.dart` (user_id references)
2. Update `touchpoint_api_service.dart`
3. Update `powersync_service.dart` schema
4. Add/update `touchpoint_validation_service.dart`
5. Update `touchpoint_form.dart` with role-based type options
6. Add mobile unit tests

### 7.4 Testing Tasks (4)

1. Write backend unit tests (touchpoints, approvals)
2. Write frontend unit tests (calls, permissions)
3. Write mobile unit tests (validation service)
4. Execute E2E tests (4 scenarios)
5. Execute regression tests

**Total: 28 implementation tasks**

---

## Appendix A: Touchpoint Sequence Reference

```
Touchpoint Sequence: Visit → Call → Call → Visit → Call → Call → Visit

┌─────────┬────────┬──────────┬──────────────────────────────────┐
│ #       │ TYPE   │ WHO CAN  │                                  │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 1st     │ Visit  │ Caravan  │ 🚶 Caravan ONLY                 │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 2nd     │ Call   │ Tele     │ ☎️ Tele ONLY                    │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 3rd     │ Call   │ Tele     │ ☎️ Tele ONLY                    │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 4th     │ Visit  │ Caravan  │ 🚶 Caravan ONLY                 │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 5th     │ Call   │ Tele     │ ☎️ Tele ONLY                    │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 6th     │ Call   │ Tele     │ ☎️ Tele ONLY                    │
├─────────┼────────┼──────────┼──────────────────────────────────┤
│ 7th     │ Visit  │ Caravan  │ 🚶 Caravan ONLY                 │
└─────────┴────────┴──────────┴──────────────────────────────────┘

Admin/Manager: Can create ANY touchpoint type
```

---

## Appendix B: Tele Permissions Matrix

| Feature | Admin | Area Mgr | Asst. Mgr | Caravan | Tele |
|---------|-------|----------|-----------|---------|-------|
| View Dashboard | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clients Page | ✅ | ✅ | ✅ | ❌ | ✅ |
| Calls Page | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Call TP | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Visit TP | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add Client (Approval) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Edit Client (Approval) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Locations | ✅ | ✅ | ✅ | ❌ | ❌ |
| Users | ✅ | ✅ | ✅ | ❌ | ❌ |
| Caravans | ✅ | ✅ | ✅ | ❌ | ❌ |
| Groups | ✅ | ✅ | ✅ | ❌ | ❌ |
| Itineraries | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approvals | ✅ | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ✅ | ✅ | ❌ | ✅ |

---

## Appendix C: Edge Cases and Error Handling

### C.1 Edge Cases to Handle

**1. Touchpoint Sequence Mismatch:**
- **Scenario**: Existing touchpoint #2 is a "Visit" instead of "Call"
- **Solution**: Historical data is preserved, but new touchpoints must follow the sequence. The validation only applies to NEW touchpoints.

**2. Orphaned caravan_id References:**
- **Scenario**: Touchpoint references a user that no longer exists
- **Solution**: Pre-migration validation query identifies orphans. Set `user_id` to NULL for orphans during migration.

**3. Tele User Tries to Access Mobile App:**
- **Scenario**: Tele user attempts to log in to mobile app
- **Solution**: Auth middleware rejects login with message: "Tele users can only access the web admin panel"

**4. Caravan User Tries to Create Call Touchpoint:**
- **Scenario**: Caravan user tries to bypass UI and call API directly
- **Solution**: Backend validation rejects with 403 and clear error message

**5. Simultaneous Touchpoint Creation:**
- **Scenario**: Two Tele users try to create touchpoint #2 for the same client
- **Solution**: First-come-first-served. Second request gets 409 Conflict error

**6. Client with No Assigned Municipality:**
- **Scenario**: Client exists but has no municipality assigned
- **Solution**: Shows in "Unassigned Clients" tab for all Tele users

**7. Tele User with No Assigned Areas:**
- **Scenario**: Tele user has no municipality assignments
- **Solution**: "My Assigned Areas" tab shows empty state, "Unassigned Clients" tab still works

### C.2 Offline Mode Handling

**Caravan Mobile App (Offline-First):**
- Continues to use Hive for local storage
- Sync service queues pending touchpoints
- Role validation works offline (user role stored locally)
- On sync: Server validates role and sequence

**Tele Web Admin (Online-Only):**
- No offline mode required
- All operations require active internet connection
- Immediate API calls for all actions
- No local storage for touchpoint data

**Network Error Handling:**
```typescript
// Tele call creation with retry
async function createCallTouchpoint(data) {
  try {
    const response = await api.post('/touchpoints', data)
    return response.data
  } catch (error) {
    if (error.networkError) {
      toast.error('Network error. Please check your connection and try again.')
    } else if (error.status === 403) {
      toast.error(error.data.message) // Role validation error
    } else if (error.status === 409) {
      toast.error('This touchpoint was already created by another user.')
    }
    throw error
  }
}
```

---

## Appendix D: Audit Trail Considerations

**Maintaining Audit History:**

Even though we're removing the touchpoint approval system, we should maintain an audit trail:

1. **Touchpoint Creation:**
   - `created_at` timestamp (already exists)
   - `created_by` user_id (add if not exists)

2. **Touchpoint Updates:**
   - `updated_at` timestamp (already exists)
   - `updated_by` user_id (add if not exists)

3. **Audit Logs Table:**
   - Use existing `audit_logs` table for tracking
   - Log all touchpoint CREATE/UPDATE/DELETE operations
   - Log includes: user_id, action, record_id, old_values, new_values

**Recommended Migration Addition:**
```sql
-- Add audit trail fields to touchpoints table
ALTER TABLE touchpoints
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- Set created_by for existing records
UPDATE touchpoints
SET created_by = user_id
WHERE created_by IS NULL;

-- Add indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_created_by ON touchpoints(created_by);
CREATE INDEX IF NOT EXISTS idx_touchpoints_updated_by ON touchpoints(updated_by);
```

---

## Appendix E: Database Schema Comparison

**Before (Current):**
```sql
CREATE TABLE touchpoints (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  caravan_id UUID REFERENCES users(id),  -- Caravan only
  touchpoint_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  edit_status TEXT, -- approval status
  edited_at TIMESTAMPTZ,
  edited_by UUID,
  proposed_changes JSONB,
  rejection_reason TEXT,
  is_synced BOOLEAN,
  synced_at TIMESTAMPTZ,
  ...
);
```

**After (With Tele):**
```sql
CREATE TABLE touchpoints (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  user_id UUID REFERENCES users(id),  -- Generic: Caravan OR Tele
  touchpoint_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  -- No approval fields - touchpoints immediately active
  ...
);
```

---

## Document Control

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-26 | Initial design | Claude |
| 1.1 | 2026-03-26 | Fixed critical issues from spec review: migration numbers (026-028), role consistency, User type update, validation details, Tele assignment workflow, approval system removal strategy, PowerSync considerations, edge cases, audit trail | Claude |

---

**End of Design Document**
