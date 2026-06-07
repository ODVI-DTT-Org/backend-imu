-- Migration 125: Backfill group_role_members from production data sources.
-- Sources:
--   - area_head           ← groups.area_manager_id
--   - assistant_area_head ← groups.assistant_area_manager_id
--   - team_leader         ← TL manifest (see scripts/area-rbac/tl-manifest.sql,
--                            inlined as a CTE below for reproducibility)
--   - caravan             ← legacy group_members.client_id, MINUS users
--                            already inserted as AH/AAH/TL in the same group
-- Idempotent: ON CONFLICT DO NOTHING.
-- Stage 2 of area-based RBAC rollout (spec 2026-06-07).

BEGIN;

-- 1. AREA HEADS — one per group, from groups.area_manager_id
INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
SELECT g.id, g.area_manager_id, 'area_head', NULL
  FROM groups g
 WHERE g.area_manager_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. ASSISTANT AREA HEADS — from groups.assistant_area_manager_id
INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
SELECT g.id, g.assistant_area_manager_id, 'assistant_area_head', NULL
  FROM groups g
 WHERE g.assistant_area_manager_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. TEAM LEADERS — from the cue card manifest (8 TLs)
WITH tl_manifest(group_name, first_name_part, last_name_part) AS (
  VALUES
    ('NORTH AGUILA',    'CHRISTOPHER', 'CRUZ'),  -- cue card 'DELA CRUZ' truncated in DB
    ('NORTH AGUILA',    'GODWIN',      'RUIZ'),
    ('UNSTOPPABLE',     'JORIS',       'LUCILO'),
    ('GENERALS',        'JOSEPH',      'GARCIA'),
    ('EXPLORER REBORN', 'JONYBOY',     'GERONCA'),
    ('SULTANS',         'GEORGE',      'REMOLADO'),
    ('SULTANS',         'NECOLUID',    'QUIOKELES'),
    ('WARRIORS',        'AERON',       'ANGELES')
),
tl_resolved AS (
  SELECT g.id AS group_id, u.id AS user_id
    FROM tl_manifest m
    JOIN groups g ON UPPER(g.name) = m.group_name
    JOIN users u ON UPPER(u.first_name) LIKE m.first_name_part || '%'
                AND UPPER(u.last_name)  LIKE m.last_name_part  || '%'
   WHERE u.id IN (SELECT client_id FROM group_members WHERE group_id = g.id)
)
INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
SELECT group_id, user_id, 'team_leader', NULL FROM tl_resolved
ON CONFLICT DO NOTHING;

-- 4. CARAVANS — from legacy group_members, excluding anyone already inserted above
INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
SELECT gm.group_id, gm.client_id, 'caravan', NULL
  FROM group_members gm
 WHERE NOT EXISTS (
   SELECT 1 FROM group_role_members grm
    WHERE grm.group_id = gm.group_id
      AND grm.user_id = gm.client_id
      AND grm.deleted_at IS NULL
 )
ON CONFLICT DO NOTHING;

-- Verification within the same transaction: counts per role
DO $$
DECLARE
  ah INT; aah INT; tl INT; cv INT;
BEGIN
  SELECT COUNT(*) INTO ah  FROM group_role_members WHERE role_in_group='area_head'           AND deleted_at IS NULL;
  SELECT COUNT(*) INTO aah FROM group_role_members WHERE role_in_group='assistant_area_head' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO tl  FROM group_role_members WHERE role_in_group='team_leader'         AND deleted_at IS NULL;
  SELECT COUNT(*) INTO cv  FROM group_role_members WHERE role_in_group='caravan'             AND deleted_at IS NULL;
  RAISE NOTICE 'group_role_members backfill: area_head=%, assistant_area_head=%, team_leader=%, caravan=%', ah, aah, tl, cv;
  -- Expected (verified 2026-06-07): area_head=6, assistant_area_head=2, team_leader=8, caravan=29
  -- (45 in legacy group_members - 16 elevated overlap (6 AH + 2 AAH + 8 TL) = 29 pure caravans)
  IF ah <> 6 THEN RAISE EXCEPTION 'expected 6 area heads, got %', ah; END IF;
  IF aah <> 2 THEN RAISE EXCEPTION 'expected 2 assistant area heads, got %', aah; END IF;
  IF tl <> 8 THEN RAISE EXCEPTION 'expected 8 team leaders, got %', tl; END IF;
  -- Caravan count is a soft check — bounds allow some drift from legacy group_members
  IF cv < 25 OR cv > 45 THEN
    RAISE EXCEPTION 'caravan count out of expected range (25-45): %', cv;
  END IF;
END $$;

COMMIT;

SELECT 'Migration 125: group_role_members backfilled' AS result;
