-- Migration: Fix user_locations municipality column name
-- Date: 2026-04-03
-- Issue: Production database has column named 'municipality' but code expects 'municipality_id'
-- Solution: Rename column to match the schema defined in migrations

BEGIN;

-- Check if column exists with old name and rename it
DO $$
BEGIN
    -- Check if the column exists with the wrong name 'municipality'
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_locations'
          AND column_name = 'municipality'
    ) THEN
        -- Rename column to correct name
        ALTER TABLE user_locations
        RENAME COLUMN municipality TO municipality_id;

        RAISE NOTICE 'Renamed column municipality to municipality_id in user_locations table';
    ELSE
        RAISE NOTICE 'Column municipality does not exist (already using municipality_id)';
    END IF;
END $$;

-- Update comment for clarity
COMMENT ON COLUMN user_locations.municipality_id IS 'Format: "province-municipality" (e.g., "Tawi-Tawi-Bongao")';

-- Verify the fix
SELECT
    'user_locations schema verified' as status,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_locations'
  AND column_name IN ('municipality_id', 'municipality')
ORDER BY column_name;

COMMIT;

-- Expected result:
-- Should show only municipality_id column, not municipality
