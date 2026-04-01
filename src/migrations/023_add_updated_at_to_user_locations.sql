-- Migration: Add updated_at column to user_locations table
-- This is needed for the update_updated_at_column trigger

ALTER TABLE user_locations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add comment
COMMENT ON COLUMN user_locations.updated_at IS 'Automatic timestamp of last update (via trigger)';

-- Verify the column was added
SELECT
  'updated_at column added to user_locations' as status,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_locations'
  AND column_name = 'updated_at';
