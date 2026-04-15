-- Migration 070: Update approvals.type enum constraint for new approval types
-- Description: Add loan_release_v2, address_add, phone_add to approvals type enum

-- First, drop the existing check constraint
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_type_check;

-- Add the updated check constraint with new approval types
ALTER TABLE approvals ADD CONSTRAINT approvals_type_check
  CHECK (type IN ('client', 'udi', 'loan_release_v2', 'address_add', 'phone_add'));

-- Add comment for documentation
COMMENT ON COLUMN approvals.type IS 'Type of approval: client (create/edit), udi (loan release), loan_release_v2 (new loan release flow), address_add, phone_add';
