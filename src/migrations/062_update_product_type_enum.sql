-- Update product_type enum values in clients table
-- Migration: 062_update_product_type_enum.sql
-- Date: 2025-04-13

-- First, drop the existing check constraint
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_product_type_check;

-- Add the new check constraint with updated product type values
ALTER TABLE clients
ADD CONSTRAINT clients_product_type_check
CHECK (product_type IN ('BFP ACTIVE', 'BFP PENSION', 'PNP PENSION', 'NAPOLCOM', 'BFP STP'));

-- Update existing data: map old values to new values
UPDATE clients
SET product_type = CASE
    WHEN product_type = 'SSS Pensioner' THEN 'PNP PENSION'
    WHEN product_type = 'GSIS Pensioner' THEN 'PNP PENSION'
    WHEN product_type = 'Private' THEN 'BFP ACTIVE'
    ELSE 'BFP ACTIVE'
END
WHERE product_type IN ('SSS Pensioner', 'GSIS Pensioner', 'Private');

-- Add comment
COMMENT ON COLUMN clients.product_type IS 'Product type for the client: BFP ACTIVE, BFP PENSION, PNP PENSION, NAPOLCOM, or BFP STP';
