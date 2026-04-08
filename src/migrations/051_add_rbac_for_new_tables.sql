-- Migration 051: Add RBAC permissions for visits, calls, releases

-- Visits permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('visits', 'create', NULL, 'Create new visits'),
    ('visits', 'read', 'own', 'View own visits'),
    ('visits', 'read', 'area', 'View visits in assigned area'),
    ('visits', 'update', 'own', 'Edit own visits'),
    ('visits', 'delete', 'all', 'Delete visits')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Calls permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('calls', 'create', NULL, 'Create new calls'),
    ('calls', 'read', 'own', 'View own calls'),
    ('calls', 'read', 'area', 'View calls in assigned area'),
    ('calls', 'update', 'own', 'Edit own calls'),
    ('calls', 'delete', 'all', 'Delete calls')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Releases permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('releases', 'create', NULL, 'Create loan releases'),
    ('releases', 'read', 'own', 'View own releases'),
    ('releases', 'read', 'area', 'View releases in assigned area'),
    ('releases', 'update', 'own', 'Edit own releases'),
    ('releases', 'approve', 'area', 'Approve loan releases'),
    ('releases', 'delete', 'all', 'Delete releases')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign permissions to Caravan role (visits and calls, own data only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource IN ('visits', 'calls') AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
)
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Tele role (calls only, own data)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'calls' AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;
