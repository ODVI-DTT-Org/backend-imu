-- Migration 048: Add unique constraint on error_logs.fingerprint
-- Purpose: Fix ON CONFLICT (fingerprint) DO NOTHING error in error logs batch processor
-- Date: 2025-04-22

-- Add unique constraint on fingerprint column
-- This allows the batch processor to use ON CONFLICT (fingerprint) DO NOTHING
-- to prevent duplicate error logs with the same fingerprint
ALTER TABLE error_logs
ADD CONSTRAINT error_logs_fingerprint_key UNIQUE (fingerprint);

-- Create index for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Comment
COMMENT ON CONSTRAINT error_logs_fingerprint_key ON error_logs IS
'Unique constraint on fingerprint to prevent duplicate error logs with the same signature';
