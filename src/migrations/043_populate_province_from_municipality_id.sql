-- Migration 043: Populate province column from municipality_id
-- Extracts province from municipality_id format "PROVINCE-MUNICIPALITY"

BEGIN;

-- Update all rows where province is NULL but municipality_id has a value
UPDATE user_locations
SET province = SPLIT_PART(municipality_id, '-', 1)
WHERE province IS NULL
  AND municipality_id IS NOT NULL
  AND municipality_id LIKE '%-%';

RAISE NOTICE 'Populated province column for % rows', ROW_COUNT;

-- Verify the update
SELECT
    province,
    municipality_id,
    COUNT(*) as count
FROM user_locations
WHERE deleted_at IS NULL
GROUP BY province, municipality_id
ORDER BY province, municipality_id
LIMIT 20;

COMMIT;
