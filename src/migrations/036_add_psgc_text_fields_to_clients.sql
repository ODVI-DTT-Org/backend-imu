-- Migration: Add PSGC text fields to clients table
-- These fields store the actual text values from PSGC for easier display and searching
-- The psgc_id foreign key is maintained for data integrity

-- Add PSGC text fields to clients table
DO $$
BEGIN
    -- Add region column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'region'
    ) THEN
        ALTER TABLE clients ADD COLUMN region TEXT;
    END IF;

    -- Add province column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'province'
    ) THEN
        ALTER TABLE clients ADD COLUMN province TEXT;
    END IF;

    -- Add barangay column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'barangay'
    ) THEN
        ALTER TABLE clients ADD COLUMN barangay TEXT;
    END IF;
END $$;

-- Populate PSGC text fields from existing psgc_id references
UPDATE clients c
SET
    region = psg.region,
    province = psg.province,
    municipality = COALESCE(psg.mun_city, c.municipality),
    barangay = psg.barangay
FROM psgc psg
WHERE c.psgc_id = psg.id
AND (c.region IS NULL OR c.province IS NULL OR c.barangay IS NULL);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_region ON clients(region);
CREATE INDEX IF NOT EXISTS idx_clients_province ON clients(province);
CREATE INDEX IF NOT EXISTS idx_clients_barangay ON clients(barangay);

-- Add comments for documentation
COMMENT ON COLUMN clients.region IS 'Region name from PSGC (e.g., NCR, Region I)';
COMMENT ON COLUMN clients.province IS 'Province name from PSGC (e.g., Metro Manila, Pangasinan)';
COMMENT ON COLUMN clients.barangay IS 'Barangay name from PSGC';

-- Verification query
SELECT
    'Migration completed!' as result,
    COUNT(*) as total_clients,
    COUNT(region) as clients_with_region,
    COUNT(province) as clients_with_province,
    COUNT(barangay) as clients_with_barangay
FROM clients;
