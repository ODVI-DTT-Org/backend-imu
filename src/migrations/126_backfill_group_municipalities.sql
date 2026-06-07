-- Migration 126: Backfill group_municipalities pool from caravan user_locations.
-- For each group, the pool is the union of (province, municipality) pairs
-- that any caravan in that group is currently assigned to via user_locations.
-- Idempotent: ON CONFLICT (group_id, province, municipality) WHERE deleted_at IS NULL DO NOTHING.
-- Stage 2 of area-based RBAC rollout (spec 2026-06-07).

BEGIN;

-- Ensure idempotency: add unique index on (group_id, province, municipality) live rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_municipalities_live
  ON group_municipalities(group_id, province, municipality)
  WHERE deleted_at IS NULL;

-- Backfill: derive pool from caravan user_locations
INSERT INTO group_municipalities (group_id, province, municipality, assigned_by)
SELECT DISTINCT
       grm.group_id,
       ul.province,
       ul.municipality,
       NULL::uuid
  FROM group_role_members grm
  JOIN user_locations ul ON ul.user_id = grm.user_id AND ul.deleted_at IS NULL
 WHERE grm.role_in_group = 'caravan'
   AND grm.deleted_at IS NULL
   AND ul.province IS NOT NULL
   AND ul.municipality IS NOT NULL
ON CONFLICT (group_id, province, municipality) WHERE deleted_at IS NULL DO NOTHING;

-- Verification
DO $$
DECLARE
  pool_count INT;
  group_count INT;
BEGIN
  SELECT COUNT(*) INTO pool_count FROM group_municipalities WHERE deleted_at IS NULL;
  SELECT COUNT(DISTINCT group_id) INTO group_count FROM group_municipalities WHERE deleted_at IS NULL;
  RAISE NOTICE 'group_municipalities backfill: total_rows=%, distinct_groups=%', pool_count, group_count;
  -- Verified pre-plan: 6 groups had distinct location counts 46–458, summing to ~1750.
  IF pool_count < 500 OR pool_count > 3000 THEN
    RAISE EXCEPTION 'group_municipalities row count out of expected range (500-3000): %', pool_count;
  END IF;
  IF group_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 distinct groups, got %', group_count;
  END IF;
END $$;

COMMIT;

SELECT 'Migration 126: group_municipalities backfilled' AS result;
