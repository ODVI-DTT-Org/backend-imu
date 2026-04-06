-- Migration 051: Remove audit_logs permissions from non-admin roles
-- Bug #11: Only Admin should have access to audit_logs/error_logs
-- This migration removes audit_logs permissions from Area Manager and other non-admin roles

BEGIN;

-- Remove audit_logs permissions from non-admin roles
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE resource = 'audit_logs'
)
AND role_id IN (
    SELECT id FROM roles WHERE slug IN ('area_manager', 'assistant_area_manager', 'caravan', 'tele')
);

-- Verify only admin has audit_logs permissions
SELECT 'Audit logs permissions after cleanup:' as info;
SELECT
    r.slug as role_slug,
    r.name as role_name,
    p.resource,
    p.action,
    p.constraint_name
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'audit_logs'
ORDER BY r.level DESC, p.action, p.constraint_name;

-- Expected result: Only 'admin' role should have audit_logs permissions

SELECT 'Migration 051: audit_logs permissions removed from non-admin roles successfully!' as result;

COMMIT;
