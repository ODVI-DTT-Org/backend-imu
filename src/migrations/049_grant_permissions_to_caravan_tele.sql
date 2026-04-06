-- Migration 049: Grant required permissions to Caravan and Tele roles
-- - approvals.create: Required for loan release functionality
-- - itineraries.delete: Required for deleting itineraries

BEGIN;

-- 1. Grant approvals.create to Caravan and Tele roles (for loan release)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'approvals' AND p.action = 'create'
WHERE r.slug IN ('caravan', 'tele')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. Grant itineraries.delete to Caravan and Tele roles (for deleting itineraries)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'itineraries' AND p.action = 'delete'
WHERE r.slug IN ('caravan', 'tele')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verify permissions granted
SELECT 'Granted permissions to Caravan and Tele:' as info;
SELECT r.slug as role, p.resource, p.action
FROM roles r
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.slug IN ('caravan', 'tele')
  AND (
    (p.resource = 'approvals' AND p.action = 'create') OR
    (p.resource = 'itineraries' AND p.action = 'delete')
  )
ORDER BY r.slug, p.resource, p.action;

SELECT 'Migration 049: Completed successfully!' as result;

COMMIT;
