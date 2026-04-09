-- Update existing phone_numbers table schema to match migration 056
-- This alters the existing table rather than recreating it

BEGIN;

-- Add missing columns if they don't exist
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Rename type column to label if label doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phone_numbers' AND column_name = 'type')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phone_numbers' AND column_name = 'label') THEN
        ALTER TABLE phone_numbers RENAME COLUMN type TO label;
    END IF;
END $$;

-- If label already exists, update data from type
UPDATE phone_numbers SET label = type WHERE label IS NULL AND type IS NOT NULL;

-- Create indexes that don't exist
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id_deleted ON phone_numbers(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_primary_deleted ON phone_numbers(client_id, is_primary) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_label_deleted ON phone_numbers(label) WHERE deleted_at IS NULL;

COMMIT;
