-- Migration 052: Add RBAC permissions for addresses and phone_numbers

-- Addresses permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('addresses', 'create', NULL, 'Create new addresses'),
    ('addresses', 'read', 'own', 'View own addresses'),
    ('addresses', 'read', 'area', 'View addresses in assigned area'),
    ('addresses', 'update', 'own', 'Edit own addresses'),
    ('addresses', 'delete', 'own', 'Delete own addresses'),
    ('addresses', 'delete', 'all', 'Delete any addresses')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Phone numbers permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('phone_numbers', 'create', NULL, 'Create new phone numbers'),
    ('phone_numbers', 'read', 'own', 'View own phone numbers'),
    ('phone_numbers', 'read', 'area', 'View phone numbers in assigned area'),
    ('phone_numbers', 'update', 'own', 'Edit own phone numbers'),
    ('phone_numbers', 'delete', 'own', 'Delete own phone numbers'),
    ('phone_numbers', 'delete', 'all', 'Delete any phone numbers')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign permissions to Caravan role (addresses and phone_numbers, own data only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource IN ('addresses', 'phone_numbers') AND p.action IN ('create', 'read', 'update', 'delete') AND p.constraint_name = 'own')
)
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Tele role (phone_numbers only, own data)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'phone_numbers' AND p.action IN ('create', 'read', 'update', 'delete') AND p.constraint_name = 'own')
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Assistant Area Manager (full access to assigned areas)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource IN ('addresses', 'phone_numbers') AND p.action IN ('read', 'update', 'delete') AND p.constraint_name = 'area')
)
WHERE r.slug = 'assistant_area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Area Manager (full access to assigned areas)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource IN ('addresses', 'phone_numbers') AND p.action IN ('read', 'update', 'delete') AND p.constraint_name = 'area')
)
WHERE r.slug = 'area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to Admin (all permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'admin' AND p.resource IN ('addresses', 'phone_numbers')
ON CONFLICT (role_id, permission_id) DO NOTHING;
