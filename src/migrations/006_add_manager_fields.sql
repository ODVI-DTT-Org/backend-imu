-- IMU Database Migration: Add Manager Fields to user_profiles
-- Adds area_manager_id and assistant_area_manager_id fields for the new role hierarchy

-- Add area_manager_id column
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS area_manager_id UUID REFERENCES user_profiles(id) ON DELETE SET null;

-- Add assistant_area_manager_id column
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS assistant_area_manager_id UUID REFERENCES user_profiles(id) ON DELETE SET null;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_area_manager_id ON user_profiles(area_manager_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_assistant_area_manager_id ON user_profiles(assistant_area_manager_id);

SELECT 'Migration 006: Manager fields added to user_profiles successfully!' as result;
