-- Add GPS coordinates to touchpoints table
-- These are synced from the mobile app's local PowerSync SQLite schema
-- which was extended with latitude/longitude/address in the same release.

ALTER TABLE touchpoints
  ADD COLUMN IF NOT EXISTS latitude REAL,
  ADD COLUMN IF NOT EXISTS longitude REAL,
  ADD COLUMN IF NOT EXISTS address TEXT;
