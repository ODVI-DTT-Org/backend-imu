-- Migration 045: Add province and municipality columns to group_municipalities table
-- This aligns group_municipalities with user_locations table structure

-- Add province column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'group_municipalities'
    AND column_name = 'province'
  ) THEN
    ALTER TABLE group_municipalities ADD COLUMN province TEXT;
  END IF;
END $$;

-- Add municipality column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'group_municipalities'
    AND column_name = 'municipality'
  ) THEN
    ALTER TABLE group_municipalities ADD COLUMN municipality TEXT;
  END IF;
END $$;

-- Create index on province for faster queries
CREATE INDEX IF NOT EXISTS idx_group_municipalities_province ON group_municipalities(province);

-- Create index on municipality for faster queries
CREATE INDEX IF NOT EXISTS idx_group_municipalities_municipality ON group_municipalities(municipality);

-- Create composite index on group_id and province for faster lookups
CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_province ON group_municipalities(group_id, province) WHERE deleted_at IS NULL;

-- Backfill existing records: parse province and municipality from municipality_id (format: "PROVINCE-MUNICIPALITY")
UPDATE group_municipalities
SET
  province = SUBSTRING(municipality_id FROM 1 FOR POSITION('-' IN municipality_id) - 1),
  municipality = SUBSTRING(municipality_id FROM POSITION('-' IN municipality_id) + 1)
WHERE province IS NULL
  AND municipality IS NULL
  AND municipality_id IS NOT NULL
  AND municipality_id LIKE '%-%';

-- Make province and municipality NOT NULL after backfill (optional, can be done separately)
-- ALTER TABLE group_municipalities ALTER COLUMN province SET NOT NULL;
-- ALTER TABLE group_municipalities ALTER COLUMN municipality SET NOT NULL;
