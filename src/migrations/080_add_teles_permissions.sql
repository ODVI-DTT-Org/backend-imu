-- Add teles:read permission and grant to manager roles so they can view the tele agents list.
INSERT INTO permissions (resource, action, description)
VALUES ('teles', 'read', 'View tele agents list')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug IN ('admin', 'area_manager', 'assistant_area_manager')
  AND p.resource = 'teles'
  AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
