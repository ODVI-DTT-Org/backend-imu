-- Migration 043: Add municipality column to user_locations table
-- This allows PowerSync sync and mobile app to work correctly
-- The municipality column contains just the municipality/city name (without province prefix)

-- Add municipality column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_locations'
    AND column_name = 'municipality'
  ) THEN
    ALTER TABLE user_locations ADD COLUMN municipality TEXT;
  END IF;
END $$;

-- Create index on municipality for faster queries
CREATE INDEX IF NOT EXISTS idx_user_locations_municipality ON user_locations(municipality);

-- Create composite index on user_id, province, and municipality for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_province_municipality ON user_locations(user_id, province, municipality) WHERE deleted_at IS NULL;

-- Comment on the new column
COMMENT ON COLUMN user_locations.municipality IS 'Municipality/city name (without province prefix) for PowerSync sync and mobile app compatibility';

-- Backfill existing records: parse municipality from municipality_id (format: "PROVINCE-MUNICIPALITY")
UPDATE user_locations
SET municipality = SUBSTRING(municipality_id FROM POSITION('-' IN municipality_id) + 1)
WHERE municipality IS NULL
  AND municipality_id IS NOT NULL
  AND municipality_id LIKE '%-%';
