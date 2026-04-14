-- Add loan_type column to clients table
-- Migration: 061_add_loan_type_to_clients.sql
-- Date: 2025-04-13

-- Add loan_type column to clients table
ALTER TABLE clients
ADD COLUMN loan_type TEXT CHECK (loan_type IN ('NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM'));

-- Create index on loan_type for filtering
CREATE INDEX IF NOT EXISTS idx_clients_loan_type ON clients(loan_type) WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN clients.loan_type IS 'Loan type for the client: NEW, ADDITIONAL, RENEWAL, or PRETERM';
