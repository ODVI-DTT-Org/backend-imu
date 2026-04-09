-- Migration: 055_create_addresses_table.sql
-- Description: Create addresses table for multiple addresses per client

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  psgc_id INTEGER NOT NULL REFERENCES psgc(id),
  label VARCHAR(50) NOT NULL CHECK (label IN ('Home', 'Work', 'Relative', 'Other')),
  street_address TEXT NOT NULL,
  postal_code VARCHAR(10),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_psgc_id ON addresses(psgc_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_is_primary ON addresses(client_id, is_primary) WHERE deleted_at IS NULL AND is_primary = true;

-- Trigger to ensure only one primary per client
CREATE OR REPLACE FUNCTION ensure_single_primary_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE addresses
    SET is_primary = false
    WHERE client_id = NEW.client_id
      AND id != NEW.id
      AND is_primary = true
      AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_primary_address
  AFTER INSERT OR UPDATE ON addresses
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_address();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_addresses_updated_at();

-- Comment
COMMENT ON TABLE addresses IS 'Multiple addresses per client with PSGC reference';
COMMENT ON COLUMN addresses.client_id IS 'FK to clients table';
COMMENT ON COLUMN addresses.psgc_id IS 'FK to PSGC table for geographic data';
COMMENT ON COLUMN addresses.label IS 'Address type: Home, Work, Relative, Other';
COMMENT ON COLUMN addresses.street_address IS 'Street and building information';
COMMENT ON COLUMN addresses.is_primary IS 'Primary address flag - only one per client';

-- ROLLBACK
-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS trigger_ensure_single_primary_address;
-- DROP TRIGGER IF EXISTS trigger_update_addresses_updated_at;
-- DROP FUNCTION IF EXISTS ensure_single_primary_address();
-- DROP FUNCTION IF EXISTS update_addresses_updated_at();
-- DROP INDEX IF EXISTS idx_addresses_is_primary;
-- DROP INDEX IF EXISTS idx_addresses_psgc_id;
-- DROP INDEX IF EXISTS idx_addresses_client_id;
-- DROP TABLE IF EXISTS addresses;
