-- ============================================
-- FIX: Add Dashboard Permissions for Admin Role
-- ============================================
-- Run this script directly against your QA database to fix the permission issue
-- Connect to: postgresql://doadmin@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa

-- ============================================
-- STEP 1: Add Dashboard Permission
-- ============================================

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard and analytics')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- ============================================
-- STEP 2: Grant Dashboard Permission to Admin Role
-- ============================================

-- Grant to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.resource = 'dashboard'
  AND p.action = 'read'
  AND p.constraint_name IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant to area_manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'area_manager'
  AND p.resource = 'dashboard'
  AND p.action = 'read'
  AND p.constraint_name IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant to assistant_area_manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'assistant_area_manager'
  AND p.resource = 'dashboard'
  AND p.action = 'read'
  AND p.constraint_name IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- VERIFICATION: Check What Was Added
-- ============================================

SELECT
    r.name as role_name,
    r.slug as role_slug,
    p.resource,
    p.action,
    p.constraint_name,
    p.description
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE p.resource = 'dashboard'
ORDER BY r.level DESC;

-- Expected output:
-- role_name             | role_slug              | resource  | action | constraint_name | description
-- ---------------------|------------------------|-----------|--------|----------------|--------------------------
-- System Administrator | admin                  | dashboard | read   |                | View dashboard and analytics
-- Area Manager         | area_manager           | dashboard | read   |                | View dashboard and analytics
-- Assistant Area Manager | assistant_area_manager | dashboard | read   |                | View dashboard and analytics
