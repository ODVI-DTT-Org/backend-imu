-- Migration 129: Seed area-RBAC permissions vocabulary.
-- Adds new permissions rows with constraint_name IN ('group_municipalities',
-- 'caravan_municipalities') and links each role to the appropriate new row.
-- ADDITIVE — existing permissions rows with constraint_name='own'/'area'/'all'
-- and their role_permissions links are LEFT IN PLACE so the existing
-- requirePermission() middleware keeps working unchanged.
-- The new applyClientScope helper only reads the new vocabulary.
-- Stage 3a of area-based RBAC rollout (spec 2026-06-07, revised 2026-06-08).

BEGIN;

-- 1. Insert new permissions rows. Idempotent via ON CONFLICT on (resource, action, constraint_name).
INSERT INTO permissions (resource, action, constraint_name, description)
VALUES
  ('clients',       'read',   'group_municipalities',   'Read clients in any group municipality the user belongs to'),
  ('clients',       'read',   'caravan_municipalities', 'Read clients only in the caravan''s own assigned slice'),
  ('clients',       'update', 'group_municipalities',   'Update clients in any group municipality'),
  ('clients',       'update', 'caravan_municipalities', 'Update clients only in the caravan''s slice'),
  ('clients',       'create', 'group_municipalities',   'Create clients within any group municipality'),
  ('clients',       'create', 'caravan_municipalities', 'Create clients within the caravan''s slice'),
  ('touchpoints',   'create', 'group_municipalities',   'Record touchpoint for any client in a group municipality'),
  ('touchpoints',   'create', 'caravan_municipalities', 'Record touchpoint for any client in the caravan''s slice'),
  ('loan_releases', 'create', 'group_municipalities',   'Record loan release for any client in a group municipality'),
  ('loan_releases', 'create', 'caravan_municipalities', 'Record loan release for any client in the caravan''s slice')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- 2. Link each role to its appropriate new row.
-- Use INSERT ... SELECT to get the IDs by lookup. Idempotent via ON CONFLICT.
DO $$
DECLARE
  perm_rec RECORD;
  granted_by_uuid UUID := NULL;  -- system seed, no actor
BEGIN
  -- Admin: skipped — admin already has unrestricted via the existing 'all' rows.
  -- The new applyClientScope helper uses new-vocabulary-first precedence,
  -- so admin (which has no new-vocabulary link) falls through to 'all' → unrestricted.

  -- area_manager → group_municipalities for read/update/create + touchpoints + loan_releases
  FOR perm_rec IN
    SELECT id FROM permissions
     WHERE constraint_name = 'group_municipalities'
       AND (resource, action) IN (
         ('clients', 'read'), ('clients', 'update'), ('clients', 'create'),
         ('touchpoints', 'create'), ('loan_releases', 'create')
       )
  LOOP
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    SELECT id, perm_rec.id, granted_by_uuid FROM roles WHERE slug = 'area_manager'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- assistant_area_manager → same group_municipalities access as area_manager.
  FOR perm_rec IN
    SELECT id FROM permissions
     WHERE constraint_name = 'group_municipalities'
       AND (resource, action) IN (
         ('clients', 'read'), ('clients', 'update'), ('clients', 'create'),
         ('touchpoints', 'create'), ('loan_releases', 'create')
       )
  LOOP
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    SELECT id, perm_rec.id, granted_by_uuid FROM roles WHERE slug = 'assistant_area_manager'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- team_leader → group_municipalities for the same 5 actions
  FOR perm_rec IN
    SELECT id FROM permissions
     WHERE constraint_name = 'group_municipalities'
       AND (resource, action) IN (
         ('clients', 'read'), ('clients', 'update'), ('clients', 'create'),
         ('touchpoints', 'create'), ('loan_releases', 'create')
       )
  LOOP
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    SELECT id, perm_rec.id, granted_by_uuid FROM roles WHERE slug = 'team_leader'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- tele → group_municipalities for clients.read ONLY (view-only per spec)
  FOR perm_rec IN
    SELECT id FROM permissions
     WHERE constraint_name = 'group_municipalities'
       AND resource = 'clients' AND action = 'read'
  LOOP
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    SELECT id, perm_rec.id, granted_by_uuid FROM roles WHERE slug = 'tele'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- caravan → caravan_municipalities for the same 5 field actions
  FOR perm_rec IN
    SELECT id FROM permissions
     WHERE constraint_name = 'caravan_municipalities'
       AND (resource, action) IN (
         ('clients', 'read'), ('clients', 'update'), ('clients', 'create'),
         ('touchpoints', 'create'), ('loan_releases', 'create')
       )
  LOOP
    INSERT INTO role_permissions (role_id, permission_id, granted_by)
    SELECT id, perm_rec.id, granted_by_uuid FROM roles WHERE slug = 'caravan'
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 3. Verification
DO $$
DECLARE
  new_perm_count INT;
  link_count INT;
BEGIN
  SELECT COUNT(*) INTO new_perm_count FROM permissions
   WHERE constraint_name IN ('group_municipalities', 'caravan_municipalities');
  SELECT COUNT(*) INTO link_count FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.constraint_name IN ('group_municipalities', 'caravan_municipalities');
  RAISE NOTICE 'Stage 3a permissions seed: % new permission rows, % new role_permission links',
               new_perm_count, link_count;
  -- 10 new perm rows (5 group_municipalities + 5 caravan_municipalities)
  -- Link count expected: area_manager 5 + asst 5 + team_leader 5 + tele 1 + caravan 5 = 21
  IF new_perm_count < 10 THEN
    RAISE EXCEPTION 'expected 10 new permissions rows, got %', new_perm_count;
  END IF;
  IF link_count < 20 THEN
    RAISE EXCEPTION 'expected at least 20 new role_permissions links, got %', link_count;
  END IF;
END $$;

COMMIT;

SELECT 'Migration 129: area-RBAC permissions vocabulary seeded' AS result;
