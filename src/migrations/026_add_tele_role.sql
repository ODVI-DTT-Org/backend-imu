-- Add 'tele' role to the system
-- Migration 026: Add Tele role

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS role_check,
  ADD CONSTRAINT role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'));

SELECT 'Migration 026: Tele role added successfully!' as result;
