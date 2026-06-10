-- Migration 1107: reclassify loan-release touchpoints from type='Visit' (+ stuffed
-- rejection_reason='Loan Release') to type='Loan Release' (+ rejection_reason=NULL).
--
-- The partial unique index uq_touchpoints_client_user_day used to exclude rows by
-- rejection_reason='Loan Release' so loan releases could coexist with a regular
-- visit on the same day. After this migration, that exclusion is keyed on
-- type='Loan Release' instead. Order matters: drop index → backfill → recreate.

BEGIN;

-- 1. Drop old index (partial WHERE references the soon-to-be-empty rejection_reason path)
DROP INDEX IF EXISTS uq_touchpoints_client_user_day;

-- 2. Backfill: rows incorrectly typed as Visit but actually loan releases
UPDATE touchpoints t
SET type = 'Loan Release', rejection_reason = NULL, updated_at = NOW()
WHERE t.type = 'Visit'
  AND (
    t.rejection_reason = 'Loan Release'
    OR EXISTS (SELECT 1 FROM visits v WHERE v.id = t.visit_id AND v.reason = 'release_loan')
  );

-- 3. Recreate the partial unique index with the new exclusion clause
CREATE UNIQUE INDEX uq_touchpoints_client_user_day
  ON public.touchpoints (client_id, user_id, touchpoint_day_manila)
  WHERE is_legacy = false AND type IS DISTINCT FROM 'Loan Release';

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES ('1107_touchpoints_type_loan_release', 'completed', now(),
  jsonb_build_object(
    'note',
    'Reclassified Visit→Loan Release for loan_release_v2 touchpoints; cleared mis-stuffed rejection_reason; rebuilt uq_touchpoints_client_user_day partial WHERE on type instead of rejection_reason'
  ));

COMMIT;
