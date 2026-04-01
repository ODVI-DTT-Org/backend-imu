-- Cleanup duplicates from user_locations table
-- This script keeps only the earliest assignment for each user-municipality pair

-- Display current state
SELECT 'BEFORE CLEANUP:' as info,
  COUNT(*) as total_assignments,
  COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
FROM user_locations
WHERE deleted_at IS NULL;

-- Delete duplicates (keep earliest assignment)
DELETE FROM user_locations
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, municipality_id
        ORDER BY assigned_at ASC
      ) as row_num
    FROM user_locations
    WHERE deleted_at IS NULL
  ) sub
  WHERE row_num > 1
);

-- Display result
SELECT 'AFTER CLEANUP:' as info,
  COUNT(*) as total_assignments,
  COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
FROM user_locations
WHERE deleted_at IS NULL;

-- Add unique constraint to prevent future duplicates
ALTER TABLE user_locations
DROP CONSTRAINT IF EXISTS user_locations_user_municipality_unique;

ALTER TABLE user_locations
ADD CONSTRAINT user_locations_user_municipality_unique
UNIQUE (user_id, municipality_id);

SELECT 'DONE - Unique constraint added' as info;
