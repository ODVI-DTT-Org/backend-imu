-- 118_add_address_edit_to_approvals_type_check.sql
--
-- Commit 9d89210 (feat/loan-release-v2 address approval) added a code path
-- that inserts an approval with type='address_edit' when a caravan agent
-- submits a loan release with a structured GPS address that differs from the
-- client's existing primary address. However the approvals_type_check
-- constraint was never updated to include 'address_edit', so those INSERTs
-- raise a constraint-violation error inside the transaction and the entire
-- loan release returns 500.
--
-- Fix: drop the existing check constraint and recreate it with 'address_edit'
-- added to the allowed list.

BEGIN;

ALTER TABLE approvals
  DROP CONSTRAINT approvals_type_check;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_type_check CHECK (
    type = ANY (ARRAY[
      'client'::text,
      'udi'::text,
      'address_add'::text,
      'address_edit'::text,
      'phone_add'::text,
      'loan_release_v2'::text,
      'client_delete'::text
    ])
  );

INSERT INTO migration_log (script_name, status, started_at, completed_at, details)
VALUES (
  '118_add_address_edit_to_approvals_type_check',
  'completed',
  NOW(),
  NOW(),
  jsonb_build_object(
    'note', 'Added address_edit to approvals_type_check. The loan-release-v2 address approval path (9d89210) omitted this value, causing 500 errors when a caravan agent submitted with structured GPS address fields and the client already had a primary address.'
  )
);

COMMIT;
