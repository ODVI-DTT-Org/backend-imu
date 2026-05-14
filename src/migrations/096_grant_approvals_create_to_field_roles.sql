-- Migration 096: Grant approvals.create to caravan and tele roles
-- Migration 049 was never applied to production, causing 403 on POST /api/approvals
-- for field agents submitting address/phone/client change requests.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'approvals' AND p.action = 'create'
WHERE r.slug IN ('caravan', 'tele')
ON CONFLICT (role_id, permission_id) DO NOTHING;
