-- Migration: Add loan_released tracking to clients table
-- When a loan is released, the client should not require further touchpoints

-- Add loan_released boolean column (default false)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS loan_released BOOLEAN DEFAULT FALSE;

-- Add loan_released_at timestamp column (nullable - set when loan is released)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS loan_released_at TIMESTAMP;

-- Add index for filtering released clients
CREATE INDEX IF NOT EXISTS idx_clients_loan_released ON clients(loan_released);

-- Add comment for documentation
COMMENT ON COLUMN clients.loan_released IS 'TRUE when loan has been released to client - no further touchpoints required';
COMMENT ON COLUMN clients.loan_released_at IS 'Timestamp when loan was released to client';
