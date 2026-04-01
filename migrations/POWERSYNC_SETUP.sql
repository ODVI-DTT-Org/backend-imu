-- ============================================================
-- PowerSync Publication Setup for IMU
-- ============================================================
-- This script sets up PostgreSQL publication for PowerSync sync
-- PowerSync uses logical replication to sync data to mobile devices
--
-- IMPORTANT: Run this after creating the database schema
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: DROP EXISTING PUBLICATION (if any)
-- ============================================================

-- This allows you to recreate the publication if needed
DROP PUBLICATION IF EXISTS powersync;

-- ============================================================
-- STEP 2: CREATE POWERYNC PUBLICATION
-- ============================================================
-- PowerSync publication includes tables that need to be synced
-- to mobile devices for offline-first functionality

CREATE PUBLICATION powersync FOR TABLE
    -- Core data tables
    clients,
    itineraries,
    touchpoints,

    -- Related data tables
    addresses,
    phone_numbers,

    -- User profile table (for PowerSync sync metadata)
    user_profiles,

    -- User location assignments (for municipality-based filtering)
    user_locations,

    -- Approvals (for caravan/tele approval workflow)
    approvals,

    -- PSGC geographic data (for location picker)
    psgc,

    -- Touchpoint reasons (global data for touchpoint form dropdowns)
    touchpoint_reasons;

-- ============================================================
-- STEP 3: VERIFY PUBLICATION
-- ============================================================

-- Check that publication was created
DO $$
DECLARE
    pub_exists BOOLEAN;
    table_count INTEGER;
BEGIN
    SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname = 'powersync') INTO pub_exists;

    IF pub_exists THEN
        RAISE NOTICE '✅ PowerSync publication "powersync" created successfully';

        -- Show which tables are in the publication
        SELECT COUNT(*) INTO table_count
        FROM pg_publication_tables
        WHERE pubname = 'powersync';

        RAISE NOTICE '✅ Publication includes % tables', table_count;
    ELSE
        RAISE EXCEPTION '❌ Failed to create PowerSync publication';
    END IF;
END $$;

-- ============================================================
-- OPTIONAL: ADD MORE TABLES TO PUBLICATION
-- ============================================================
-- If you need to sync additional tables, use ALTER PUBLICATION:
--
-- ALTER PUBLICATION powersync ADD TABLE table_name;
--
-- Examples:
-- ALTER PUBLICATION powersync ADD TABLE agencies;
-- ALTER PUBLICATION powersync ADD TABLE groups;
-- ALTER PUBLICATION powersync ADD TABLE group_members;
-- ALTER PUBLICATION powersync ADD TABLE user_locations;

-- ============================================================
-- OPTIONAL: REMOVE TABLES FROM PUBLICATION
-- ============================================================
-- If you need to stop syncing a table, use ALTER PUBLICATION:
--
-- ALTER PUBLICATION powersync DROP TABLE table_name;

COMMIT;

-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- To view all publications:
-- SELECT * FROM pg_publication;

-- To view tables in a publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'powersync';

-- To drop a publication:
-- DROP PUBLICATION powersync;

-- ============================================================
-- POWERYNC REQUIREMENTS
-- ============================================================
--
-- PowerSync requires PostgreSQL logical replication to be enabled.
-- Check your postgresql.conf file for these settings:
--
-- wal_level = logical
-- max_replication_slots = 4 (or more)
-- max_wal_senders = 4 (or more)
--
-- After changing postgresql.conf, restart PostgreSQL.
--
-- For DigitalOcean App Platform:
-- These settings are already enabled by default.
--
-- For local development:
-- You may need to enable logical replication in your PostgreSQL config.
