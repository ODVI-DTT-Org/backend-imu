-- 119_add_approval_reference_number.sql
--
-- Adds a sequential reference_number to approvals so every UDI request /
-- loan release request has a stable short identifier displayable as REQ-####
-- in the admin UI. Especially important since UDI was made optional —
-- otherwise the dialog hero strip says "UDI No. —" with nothing to id.
--
-- Also adds reference_number (nullable BIGINT) to releases so the admin list
-- view can show REQ-#### without needing a JOIN back to approvals. Populated
-- at approval-time in approvals.ts when the release row is inserted.
BEGIN;

ALTER TABLE approvals
  ADD COLUMN reference_number BIGSERIAL;

CREATE UNIQUE INDEX uq_approvals_reference_number
  ON approvals (reference_number);

ALTER TABLE releases
  ADD COLUMN reference_number BIGINT;

INSERT INTO migration_log (script_name, status, started_at, completed_at, details)
VALUES (
  '119_add_approval_reference_number',
  'completed',
  NOW(),
  NOW(),
  jsonb_build_object(
    'note', 'Added reference_number BIGSERIAL to approvals + unique index. Added nullable reference_number BIGINT to releases for denormalised display.'
  )
);

COMMIT;
