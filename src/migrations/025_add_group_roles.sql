-- IMU Database Migration: Add Role Fields to Groups Table
-- Adds assistant_area_manager_id and caravan_id fields for the new role hierarchy
-- This allows groups to have separate area manager, assistant area manager, and caravan assignments

-- Add assistant_area_manager_id column
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS assistant_area_manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add caravan_id column
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS caravan_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_groups_assistant_area_manager_id ON groups(assistant_area_manager_id);
CREATE INDEX IF NOT EXISTS idx_groups_caravan_id ON groups(caravan_id);

-- Create unique constraint to ensure a user can only be assigned once per role across all groups
-- This prevents the same caravan from being assigned to multiple groups
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_unique_caravan
    ON groups(caravan_id)
    WHERE caravan_id IS NOT NULL;

SELECT 'Migration 025: Role fields added to groups table successfully!' as result;
