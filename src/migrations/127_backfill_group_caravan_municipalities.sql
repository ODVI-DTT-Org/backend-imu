-- Migration 127: Backfill group_caravan_municipalities from user_locations.
-- For each caravan in group_role_members, copy their live user_locations rows
-- to group_caravan_municipalities, scoped to the group they're a caravan in.
-- The Stage 1 trigger gcm_validate_insert_update enforces the cross-table
-- invariants on every row — this is the proof that migration 126's pool is
-- complete enough.
-- Idempotent: unique index uq_gcm_no_dup blocks duplicates.
-- Stage 2 of area-based RBAC rollout (spec 2026-06-07).

BEGIN;

INSERT INTO group_caravan_municipalities
  (group_id, caravan_user_id, province, municipality, assigned_by, assigned_at)
SELECT grm.group_id,
       grm.user_id,
       ul.province,
       ul.municipality,
       NULL::uuid,
       ul.assigned_at
  FROM group_role_members grm
  JOIN user_locations ul ON ul.user_id = grm.user_id AND ul.deleted_at IS NULL
 WHERE grm.role_in_group = 'caravan'
   AND grm.deleted_at IS NULL
   AND ul.province IS NOT NULL
   AND ul.municipality IS NOT NULL
ON CONFLICT (group_id, caravan_user_id, province, municipality) WHERE deleted_at IS NULL DO NOTHING;

DO $$
DECLARE
  slice_count INT;
  caravan_count INT;
BEGIN
  SELECT COUNT(*) INTO slice_count FROM group_caravan_municipalities WHERE deleted_at IS NULL;
  SELECT COUNT(DISTINCT caravan_user_id) INTO caravan_count
    FROM group_caravan_municipalities WHERE deleted_at IS NULL;
  RAISE NOTICE 'group_caravan_municipalities backfill: total_rows=%, distinct_caravans=%', slice_count, caravan_count;
  -- Verified pre-plan: ~7286 live user_locations rows; expect similar magnitude here.
  IF slice_count < 1000 THEN
    RAISE EXCEPTION 'too few slice rows backfilled: %', slice_count;
  END IF;
END $$;

COMMIT;

SELECT 'Migration 127: group_caravan_municipalities backfilled' AS result;
