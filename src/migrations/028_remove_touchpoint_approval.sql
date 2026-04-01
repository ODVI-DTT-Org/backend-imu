-- Migration: Remove touchpoint approval fields
-- Archives rejected/deleted touchpoints before removing approval fields
-- Migration 028

BEGIN;

-- Step 1: Create archival table for rejected/deleted touchpoints
CREATE TABLE IF NOT EXISTS touchpoints_archived (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  user_id UUID REFERENCES users(id),
  touchpoint_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  photo_url TEXT,
  audio_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  time_in TIME,
  time_in_gps_lat NUMERIC,
  time_in_gps_lng NUMERIC,
  time_in_gps_address TEXT,
  time_out TIME,
  time_out_gps_lat NUMERIC,
  time_out_gps_lng NUMERIC,
  time_out_gps_address TEXT,
  next_visit_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  original_edit_status TEXT,
  rejection_reason TEXT,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Archive rejected and deleted touchpoints
INSERT INTO touchpoints_archived (
  id, client_id, user_id, touchpoint_number, type, date, reason, status,
  notes, photo_url, audio_url, latitude, longitude, time_in,
  time_in_gps_lat, time_in_gps_lng, time_in_gps_address, time_out,
  time_out_gps_lat, time_out_gps_lng, time_out_gps_address, next_visit_date,
  created_at, updated_at, original_edit_status, rejection_reason
)
SELECT
  id, client_id, caravan_id as user_id, touchpoint_number, type, date, reason, status,
  notes, photo_url, audio_url, latitude, longitude, time_in,
  time_in_gps_lat, time_in_gps_lng, time_in_gps_address, time_out,
  time_out_gps_lat, time_out_gps_lng, time_out_gps_address, next_visit_date,
  created, updated, edit_status, rejection_reason
FROM touchpoints
WHERE edit_status IN ('rejected', 'deleted');

-- Step 3: Delete archived touchpoints from main table
DELETE FROM touchpoints
WHERE edit_status IN ('rejected', 'deleted');

-- Step 4: Restore touchpoints with pending_deletion (cancel pending deletions)
UPDATE touchpoints
SET edit_status = NULL,
    rejection_reason = NULL,
    edited_at = NULL,
    edited_by = NULL,
    proposed_changes = NULL
WHERE edit_status = 'pending_deletion';

-- Step 5: Remove approval-related fields
ALTER TABLE touchpoints
  DROP COLUMN IF EXISTS edit_status,
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS edited_by,
  DROP COLUMN IF EXISTS proposed_changes,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS is_synced,
  DROP COLUMN IF EXISTS synced_at;

COMMIT;

SELECT 'Migration 028: Touchpoint approval fields removed successfully!' as result;
