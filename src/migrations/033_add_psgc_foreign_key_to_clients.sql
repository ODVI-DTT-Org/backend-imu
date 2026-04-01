-- Migration: Add psgc_id foreign key to clients table
-- This replaces the free-text municipality field with a proper PSGC reference

-- ============================================
-- STEP 1: Add psgc_id column to clients table
-- ============================================

DO $$
BEGIN
    -- Check if psgc_id column already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'clients'
        AND column_name = 'psgc_id'
    ) THEN
        ALTER TABLE clients ADD COLUMN psgc_id INTEGER REFERENCES psgc(id);
    END IF;
END $$;

-- ============================================
-- STEP 2: Migrate existing municipality data to psgc_id
-- ============================================

-- Update clients.psgc_id by matching existing municipality text to psgc.mun_city
-- This will match clients where municipality = psgc.mun_city
UPDATE clients c
SET psgc_id = (
    SELECT p.id
    FROM psgc p
    WHERE p.mun_city = c.municipality
    LIMIT 1
)
WHERE c.municipality IS NOT NULL
AND c.psgc_id IS NULL;

-- ============================================
-- STEP 3: Create index for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_clients_psgc_id ON clients(psgc_id);

-- ============================================
-- STEP 4: (Optional) Add comment to document the change
-- ============================================

COMMENT ON COLUMN clients.psgc_id IS 'Foreign key reference to PSGC table for geographic data';

-- ============================================
-- STEP 5: Verification query
-- ============================================

SELECT
    'Migration completed!' as result,
    COUNT(*) as total_clients,
    COUNT(psgc_id) as clients_with_psgc,
    COUNT(*) - COUNT(psgc_id) as clients_without_psgc
FROM clients;

-- Note: The old municipality text column is kept for backward compatibility
-- It can be dropped later after verifying data migration was successful
