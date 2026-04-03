-- Migration: Add Dashboard Permissions
-- This adds dashboard read permission for admin and manager roles

BEGIN;

-- ============================================
-- ADD DASHBOARD PERMISSION
-- ============================================

-- Insert dashboard:read permission
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard and analytics')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- ============================================
-- GRANT DASHBOARD PERMISSION TO ROLES
-- ============================================

-- Get the permission ID
DO $$
DECLARE
    v_dashboard_permission_id UUID;
    v_admin_role_id UUID;
    v_area_manager_role_id UUID;
    v_assistant_area_manager_role_id UUID;
BEGIN
    -- Get dashboard:read permission ID
    SELECT id INTO v_dashboard_permission_id
    FROM permissions
    WHERE resource = 'dashboard' AND action = 'read' AND constraint_name IS NULL
    LIMIT 1;

    IF v_dashboard_permission_id IS NULL THEN
        RAISE EXCEPTION 'Dashboard permission not found. Please ensure permissions table has dashboard:read permission.';
    END IF;

    -- Get admin role ID
    SELECT id INTO v_admin_role_id
    FROM roles
    WHERE slug = 'admin'
    LIMIT 1;

    -- Get area_manager role ID
    SELECT id INTO v_area_manager_role_id
    FROM roles
    WHERE slug = 'area_manager'
    LIMIT 1;

    -- Get assistant_area_manager role ID
    SELECT id INTO v_assistant_area_manager_role_id
    FROM roles
    WHERE slug = 'assistant_area_manager'
    LIMIT 1;

    -- Grant dashboard:read to admin role
    IF v_admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_admin_role_id, v_dashboard_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        RAISE NOTICE 'Granted dashboard:read permission to admin role';
    ELSE
        RAISE NOTICE 'Admin role not found';
    END IF;

    -- Grant dashboard:read to area_manager role
    IF v_area_manager_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_area_manager_role_id, v_dashboard_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        RAISE NOTICE 'Granted dashboard:read permission to area_manager role';
    END IF;

    -- Grant dashboard:read to assistant_area_manager role
    IF v_assistant_area_manager_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_assistant_area_manager_role_id, v_dashboard_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        RAISE NOTICE 'Granted dashboard:read permission to assistant_area_manager role';
    END IF;

END $$;

COMMIT;

-- ============================================
-- VERIFICATION QUERY
-- ============================================

-- Verify the permission was granted
SELECT
    r.name as role_name,
    r.slug as role_slug,
    p.resource,
    p.action,
    p.description
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE p.resource = 'dashboard'
ORDER BY r.level DESC;
