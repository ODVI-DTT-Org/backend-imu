-- ============================================================
-- Migration 047a: Add is_legacy Flag to Touchpoints
-- ============================================================
-- Adds flag to distinguish migrated historical data from new touchpoints
-- Migrated data (is_legacy=TRUE) is excluded from pattern validation

BEGIN;

INSERT INTO migration_log (script_name, status)
VALUES ('047a_add_touchpoint_is_legacy', 'started');

ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_touchpoints_is_legacy ON touchpoints(is_legacy);

COMMENT ON COLUMN touchpoints.is_legacy IS 'TRUE for migrated historical data that may not follow the 7-step pattern. Validation logic skips these records.';

INSERT INTO migration_log (script_name, status, completed_at, records_processed)
VALUES ('047a_add_touchpoint_is_legacy', 'completed', NOW(), 0);

COMMIT;
