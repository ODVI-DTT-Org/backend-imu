# IMU Database Migrations - March 24, 2025

## Quick Start

Run the complete migration script:
```bash
psql -U postgres -d imu_db -f migrations/RUN_ALL.sql
```

Or run against the production database (using the DATABASE_URL from .env):
```bash
# From backend directory
psql $DATABASE_URL -f migrations/RUN_ALL.sql
```

---

## What These Migrations Fix

### Bug Fix 1: Approvals Navigation Tabs 500 Error ✅
**Problem**: `/api/approvals?type=client` and `/api/approvals?type=udi` returned 500 errors

**Root Cause**:
- Query parameter mismatch: Backend read `touchpoint` but frontend sent `touchpoint_number`
- Missing `role` filter in SQL query
- **Approvals table didn't exist in database**

**Solution**:
- Fixed `backend/src/routes/approvals.ts` to read `touchpoint_number`
- Added `role` parameter handling in WHERE clause
- Created `approvals` table with all required columns

### Bug Fix 2: Itineraries Creation 500 Error ✅
**Problem**: POST `/api/itineraries` returned 500 error

**Root Cause**: `itineraries` table missing `created_by` column

**Solution**:
- Added `created_by UUID REFERENCES users(id)` column to itineraries table
- Updated SELECT queries to JOIN with users table for created_by user details
- Added `created_by` to the expand response with user name

### Bug Fix 3: Municipality Assignments 501 Error ✅
**Problem**: Municipality assignments returned "501 Not Implemented - Please run database migrations"

**Root Cause**: `user_municipalities_simple` table didn't exist

**Solution**:
- Created `user_municipalities_simple` table with proper schema
- Changed FK references from `user_profiles(id)` to `users(id)`
- Removed FK to `municipalities` table (uses TEXT format for PSGC data)
- Added `created_at` and `updated_at` timestamps
- Created proper indexes for efficient queries

---

## Migration Details

### Migration 013: itineraries.created_by Column
```sql
ALTER TABLE itineraries ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
```

### Migration 005: user_municipalities_simple Table
```sql
CREATE TABLE user_municipalities_simple (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,  -- Format: "province-municipality"
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, municipality_id)
);
```

### Migration 014: approvals Table
```sql
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('client', 'udi')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Files Modified

### Backend Routes
- `backend/src/routes/approvals.ts` - Fixed query parameters
- `backend/src/routes/itineraries.ts` - Added created_by JOIN

### Backend Migrations
- `backend/src/migrations/005_add_user_municipalities_simple.sql` - Updated
- `backend/src/migrations/013_add_itineraries_created_by.sql` - Created
- `backend/src/migrations/014_fix_approvals_table.sql` - Created
- `backend/migrations/RUN_ALL.sql` - **RUN THIS FILE**

### Backend Core
- `backend/src/index.ts` - Added /api/migrate and /api/debug endpoints

---

## Verification After Running Migrations

```sql
-- Check itineraries.created_by exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'itineraries' AND column_name = 'created_by';

-- Check user_municipalities_simple exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'user_municipalities_simple';

-- Check approvals table exists with correct columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'approvals'
ORDER BY ordinal_position;
```

---

## Test Credentials
- **Admin**: admin@imu.com / admin123
- **Staff**: test@imu.com / staff123

---

## Rollback (If Needed)

```sql
-- Drop approvals table
DROP TABLE IF EXISTS approvals CASCADE;

-- Drop user_municipalities_simple table
DROP TABLE IF EXISTS user_municipalities_simple CASCADE;

-- Remove created_by from itineraries
ALTER TABLE itineraries DROP COLUMN IF EXISTS created_by;
```
