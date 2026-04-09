-- Migration: 056_create_phone_numbers_table.sql
-- Description: Create phone_numbers table for multiple phone numbers per client

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL CHECK (label IN ('Mobile', 'Home', 'Work')),
  number VARCHAR(20) NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_primary ON phone_numbers(client_id, is_primary) WHERE deleted_at IS NULL AND is_primary = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_unique_number_per_client ON phone_numbers(client_id, number) WHERE deleted_at IS NULL;

-- Trigger to ensure only one primary per client
CREATE OR REPLACE FUNCTION ensure_single_primary_phone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE phone_numbers
    SET is_primary = false
    WHERE client_id = NEW.client_id
      AND id != NEW.id
      AND is_primary = true
      AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_primary_phone
  AFTER INSERT OR UPDATE ON phone_numbers
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_phone();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_phone_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_phone_numbers_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_numbers_updated_at();

-- Comment
COMMENT ON TABLE phone_numbers IS 'Multiple phone numbers per client';
COMMENT ON COLUMN phone_numbers.label IS 'Phone type: Mobile, Home, Work';
COMMENT ON COLUMN phone_numbers.is_primary IS 'Primary phone flag - only one per client';

-- ROLLBACK
-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS trigger_ensure_single_primary_phone;
-- DROP TRIGGER IF EXISTS trigger_update_phone_numbers_updated_at;
-- DROP FUNCTION IF EXISTS ensure_single_primary_phone();
-- DROP FUNCTION IF EXISTS update_phone_numbers_updated_at();
-- DROP INDEX IF EXISTS idx_phone_numbers_is_primary;
-- DROP INDEX IF EXISTS idx_phone_numbers_client_id;
-- DROP TABLE IF EXISTS phone_numbers;
