-- Migration 080: Drop redundant time_arrival/time_departure text columns from visits
-- These are legacy CMS-era text fields replaced by time_in/time_out TIMESTAMPTZ.
-- Backfill time_in/time_out from text columns where the TIMESTAMPTZ columns are null.

-- Backfill time_in from time_arrival where possible
UPDATE visits
SET time_in = time_arrival::TIMESTAMPTZ
WHERE time_in IS NULL
  AND time_arrival IS NOT NULL
  AND time_arrival ~ '^\d{4}-\d{2}-\d{2}';

-- Backfill time_out from time_departure where possible
UPDATE visits
SET time_out = time_departure::TIMESTAMPTZ
WHERE time_out IS NULL
  AND time_departure IS NOT NULL
  AND time_departure ~ '^\d{4}-\d{2}-\d{2}';

-- Drop the redundant text columns
ALTER TABLE visits DROP COLUMN IF EXISTS time_arrival;
ALTER TABLE visits DROP COLUMN IF EXISTS time_departure;
