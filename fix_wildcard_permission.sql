-- ============================================
-- FIX: Add Wildcard Super Admin Permission
-- ============================================
-- This creates a wildcard permission that grants access to ALL resources
-- Run this directly against your QA database

BEGIN;

-- ============================================
-- STEP 1: Add Wildcard Permission
-- ============================================

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('*', '*', NULL, 'Super admin - Full access to all resources and actions')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- ============================================
-- STEP 2: Grant Wildcard Permission to Admin Role
-- ============================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.resource = '*'
  AND p.action = '*'
  AND p.constraint_name IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- STEP 3: Also Add Individual Dashboard Permission (for good measure)
-- ============================================

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard and analytics')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.resource = 'dashboard'
  AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

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
WHERE r.slug = 'admin'
  AND (p.resource = '*' OR p.resource = 'dashboard')
ORDER BY p.resource, p.action;

-- Expected output should show:
-- 1. Wildcard permission: resource='*', action='*'
-- 2. Dashboard permission: resource='dashboard', action='read'
