-- Migration 050: Normalize touchpoints table
-- Add foreign keys to visits and calls tables

-- Add new columns
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE SET NULL;

-- Add constraint to ensure every touchpoint has a visit or call
ALTER TABLE touchpoints ADD CONSTRAINT touchpoint_has_record
  CHECK (visit_id IS NOT NULL OR call_id IS NOT NULL);

-- Create indexes for new foreign keys
CREATE INDEX idx_touchpoints_visit_id ON touchpoints(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX idx_touchpoints_call_id ON touchpoints(call_id) WHERE call_id IS NOT NULL;
