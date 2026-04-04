-- Migration 045: Add clients.update permission to Tele role
-- This migration allows Tele (telemarketers) to edit client information

BEGIN;

-- Add clients.update:own permission to Tele role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource = 'clients'
    AND p.action = 'update'
    AND p.constraint_name = 'own'
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- Verification query
SELECT 'Tele role now has clients.update:own permission' as result;
