-- Migration 082: Rename addresses.label to addresses.type
-- The sync-config and mobile app use 'type' for address category; DB had 'label'

-- Drop the old unique index (references 'label')
DROP INDEX IF EXISTS idx_addresses_unique_label_per_client;

-- Rename the column
ALTER TABLE addresses RENAME COLUMN label TO type;

-- Recreate unique index with new column name
CREATE UNIQUE INDEX idx_addresses_unique_type_per_client
ON addresses(client_id, type)
WHERE deleted_at IS NULL;

-- Backfill street from street_address where street is null
UPDATE addresses SET street = street_address WHERE street IS NULL AND street_address IS NOT NULL;

COMMENT ON COLUMN addresses.type IS 'Address type: Home, Work, Relative, Other';
