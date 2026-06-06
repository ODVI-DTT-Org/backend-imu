-- Migration 116: Enforce one touchpoint per (client_id, user_id, Manila day)
-- Existing rows are marked is_legacy=true so the partial unique index only
-- constrains NEW inserts. No existing duplicate rows are deleted.

BEGIN;

-- Step 1: Mark all existing rows as legacy so the unique index excludes them
UPDATE touchpoints
SET is_legacy = true
WHERE created_at < now();

-- Step 2: Add generated column for Manila-local date (STORED)
ALTER TABLE touchpoints
  ADD COLUMN IF NOT EXISTS touchpoint_day_manila date
    GENERATED ALWAYS AS ((created_at AT TIME ZONE 'Asia/Manila')::date) STORED;

-- Step 3: Create partial unique index — only constrains non-legacy rows
CREATE UNIQUE INDEX uq_touchpoints_client_user_day
  ON touchpoints (client_id, user_id, touchpoint_day_manila)
  WHERE is_legacy = false;

-- Step 4: Record in migration log
INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '116_unique_touchpoint_per_client_user_day',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'Marked all pre-existing rows is_legacy=true; added touchpoint_day_manila generated column; created partial unique index uq_touchpoints_client_user_day'
  )
);

COMMIT;
