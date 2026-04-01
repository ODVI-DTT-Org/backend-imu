-- IMU Database Migration: Update Groups Table for Role System
-- Renames caravan_id to area_manager_id
-- This supports the Area Manager role hierarchy

-- First, check if team_leader_id column exists (from seed-digital-ocean.sql)
-- If it exists, rename it to area_manager_id
DO $$
BEGIN
    -- Check if team_leader_id exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'groups' AND column_name = 'team_leader_id'
    ) THEN
        -- Rename team_leader_id to area_manager_id
        ALTER TABLE groups RENAME COLUMN team_leader_id TO area_manager_id;
        RAISE NOTICE 'Renamed team_leader_id to area_manager_id in groups table';
    END IF;

    -- Check if caravan_id exists and rename to area_manager_id if team_leader_id doesn't exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'groups' AND column_name = 'caravan_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'groups' AND column_name = 'area_manager_id'
    ) THEN
        ALTER TABLE groups RENAME COLUMN caravan_id TO area_manager_id;
        RAISE NOTICE 'Renamed caravan_id to area_manager_id in groups table';
    END IF;
END $$;

-- Add area_manager_id if it doesn't exist
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS area_manager_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_groups_area_manager_id ON groups(area_manager_id);

SELECT 'Migration 007: Groups table updated for role system successfully!' as result;
