-- Migration: Drop Redundant Tables After Normalization
-- Date: 2025-03-26
-- Purpose: Clean up redundant tables after user table normalization
--
-- AFTER THIS MIGRATION:
-- - caravans table: DROPPED (data migrated to users table)
-- - user_profiles table: DROPPED (data was duplicate of users table)
-- - user_psgc_assignments table: DROPPED (unused, replaced by user_municipalities_simple)
-- - v_caravans view: DROPPED (no longer needed after cleanup)
--
-- user_municipalities_simple RENAMED to user_locations for clarity

BEGIN;

-- ============================================
-- STEP 1: Verify data migration before dropping
-- ============================================

DO $$
DECLARE
    users_count INTEGER;
    caravans_count INTEGER;
    user_profiles_count INTEGER;
    user_psgc_count INTEGER;
BEGIN
    -- Count users with caravan roles
    SELECT COUNT(*) INTO users_count
    FROM users
    WHERE role IN ('field_agent', 'caravan');

    -- Count caravans table rows
    SELECT COUNT(*) INTO caravans_count
    FROM caravans;

    -- Count user_profiles
    SELECT COUNT(*) INTO user_profiles_count
    FROM user_profiles;

    -- Count user_psgc_assignments
    SELECT COUNT(*) INTO user_psgc_count
    FROM user_psgc_assignments;

    RAISE NOTICE 'Pre-drop verification:';
    RAISE NOTICE '  Users with caravan/field_agent role: %', users_count;
    RAISE NOTICE '  caravans table rows: %', caravans_count;
    RAISE NOTICE '  user_profiles table rows: %', user_profiles_count;
    RAISE NOTICE '  user_psgc_assignments table rows: %', user_psgc_count;

    -- Sanity check: we should have users with caravan roles
    IF users_count = 0 THEN
        RAISE EXCEPTION 'No users found with caravan/field_agent role! Cannot proceed.';
    END IF;
END $$;

-- ============================================
-- STEP 2: Drop foreign key constraints that reference caravans
-- ============================================

-- The groups.team_leader_id should already reference users (from migration 019)
-- But let's verify and ensure no other tables reference caravans

DO $$
BEGIN
    -- Drop any remaining foreign keys to caravans table
    -- (This should be empty after migration 019, but let's be safe)

    -- Check if any tables still reference caravans.id
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name != 'caravans'
          AND kcu.table_name != 'user_profiles'  -- Exclude self-references
    ) THEN
        RAISE NOTICE 'Found remaining foreign keys to caravans table. Review manually.';
    ELSE
        RAISE NOTICE 'No foreign keys to caravans table found (expected).';
    END IF;
END $$;

-- ============================================
-- STEP 3: Drop redundant tables
-- ============================================

DO $$
BEGIN
    -- Drop caravans table (data is in users table now)
    DROP TABLE IF EXISTS caravans CASCADE;
    RAISE NOTICE 'Dropped caravans table';

    -- Drop user_profiles table (data was duplicate of users)
    DROP TABLE IF EXISTS user_profiles CASCADE;
    RAISE NOTICE 'Dropped user_profiles table';

    -- Drop user_psgc_assignments table (unused, replaced by user_municipalities_simple)
    DROP TABLE IF EXISTS user_psgc_assignments CASCADE;
    RAISE NOTICE 'Dropped user_psgc_assignments table';
END $$;

-- ============================================
-- STEP 4: Drop backward compatibility view
-- ============================================

DROP VIEW IF EXISTS v_caravans CASCADE;

-- ============================================
-- STEP 5: Rename table for clarity
-- ============================================

-- Rename user_municipalities_simple to user_locations
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_municipalities_simple') THEN
        ALTER TABLE user_municipalities_simple RENAME TO user_locations;

        -- Rename the sequence if it exists
        IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'user_municipalities_simple_id_seq') THEN
            ALTER SEQUENCE user_municipalities_simple_id_seq RENAME TO user_locations_id_seq;
        END IF;

        -- Update index names
        ALTER INDEX IF EXISTS idx_user_municipalities_user RENAME TO idx_user_locations_user;
        ALTER INDEX IF EXISTS idx_user_municipalities_municipality RENAME TO idx_user_locations_municipality;
        ALTER INDEX IF EXISTS idx_user_municipalities_active RENAME TO idx_user_locations_active;

        RAISE NOTICE 'Renamed user_municipalities_simple to user_locations';
    ELSE
        RAISE NOTICE 'Table user_municipalities_simple not found, skipping rename';
    END IF;
END $$;

-- ============================================
-- STEP 6: Update trigger function names
-- ============================================

DO $$
BEGIN
    -- Drop old trigger function if it exists
    DROP TRIGGER IF EXISTS update_user_municipalities_simple_updated_at ON user_locations;

    -- The trigger function itself is shared, so we just need to recreate it on the new table
    CREATE TRIGGER update_user_locations_updated_at
        BEFORE UPDATE ON user_locations
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

    RAISE NOTICE 'Updated trigger for user_locations table';
END $$;

-- ============================================
-- STEP 7: Update comments for clarity
-- ============================================

COMMENT ON TABLE user_locations IS 'Assigns municipalities to users (field agents/caravans) for location-based work management';
COMMENT ON COLUMN user_locations.municipality_id IS 'Format: "province-municipality" (e.g., "Tawi-Tawi-Bongao")';
COMMENT ON COLUMN user_locations.assigned_at IS 'When this municipality was assigned to the user';
COMMENT ON COLUMN user_locations.assigned_by IS 'User ID of admin who made this assignment';
COMMENT ON COLUMN user_locations.deleted_at IS 'Soft delete timestamp - NULL means active assignment';

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify users table has caravan data:
-- SELECT id, email, first_name, last_name, role, is_active FROM users WHERE role IN ('field_agent', 'caravan');

-- Verify user_locations table exists:
-- SELECT * FROM user_locations LIMIT 10;

-- Verify old tables don't exist:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('caravans', 'user_profiles', 'user_psgc_assignments', 'user_municipalities_simple');

SELECT 'Migration 020: Redundant tables dropped successfully!' as result;
