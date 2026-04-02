-- Rollback Migration 033: Remove RBAC System
-- This script rolls back the RBAC system and restores the previous state
-- WARNING: This will delete all roles, permissions, and user role assignments

BEGIN;

-- ============================================
-- DROP VIEWS
-- ============================================

DROP VIEW IF EXISTS user_permissions_view CASCADE;
DROP VIEW IF EXISTS users_with_roles CASCADE;

-- ============================================
-- DROP FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS has_permission CASCADE;
DROP FUNCTION IF EXISTS get_user_permissions CASCADE;
DROP FUNCTION IF EXISTS has_role CASCADE;

-- ============================================
-- DROP TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;

-- ============================================
-- DROP TABLES (in correct order due to foreign keys)
-- ============================================

DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
    -- Check that all RBAC objects have been dropped
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles') THEN
        RAISE EXCEPTION 'Rollback failed: roles table still exists';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions') THEN
        RAISE EXCEPTION 'Rollback failed: permissions table still exists';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
        RAISE EXCEPTION 'Rollback failed: user_roles table still exists';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.views WHERE view_name = 'user_permissions_view') THEN
        RAISE EXCEPTION 'Rollback failed: user_permissions_view still exists';
    END IF;

    RAISE NOTICE 'RBAC system successfully rolled back';
END $$;

COMMIT;

SELECT 'Migration 033 Rollback: RBAC system removed successfully!' as result;

-- ============================================
-- POST-ROLLBACK CHECKLIST
-- ============================================
-- After running this rollback:
--
-- 1. Verify old role-based middleware still works
-- 2. Check that users.role column still exists
-- 3. Test that API endpoints function correctly
-- 4. Remove any new permission middleware imports
-- 5. Revert to using requireRole() middleware
--
-- If you need to re-install RBAC:
--   Run: \i backend/src/migrations/033_add_rbac_system.sql
