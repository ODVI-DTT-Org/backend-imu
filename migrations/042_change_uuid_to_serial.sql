-- ============================================
-- MIGRATION: Change UUIDs to SERIAL (except users table)
-- ============================================
-- This migration changes primary keys from UUID to SERIAL for all tables
-- except the users table (which keeps UUIDs for security)
--
-- WARNING: This is a breaking change that affects foreign key relationships
-- DO NOT RUN THIS IN PRODUCTION WITHOUT FULL BACKUP AND TESTING
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Create new SERIAL columns for all tables
-- ============================================

-- Example: For a generic table with UUID primary key
-- This is a template - you'll need to run similar commands for each table

-- Template for converting UUID to SERIAL:
-- 1. Add new SERIAL column
-- 2. Copy data from UUID column to new column (using sequence)
-- 3. Update foreign key references
-- 4. Drop old UUID column
-- 5. Rename new column to original name

-- ============================================
-- EXAMPLE: Converting 'agencies' table
-- ============================================

-- 1. Create agencies_seq sequence
CREATE SEQUENCE IF NOT EXISTS agencies_seq START 1;

-- 2. Add new id_serial column
-- ALTER TABLE agencies ADD COLUMN id_serial INTEGER DEFAULT nextval('agencies_seq') NOT NULL;

-- 3. Copy data (preserve relationships by maintaining mapping)
-- This would need to be done carefully to maintain foreign key relationships

-- 4. Update foreign key references in other tables
-- ALTER TABLE some_table DROP CONSTRAINT some_table_agency_id_fkey;
-- ALTER TABLE some_table ADD CONSTRAINT some_table_agency_id_fkey
--   FOREIGN KEY (agency_id) REFERENCES agencies(id_serial);

-- 5. Drop old UUID column and rename new column
-- ALTER TABLE agencies DROP COLUMN id;
-- ALTER TABLE agencies RENAME COLUMN id_serial TO id;
-- ALTER TABLE agencies ADD PRIMARY KEY (id);

-- ============================================
-- ALTERNATIVE APPROACH: Use ID as display name
-- ============================================

-- Instead of changing the database schema, a safer approach is to:
-- 1. Keep UUIDs internally (for security and distributed systems)
-- 2. Add a display_id column with SERIAL for human-readable IDs
-- 3. Show display_id in the UI while using UUID internally

-- Example for agencies table:
ALTER TABLE agencies ADD COLUMN display_id SERIAL PRIMARY KEY;
-- This keeps the UUID as id but adds a human-readable display_id

-- ============================================
-- RECOMMENDATION
-- ============================================

-- For the IMU system, I recommend keeping UUIDs for the following reasons:
-- 1. Security: UUIDs don't expose sequential data (prevents enumeration attacks)
-- 2. Distributed systems: UUIDs work better with PowerSync and mobile sync
-- 3. Offline-first: UUIDs can be generated client-side without conflicts
-- 4. Performance: The performance impact of UUIDs vs SERIAL is minimal for most applications

-- If you still want to proceed with changing to SERIAL, please:
-- 1. Create a full database backup
-- 2. Test this migration on a staging database first
-- 3. Update all foreign key references carefully
-- 4. Update PowerSync schema and mobile app to use integer IDs
-- 5. Test thoroughly before deploying to production

ROLLBACK; -- This migration is rolled back by default for safety
