# Visit Record Only & Loan Release Data Flow Design

**Date:** 2026-04-15
**Status:** Approved for Implementation
**Author:** Claude Code (Brainstorming Session)

---

## Executive Summary

This document outlines the approved design changes to two critical data flows in the IMU system:

1. **Visit Record Only**: Redesigned to create only an itinerary record, NOT a touchpoint
2. **Loan Release**: Redesigned to skip Touchpoint #7 creation, mark client as loan_released directly

**Design Decision Summary:**
- Both approaches simplify the data model by removing unnecessary touchpoint creation
- Better separation of concerns: touchpoints = 7-step sales process, itineraries = visit tracking
- Maintains audit trail while reducing data redundancy

---

## Background

### Current Implementation Problems

**Visit Record Only:**
- Currently creates a touchpoint with `touchpoint_number=0` (hacky workaround)
- Touchpoints table is meant for the 7-step sales process, not general visits
- Confuses the "completed touchpoints" count on client cards

**Loan Release:**
- Currently creates Touchpoint #7 (Visit type) with status "Completed"
- This is semantically incorrect - loan release is not the same as completing the sales process
- Creates confusion in reporting and analytics

### Business Requirements

**User Requirements (as stated):**
1. "visit record only should not create touchpoint, but a visit record only"
2. "loan release should create a touchpoint but should not be labeled as complete, maybe something for history like 'released loan on...'"
3. After brainstorming: User approved Approach 1 for both (skip touchpoint creation)

**Approval Rules:**
- Loan release: Requires admin approval
- Visit record only: No approval required
- Touchpoint creation (1-7): No approval required

---

## Approved Design Changes

### Change 1: Visit Record Only (Itinerary-Only Approach)

**Current Behavior:**
```
POST /api/my-day/clients/:id/visit
→ Creates touchpoint with touchpoint_number=0 (HACK)
→ Creates itinerary record
```

**New Behavior:**
```
POST /api/my-day/clients/:id/visit
→ Creates/updates itinerary record ONLY
→ NO touchpoint creation
```

**Rationale:**
- Clean separation: touchpoints = 7-step sales process, itineraries = visit tracking
- Eliminates the `touchpoint_number=0` hack
- Better reflects the actual business activity (general visit vs sales touchpoint)

### Change 2: Loan Release (No Touchpoint #7 Approach)

**Current Behavior:**
```
POST /api/approvals/loan-release-v2
→ On approval: Creates Touchpoint #7 (Visit) with status="Completed"
→ Updates client.loan_released = TRUE
→ Creates itinerary record
```

**New Behavior:**
```
POST /api/approvals/loan-release-v2
→ On approval: NO touchpoint creation
→ Updates client.loan_released = TRUE, client.loan_released_at = NOW()
→ Creates itinerary record (for audit trail)
→ Add 'loan_released' to touchpoint status enum (for future use)
```

**Rationale:**
- Loan release is an administrative action, not a sales touchpoint
- Touchpoint #7 should only be created when the 7th sales visit actually occurs
- Maintains audit trail via itinerary record

---

## Architecture Changes

### 1. Database Schema Changes

#### 1.1 Itinerary Table Enhancements

**New Columns to Add:**
```sql
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS visit_outcome VARCHAR(50);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS actual_time_in TIME;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS actual_time_out TIME;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS gps_latitude DOUBLE PRECISION;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS gps_longitude DOUBLE PRECISION;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS gps_address TEXT;
```

**Add CHECK Constraint for visit_outcome:**
```sql
ALTER TABLE itineraries ADD CONSTRAINT visit_outcome_check
  CHECK (visit_outcome IN (
    'successful',
    'unsuccessful',
    'client_not_available',
    'wrong_contact',
    'rescheduled',
    'refused',
    'other'
  ));
```

**Rationale:**
- `visit_outcome`: Better tracking of visit results (beyond simple status)
- `actual_time_in/out`: Separate from scheduled time (time_in/time_out columns)
- GPS fields: Capture location data for visit verification

#### 1.2 Touchpoint Status Enum Update

**Current CHECK Constraint:**
```sql
CONSTRAINT touchpoint_status_check
  CHECK (status IN ('Interested', 'Undecided', 'Not Interested', 'Completed'))
```

**New CHECK Constraint:**
```sql
-- Drop old constraint
ALTER TABLE touchpoints DROP CONSTRAINT IF EXISTS touchpoint_status_check;

-- Add new constraint with loan_released
ALTER TABLE touchpoints ADD CONSTRAINT touchpoint_status_check
  CHECK (status IN (
    'Interested',
    'Undecided',
    'Not Interested',
    'Completed',
    'loan_released'
  ));
```

**Rationale:**
- **DECISION: Remove this change** - The 'loan_released' status is not needed since we're not creating touchpoints for loan releases
- Keep the touchpoint status enum as-is: Interested, Undecided, Not Interested, Completed
- If loan release context is needed in the future, use the itinerary.status='loan_released' field instead

#### 1.3 Client Table Enhancements (Already Exists)

**Existing Columns (No Changes Needed):**
```sql
loan_released BOOLEAN DEFAULT FALSE
loan_released_at TIMESTAMP
```

**Note:** These columns already exist and are used by the loan release flow.

---

### 2. Backend API Changes

#### 2.1 Visit Record Only Endpoint

**File:** `backend/src/routes/my-day.ts`

**Current Implementation:**
```typescript
myDay.post('/clients/:id/visit', authMiddleware, async (c) => {
  // Currently creates touchpoint with touchpoint_number=0
  await client.query(`
    INSERT INTO touchpoints (
      id, client_id, user_id, touchpoint_number, type, reason, status, date
    ) VALUES (
      gen_random_uuid(), $1, $2, 0, 'Visit', 'Visit Only', 'Completed', CURRENT_DATE
    )
  `, [clientId, userId]);

  // Creates itinerary
  await client.query(`INSERT INTO itineraries ...`);
});
```

**New Implementation:**
```typescript
myDay.post('/clients/:id/visit', authMiddleware, async (c) => {
  const schema = z.object({
    remarks: z.string().optional(),
    visit_outcome: z.enum(['successful', 'unsuccessful', 'client_not_available', 'wrong_contact', 'rescheduled', 'refused', 'other']).optional(),
    actual_time_in: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    actual_time_out: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    gps_latitude: z.number().optional(),
    gps_longitude: z.number().optional(),
    gps_address: z.string().optional(),
  });

  const validated = schema.parse(await c.req.json());

  // NO touchpoint creation - only itinerary
  await client.query(`
    INSERT INTO itineraries (
      id, client_id, user_id, scheduled_date, scheduled_time_in, scheduled_time_out,
      actual_time_in, actual_time_out, visit_outcome,
      gps_latitude, gps_longitude, gps_address,
      status, remarks, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, CURRENT_DATE, NULL, NULL,
      $3, $4, $5,
      $6, $7, $8,
      'completed', $9, NOW()
    )
  `, [
    clientId, userId,
    validated.actual_time_in,
    validated.actual_time_out,
    validated.visit_outcome,
    validated.gps_latitude,
    validated.gps_longitude,
    validated.gps_address,
    validated.remarks,
  ]);

  return c.json({ message: 'Visit recorded successfully' });
});
```

**Key Changes:**
- Removed touchpoint creation entirely
- Added new fields: visit_outcome, actual_time_in/out, GPS data
- Simplified logic - single INSERT to itineraries table

#### 2.2 Loan Release Approval Handler

**File:** `backend/src/routes/approvals.ts`

**Current Implementation (lines 538-592):**
```typescript
if (approval.type === 'loan_release_v2') {
  // Mark client as loan_released
  await client.query(`
    UPDATE clients
    SET loan_released = TRUE, loan_released_at = NOW()
    WHERE id = $1
  `, [clientId]);

  // Create Touchpoint #7 (REMOVE THIS)
  await client.query(`
    INSERT INTO touchpoints (
      id, client_id, user_id, touchpoint_number, type, reason, status, date
    ) VALUES (
      gen_random_uuid(), $1, $2, 7, 'Visit', 'Loan Release', 'Completed', CURRENT_DATE
    )
  `, [clientId, userId]);

  // Create itinerary
  await client.query(`INSERT INTO itineraries ...`);
}
```

**New Implementation:**
```typescript
if (approval.type === 'loan_release_v2') {
  const notes = approval.notes as Record<string, any>;

  // Mark client as loan_released
  await client.query(`
    UPDATE clients
    SET loan_released = TRUE, loan_released_at = NOW()
    WHERE id = $1
  `, [clientId]);

  // NO touchpoint creation - skip Touchpoint #7

  // Create itinerary record for audit trail
  await client.query(`
    INSERT INTO itineraries (
      id, client_id, user_id, scheduled_date,
      actual_time_in, actual_time_out,
      gps_latitude, gps_longitude, gps_address,
      status, remarks, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, CURRENT_DATE,
      $3, $4,
      $5, $6, $7,
      'loan_released', $8, NOW()
    )
  `, [
    clientId, userId,
    notes.time_in, notes.time_out,
    notes.latitude, notes.longitude, notes.address,
    notes.remarks,
  ]);

  return c.json({
    message: 'Loan release approved',
    client_id: clientId,
    loan_released: true,
    loan_released_at: new Date().toISOString(),
  });
}
```

**Key Changes:**
- Removed Touchpoint #7 creation entirely
- Added status='loan_released' to itinerary record
- Uses itinerary as audit trail instead of touchpoint

---

### 3. Mobile App Changes

#### 3.1 Visit Record Form (No Changes Required)

**File:** `mobile/imu_flutter/lib/features/my_day/presentation/widgets/visit_form.dart`

**Status:** ✅ Already exists and uses correct endpoint

**Current Implementation:**
```dart
// Already uses POST /api/my-day/clients/:id/visit
await myDayApiService.completeVisit(
  clientId: widget.client.id!,
  remarks: _remarks,
);
```

**Action:** No changes needed - endpoint will be updated on backend

#### 3.2 Release Loan Form (No Changes Required)

**File:** `mobile/imu_flutter/lib/features/record_forms/presentation/widgets/release_loan_form.dart`

**Status:** ✅ Already updated in previous work

**Current Implementation:**
```dart
// Already uses POST /api/approvals/loan-release-v2
await approvalsApiService.submitLoanReleaseV2(
  clientId: widget.client.id!,
  udiNumber: _formData.udiNumber!.trim(),
  productType: _formData.productType?.apiValue,
  loanType: _formData.loanType?.apiValue,
  timeIn: timeInStr,
  timeOut: timeOutStr,
  odometerIn: _formData.odometerIn,
  odometerOut: _formData.odometerOut,
  latitude: _formData.gpsLatitude,
  longitude: _formData.gpsLongitude,
  address: _formData.gpsAddress,
  photoUrl: _formData.photoPath,
  remarks: _formData.remarks?.trim().isNotEmpty == true ? _formData.remarks : null,
);
```

**Action:** No changes needed - backend handler will be updated

---

### 4. API Compatibility & Migration

#### 4.1 Visit Record Endpoint Changes

**Breaking Changes:** None - all new fields are optional

**Backward Compatibility:**
- Old mobile app versions can still call the endpoint without new fields
- New fields (`visit_outcome`, `actual_time_in/out`, GPS) are all optional
- If not provided, these fields will be NULL in database

**Forward Compatibility:**
- New mobile app versions can provide new fields
- Backend will accept and store new fields when provided
- Old backend versions will ignore unknown fields (JSON parse behavior)

**Field Defaults:**
- `visit_outcome`: NULL if not provided (no default)
- `actual_time_in`: NULL if not provided
- `actual_time_out`: NULL if not provided
- GPS fields: NULL if not provided

**Migration Strategy:**
- Deploy database migration first (columns are nullable)
- Deploy backend API changes (new fields optional)
- Mobile app can be updated later to use new fields
- No coordinated deployment required

#### 4.2 Existing Data Migration

**Touchpoint #0 Records (Visit Only):**
- **Problem:** Existing records with `touchpoint_number=0` are legacy "Visit Only" records
- **Solution:** Migration script converts these to itinerary records and deletes the touchpoints
- **Impact:** Clients will show correct touchpoint counts after migration (no more "0/7" confusion)

**Touchpoint #7 Records (Loan Release):**
- **Problem:** Some Touchpoint #7 records may have been created by loan releases
- **Solution:** Keep these records as-is (they represent actual 7th sales visits)
- **Future:** New loan releases will NOT create Touchpoint #7
- **Impact:** No data loss, only new behavior changes

**Detection Query:**
```sql
-- Find legacy Visit Only touchpoints (before migration)
SELECT COUNT(*) as visit_only_count
FROM touchpoints
WHERE touchpoint_number = 0;

-- Find loan release touchpoints (for reference)
SELECT COUNT(*) as loan_release_count
FROM touchpoints
WHERE touchpoint_number = 7
  AND reason = 'Loan Release';
```

---

## Data Flow Diagrams

### Visit Record Only Flow (New)

```
┌─────────────────┐
│  Mobile App     │
│  (Caravan/Tele) │
└────────┬────────┘
         │
         │ POST /api/my-day/clients/:id/visit
         │ {
         │   "remarks": "Client not interested",
         │   "visit_outcome": "unsuccessful",
         │   "actual_time_in": "09:30",
         │   "actual_time_out": "09:45",
         │   "gps_latitude": 14.5995,
         │   "gps_longitude": 120.9842,
         │   "gps_address": "Manila, Philippines"
         │ }
         ▼
┌─────────────────────────────────┐
│  Backend API                    │
│  (my-day.ts)                    │
└────────┬────────────────────────┘
         │
         │ BEGIN TRANSACTION
         │
         ▼
┌─────────────────────────────────┐
│  INSERT INTO itineraries        │
│  - id: gen_random_uuid()        │
│  - client_id: <client_id>       │
│  - user_id: <user_id>           │
│  - scheduled_date: CURRENT_DATE │
│  - actual_time_in: "09:30"      │
│  - actual_time_out: "09:45"     │
│  - visit_outcome: "unsuccessful"│
│  - gps_latitude: 14.5995        │
│  - gps_longitude: 120.9842      │
│  - gps_address: "Manila..."     │
│  - status: "completed"          │
│  - remarks: "Client not..."     │
└────────┬────────────────────────┘
         │
         │ COMMIT
         │
         ▼
┌─────────────────────────────────┐
│  Response                       │
│  {                              │
│    "message": "Visit recorded   │
│              successfully"      │
│  }                              │
└─────────────────────────────────┘

❌ NO touchpoint creation
```

### Loan Release Flow (New)

```
┌─────────────────┐
│  Mobile App     │
│  (Admin Only)   │
└────────┬────────┘
         │
         │ POST /api/approvals/loan-release-v2
         │ {
         │   "client_id": "<uuid>",
         │   "udi_number": "UDI-12345",
         │   "product_type": "pension",
         │   "loan_type": "regular",
         │   "time_in": "10:00",
         │   "time_out": "10:30",
         │   "latitude": 14.5995,
         │   "longitude": 120.9842,
         │   "address": "Manila...",
         │   "remarks": "Loan released"
         │ }
         ▼
┌─────────────────────────────────┐
│  Backend API                    │
│  (approvals.ts)                 │
└────────┬────────────────────────┘
         │
         │ Creates approval request
         │ (type='loan_release_v2')
         │ status='pending'
         │
         ▼
┌─────────────────────────────────┐
│  Admin approves via web         │
│  POST /api/approvals/:id/approve│
└────────┬────────────────────────┘
         │
         │ BEGIN TRANSACTION
         │
         ▼
┌─────────────────────────────────┐
│  UPDATE clients                 │
│  SET loan_released = TRUE       │
│      loan_released_at = NOW()   │
│  WHERE id = $1                  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  INSERT INTO itineraries        │
│  - id: gen_random_uuid()        │
│  - client_id: <client_id>       │
│  - user_id: <user_id>           │
│  - scheduled_date: CURRENT_DATE │
│  - actual_time_in: "10:00"      │
│  - actual_time_out: "10:30"     │
│  - gps_latitude: 14.5995        │
│  - gps_longitude: 120.9842      │
│  - gps_address: "Manila..."     │
│  - status: "loan_released"      │
│  - remarks: "Loan released"     │
└────────┬────────────────────────┘
         │
         │ COMMIT
         │
         ▼
┌─────────────────────────────────┐
│  Response                       │
│  {                              │
│    "message": "Loan release     │
│              approved",         │
│    "loan_released": true,       │
│    "loan_released_at": "..."    │
│  }                              │
└─────────────────────────────────┘

❌ NO Touchpoint #7 creation
✅ Client marked as loan_released
✅ Audit trail in itineraries
```

---

## Error Handling

### Database Transaction Rollback

Both endpoints use database transactions to ensure atomicity:

```typescript
try {
  await client.query('BEGIN');

  // Multiple operations
  await client.query('UPDATE clients ...');
  await client.query('INSERT INTO itineraries ...');

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
}
```

**Failure Scenarios:**
1. **Client not found**: Rollback + 404 error
2. **Invalid GPS data**: Rollback + 400 validation error
3. **Database connection lost**: Automatic rollback
4. **Permission denied**: Rollback + 403 error

### Validation Errors

**Visit Record Only:**
- Missing required fields → 400 Bad Request
- Invalid time format (HH:MM) → 400 Bad Request
- Invalid GPS coordinates → 400 Bad Request
- Invalid visit_outcome enum → 400 Bad Request

**Loan Release:**
- Missing UDI number → 400 Bad Request
- UDI number > 50 chars → 400 Bad Request
- Invalid client_id UUID → 400 Bad Request
- Client already loan_released → 409 Conflict

---

## Migration Plan

### Phase 1: Database Schema Migration

**Migration File:** `backend/src/migrations/048_visit_outcome_and_loan_released_status.sql`

```sql
-- ============================================================
-- Migration 048: Visit Outcome Fields & Itinerary-Only Flow
-- ============================================================

-- Add new columns to itineraries table
ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS visit_outcome VARCHAR(50);

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS actual_time_in TIME;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS actual_time_out TIME;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS gps_latitude DOUBLE PRECISION;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS gps_longitude DOUBLE PRECISION;

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS gps_address TEXT;

-- Add CHECK constraint for visit_outcome
ALTER TABLE itineraries
  ADD CONSTRAINT visit_outcome_check
  CHECK (visit_outcome IN (
    'successful',
    'unsuccessful',
    'client_not_available',
    'wrong_contact',
    'rescheduled',
    'refused',
    'other'
  ));

-- NOTE: No changes to touchpoints table needed
-- Touchpoint status enum remains: Interested, Undecided, Not Interested, Completed

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_itineraries_visit_outcome
  ON itineraries(visit_outcome);

CREATE INDEX IF NOT EXISTS idx_itineraries_actual_time
  ON itineraries(actual_time_in, actual_time_out);

CREATE INDEX IF NOT EXISTS idx_itineraries_gps
  ON itineraries(gps_latitude, gps_longitude);

-- Add comments for documentation
COMMENT ON COLUMN itineraries.visit_outcome IS 'Outcome of the visit (successful, unsuccessful, etc.)';
COMMENT ON COLUMN itineraries.actual_time_in IS 'Actual time visit started (HH:MM)';
COMMENT ON COLUMN itineraries.actual_time_out IS 'Actual time visit ended (HH:MM)';
COMMENT ON COLUMN itineraries.gps_latitude IS 'GPS latitude captured during visit';
COMMENT ON COLUMN itineraries.gps_longitude IS 'GPS longitude captured during visit';
COMMENT ON COLUMN itineraries.gps_address IS 'Reverse geocoded address from GPS';

-- ============================================================
-- Data Migration: Clean up old touchpoint records
-- ============================================================

-- Migrate existing touchpoint_number=0 records to itineraries
-- This converts old "Visit Only" touchpoints to pure itinerary records
INSERT INTO itineraries (id, client_id, user_id, scheduled_date, status, remarks, created_at)
SELECT
  gen_random_uuid(),
  t.client_id,
  t.user_id,
  t.date,
  'completed',
  'Migrated from touchpoint #0: ' || COALESCE(t.remarks, ''),
  t.created_at
FROM touchpoints t
WHERE t.touchpoint_number = 0
  AND NOT EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.client_id = t.client_id
      AND i.user_id = t.user_id
      AND i.scheduled_date = t.date
      AND i.status = 'completed'
  );

-- Delete migrated touchpoint_number=0 records
DELETE FROM touchpoints
WHERE touchpoint_number = 0;

-- Log migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM touchpoints
  WHERE touchpoint_number = 0;

  RAISE NOTICE 'Migration completed. Migrated % touchpoint #0 records to itineraries.', migrated_count;
END $$;
```

**Rollback Script:**
```sql
-- Rollback Migration 048

-- Drop indexes
DROP INDEX IF EXISTS idx_itineraries_visit_outcome;
DROP INDEX IF EXISTS idx_itineraries_actual_time;
DROP INDEX IF EXISTS idx_itineraries_gps;

-- Drop constraint
ALTER TABLE itineraries
  DROP CONSTRAINT IF EXISTS visit_outcome_check;

-- Drop columns
ALTER TABLE itineraries
  DROP COLUMN IF EXISTS visit_outcome;

ALTER TABLE itineraries
  DROP COLUMN IF EXISTS actual_time_in;

ALTER TABLE itineraries
  DROP COLUMN IF EXISTS actual_time_out;

ALTER TABLE itineraries
  DROP COLUMN IF EXISTS gps_latitude;

ALTER TABLE itineraries
  DROP COLUMN IF EXISTS gps_longitude;

ALTER TABLE itineraries
  DROP COLUMN IF EXISTS gps_address;

-- NOTE: No changes to touchpoints table to rollback
```

### Phase 2: Backend API Updates

**Order of Operations:**
1. Deploy database migration (Phase 1)
2. Update visit record endpoint (`my-day.ts`)
3. Update loan release handler (`approvals.ts`)
4. Run integration tests
5. Deploy to staging

### Phase 3: Testing & Verification

**Integration Tests:**
- Test visit record only creates itinerary, not touchpoint
- Test loan release marks client loan_released, creates itinerary, not touchpoint
- Test rollback scenarios
- Test GPS data capture
- Test visit_outcome validation

**Manual Testing:**
1. Create visit record from mobile app
2. Verify itinerary record created with all fields
3. Verify NO touchpoint created
4. Submit loan release for approval
5. Approve loan release
6. Verify client.loan_released = TRUE
7. Verify NO Touchpoint #7 created
8. Verify itinerary record created with status='loan_released'

---

## Rollback Plan

If issues arise after deployment:

### Option 1: Feature Flags
```typescript
// Add feature flag to temporarily revert
const USE_NEW_VISIT_FLOW = process.env.USE_NEW_VISIT_FLOW !== 'false';

if (USE_NEW_VISIT_FLOW) {
  // New implementation (itinerary only)
} else {
  // Old implementation (creates touchpoint)
}
```

### Option 2: Code Rollback
1. Revert backend changes to `my-day.ts` and `approvals.ts`
2. Redeploy previous version
3. Database schema can remain (new columns are optional)

### Option 3: Data Migration
If existing data needs correction:
```sql
-- Fix any incorrectly created touchpoints
DELETE FROM touchpoints
WHERE touchpoint_number = 0
  AND reason = 'Visit Only';

-- Fix loan release touchpoints (if any)
DELETE FROM touchpoints
WHERE touchpoint_number = 7
  AND reason = 'Loan Release';
```

---

## Performance Considerations

### Database Indexes

**New Indexes Added:**
```sql
CREATE INDEX idx_itineraries_visit_outcome ON itineraries(visit_outcome);
CREATE INDEX idx_itineraries_actual_time ON itineraries(actual_time_in, actual_time_out);
CREATE INDEX idx_itineraries_gps ON itineraries(gps_latitude, gps_longitude);
```

**Rationale:**
- `visit_outcome`: Enables filtering by visit result
- `actual_time`: Enables time-based analytics
- `gps`: Enables location-based queries (future feature)

### Query Performance

**Expected Impact:**
- ✅ **Improved**: Removed unnecessary touchpoint queries for visit-only
- ✅ **Neutral**: Loan release still requires client update + itinerary insert
- ✅ **Improved**: Fewer touchpoint records = smaller table = faster queries

---

## Security Considerations

### Authorization

**Visit Record Only:**
- Requires authentication (JWT token)
- No role restrictions (all authenticated users can record visits)
- User can only record visits for clients in their assigned area

**Loan Release:**
- Requires `admin` role (enforced via `requireRole('admin')`)
- Approval workflow prevents unauthorized releases

### Input Validation

**All GPS Data:**
- Latitude: -90 to 90
- Longitude: -180 to 180
- Address: Max 500 chars

**Time Format:**
- Regex validation: `^\d{2}:\d{2}$`
- Range: 00:00 to 23:59

**Visit Outcome:**
- Enum validation prevents invalid values

---

## Future Enhancements

### Potential Future Features (Out of Scope)

1. **Visit Analytics Dashboard**
   - Use `visit_outcome` for success rate metrics
   - GPS heatmap of visit locations
   - Time-based analytics (actual vs scheduled)

2. **Location-Based Client Assignment**
   - Use GPS data to verify visits occurred at client address
   - Alert if visit location > 500m from client address

3. **Touchpoint #7 Manual Creation**
   - Allow Caravan to create actual Touchpoint #7 after loan release
   - Use new `loan_released` status to indicate context

4. **Visit Photo Integration**
   - Add photo_url to itineraries table
   - Capture proof of visit

---

## Appendix A: Touchpoint vs Itinerary Semantics

### When to Use Each

**Touchpoints:**
- 7-step sales process (numbers 1-7)
- Fixed pattern: Visit → Call → Call → Visit → Call → Call → Visit
- Status: Interested, Undecided, Not Interested, Completed
- Purpose: Track sales progression

**Itineraries:**
- General visit tracking
- Any visit, not just sales touchpoints
- Status: scheduled, in_progress, completed, cancelled, loan_released
- Purpose: Audit trail, attendance tracking, GPS verification

### Decision Flow

```
Is this part of the 7-step sales process?
├─ Yes → Create Touchpoint (1-7)
└─ No → Create Itinerary only
    ├─ Is this a loan release?
    │   ├─ Yes → Update client.loan_released + Itinerary with status='loan_released'
    │   └─ No → Itinerary with status='completed'
```

---

## Appendix B: API Contract Examples

### Visit Record Only Request/Response

**Request:**
```http
POST /api/my-day/clients/123e4567-e89b-12d3-a456-426614174000/visit
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "remarks": "Client asked to call back next week",
  "visit_outcome": "rescheduled",
  "actual_time_in": "09:30",
  "actual_time_out": "09:45",
  "gps_latitude": 14.5995,
  "gps_longitude": 120.9842,
  "gps_address": "Manila, Philippines"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Visit recorded successfully",
  "itinerary_id": "987fcdeb-51a2-43f1-a456-426614174000"
}
```

### Loan Release Request/Response

**Request (Submit for Approval):**
```http
POST /api/approvals/loan-release-v2
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "udi_number": "UDI-2026-001234",
  "product_type": "pension",
  "loan_type": "regular",
  "time_in": "10:00",
  "time_out": "10:30",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "Manila, Philippines",
  "remarks": "Loan released successfully"
}
```

**Response (Approval Created):**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "456e7890-e89b-12d3-a456-426614174000",
  "type": "loan_release_v2",
  "status": "pending",
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "created_at": "2026-04-15T10:00:00Z"
}
```

**Request (Approve):**
```http
POST /api/approvals/456e7890-e89b-12d3-a456-426614174000/approve
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "notes": "Approved - all documents verified"
}
```

**Response (Approved):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Loan release approved",
  "approval_id": "456e7890-e89b-12d3-a456-426614174000",
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "loan_released": true,
  "loan_released_at": "2026-04-15T10:05:00Z",
  "itinerary_id": "789ghijk-e89b-12d3-a456-426614174000"
}
```

---

## Sign-Off

**Design Approved By:** User (via "do 1")
**Date:** 2026-04-15
**Next Step:** Invoke writing-plans skill to create implementation plan

---

**End of Design Document**
