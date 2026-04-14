# Production Schema Review - Critical Issues & Recommendations

**Date:** 2026-04-10
**Schema Version:** 999_production_schema.sql
**Reviewer:** Claude Code
**Priority:** HIGH - Address before production deployment

---

## 🔴 CRITICAL ISSUES (Must Fix Before Production)

### 1. Missing Foreign Key Constraints ⚠️ CRITICAL

**Impact:** HIGH - Data Integrity Risk
**Risk:** Orphaned records, referential integrity violations

**Affected Tables:**
- `addresses.client_id` → `clients.id` (NO FK)
- `phone_numbers.client_id` → `clients.id` (NO FK)
- `visits.client_id` → `clients.id` (NO FK)
- `visits.user_id` → `users.id` (NO FK)
- `calls.client_id` → `clients.id` (NO FK)
- `calls.user_id` → `users.id` (NO FK)
- `releases.client_id` → `clients.id` (NO FK)
- `releases.user_id` → `users.id` (NO FK)
- `releases.visit_id` → `visits.id` (NO FK)
- `touchpoints.client_id` → `clients.id` (NO FK)
- `touchpoints.user_id` → `users.id` (NO FK)
- `touchpoints.visit_id` → `visits.id` (NO FK)
- `touchpoints.call_id` → `calls.id` (NO FK)
- `itineraries.client_id` → `clients.id` (NO FK)
- `itineraries.user_id` → `users.id` (NO FK)
- `itineraries.created_by` → `users.id` (NO FK)
- `approvals.client_id` → `clients.id` (NO FK)
- `approvals.user_id` → `users.id` (NO FK)
- `approvals.approved_by` → `users.id` (NO FK)
- `approvals.rejected_by` → `users.id` (NO FK)
- `agencies_id` in clients table (NO FK)
- `user_id` in clients table (NO FK)
- `user_id` in user_locations (NO FK)
- `user_id` in user_profiles (NO FK)
- `uploaded_by` in files (NO FK)
- `created_by` in targets (NO FK)
- `created_by` in report_jobs (NO FK)
- `created_by` in scheduled_reports (NO FK)
- `group_id` references (NO FK)
- `role_id` references (NO FK)

**Only 1 FK exists:** `releases.approved_by → users.id`

**Recommendation:**
```sql
-- Add all missing foreign keys
ALTER TABLE addresses
  ADD CONSTRAINT addresses_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE visits
  ADD CONSTRAINT visits_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  ADD CONSTRAINT visits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Continue for all tables...
```

---

### 2. Password Storage Security ⚠️ CRITICAL

**Issue:** `password_hash` column exists but no validation for minimum hash strength

**Current:**
```sql
password_hash text NOT NULL,
```

**Recommendation:**
```sql
-- Add constraint to ensure bcrypt hash format
ALTER TABLE users
  ADD CONSTRAINT users_password_hash_format
  CHECK (password_hash ~ '^ \$2[aby]?\$[0-9]{2}\$[./A-Za-z0-9]{53}$');

-- Add minimum length constraint
ALTER TABLE users
  ADD CONSTRAINT users_password_hash_min_length
  CHECK (LENGTH(password_hash) >= 60);
```

---

### 3. Missing NOT NULL Constraints on Critical Fields

**Affected Fields:**
- `users.email` - Should have validation constraint
- `users.phone` - Missing format validation
- `clients.email` - No format validation
- `clients.phone` - No format validation
- `phone_numbers.number` - No format validation

**Recommendation:**
```sql
-- Email format validation
ALTER TABLE users
  ADD CONSTRAINT users_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

-- Phone number format (Philippines)
ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_number_format
  CHECK (number ~ '^(09|\+639)\d{9}$');
```

---

### 4. Missing Indexes on Foreign Keys ⚠️ PERFORMANCE

**Issue:** Foreign key columns need indexes for JOIN performance

**Missing Indexes:**
```sql
-- These should be added after FKs are created
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON public.visits USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_releases_user_id ON public.releases USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_id ON public.touchpoints USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON public.itineraries USING btree (user_id);
```

---

## 🟡 IMPORTANT ISSUES (Should Fix)

### 5. Time Data Type Inconsistency

**Issue:** `time_arrival` and `time_departure` in `visits` table are TEXT instead of TIME

**Current:**
```sql
time_arrival text,  -- HH:MM format as text
time_departure text,  -- HH:MM format as text
```

**Problems:**
- No automatic validation of time format
- Can't use time-based functions
- No time zone awareness
- Potential for invalid data

**Recommendation:**
```sql
-- Option 1: Use TIME type (better)
ALTER TABLE visits
  ALTER COLUMN time_arrival TYPE time USING time_arrival::time,
  ALTER COLUMN time_departure TYPE time USING time_departure::time;

-- Option 2: Keep as text but add constraint
ALTER TABLE visits
  ADD CONSTRAINT visits_time_arrival_format
  CHECK (time_arrival ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$');
```

---

### 6. Missing Check Constraints for Data Validation

**Issues:**

**Visits table:**
```sql
-- Missing: GPS coordinate ranges
ALTER TABLE visits
  ADD CONSTRAINT visits_latitude_range
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT visits_longitude_range
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
```

**Calls table:**
```sql
-- Missing: Duration validation
ALTER TABLE calls
  ADD CONSTRAINT calls_duration_positive
  CHECK (duration IS NULL OR duration >= 0);
```

**Releases table:**
```sql
-- Missing: Amount validation
ALTER TABLE releases
  ADD CONSTRAINT releases_amount_positive
  CHECK (amount > 0);
```

---

### 7. Soft Delete Index Performance Issue

**Issue:** Partial indexes on `deleted_at` may not be optimal

**Current:**
```sql
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at
  ON public.addresses USING btree (deleted_at)
  WHERE (deleted_at IS NULL);
```

**Problem:** This index only helps when filtering for active records, but not when filtering for deleted records.

**Recommendation:**
```sql
-- Add index for deleted records too
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at_include
  ON public.addresses USING btree (deleted_at);

-- Or better: Use composite index
CREATE INDEX IF NOT EXISTS idx_addresses_client_deleted
  ON public.addresses USING btree (client_id, deleted_at);
```

---

### 8. Missing Composite Indexes for Common Queries

**Likely Query Patterns:**
```sql
-- Get client with primary address
CREATE INDEX IF NOT EXISTS idx_addresses_client_primary
  ON public.addresses USING btree (client_id, is_primary)
  WHERE (deleted_at IS NULL);

-- Get visits with client and user
CREATE INDEX IF NOT EXISTS idx_visits_client_user_date
  ON public.visits USING btree (client_id, user_id, created_at DESC);

-- Get calls with client and date range
CREATE INDEX IF NOT EXISTS idx_calls_client_dial_time
  ON public.calls USING btree (client_id, dial_time DESC);
```

---

## 🟢 MINOR ISSUES (Nice to Have)

### 9. Missing Table Comments

**Add for documentation:**
```sql
COMMENT ON TABLE public.users IS 'User accounts with authentication and role assignments';
COMMENT ON TABLE public.clients IS 'Client database with fuzzy search support';
COMMENT ON TABLE public.visits IS 'Physical visit records with GPS tracking';
COMMENT ON TABLE public.calls IS 'Phone call records with duration tracking';
COMMENT ON TABLE public.releases IS 'Loan release events with approval workflow';
```

---

### 10. Trigger Performance Concern

**Issue:** `ensure_single_primary_address` and `ensure_single_primary_phone` triggers run UPDATE on every INSERT/UPDATE

**Current:**
```sql
UPDATE addresses
SET is_primary = false
WHERE client_id = NEW.client_id
  AND id != NEW.id
  AND is_primary = true
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);
```

**Problem:** No index on `(client_id, is_primary, deleted_at)` for this query

**Recommendation:**
```sql
CREATE INDEX IF NOT EXISTS idx_addresses_client_primary_deleted
  ON public.addresses USING btree (client_id, is_primary, deleted_at);
```

---

### 11. Missing Transaction Wrappers

**Issue:** Schema creation should be wrapped in transaction for atomicity

**Recommendation:**
```sql
BEGIN;

-- All schema creation here

COMMIT;
```

---

### 12. No Database Versioning

**Issue:** No schema version table to track migrations

**Recommendation:**
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz DEFAULT now() NOT NULL,
    description text
);

-- Insert current version
INSERT INTO schema_migrations (version, description)
VALUES ('1.0.0', 'Initial production schema');
```

---

## 🔒 SECURITY CONCERNS

### 13. No Row-Level Security (RLS)

**Recommendation for Multi-Tenant Security:**
```sql
-- Enable RLS on sensitive tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY clients_isolation_policy ON clients
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id')::uuid
    OR EXISTS (
      SELECT 1 FROM user_permissions_view
      WHERE user_id = current_setting('app.current_user_id')::uuid
        AND resource = 'clients'
        AND action IN ('read', 'update', 'delete')
    )
  );
```

---

### 14. Missing Audit Trail for Sensitive Data

**Recommendation:**
```sql
-- Add audit columns to sensitive tables
ALTER TABLE users
  ADD COLUMN created_by uuid,
  ADD COLUMN updated_by uuid,
  ADD COLUMN last_login_ip inet;

ALTER TABLE clients
  ADD COLUMN created_by uuid,
  ADD COLUMN updated_by uuid;
```

---

## 📊 MONITORING & MAINTENANCE

### 15. Missing Autovacuum Tuning

**Recommendation:**
```sql
-- Tune autovacuum for high-traffic tables
ALTER TABLE visits SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE calls SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE touchpoints SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE audit_logs SET (autovacuum_vacuum_scale_factor = 0.05);

-- Increase autovacuum analyze scale for tables with frequent updates
ALTER TABLE clients SET (autovacuum_analyze_scale_factor = 0.05);
```

---

### 16. Missing Statistics Target

**Recommendation:**
```sql
-- Increase statistics target for columns used in JOINs
ALTER TABLE visits ALTER COLUMN client_id SET STATISTICS 100;
ALTER TABLE visits ALTER COLUMN user_id SET STATISTICS 100;
ALTER TABLE calls ALTER COLUMN client_id SET STATISTICS 100;
ALTER TABLE clients ALTER COLUMN full_name SET STATISTICS 100;
```

---

## ✅ COMPLIANCE CHECKLIST

### Data Privacy
- [ ] Add GDPR compliance fields (data retention, consent tracking)
- [ ] Implement right to be forgotten (cascade deletes)
- [ ] Add data classification metadata

### Performance
- [ ] Set up connection pooling configuration
- [ ] Configure work_mem and maintenance_work_mem
- [ ] Set up partitioning for large tables (audit_logs, error_logs)

### High Availability
- [ ] Set up streaming replication
- [ ] Configure failover mechanism
- [ ] Implement backup verification

### Monitoring
- [ ] Set up query performance monitoring
- [ ] Configure slow query logging
- [ ] Set up bloat monitoring
- [ ] Create alert rules for critical metrics

---

## 📋 IMMEDIATE ACTION ITEMS

### Before Production Deployment:

1. **HIGH PRIORITY:**
   - [ ] Add all missing foreign key constraints
   - [ ] Add password hash format validation
   - [ ] Add email format validation
   - [ ] Add phone number format validation
   - [ ] Add missing indexes on foreign keys

2. **MEDIUM PRIORITY:**
   - [ ] Fix time data type inconsistency
   - [ ] Add check constraints for validation
   - [ ] Add composite indexes for common queries
   - [ ] Optimize trigger performance

3. **LOW PRIORITY:**
   - [ ] Add table comments
   - [ ] Implement row-level security
   - [ ] Add audit trail columns
   - [ ] Set up autovacuum tuning

---

## 🎯 RECOMMENDED PRODUCTION SCHEMA FIX

Create a new file: `backend/src/migrations/1000_production_schema_fixes.sql`

This should include:
1. All missing foreign keys
2. All validation constraints
3. All missing indexes
4. Transaction wrapper
5. Schema versioning table

---

## 📞 NEXT STEPS

1. **Review this document** with your team
2. **Prioritize fixes** based on your timeline
3. **Create migration script** for fixes
4. **Test on staging** before production
5. **Implement monitoring** before going live
6. **Create rollback plan** in case of issues

---

**Severity Legend:**
- 🔴 CRITICAL - Must fix before production
- 🟡 IMPORTANT - Should fix before production
- 🟢 MINOR - Nice to have

**Overall Assessment:** 🟡 **NOT PRODUCTION READY** - Requires critical fixes before deployment
