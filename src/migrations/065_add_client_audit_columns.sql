-- ============================================
-- Migration 065: Add Client Audit Columns
-- ============================================
-- Purpose: Add created_by and deleted_by columns to track who created or deleted clients
--
-- These columns are essential for:
-- - Audit trails: Know which user created/deleted each client
-- - Accountability: Track user actions in the system
-- - Compliance: Meet data governance requirements
-- ============================================

-- Add created_by column (who created the client)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Add deleted_by column (who soft-deleted the client)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN clients.created_by IS 'User ID of the user who created this client record';
COMMENT ON COLUMN clients.deleted_by IS 'User ID of the user who soft-deleted this client record';

-- Create index on created_by for filtering by creator
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by) WHERE created_by IS NOT NULL;

-- Create index on deleted_by for filtering by deleter
CREATE INDEX IF NOT EXISTS idx_clients_deleted_by ON clients(deleted_by) WHERE deleted_by IS NOT NULL;

-- ============================================
-- Verification Queries
-- ============================================
-- Test 1: Verify columns were added
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'clients'
-- AND column_name IN ('created_by', 'deleted_by');
-- Expected: Two rows showing created_by and deleted_by

-- Test 2: Verify indexes were created
-- SELECT indexname
-- FROM pg_indexes
-- WHERE tablename = 'clients'
-- AND indexname LIKE '%created_by%';
-- Expected: idx_clients_created_by, idx_clients_deleted_by
