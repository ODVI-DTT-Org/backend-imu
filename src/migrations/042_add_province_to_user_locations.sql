-- Migration 042: Add province column to user_locations table
-- This allows tracking both municipality and province assignments

-- Add province column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_locations'
    AND column_name = 'province'
  ) THEN
    ALTER TABLE user_locations ADD COLUMN province TEXT;
  END IF;
END $$;

-- Create index on province for faster queries
CREATE INDEX IF NOT EXISTS idx_user_locations_province ON user_locations(province);

-- Create composite index on user_id and province for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_province ON user_locations(user_id, province) WHERE deleted_at IS NULL;

-- Comment on the new column
COMMENT ON COLUMN user_locations.province IS 'Province code (PSGC) for the user assignment';
