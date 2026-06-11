-- Add LOAN_RELEASE touchpoint reason for caravan (Visit) and tele (Call)
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order, is_active)
VALUES
  ('LOAN_RELEASE', 'Loan Release', 'Visit', 'caravan', 'Release', 0, true),
  ('LOAN_RELEASE', 'Loan Release', 'Call',  'tele',    'Release', 0, true)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- Normalize existing visits.reason from the literal 'Loan Release' to 'LOAN_RELEASE'
-- so it joins touchpoint_reasons correctly. Only affects visits table; does NOT touch
-- touchpoints.type or touchpoints.rejection_reason which legitimately use 'Loan Release'.
UPDATE visits SET reason = 'LOAN_RELEASE' WHERE reason = 'Loan Release';
