-- Migration: Rename caravan_id to user_id in touchpoints table
-- This supports both Caravan and Tele users creating touchpoints
-- Migration 027

BEGIN;

-- 1. Rename column
ALTER TABLE touchpoints RENAME COLUMN caravan_id TO user_id;

-- 2. Update column comment
COMMENT ON COLUMN touchpoints.user_id IS 'The user (caravan or tele) who created this touchpoint';

-- 3. Update foreign key references
ALTER TABLE touchpoints
  DROP CONSTRAINT IF EXISTS touchpoints_caravan_id_fkey,
  ADD CONSTRAINT touchpoints_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Update indexes
DROP INDEX IF EXISTS idx_touchpoints_caravan_id;
CREATE INDEX idx_touchpoints_user_id ON touchpoints(user_id);

COMMIT;

SELECT 'Migration 027: caravan_id renamed to user_id successfully!' as result;
