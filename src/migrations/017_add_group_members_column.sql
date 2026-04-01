-- Migration: Add members column to groups table
-- Date: 2025-03-25
-- Issue: Groups need to store caravan members as an array

BEGIN;

-- Add members column as JSONB to store array of caravan IDs
ALTER TABLE groups ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb;

-- Create index for querying groups by member
CREATE INDEX IF NOT EXISTS idx_groups_members ON groups USING GIN(members);

COMMIT;

-- Verification query:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'groups';
