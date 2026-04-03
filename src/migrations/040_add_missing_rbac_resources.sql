-- Migration 040: Add Missing RBAC Resources
-- Adds dashboard, approvals, and error_logs permissions
-- Based on alignment decisions:
-- - Dashboard: Admin + Area Manager + Assistant Area Manager
-- - Approvals: Admin only
-- - Error Logs: Admin only
-- - My Calls: Tele + Admin + Area Manager + Assistant Area Manager

BEGIN;

-- ============================================
-- DASHBOARD PERMISSIONS
-- ============================================
-- Access: Admin + Area Manager + Assistant Area Manager

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard statistics and metrics'),
    ('dashboard', 'read_performance', NULL, 'View performance metrics and analytics')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign dashboard permissions to Admin, Area Manager, and Assistant Area Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('admin', 'area_manager', 'assistant_area_manager')
  AND p.resource = 'dashboard'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- APPROVALS PERMISSIONS
-- ============================================
-- Access: Admin ONLY (both UDI and Client approvals)

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('approvals', 'read', NULL, 'View all approval requests'),
    ('approvals', 'create', NULL, 'Create approval requests'),
    ('approvals', 'approve', NULL, 'Approve requests'),
    ('approvals', 'reject', NULL, 'Reject requests'),
    ('approvals', 'update', NULL, 'Update approval details'),
    ('approvals', 'delete', NULL, 'Delete approval requests')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign approvals permissions to Admin ONLY
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.resource = 'approvals'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- ERROR LOGS PERMISSIONS
-- ============================================
-- Access: Admin ONLY

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('error_logs', 'read', NULL, 'View all error logs'),
    ('error_logs', 'resolve', NULL, 'Resolve error logs'),
    ('error_logs', 'delete', NULL, 'Delete error logs')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign error_logs permissions to Admin ONLY
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.resource = 'error_logs'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- MY CALLS / TELE PERMISSIONS
-- ============================================
-- Access: Tele + Admin + Area Manager + Assistant Area Manager (oversight)

-- My Calls uses existing touchpoints.read permission
-- No new permissions needed, just noting that Tele users can access

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify new permissions created
SELECT 'Dashboard permissions:' as info, COUNT(*) as count
FROM permissions WHERE resource = 'dashboard';

SELECT 'Approvals permissions:' as info, COUNT(*) as count
FROM permissions WHERE resource = 'approvals';

SELECT 'Error logs permissions:' as info, COUNT(*) as count
FROM permissions WHERE resource = 'error_logs';

-- Verify role permissions assigned
SELECT 'Dashboard role permissions:' as info, COUNT(*) as count
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'dashboard';

SELECT 'Approvals role permissions:' as info, COUNT(*) as count
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'approvals';

SELECT 'Error logs role permissions:' as info, COUNT(*) as count
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'error_logs';

SELECT 'Migration 040: Missing RBAC resources added successfully!' as result;

COMMIT;
