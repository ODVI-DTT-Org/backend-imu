# Database Normalization Analysis

**Date:** 2025-03-26
**Database:** IMU (Itinerary Manager - Uniformed)
**Purpose:** Identify redundancy, normalization issues, and recommended fixes

---

## Executive Summary

The IMU database has **significant normalization issues** that cause:
- Data duplication across multiple tables
- Synchronization problems
- Confusing foreign key relationships
- The location assignment bug we just encountered

**Critical Issues Found:**
1. `users`, `caravans`, and `user_profiles` tables duplicate the same data
2. Multiple conflicting location assignment tables
3. Inconsistent foreign key references (caravan_id points to different tables)
4. Unused/legacy tables causing confusion

---

## Table Structure Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CURRENT SCHEMA                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │   users     │    │  caravans   │    │   user_profiles     │    │
│  ├─────────────┤    ├─────────────┤    ├─────────────────────┤    │
│  │ id (PK)     │───▶│ id (PK)     │    │ id (PK)             │    │
│  │ email       │    │ user_id (FK)│───▶│ user_id (FK)        │    │
│  │ first_name  │    │ first_name  │    │ name (dupe!)        │    │
│  │ last_name   │    │ last_name   │    │ email (dupe!)       │    │
│  │ role        │    │ email       │    │ role (dupe!)        │    │
│  │ phone       │    │ phone       │    │ avatar_url          │    │
│  │ password    │    │ agency_id   │    │                     │    │
│  └─────────────┘    │ is_active   │    └─────────────────────┘    │
│                     └─────────────┘                                │
│                          ▲         ▲                                │
│                          │         │                                │
│                    (duplicates)(duplicates)                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              LOCATION ASSIGNMENT (3 tables!)                  │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  user_municipalities_simple  │  user_psgc_assignments        │  │
│  │  ┌─────────────────────────┐│ ┌─────────────────────────┐  │  │
│  │  │ user_id + municipality  ││ │ user_id + psgc_id        │  │  │
│  │  │ (TEXT: "prov-city")     ││ │ (INTEGER)               │  │  │
│  │  └─────────────────────────┘│ └─────────────────────────┘  │  │
│  │                                                            │  │
│  │  group_municipalities                                     │  │
│  │  ┌─────────────────────────┐                              │  │
│  │  │ group_id + municipality │                              │  │
│  │  └─────────────────────────┘                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Issue 1: User Data Triplication (CRITICAL)

### Tables Involved
- `users`
- `caravans`
- `user_profiles`

### Duplication Analysis

| Field | users | caravans | user_profiles |
|-------|-------|----------|---------------|
| ID | `id` (UUID) | `id` (different UUID!) | `id` (different UUID!) |
| User Reference | primary | `user_id` (FK) | `user_id` (FK) |
| First Name | ✅ | ✅ (duplicate) | ❌ |
| Last Name | ✅ | ✅ (duplicate) | ❌ |
| Name | ❌ | ❌ | ✅ (duplicate of first+last) |
| Email | ✅ | ✅ (duplicate) | ✅ (duplicate) |
| Phone | ✅ | ✅ (duplicate) | ❌ |
| Role | ✅ | ❌ | ✅ (duplicate) |
| Avatar | ✅ | ❌ | ✅ (duplicate) |
| Password | ✅ | ❌ | ❌ |
| Is Active | ❌ | ✅ | ❌ |

### Problems Caused

1. **Synchronization Issues**
   - Update user email in `users` → not reflected in `caravans` or `user_profiles`
   - Update phone in `users` → not reflected in `caravans`

2. **Confusion About Which ID to Use**
   - `clients.caravan_id` references `users(id)` NOT `caravans(id)`
   - `groups.team_leader_id` references `caravans(id)`
   - Code doesn't know which table to query

3. **The Bug We Just Fixed**
   - Creating a user didn't create the `caravans` entry
   - Municipality assignment failed because `caravans.user_id` was NULL

### Current Usage Analysis

```sql
-- What references what?
clients.caravan_id        → users(id)      -- NOT caravans!
touchpoints.caravan_id    → users(id)      -- NOT caravans!
itineraries.caravan_id    → users(id)      -- NOT caravans!
approvals.caravan_id      → users(id)      -- NOT caravans!
groups.team_leader_id     → caravans(id)   -- This one uses caravans!
```

### Root Cause

The `caravans` table was created to solve "caravans table referenced in foreign keys but never created" but it:
- Duplicated user data instead of referencing it
- Created confusion about which ID to use
- Only ONE foreign key actually uses it (`groups.team_leader_id`)

---

## Issue 2: Multiple Location Assignment Tables

### Tables Involved
- `user_municipalities_simple`
- `user_psgc_assignments`
- `group_municipalities`

### Duplication Analysis

| Table | User Column | Location Column | Location Type | Purpose |
|-------|-------------|-----------------|---------------|---------|
| `user_municipalities_simple` | `user_id` (UUID) | `municipality_id` (TEXT) | "province-city" | User location assignments |
| `user_psgc_assignments` | `user_id` (UUID) | `psgc_id` (INTEGER) | Foreign key to `psgc.id` | User location assignments (LEGACY?) |
| `group_municipalities` | `group_id` (UUID) | `municipality_id` (TEXT) | "province-city" | Group location assignments |

### Problems

1. **Two Tables for Same Purpose**
   - Both `user_municipalities_simple` and `user_psgc_assignments` assign locations to users
   - Which one is the source of truth?
   - Code might query one but insert into the other

2. **Different Location ID Formats**
   - `user_municipalities_simple.municipality_id` = TEXT "province-city"
   - `user_psgc_assignments.psgc_id` = INTEGER (foreign key to `psgc.id`)
   - These reference the SAME data but in different ways

3. **Inconsistent Foreign Keys**
   - `user_psgc_assignments.psgc_id` → `psgc(id)` ✅ Proper FK
   - `user_municipalities_simple.municipality_id` → ❌ No FK (just TEXT)

### Current Usage

```sql
-- Code currently uses user_municipalities_simple
POST /api/caravans/:id/municipalities  → user_municipalities_simple
GET  /api/caravans/:id/municipalities  → user_municipalities_simple

-- user_psgc_assignments appears to be legacy/unused
-- No API endpoints currently use it
```

---

## Issue 3: Unused/Legacy Tables

### `user_profiles` Table

| Column | Value | Status |
|--------|-------|--------|
| All fields | Duplicates `users` table | **REDUNDANT** |
| Foreign key references | `user_profiles.user_id` → `users.id` | Points to users |
| PowerSync publication | ✅ Published | But duplicates data! |

**Recommendation:** This table serves no purpose. All data exists in `users`.

---

## Issue 4: Inconsistent `caravan_id` Foreign Keys

### The Problem

`caravan_id` in different tables points to **different tables**:

| Table | Column | References |
|-------|--------|------------|
| `clients` | `caravan_id` | `users(id)` |
| `touchpoints` | `caravan_id` | `users(id)` |
| `itineraries` | `caravan_id` | `users(id)` |
| `approvals` | `caravan_id` | `users(id)` |
| `groups` | `team_leader_id` | `caravans(id)` |

### Why This Happened

- Most tables were created to reference `users.id` where `role IN ('caravan', 'field_agent')`
- Later, `caravans` table was created as a separate entity
- No migration updated the foreign keys

### Impact

```sql
-- This query is WRONG if you want caravan data:
SELECT * FROM caravans WHERE id = (SELECT caravan_id FROM clients LIMIT 1);

-- This query is CORRECT:
SELECT * FROM users WHERE id = (SELECT caravan_id FROM clients LIMIT 1);
```

---

## Recommended Normalization

### Option 1: Simplify to Single `users` Table (RECOMMENDED)

```sql
-- Add is_active to users
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Remove redundant tables
DROP TABLE IF EXISTS caravans CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- Update groups.team_leader_id to reference users
ALTER TABLE groups DROP CONSTRAINT groups_team_leader_id_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_team_leader_id_fkey
  FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL;

-- Filter caravans by role:
SELECT * FROM users WHERE role IN ('field_agent', 'caravan');
```

**Pros:**
- Simplest solution
- Eliminates all duplication
- Fixes the synchronization issue
- Clear what ID to use everywhere

**Cons:**
- Need to migrate any caravan-specific data (but there isn't any beyond is_active)

---

### Option 2: Proper 1:1 Relationship (IF caravan-specific data is needed)

```sql
-- Remove duplicated fields from caravans
ALTER TABLE caravans
  DROP COLUMN first_name,
  DROP COLUMN last_name,
  DROP COLUMN email,
  DROP COLUMN phone;

-- Keep only caravan-specific fields:
-- - id (primary key)
-- - user_id (foreign key to users)
-- - agency_id
-- - is_active

-- Query caravan data with user info:
SELECT c.*, u.first_name, u.last_name, u.email, u.phone
FROM caravans c
JOIN users u ON c.user_id = u.id;
```

**Pros:**
- Keeps caravan as a separate entity
- No data duplication
- Proper normalization

**Cons:**
- More complex queries (always need JOIN)
- Still have confusion about which ID to use

---

## Location Assignment Consolidation

### Recommended: Single Table with Proper FK

```sql
-- Drop the unused table
DROP TABLE IF EXISTS user_psgc_assignments CASCADE;

-- Rename for clarity
ALTER TABLE user_municipalities_simple RENAME TO user_locations;

-- Add proper foreign key to psgc
-- First, ensure psgc table has a computed municipality_id column
ALTER TABLE psgc ADD COLUMN municipality_id_gen GENERATED ALWAYS AS (
  TRIM(province) || '-' || TRIM(mun_city)
) STORED;

CREATE INDEX idx_psgc_municipality_id_gen ON psgc(municipality_id_gen);

-- Add foreign key constraint
ALTER TABLE user_locations
  ADD CONSTRAINT user_locations_municipality_id_fkey
  FOREIGN KEY (municipality_id)
  REFERENCES psgc(municipality_id_gen);

-- Now we have:
-- user_locations: user_id + municipality_id (with proper FK)
-- group_municipalities: group_id + municipality_id
```

---

## Migration Plan

### Phase 1: Fix User Tables (HIGH PRIORITY)

1. **Add `is_active` to `users`**
   ```sql
   ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
   ```

2. **Migrate caravan data to users**
   ```sql
   UPDATE users
   SET is_active = COALESCE(c.is_active, true)
   FROM caravans c
   WHERE users.id = c.user_id;
   ```

3. **Update foreign key in groups**
   ```sql
   ALTER TABLE groups
     DROP CONSTRAINT groups_team_leader_id_fkey;

   ALTER TABLE groups
     ADD CONSTRAINT groups_team_leader_id_fkey
     FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL;
   ```

4. **Drop redundant tables**
   ```sql
   DROP TABLE IF EXISTS caravans CASCADE;
   DROP TABLE IF EXISTS user_profiles CASCADE;
   ```

5. **Update API endpoints**
   - Change `/api/caravans` to filter `users` by role
   - Update all references to `caravan.id` to use `user.id`

### Phase 2: Consolidate Location Assignments

1. **Drop unused table**
   ```sql
   DROP TABLE IF EXISTS user_psgc_assignments CASCADE;
   ```

2. **Rename for clarity**
   ```sql
   ALTER TABLE user_municipalities_simple RENAME TO user_locations;
   ```

3. **Add proper foreign key** (optional, requires PSGC changes)

### Phase 3: Update Application Code

1. **Update TypeScript types**
2. **Update API routes**
3. **Update frontend components**
4. **Update queries**

---

## Summary of Changes

| Action | Table | Change | Impact |
|--------|-------|--------|--------|
| ADD COLUMN | `users` | `is_active BOOLEAN` | Enables dropping caravans |
| DROP TABLE | `caravans` | Entire table | Eliminates duplication |
| DROP TABLE | `user_profiles` | Entire table | Eliminates duplication |
| DROP TABLE | `user_psgc_assignments` | Entire table | Eliminates confusion |
| RENAME TABLE | `user_municipalities_simple` → `user_locations` | Name only | Clearer purpose |
| UPDATE FK | `groups.team_leader_id` | Reference `users(id)` | Consistency |
| UPDATE CODE | All files | Use `users` table | Fixes bugs |

---

## Questions for Team

1. **Is there any caravan-specific data** that needs to be preserved beyond `is_active`?
2. **Why was `user_profiles` created?** Is it used by PowerSync?
3. **Why are there two location assignment tables?** Which one should be the source of truth?
4. **Can we deprecate the "caravan" terminology** and just use "field_agent" or "user" everywhere?

---

## Migration Status: IN PROGRESS ✅

**Started:** 2025-03-26
**Current Status:** Backend complete, frontend testing pending

### Completed ✅

1. ✅ **Migration 019 created and executed**
   - Added `is_active` column to users table
   - Migrated data from caravans to users (7 rows)
   - Updated groups.team_leader_id FK to reference users
   - Created backward compatibility view

2. ✅ **Backend API updated**
   - `backend/src/routes/caravans.ts` fully migrated to use users table
   - All endpoints now query users with role filter
   - API remains 100% backward compatible

### Pending ⏸

1. ⏸️ **Test all functionality**
2. ⏸️ **Update frontend types** (optional cleanup)
3. ⏸️ **Drop redundant tables** (after testing)

### See Progress Document

Detailed progress tracking: `docs/database-normalization-progress.md`

---

## Next Steps

1. ✅ **Review this document** with the team
2. ✅ **Decide on Option 1** (SIMPLIFIED - chosen)
3. ✅ **Create migration scripts** (DONE - 019_normalize_user_tables.sql)
4. ⏳ **Test in development environment**
5. ⏳ **Deploy to production**
