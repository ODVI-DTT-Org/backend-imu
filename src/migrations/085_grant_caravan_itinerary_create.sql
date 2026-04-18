-- Grant caravan role permission to create itineraries.
-- Migration 039 missed this because itineraries.create has constraint_name IS NULL
-- but the INSERT only matched rows where constraint_name = 'own'.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'itineraries' AND p.action = 'create' AND p.constraint_name IS NULL
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;
