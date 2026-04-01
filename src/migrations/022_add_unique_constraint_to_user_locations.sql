-- Migration: Add unique constraint to user_locations and clean up duplicates
-- This ensures each user-municipality pair is unique

-- Step 1: Clean up duplicates in batches (more efficient)
-- This keeps only the earliest assignment for each user-municipality pair
WITH duplicates_to_delete AS (
  SELECT id
  FROM user_locations
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
  )
  LIMIT 1000
)
DELETE FROM user_locations
WHERE id IN (SELECT id FROM duplicates_to_delete);

-- Step 2: Add unique constraint on (user_id, municipality_id)
-- Note: This may fail if duplicates still exist - run Step 1 multiple times if needed
ALTER TABLE user_locations
DROP CONSTRAINT IF EXISTS user_locations_user_municipality_unique;

ALTER TABLE user_locations
ADD CONSTRAINT user_locations_user_municipality_unique
UNIQUE (user_id, municipality_id)
DEFERRABLE INITIALLY DEFERRED;

-- Step 3: Create index for better query performance
DROP INDEX IF EXISTS idx_user_locations_unique_active;
CREATE UNIQUE INDEX idx_user_locations_unique_active
ON user_locations (user_id, municipality_id)
WHERE deleted_at IS NULL;

-- Step 4: Add comment
COMMENT ON CONSTRAINT user_locations_user_municipality_unique
ON user_locations IS 'Ensures each user can only have one active assignment per municipality';

-- Return summary
SELECT
  'Migration completed' as status,
  COUNT(*) as total_assignments,
  COUNT(DISTINCT user_id || '-' || municipality_id) as unique_assignments
FROM user_locations
WHERE deleted_at IS NULL;
