-- Migration 069: Add call_id column to releases table and make visit_id nullable
-- Description: Support Tele loan releases via calls and Admin direct releases

-- Add call_id column to releases table
ALTER TABLE releases ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE CASCADE;

-- Make visit_id nullable (for admin direct releases and tele releases)
ALTER TABLE releases ALTER COLUMN visit_id DROP NOT NULL;

-- Add constraint to ensure proper activity reference
ALTER TABLE releases ADD CONSTRAINT release_activity_check CHECK (
  (visit_id IS NOT NULL AND call_id IS NULL) OR  -- Caravan: visit only
  (visit_id IS NULL AND call_id IS NOT NULL) OR  -- Tele: call only
  (visit_id IS NULL AND call_id IS NULL)         -- Admin: direct release
);

-- Add comments for documentation
COMMENT ON COLUMN releases.call_id IS 'References calls(id) for Tele releases, NULL for Admin/Caravan releases';
COMMENT ON COLUMN releases.visit_id IS 'References visits(id) for Caravan releases, NULL for Admin/Tele releases';
COMMENT ON CONSTRAINT release_activity_check ON releases IS 'Ensures only one of visit_id or call_id is set, or both NULL for admin direct releases';
