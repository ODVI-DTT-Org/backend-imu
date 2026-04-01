-- Migration: Normalize User Tables - Eliminate Duplication
-- Date: 2025-03-26
-- Issue: caravans and user_profiles tables duplicate data from users table
-- Solution: Add is_active to users, migrate data, update FKs, drop redundant tables

BEGIN;

-- ============================================
-- STEP 1: Add is_active column to users table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added is_active column to users table';
    ELSE
        RAISE NOTICE 'is_active column already exists in users table';
    END IF;
END $$;

-- Create index for is_active queries
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- STEP 2: Migrate is_active from caravans to users
-- ============================================
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE users
    SET is_active = COALESCE(c.is_active, true)
    FROM caravans c
    WHERE users.id = c.user_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Migrated is_active status from caravans to users: % rows updated', updated_count;
END $$;

-- ============================================
-- STEP 3: Update groups.team_leader_id FK to reference users
-- ============================================
DO $$
DECLARE
    updated_count INTEGER;
    invalid_count INTEGER;
BEGIN
    -- First, drop any existing foreign key constraint to allow updates
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'groups' AND constraint_name = 'groups_team_leader_id_fkey'
    ) THEN
        ALTER TABLE groups DROP CONSTRAINT groups_team_leader_id_fkey;
        RAISE NOTICE 'Dropped existing groups.team_leader_id foreign key constraint';
    END IF;

    -- Update team_leader_id that reference caravans.id to use the corresponding user_id
    UPDATE groups
    SET team_leader_id = c.user_id
    FROM caravans c
    WHERE groups.team_leader_id = c.id
      AND c.user_id IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated groups.team_leader_id from caravan.id to user_id: % rows updated', updated_count;

    -- Check for any team_leader_id values that don't reference valid users
    SELECT COUNT(*) INTO invalid_count
    FROM groups g
    WHERE g.team_leader_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM users u WHERE u.id = g.team_leader_id
      );

    IF invalid_count > 0 THEN
        RAISE NOTICE 'Found % groups with invalid team_leader_id (will be set to NULL)', invalid_count;
        -- Set invalid team_leader_id to NULL
        UPDATE groups
        SET team_leader_id = NULL
        WHERE team_leader_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM users u WHERE u.id = groups.team_leader_id
          );
    END IF;

    -- Add new foreign key constraint to users table
    ALTER TABLE groups
    ADD CONSTRAINT groups_team_leader_id_fkey
    FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL;

    RAISE NOTICE 'Added new groups.team_leader_id foreign key to users table';
END $$;

-- ============================================
-- STEP 4: Create views for backward compatibility
-- ============================================

-- Create a view that mimics the old caravans table structure
-- This allows legacy queries to continue working during transition
CREATE OR REPLACE VIEW v_caravans AS
SELECT
    u.id AS id,
    u.id AS user_id,  -- Self-reference for compatibility
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.is_active,
    u.created_at,
    u.updated_at
FROM users u
WHERE u.role IN ('field_agent', 'caravan');

COMMENT ON VIEW v_caravans IS 'Compatibility view for legacy caravans table - queries users with role IN (field_agent, caravan)';

-- ============================================
-- STEP 5: Create helper functions for common queries
-- ============================================

-- Function to check if user is a field agent/caravan
CREATE OR REPLACE FUNCTION is_field_agent(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = is_field_agent.user_id
          AND u.role IN ('field_agent', 'caravan')
          AND u.is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get field agents for a region/municipality
CREATE OR REPLACE FUNCTION get_field_agents_for_location(location_municipality TEXT)
RETURNS TABLE (
    user_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone
    FROM users u
    JOIN user_municipalities_simple ums ON u.id = ums.user_id
    WHERE u.role IN ('field_agent', 'caravan')
      AND u.is_active = true
      AND ums.municipality_id = get_field_agents_for_location.location_municipality
      AND ums.deleted_at IS NULL
    ORDER BY u.last_name, u.first_name;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify is_active was added and populated
-- SELECT id, email, is_active, role FROM users WHERE role IN ('field_agent', 'caravan') LIMIT 10;

-- Verify groups.team_leader_id now references users
-- SELECT g.id as group_id, g.name, g.team_leader_id, u.email as leader_email
-- FROM groups g
-- LEFT JOIN users u ON g.team_leader_id = u.id
-- LIMIT 10;

-- Verify caravans view works
-- SELECT * FROM v_caravans LIMIT 10;

-- Count affected entities
-- SELECT
--     (SELECT COUNT(*) FROM users WHERE role IN ('field_agent', 'caravan')) as field_agents,
--     (SELECT COUNT(*) FROM users WHERE role IN ('field_agent', 'caravan') AND is_active = true) as active_field_agents,
--     (SELECT COUNT(*) FROM groups WHERE team_leader_id IS NOT NULL) as groups_with_leaders,
--     (SELECT COUNT(*) FROM caravans) as caravan_table_rows;

-- ============================================
-- NEXT STEPS (After verifying migration success):
-- ============================================
--
-- 1. Update application code to use users table instead of caravans
-- 2. Test all functionality thoroughly
-- 3. Drop redundant tables (ONLY after code is updated):
--
--    DROP TABLE IF EXISTS caravans CASCADE;
--    DROP TABLE IF EXISTS user_profiles CASCADE;
--    DROP TABLE IF EXISTS user_psgc_assignments CASCADE;
--
-- 4. Drop this migration view (optional, after transition complete):
--
--    DROP VIEW IF EXISTS v_caravans;
--
SELECT 'Migration 019: User table normalization completed successfully!' as result;
