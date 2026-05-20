-- Migration 107: Add street field to clients table
-- Purpose: Allow storing the street/address line detail for clients
-- This complements PSGC location (region, province, municipality, barangay)

BEGIN;

-- Add street column to clients table (optional)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS street TEXT;

-- Add comment for documentation
COMMENT ON COLUMN clients.street IS 'Street address line for the client (complements PSGC location fields)';

-- Create index for efficient address-based lookups
CREATE INDEX IF NOT EXISTS idx_clients_street ON clients(street) WHERE street IS NOT NULL;

COMMIT;

-- Verification query:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'street';
