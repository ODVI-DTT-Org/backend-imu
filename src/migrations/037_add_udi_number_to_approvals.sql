-- Migration: Add udi_number field to approvals table
-- Date: 2025-03-27
-- Issue: UDI number needs to be stored with loan release approvals
-- Solution: Add udi_number column to approvals table

BEGIN;

-- Add udi_number column to approvals table
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS udi_number TEXT;

-- Add index for efficient UDI number lookups
CREATE INDEX IF NOT EXISTS idx_approvals_udi_number ON approvals(udi_number);

-- Add comment for documentation
COMMENT ON COLUMN approvals.udi_number IS 'UDI (Unique Document Identifier) number for loan release approvals';

COMMIT;

-- Verification query
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'udi_number';
