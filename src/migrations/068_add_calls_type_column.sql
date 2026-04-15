-- Migration 068: Add type column to calls table
-- Description: Add type column to distinguish loan release calls from regular calls

-- Add type column to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'regular_call'
  CHECK (type IN ('regular_call', 'release_loan'));

-- Add comment for documentation
COMMENT ON COLUMN calls.type IS 'Type of call: regular_call or release_loan';
