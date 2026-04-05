-- Migration: Fix touchpoint_reasons table schema for Tele role support
-- This migration updates the old schema (migration 009) to the new schema (migration 029)
-- The new schema adds role, touchpoint_type, and category columns, and renames code to reason_code

-- Step 1: Backup existing data from old table
CREATE TEMP TABLE touchpoint_reasons_backup AS
SELECT * FROM touchpoint_reasons;

-- Step 2: Drop the old table (it has the wrong schema)
DROP TABLE IF EXISTS touchpoint_reasons CASCADE;

-- Step 3: Create the new table with correct schema
CREATE TABLE touchpoint_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_code TEXT NOT NULL,
  label TEXT NOT NULL,
  touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN ('Visit', 'Call')),
  role TEXT NOT NULL CHECK (role IN ('caravan', 'tele')),
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#6B7280',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reason_code, role, touchpoint_type)
);

-- Step 4: Create indexes for better query performance
CREATE INDEX idx_touchpoint_reasons_role ON touchpoint_reasons(role);
CREATE INDEX idx_touchpoint_reasons_touchpoint_type ON touchpoint_reasons(touchpoint_type);
CREATE INDEX idx_touchpoint_reasons_role_type ON touchpoint_reasons(role, touchpoint_type);
CREATE INDEX idx_touchpoint_reasons_active ON touchpoint_reasons(is_active) WHERE is_active = true;

-- Step 5: Create trigger for updated_at
CREATE TRIGGER update_touchpoint_reasons_updated_at
  BEFORE UPDATE ON touchpoint_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Insert Caravan Visit reasons (existing touchpoint reasons from backup)
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order, color)
SELECT
  code,
  label,
  'Visit'::TEXT,
  'caravan'::TEXT,
  'General'::TEXT,
  sort_order,
  color
FROM touchpoint_reasons_backup;

-- Step 7: Insert Tele Call reasons (organized by level and category)
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order) VALUES
  -- LEVEL 1 FAVORABLE
  ('L1_BORROWED', 'LEVEL 1 FAVORABLE - BORROWED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 1),
  ('L1_FULLY_PAID', 'LEVEL 1 FAVORABLE - FULLYPAID', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 2),
  ('L1_INTERESTED', 'LEVEL 1 FAVORABLE - INTERESTED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 3),
  ('L1_LOAN_INQUIRY', 'LEVEL 1 FAVORABLE - LOAN INQUIRY / FOR VERIFICATION', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 4),
  ('L1_UNDECIDED', 'LEVEL 1 FAVORABLE - UNDECIDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 5),
  ('L1_WILL_CALL_IF_NEEDED', 'LEVEL 1 FAVORABLE - WILL CALL IF NEEDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 6),
  ('L1_ENDORSED_TO_CARAVAN', 'LEVEL 1 FAVORABLE - ENDORSED TO CARAVAN', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 7),
  ('L1_NOT_IN_LIST', 'LEVEL 1 FAVORABLE - NOT IN THE LIST', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 8),

  -- LEVEL 2 FAVORABLE
  ('L2_NOT_AROUND', 'LEVEL 2 FAVORABLE - NOT AROUND', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 9),
  ('L2_RINGING', 'LEVEL 2 FAVORABLE - RINGING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 10),
  ('L2_LINE_BUSY', 'LEVEL 2 FAVORABLE - LINE BUSY', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 11),
  ('L2_EXISTING_CLIENT', 'LEVEL 2 FAVORABLE - EXISTING CLIENT', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 12),
  ('L2_WITH_OTHER_LENDING', 'LEVEL 2 FAVORABLE - WITH OTHER LENDING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 13),

  -- LEVEL 1 UNFAVORABLE
  ('L1_NOT_INTERESTED', 'LEVEL 1 UNFAVORABLE - NOT INTERESTED', 'Call', 'tele', 'LEVEL 1 UNFAVORABLE', 14),

  -- LEVEL 2 UNFAVORABLE
  ('L2_INCORRECT_NUMBER', 'LEVEL 2 UNFAVORABLE - INCORRECT / INCOMPLETE NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 15),
  ('L2_WRONG_NUMBER', 'LEVEL 2 UNFAVORABLE - WRONG NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 16),
  ('L2_DROPCALL', 'LEVEL 2 UNFAVORABLE - DROPCALL', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 17),
  ('L2_CANNOT_BE_REACHED', 'LEVEL 2 UNFAVORABLE - CANNOT BE REACH / UNATTENDED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 18),
  ('L2_NOT_YET_IN_SERVICE', 'LEVEL 2 UNFAVORABLE - NOT YET IN SERVICE / CANNOT BE COMPLETED IF DIALLED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 19),
  ('L2_FAMILY_DECLINED', 'LEVEL 2 UNFAVORAVLE - INTERESTED, BUT DECLINED DUE TO FAMILY''S DECISION', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 20),
  ('L2_ABROAD', 'LEVEL 2 UNFAVORABLE - ABROAD', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 21),

  -- LEVEL 3 UNFAVORABLE
  ('L3_NOT_QUALIFIED', 'LEVEL 3 UNFAVORABLE - NOT QUALIFIED - LOW / NEGATIVE LOAN PROCEEDS', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 22),
  ('L3_DISQUALIFIED', 'LEVEL 3 UNFAVORABLE - DISQUALIFIED - HEALTH CONDITION / OVERAGE', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 23),
  ('L3_BACKED_OUT', 'LEVEL 3 UNFAVORABLE - BACKED OUT', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 24),
  ('L3_DISAPPROVED', 'LEVEL 3 UNFAVORABLE - DISAPPROVED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 25),
  ('L3_DECEASED', 'LEVEL 3 UNFAVORABLE - DECEASED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 26)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- Step 8: Drop the backup table
DROP TABLE touchpoint_reasons_backup;

-- Step 9: Create a view for easy access to active reasons grouped by category
CREATE OR REPLACE VIEW active_touchpoint_reasons AS
SELECT
  id,
  reason_code,
  label,
  touchpoint_type,
  role,
  category,
  sort_order
FROM touchpoint_reasons
WHERE is_active = true
ORDER BY role, touchpoint_type, category, sort_order;

COMMENT ON TABLE touchpoint_reasons IS 'Stores predefined reasons for touchpoints, organized by role (caravan/tele) and touchpoint type (Visit/Call)';
COMMENT ON VIEW active_touchpoint_reasons IS 'View of active touchpoint reasons for easy querying';
