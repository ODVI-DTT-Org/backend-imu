-- 112: Add kilometers_traveled column to visits
--
-- odometer_departure is a READING (the odometer value when the user left
-- the previous client). kilometers_traveled is the DELTA — how far the
-- user actually drove between the previous visit's arrival and this
-- visit's arrival.
--
-- Compute rule (server-side at write time):
--   kilometers_traveled = max(0, current.odometer_arrival - prev.odometer_arrival)
--   = 0 when no prior same-day visit OR current arrival is empty/non-numeric
--
-- NO BACKFILL — historical rows stay NULL. Only new writes get the value.
--
-- Apply: psql $DATABASE_URL -f migrations/112_add_kilometers_traveled.sql

BEGIN;

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS kilometers_traveled text;

COMMENT ON COLUMN visits.kilometers_traveled IS
  'Distance traveled (km) between this visit and the previous same-day visit. '
  'Computed server-side at INSERT. NULL for historical rows (pre-2026-06-04).';

COMMIT;
