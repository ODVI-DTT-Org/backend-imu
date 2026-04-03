-- Migration 044: Remove municipality_id column from user_locations table
-- The municipality_id column is redundant since we now have separate province and municipality columns

-- Drop old unique constraint on (user_id, municipality_id) if it exists
DROP INDEX IF EXISTS idx_user_locations_user_municipality_id;

-- Drop the municipality_id column
ALTER TABLE user_locations DROP COLUMN IF EXISTS municipality_id;

-- Create unique constraint on (user_id, province, municipality) for data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_user_province_municipality_unique
ON user_locations(user_id, province, municipality)
WHERE deleted_at IS NULL;
