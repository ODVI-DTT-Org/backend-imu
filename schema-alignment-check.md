# Schema Alignment Check Report

## Critical Issues Found:

### 1. ❌ releases.visit_id Constraint
**Schema:** `visit_id UUID NOT NULL` (line 202)
**Implementation:** Expects nullable for admin direct releases and Tele releases
**Impact:** Admin and Tele loan releases will fail
**Fix Required:** Schema migration needed to make nullable

### 2. ❌ releases.call_id Missing
**Schema:** No call_id column exists
**Implementation:** Uses call_id for Tele releases
**Impact:** Tele loan releases will fail
**Fix Required:** Schema migration to add call_id column

### 3. ❌ calls.type Missing
**Schema:** No type column in calls table
**Implementation:** Uses type='release_loan' for loan release calls
**Impact:** Cannot distinguish loan release calls from regular calls
**Fix Required:** Schema migration to add type column

### 4. ❌ approvals.type Enum Constraint
**Schema:** `CHECK (type IN ('client', 'udi'))` (line 317)
**Implementation:** Uses 'loan_release_v2', 'address_add', 'phone_add'
**Impact:** All new approval types will fail
**Fix Required:** Schema migration to update enum constraint

### 5. ⚠️ itineraries.status Values
**Schema:** `status TEXT DEFAULT 'pending'` (no enum constraint)
**Implementation:** Uses 'in_progress', 'completed'
**Impact:** Should work (no constraint) but not documented in schema
**Fix Required:** Update schema documentation or add constraint

## Missing Constraint for releases.visit_id/call_id:
**Schema:** No constraint to ensure only one is set
**Implementation:** Expects release_activity_check constraint
**Fix Required:** Schema migration to add constraint

