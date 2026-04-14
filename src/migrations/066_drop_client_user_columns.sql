-- ============================================
-- Migration 066: Drop Client User/Caravan ID Columns
-- ============================================
-- Purpose: Remove user_id and caravan_id columns from clients table
--
-- These columns are being replaced by:
-- - created_by: User ID of who created the client (added in migration 065)
-- - deleted_by: User ID of who soft-deleted the client (added in migration 065)
-- - user_locations table: For area-based client assignment
--
-- This change aligns with the new RBAC system where client access is
-- determined by area assignments rather than direct user ownership.
-- ============================================

-- Drop caravan_id column if exists (legacy field, replaced by user_id then created_by)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'caravan_id'
  ) THEN
    ALTER TABLE clients DROP COLUMN caravan_id;
  END IF;
END $$;

-- Drop user_id column if exists (replaced by created_by and area assignments)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE clients DROP COLUMN user_id;
  END IF;
END $$;

-- ============================================
-- Verification Queries
-- ============================================
-- Test 1: Verify columns were dropped
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'clients'
-- AND column_name IN ('user_id', 'caravan_id');
-- Expected: No rows (columns should not exist)

-- Test 2: Verify created_by and deleted_by still exist
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'clients'
-- AND column_name IN ('created_by', 'deleted_by');
-- Expected: Two rows showing created_by and deleted_by

-- ============================================
-- Impact Analysis
-- ============================================
-- Tables affected: clients (schema change)
-- API affected: Client endpoints will no longer return user_id/caravan_id
-- Frontend affected: Flutter and Vue apps updated to not expect these fields
-- Migration needed: Application code must be deployed before this migration
