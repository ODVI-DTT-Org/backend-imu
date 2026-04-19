-- Migration 089: Add remarks column to touchpoints, calls, visits, releases
-- remarks is user-entered free text, separate from system notes

ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE calls       ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE visits      ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE releases    ADD COLUMN IF NOT EXISTS remarks TEXT;
