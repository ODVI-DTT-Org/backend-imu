-- Migration: Make client_id nullable in approvals table for client creation requests
-- When caravan/tele users create clients, they need approval first
-- At the time of approval creation, the client doesn't exist yet, so client_id must be NULL

-- Alter client_id column to allow NULL values
ALTER TABLE approvals
ALTER COLUMN client_id DROP NOT NULL;

-- Add comment to explain the purpose
COMMENT ON COLUMN approvals.client_id IS 'Nullable to support client creation approvals. When type=client and status=pending, client_id is NULL until approved.';

-- Add check constraint to ensure data integrity
-- Either client_id is NULL (for new client requests) OR status is 'approved' (client created)
-- Actually, we can't easily enforce this with a CHECK constraint because the workflow is:
-- 1. Create approval with client_id=NULL, status='pending'
-- 2. Approve: create client, update approval with client_id, status='approved'
-- So we'll just document this in the table comment

SELECT 'Migration 050: Made client_id nullable in approvals table' as result;
