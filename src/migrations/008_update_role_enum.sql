-- IMU Database Migration: Update Role Enum
-- Changes from 2 roles (field_agent, admin) to 4 roles
-- New roles: admin, area_manager, assistant_area_manager, caravan

-- Drop existing check constraints
ALTER TABLE user_profiles
    DROP CONSTRAINT IF EXISTS role_check;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;

-- Update role values in user_profiles
-- First, update 'field_agent' to 'caravan'
UPDATE user_profiles
SET role = 'caravan'
WHERE role = 'field_agent';

-- Update role values in users table
UPDATE users
SET role = 'caravan'
WHERE role = 'field_agent';

-- Add new check constraint for user_profiles
ALTER TABLE user_profiles
    ADD CONSTRAINT role_check
    CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

-- Add new check constraint for users
ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

-- Create index on role for efficient filtering
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

SELECT 'Migration 008: Role enum updated successfully!' as result;
