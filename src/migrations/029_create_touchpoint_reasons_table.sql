-- Migration: Create touchpoint_reasons table
-- This table stores predefined reasons for touchpoints, organized by role and touchpoint type

-- Create the touchpoint_reasons table
CREATE TABLE IF NOT EXISTS touchpoint_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_code TEXT NOT NULL,
  label TEXT NOT NULL,
  touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN ('Visit', 'Call')),
  role TEXT NOT NULL CHECK (role IN ('caravan', 'tele')),
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reason_code, role, touchpoint_type)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role ON touchpoint_reasons(role);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_touchpoint_type ON touchpoint_reasons(touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role_type ON touchpoint_reasons(role, touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_active ON touchpoint_reasons(is_active) WHERE is_active = true;

-- Create trigger for updated_at
CREATE TRIGGER update_touchpoint_reasons_updated_at
  BEFORE UPDATE ON touchpoint_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert Caravan Visit reasons (existing touchpoint reasons)
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order) VALUES
  ('ABROAD', 'Abroad', 'Visit', 'caravan', 'General', 1),
  ('APPLY_MEMBERSHIP', 'Apply for PUSU Membership / LIKA Membership', 'Visit', 'caravan', 'General', 2),
  ('BACKED_OUT', 'Backed Out', 'Visit', 'caravan', 'Unfavorable', 3),
  ('CI_BI', 'CI/BI', 'Visit', 'caravan', 'General', 4),
  ('DECEASED', 'Deceased', 'Visit', 'caravan', 'Unfavorable', 5),
  ('DISAPPROVED', 'Disapproved', 'Visit', 'caravan', 'Unfavorable', 6),
  ('FOR_ADA_COMPLIANCE', 'For ADA Compliance', 'Visit', 'caravan', 'Processing', 7),
  ('FOR_PROCESSING', 'For Processing / Approval / Request / Buy-Out', 'Visit', 'caravan', 'Processing', 8),
  ('FOR_UPDATE', 'For Update', 'Visit', 'caravan', 'Processing', 9),
  ('FOR_VERIFICATION', 'For Verification', 'Visit', 'caravan', 'Processing', 10),
  ('INACCESSIBLE_AREA', 'Inaccessible / Critical Area', 'Visit', 'caravan', 'Unfavorable', 11),
  ('INTERESTED', 'Interested', 'Visit', 'caravan', 'Favorable', 12),
  ('LOAN_INQUIRY', 'Loan Inquiry', 'Visit', 'caravan', 'Favorable', 13),
  ('MOVED_OUT', 'Moved Out', 'Visit', 'caravan', 'Unfavorable', 14),
  ('NOT_AMENABLE', 'Not Amenable to Our Product Criteria', 'Visit', 'caravan', 'Unfavorable', 15),
  ('NOT_AROUND', 'Not Around', 'Visit', 'caravan', 'General', 16),
  ('NOT_IN_LIST', 'Not In the List', 'Visit', 'caravan', 'General', 17),
  ('NOT_INTERESTED', 'Not Interested', 'Visit', 'caravan', 'Unfavorable', 18),
  ('OVERAGE', 'Overage', 'Visit', 'caravan', 'Unfavorable', 19),
  ('POOR_HEALTH', 'Poor Health Condition', 'Visit', 'caravan', 'Unfavorable', 20),
  ('RETURNED_ATM', 'Returned ATM / Pick-up ATM', 'Visit', 'caravan', 'Processing', 21),
  ('TELEMARKETING', 'Telemarketing', 'Visit', 'caravan', 'Favorable', 22),
  ('UNDECIDED', 'Undecided', 'Visit', 'caravan', 'Favorable', 23),
  ('UNLOCATED', 'Unlocated', 'Visit', 'caravan', 'Unfavorable', 24),
  ('WITH_OTHER_LENDING', 'With Other Lending', 'Visit', 'caravan', 'General', 25),
  ('INTERESTED_FAMILY_DECLINED', 'Interested, But Declined Due to Family Decision', 'Visit', 'caravan', 'Unfavorable', 26)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- Insert Tele Call reasons (organized by level and category)
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

-- Create a view for easy access to active reasons grouped by category
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
