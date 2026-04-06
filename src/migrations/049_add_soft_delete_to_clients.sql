-- Migration: Add soft delete functionality to clients table
-- Date: 2026-04-07
-- Purpose: Enable soft delete for clients (admin only)

-- Add deleted_at column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index on deleted_at for performance (queries often filter by NULL)
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);

-- Add comment explaining the soft delete column
COMMENT ON COLUMN clients.deleted_at IS 'Soft delete timestamp. NULL means active, non-NULL means deleted.';
