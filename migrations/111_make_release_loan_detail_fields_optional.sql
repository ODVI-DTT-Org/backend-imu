-- 111: Make loan-detail fields optional on releases table
-- product_type and loan_type were NOT NULL; the team wants them optional
-- so agents can create a release record without selecting them upfront.
--
-- Postgres CHECK constraint: NULL = ANY(ARRAY[...]) yields NULL, which
-- passes the constraint check, so the existing CHECK constraints on
-- product_type and loan_type do NOT need to be dropped — only the
-- NOT NULL constraint needs to be relaxed.
--
-- Apply with: psql $DATABASE_URL -f migrations/111_make_release_loan_detail_fields_optional.sql

BEGIN;

ALTER TABLE releases
  ALTER COLUMN product_type DROP NOT NULL;

ALTER TABLE releases
  ALTER COLUMN loan_type DROP NOT NULL;

COMMIT;
