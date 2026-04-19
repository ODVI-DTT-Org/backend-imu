-- Migration 088: Drop amount column from releases (UDI number IS the amount)
-- Also migrate existing loan_release_v2 pending approvals to type='udi'
-- so they appear in the UDI approvals queue

-- Migrate existing loan_release_v2 approvals to udi type,
-- extracting udi_number from the notes JSON into the udi_number column
UPDATE approvals
SET
  type = 'udi',
  udi_number = (notes::jsonb->>'udi_number')
WHERE type = 'loan_release_v2'
  AND status = 'pending'
  AND notes IS NOT NULL
  AND notes::jsonb->>'udi_number' IS NOT NULL;

-- Drop amount column from releases (udi_number serves this purpose)
ALTER TABLE releases DROP COLUMN IF EXISTS amount;
