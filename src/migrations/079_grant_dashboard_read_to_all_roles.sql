-- Grant dashboard:read to caravan and tele roles so they can view their own stats.
-- The dashboard handler already has role-specific logic; this just lets them past
-- the requirePermission middleware.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('caravan', 'tele')
  AND p.resource = 'dashboard'
  AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
