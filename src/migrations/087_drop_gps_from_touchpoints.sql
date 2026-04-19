-- Revert 086: GPS coordinates do not belong on the touchpoints table.
-- When a touchpoint is created, the backend route auto-creates a linked visit
-- and stores GPS on that visit record instead. The mobile app sends lat/lng/address
-- in the POST body; the route reads them and inserts them into visits.

ALTER TABLE touchpoints
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS address;
