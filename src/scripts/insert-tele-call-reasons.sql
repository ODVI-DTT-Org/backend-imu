-- SQL Script to insert Tele Call touchpoint reasons
-- Run this manually if the Tele Call reasons dropdown is empty

-- First, check if Tele Call reasons already exist
SELECT COUNT(*) as existing_tele_call_reasons
FROM touchpoint_reasons
WHERE role = 'tele' AND touchpoint_type = 'Call';

-- If the count is 0, insert the Tele Call reasons
-- You can run the following INSERT statement:

INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order, is_active) VALUES
  -- LEVEL 1 FAVORABLE
  ('L1_BORROWED', 'LEVEL 1 FAVORABLE - BORROWED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 1, true),
  ('L1_FULLY_PAID', 'LEVEL 1 FAVORABLE - FULLYPAID', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 2, true),
  ('L1_INTERESTED', 'LEVEL 1 FAVORABLE - INTERESTED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 3, true),
  ('L1_LOAN_INQUIRY', 'LEVEL 1 FAVORABLE - LOAN INQUIRY / FOR VERIFICATION', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 4, true),
  ('L1_UNDECIDED', 'LEVEL 1 FAVORABLE - UNDECIDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 5, true),
  ('L1_WILL_CALL_IF_NEEDED', 'LEVEL 1 FAVORABLE - WILL CALL IF NEEDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 6, true),
  ('L1_ENDORSED_TO_CARAVAN', 'LEVEL 1 FAVORABLE - ENDORSED TO CARAVAN', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 7, true),
  ('L1_NOT_IN_LIST', 'LEVEL 1 FAVORABLE - NOT IN THE LIST', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 8, true),

  -- LEVEL 2 FAVORABLE
  ('L2_NOT_AROUND', 'LEVEL 2 FAVORABLE - NOT AROUND', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 9, true),
  ('L2_RINGING', 'LEVEL 2 FAVORABLE - RINGING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 10, true),
  ('L2_LINE_BUSY', 'LEVEL 2 FAVORABLE - LINE BUSY', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 11, true),
  ('L2_EXISTING_CLIENT', 'LEVEL 2 FAVORABLE - EXISTING CLIENT', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 12, true),
  ('L2_WITH_OTHER_LENDING', 'LEVEL 2 FAVORABLE - WITH OTHER LENDING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 13, true),

  -- LEVEL 1 UNFAVORABLE
  ('L1_NOT_INTERESTED', 'LEVEL 1 UNFAVORABLE - NOT INTERESTED', 'Call', 'tele', 'LEVEL 1 UNFAVORABLE', 14, true),

  -- LEVEL 2 UNFAVORABLE
  ('L2_INCORRECT_NUMBER', 'LEVEL 2 UNFAVORABLE - INCORRECT / INCOMPLETE NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 15, true),
  ('L2_WRONG_NUMBER', 'LEVEL 2 UNFAVORABLE - WRONG NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 16, true),
  ('L2_DROPCALL', 'LEVEL 2 UNFAVORABLE - DROPCALL', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 17, true),
  ('L2_CANNOT_BE_REACHED', 'LEVEL 2 UNFAVORABLE - CANNOT BE REACH / UNATTENDED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 18, true),
  ('L2_NOT_YET_IN_SERVICE', 'LEVEL 2 UNFAVORABLE - NOT YET IN SERVICE / CANNOT BE COMPLETED IF DIALLED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 19, true),
  ('L2_FAMILY_DECLINED', 'LEVEL 2 UNFAVORAVLE - INTERESTED, BUT DECLINED DUE TO FAMILY''S DECISION', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 20, true),
  ('L2_ABROAD', 'LEVEL 2 UNFAVORABLE - ABROAD', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 21, true),

  -- LEVEL 3 UNFAVORABLE
  ('L3_NOT_QUALIFIED', 'LEVEL 3 UNFAVORABLE - NOT QUALIFIED - LOW / NEGATIVE LOAN PROCEEDS', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 22, true),
  ('L3_DISQUALIFIED', 'LEVEL 3 UNFAVORABLE - DISQUALIFIED - HEALTH CONDITION / OVERAGE', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 23, true),
  ('L3_BACKED_OUT', 'LEVEL 3 UNFAVORABLE - BACKED OUT', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 24, true),
  ('L3_DISAPPROVED', 'LEVEL 3 UNFAVORABLE - DISAPPROVED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 25, true),
  ('L3_DECEASED', 'LEVEL 3 UNFAVORABLE - DECEASED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 26, true)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- Verify the insert
SELECT category, COUNT(*) as count
FROM touchpoint_reasons
WHERE role = 'tele' AND touchpoint_type = 'Call' AND is_active = true
GROUP BY category
ORDER BY category;
