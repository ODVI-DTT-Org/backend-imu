-- ============================================
-- Migration 072: Add Touchpoint Summary to Clients
-- ============================================
-- Purpose: Pre-calculate touchpoint data on clients table
-- for improved query performance on /api/clients and /api/clients/assigned
--
-- Columns added:
-- - touchpoint_summary: JSONB array of all touchpoints with full details
-- - touchpoint_number: Current touchpoint count (1-7), defaults to 1
-- - next_touchpoint: Next touchpoint type ('Visit' or 'Call'), defaults to 'Visit'
-- ============================================

-- Add new columns to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS touchpoint_summary JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS touchpoint_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_touchpoint VARCHAR(10) DEFAULT 'Visit';

-- Create index for filtering by next touchpoint type (for Caravan/Tele)
CREATE INDEX IF NOT EXISTS idx_clients_next_touchpoint
  ON clients(next_touchpoint)
  WHERE next_touchpoint IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN clients.touchpoint_summary IS 'JSONB array of all touchpoints with full details (id, number, type, date, reason, status, user_id, time_in, time_out, location)';
COMMENT ON COLUMN clients.touchpoint_number IS 'Current touchpoint count (unlimited). Defaults to 1 for new clients.';
COMMENT ON COLUMN clients.next_touchpoint IS 'Next touchpoint type (backend-determined). NULL when complete.';
