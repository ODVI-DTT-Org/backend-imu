-- Migration: Fix user_locations table - add missing municipality_id column
-- Description: Add municipality_id column to user_locations table
-- Date: 2026-04-03

BEGIN;

-- Check if municipality_id column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_locations' 
    AND column_name = 'municipality_id'
  ) THEN
    ALTER TABLE user_locations ADD COLUMN municipality_id TEXT;
    
    RAISE NOTICE 'Added municipality_id column to user_locations table';
  ELSE
    RAISE NOTICE 'municipality_id column already exists in user_locations table';
  END IF;
END $$;

COMMIT;

SELECT 'Migration 041: Fixed user_locations table' as result;
