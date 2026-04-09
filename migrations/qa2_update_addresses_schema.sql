-- Update existing addresses table schema to match migration 055
-- This alters the existing table rather than recreating it

BEGIN;

-- Add missing columns if they don't exist
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS psgc_id INTEGER;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS street_address TEXT;

-- Rename type column to label if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'addresses' AND column_name = 'type') THEN
        ALTER TABLE addresses RENAME COLUMN type TO label;
    END IF;
END $$;

-- Rename street column to street_address if it exists and street_address doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'addresses' AND column_name = 'street')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'addresses' AND column_name = 'street_address') THEN
        ALTER TABLE addresses RENAME COLUMN street TO street_address;
    END IF;
END $$;

-- Update data: move street data to street_address if needed
UPDATE addresses SET street_address = street WHERE street_address IS NULL AND street IS NOT NULL;

-- Create indexes that don't exist
CREATE INDEX IF NOT EXISTS idx_addresses_client_id_deleted ON addresses(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_psgc_id_deleted ON addresses(psgc_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_primary_deleted ON addresses(client_id, is_primary) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_label_deleted ON addresses(label) WHERE deleted_at IS NULL;

COMMIT;
