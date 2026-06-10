-- 121_add_failed_status_to_approvals.sql
--
-- Allow approval processing failures to be recorded instead of reporting a
-- successful approval when the underlying mutation affected no rows.

BEGIN;

ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS approvals_status_check;

ALTER TABLE approvals
  ADD CONSTRAINT approvals_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'approved'::text,
      'rejected'::text,
      'failed'::text
    ])
  );

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS error_message TEXT;

INSERT INTO migration_log (script_name, status, started_at, completed_at, details)
VALUES (
  '121_add_failed_status_to_approvals',
  'completed',
  NOW(),
  NOW(),
  jsonb_build_object(
    'note', 'Added approvals.status=failed and approvals.error_message for approval mutation failures.'
  )
);

COMMIT;
