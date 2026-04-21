-- Migration: Unli Touchpoint - CMS Data Migration
-- Date: 2026-04-21
-- Description: Migrate cms_visit_logs and cms_call_logs to touchpoints table
-- Adds: migrated_from_cms tracking column

BEGIN;

-- Step 1: Add migration tracking column
ALTER TABLE touchpoints
ADD COLUMN IF NOT EXISTS migrated_from_cms BOOLEAN DEFAULT FALSE;

-- Step 2: Migrate visit logs to touchpoints
INSERT INTO touchpoints (
  id,
  client_id,
  user_id,
  touchpoint_number,
  type,
  status,
  date,
  time_in,
  time_out,
  remarks,
  photo_path,
  time_in_gps_lat,
  time_in_gps_lng,
  time_in_gps_address,
  time_out_gps_lat,
  time_out_gps_lng,
  time_out_gps_address,
  created_at,
  updated_at,
  migrated_from_cms
)
SELECT
  gen_random_uuid(),
  cvl.client_id,
  cvl.user_id,
  (SELECT COALESCE(MAX(tp.touchpoint_number), 0) + 1
   FROM touchpoints tp
   WHERE tp.client_id = cvl.client_id) as touchpoint_number,
  'Visit' as type,
  cvl.status,
  cvl.visit_date as date,
  cvl.time_in,
  cvl.time_out,
  cvl.remarks,
  cvl.photo_path,
  cvl.gps_lat as time_in_gps_lat,
  cvl.gps_lng as time_in_gps_lng,
  cvl.gps_address as time_in_gps_address,
  NULL as time_out_gps_lat,
  NULL as time_out_gps_lng,
  NULL as time_out_gps_address,
  cvl.created_at,
  cvl.updated_at,
  TRUE as migrated_from_cms
FROM cms_visit_logs cvl
WHERE cvl.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Step 3: Migrate call logs to touchpoints
INSERT INTO touchpoints (
  id,
  client_id,
  user_id,
  touchpoint_number,
  type,
  status,
  date,
  time_in,
  time_out,
  remarks,
  photo_path,
  time_in_gps_lat,
  time_in_gps_lng,
  time_in_gps_address,
  time_out_gps_lat,
  time_out_gps_lng,
  time_out_gps_address,
  created_at,
  updated_at,
  migrated_from_cms
)
SELECT
  gen_random_uuid(),
  ccl.client_id,
  ccl.user_id,
  (SELECT COALESCE(MAX(tp.touchpoint_number), 0) + 1
   FROM touchpoints tp
   WHERE tp.client_id = ccl.client_id) as touchpoint_number,
  'Call' as type,
  ccl.status,
  ccl.call_date as date,
  ccl.time_in,
  ccl.time_out,
  ccl.remarks,
  ccl.photo_path,
  ccl.gps_lat as time_in_gps_lat,
  ccl.gps_lng as time_in_gps_lng,
  ccl.gps_address as time_in_gps_address,
  NULL as time_out_gps_lat,
  NULL as time_out_gps_lng,
  NULL as time_out_gps_address,
  ccl.created_at,
  ccl.updated_at,
  TRUE as migrated_from_cms
FROM cms_call_logs ccl
WHERE ccl.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Step 4: Create index for migrated records
CREATE INDEX IF NOT EXISTS idx_touchpoints_migrated_from_cms
ON touchpoints(migrated_from_cms)
WHERE migrated_from_cms = TRUE;

-- Step 5: Backup CMS tables before cleanup
CREATE TABLE IF NOT EXISTS cms_visit_logs_backup AS
SELECT * FROM cms_visit_logs;

CREATE TABLE IF NOT EXISTS cms_call_logs_backup AS
SELECT * FROM cms_call_logs;

COMMIT;
