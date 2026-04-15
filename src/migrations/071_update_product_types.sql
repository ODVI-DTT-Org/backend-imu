-- Update product_type values in releases table
-- Migration: 071_update_product_types.sql
-- Date: 2026-04-15

BEGIN;

-- Step 1: Drop the existing check constraint
ALTER TABLE releases DROP CONSTRAINT IF EXISTS releases_product_type_check;

-- Step 2: Update existing data to map old values to new values
UPDATE releases
SET product_type = CASE
    WHEN product_type = 'PUSU' THEN 'BFP_ACTIVE'
    WHEN product_type = 'LIKA' THEN 'BFP_PENSION'
    WHEN product_type = 'SUB2K' THEN 'PNP_PENSION'
    ELSE product_type
END
WHERE product_type IN ('PUSU', 'LIKA', 'SUB2K');

-- Step 3: Add the new check constraint with updated values
ALTER TABLE releases
ADD CONSTRAINT releases_product_type_check
CHECK (product_type IN ('BFP_ACTIVE', 'BFP_PENSION', 'PNP_PENSION', 'NAPOLCOM', 'BFP_STP'));

COMMIT;

-- Verification query (run separately to verify)
-- SELECT DISTINCT product_type FROM releases;
