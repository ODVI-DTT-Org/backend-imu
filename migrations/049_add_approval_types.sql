-- Migration 049: Widen approvals.type CHECK constraint
-- Description: Add address_add, phone_add, loan_release_v2, client_delete approval types
-- Date: 2026-04-18

-- Drop the existing constraint and replace with one that covers all used types
ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS approvals_type_check;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_type_check
  CHECK (type IN ('client', 'udi', 'address_add', 'phone_add', 'loan_release_v2', 'client_delete'));
