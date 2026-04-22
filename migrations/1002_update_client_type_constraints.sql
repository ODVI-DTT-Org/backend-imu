-- Migration: Update client type dropdown values
-- Date: 2026-04-22
-- Description: Update CHECK constraints for pension_type, market_type, client_type to match new dropdown values

-- First, drop existing loan_type constraint (will be recreated)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_loan_type_check;

-- Add CHECK constraint for pension_type
ALTER TABLE clients ADD CONSTRAINT clients_pension_type_check
  CHECK (pension_type IN (
    'PNP - RETIREE OPTIONAL',
    'PNP - RETIREE COMPULSORY',
    'PNP - RETIREE',
    'BFP - RETIREE',
    'BFP STP - RETIREE',
    'PNP - TRANSFEREE',
    'BFP - SURVIVOR',
    'PNP - SURVIVOR',
    'PNP - TPPD',
    'BFP - TPPD',
    'PNP - MINOR',
    'BFP - MINOR',
    'PNP - POSTHUMOUS MINOR',
    'PNP - POSTHUMOUS SPOUSE',
    'OTHERS',
    NULL  -- Allow null for existing data
  ));

-- Add CHECK constraint for market_type
ALTER TABLE clients ADD CONSTRAINT clients_market_type_check
  CHECK (market_type IN (
    'VIRGIN',
    'EXISTING',
    'FULLY PAID',
    NULL  -- Allow null for existing data
  ));

-- Add CHECK constraint for client_type
ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN (
    'POTENTIAL',
    'EXISTING',
    NULL  -- Allow null for existing data
  ));

-- Recreate loan_type constraint (unchanged, just for completeness)
ALTER TABLE clients ADD CONSTRAINT clients_loan_type_check
  CHECK (loan_type IN (
    'NEW',
    'ADDITIONAL',
    'RENEWAL',
    'PRETERM',
    NULL  -- Allow null for existing data
  ));

-- Note: product_type constraint already exists and is correct
-- No changes needed for product_type

-- Comments for documentation
COMMENT ON CONSTRAINT clients_pension_type_check ON clients IS 'Valid pension types matching new dropdown values';
COMMENT ON CONSTRAINT clients_market_type_check ON clients IS 'Valid market types: VIRGIN, EXISTING, FULLY PAID';
COMMENT ON CONSTRAINT clients_client_type_check ON clients IS 'Valid client types: POTENTIAL, EXISTING';
COMMENT ON CONSTRAINT clients_loan_type_check ON clients IS 'Valid loan types: NEW, ADDITIONAL, RENEWAL, PRETERM';
