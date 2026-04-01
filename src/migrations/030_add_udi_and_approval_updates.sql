-- Migration: Add UDI to clients, add update columns to approvals, drop tele_assignments
-- Date: 2025-03-28

BEGIN;

-- 1. Add UDI column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS udi TEXT;

-- Create index for UDI queries
CREATE INDEX IF NOT EXISTS idx_clients_udi ON clients(udi);

-- 2. Add updated_client_information and updated_udi columns to approvals table
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS updated_client_information JSONB;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS updated_udi TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_approvals_updated_client_information ON approvals(updated_client_information);
CREATE INDEX IF NOT EXISTS idx_approvals_updated_udi ON approvals(updated_udi);

-- 3. Drop tele_assignments table (we use user_locations instead)
DROP TABLE IF EXISTS tele_assignments CASCADE;

COMMIT;

-- Verification queries:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'udi';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'approvals' AND column_name IN ('updated_client_information', 'updated_udi');
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'tele_assignments';
