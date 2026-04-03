-- Migration 046: Remove municipality_id column from group_municipalities table
-- The municipality_id column is redundant since we now have separate province and municipality columns

-- Drop old unique constraint on (group_id, municipality_id) if it exists
DROP INDEX IF EXISTS idx_group_municipalities_group_municipality_id;

-- Drop the municipality_id column
ALTER TABLE group_municipalities DROP COLUMN IF EXISTS municipality_id;

-- Create unique constraint on (group_id, province, municipality) for data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_municipalities_group_province_municipality_unique
ON group_municipalities(group_id, province, municipality)
WHERE deleted_at IS NULL;
