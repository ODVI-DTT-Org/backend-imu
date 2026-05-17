-- Migration 098: Add team_leader role
-- Extends role constraints on users and user_profiles, seeds team_leader RBAC role
-- with caravan permissions + groups.read, adds UNIQUE index on groups.name,
-- and drops the vestigial idx_groups_unique_caravan (caravan_id will be NULL on all groups).

-- 1. Extend role CHECK constraints on both tables
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'admin', 'area_manager', 'assistant_area_manager',
    'team_leader', 'caravan', 'tele'
  ]));

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS role_check,
  ADD CONSTRAINT role_check
  CHECK (role = ANY (ARRAY[
    'admin', 'area_manager', 'assistant_area_manager',
    'team_leader', 'caravan', 'tele'
  ]));

-- 2. Seed the team_leader RBAC role
INSERT INTO roles (id, name, slug, description, created_at)
VALUES (
  gen_random_uuid(),
  'Team Leader',
  'team_leader',
  'Field team leader — caravan capabilities plus team visibility',
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Copy all caravan RBAC permissions to team_leader
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r_tl.id, rp.permission_id
FROM role_permissions rp
JOIN roles r_caravan ON r_caravan.id = rp.role_id AND r_caravan.slug = 'caravan'
CROSS JOIN (SELECT id FROM roles WHERE slug = 'team_leader') r_tl
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Add groups.read to team_leader (so TLs can see their team in the app)
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'team_leader'
  AND p.resource = 'groups' AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Add UNIQUE constraint on groups.name (required by seeder upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_unique_name ON groups (name);

-- 6. Drop caravan uniqueness index — caravan_id will be NULL on all groups after migration
DROP INDEX IF EXISTS idx_groups_unique_caravan;

SELECT 'Migration 098: team_leader role added successfully!' AS result;
