-- 117_allow_loan_release_alongside_touchpoint.sql
--
-- Migration 116 added a partial unique index on (client_id, user_id,
-- touchpoint_day_manila) WHERE is_legacy = false to block duplicate
-- touchpoints per agent per Manila-day.
--
-- The loan-release flow (POST /approvals/loan-release-v2) inserts a SECOND
-- row into `touchpoints` as a side-effect to mark "this client was contacted
-- today via loan release". That row uses rejection_reason = 'Loan Release'.
-- If the agent recorded a regular touchpoint earlier the same day, the loan
-- release INSERT collides with the unique index and the route returns 500.
--
-- Per product spec, touchpoint + loan-release on the same client+day is
-- allowed (they're independent flows). Only duplicate REGULAR touchpoints
-- should be blocked.
--
-- Fix: rebuild the index to exclude loan-release shadow rows from the
-- uniqueness predicate.

BEGIN;

DROP INDEX IF EXISTS uq_touchpoints_client_user_day;

CREATE UNIQUE INDEX uq_touchpoints_client_user_day
  ON touchpoints (client_id, user_id, touchpoint_day_manila)
  WHERE is_legacy = false
    AND (rejection_reason IS DISTINCT FROM 'Loan Release');

INSERT INTO migration_log (script_name, status, started_at, completed_at, details)
VALUES (
  '117_allow_loan_release_alongside_touchpoint',
  'completed',
  NOW(),
  NOW(),
  jsonb_build_object(
    'note', 'Rebuilt uq_touchpoints_client_user_day to exclude rows where rejection_reason = ''Loan Release'' so loan releases can co-exist with a regular touchpoint on the same client/day.'
  )
);

COMMIT;
