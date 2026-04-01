-- Migration: Fix trailing/leading whitespace in municipality_id columns
-- This fixes the issue where DELETE operations fail due to whitespace mismatch
-- IMPORTANT: Must run BEFORE adding unique constraints to avoid duplicate key violations

BEGIN;

-- Step 1: Remove duplicates that would be created by trimming
-- For user_locations, keep the oldest (first assigned) and delete newer duplicates
WITH user_loc_duplicates AS (
  SELECT
    user_id,
    TRIM(municipality_id) as trimmed_id,
    ARRAY_AGG(id ORDER BY assigned_at) as ids,
    COUNT(*) as count
  FROM user_locations
  WHERE municipality_id != TRIM(municipality_id)
  GROUP BY user_id, TRIM(municipality_id)
  HAVING COUNT(*) > 1
)
DELETE FROM user_locations
WHERE id IN (
  SELECT unnest(ids[2:array_length(ids, 1)]) FROM user_loc_duplicates
);

-- Also remove duplicates that would conflict with existing non-whitespace records
WITH user_loc_conflicts AS (
  SELECT
    ul1.id as id_to_delete
  FROM user_locations ul1
  INNER JOIN user_locations ul2
    ON ul1.user_id = ul2.user_id
    AND TRIM(ul1.municipality_id) = TRIM(ul2.municipality_id)
    AND ul1.id != ul2.id
    AND ul1.municipality_id != TRIM(ul1.municipality_id)
    AND ul2.municipality_id = TRIM(ul2.municipality_id)
)
DELETE FROM user_locations
WHERE id IN (SELECT id_to_delete FROM user_loc_conflicts);

-- Step 2: Now trim the municipality_id in user_locations
UPDATE user_locations
SET municipality_id = TRIM(municipality_id)
WHERE municipality_id != TRIM(municipality_id);

-- Step 3: Remove duplicates in group_municipalities
WITH group_mun_duplicates AS (
  SELECT
    group_id,
    TRIM(municipality_id) as trimmed_id,
    ARRAY_AGG(id ORDER BY assigned_at) as ids,
    COUNT(*) as count
  FROM group_municipalities
  WHERE municipality_id != TRIM(municipality_id)
    AND deleted_at IS NULL
  GROUP BY group_id, TRIM(municipality_id)
  HAVING COUNT(*) > 1
)
UPDATE group_municipalities
SET deleted_at = NOW()
WHERE id IN (
  SELECT unnest(ids[2:array_length(ids, 1)]) FROM group_mun_duplicates
);

-- Also remove group_municipalities that would conflict with existing non-whitespace records
WITH group_mun_conflicts AS (
  SELECT
    gm1.id as id_to_delete
  FROM group_municipalities gm1
  INNER JOIN group_municipalities gm2
    ON gm1.group_id = gm2.group_id
    AND TRIM(gm1.municipality_id) = TRIM(gm2.municipality_id)
    AND gm1.id != gm2.id
    AND gm1.municipality_id != TRIM(gm1.municipality_id)
    AND gm2.municipality_id = TRIM(gm2.municipality_id)
    AND gm1.deleted_at IS NULL
    AND gm2.deleted_at IS NULL
)
UPDATE group_municipalities
SET deleted_at = NOW()
WHERE id IN (SELECT id_to_delete FROM group_mun_conflicts);

-- Step 4: Now trim the municipality_id in group_municipalities
UPDATE group_municipalities
SET municipality_id = TRIM(municipality_id)
WHERE municipality_id != TRIM(municipality_id);

-- Step 5: Add check constraint to prevent future whitespace issues (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_locations_municipality_id_no_whitespace'
  ) THEN
    ALTER TABLE user_locations
    ADD CONSTRAINT user_locations_municipality_id_no_whitespace
    CHECK (municipality_id = TRIM(municipality_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'group_municipalities_municipality_id_no_whitespace'
  ) THEN
    ALTER TABLE group_municipalities
    ADD CONSTRAINT group_municipalities_municipality_id_no_whitespace
    CHECK (municipality_id = TRIM(municipality_id));
  END IF;
END $$;

-- Verify the fix
SELECT
  'user_locations' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE municipality_id != TRIM(municipality_id)) as remaining_whitespace
FROM user_locations
UNION ALL
SELECT
  'group_municipalities' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE municipality_id != TRIM(municipality_id)) as remaining_whitespace
FROM group_municipalities
WHERE deleted_at IS NULL;

COMMIT;

SELECT 'Migration 024: Municipality ID whitespace fixed and duplicates removed' as result;
