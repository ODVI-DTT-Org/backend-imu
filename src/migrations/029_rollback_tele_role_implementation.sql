-- Migration Rollback: Tele Role Implementation
-- This script reverses migrations 026, 027, and 028
--
-- WARNING: This will:
-- 1. Remove Tele role from users table
-- 2. Rename user_id back to caravan_id in touchpoints, itineraries, approvals
-- 3. Re-add touchpoint approval workflow
-- 4. Remove status column from touchpoints
-- 5. Remove Time In/Out GPS columns from touchpoints
--
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!

BEGIN;

-- Step 1: Remove Tele role constraint (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
    END IF;
END $$;

-- Step 2: Re-add old role check constraint (without tele)
ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));

-- Step 3: Update any Tele users to Caravan (or you could delete them)
UPDATE users
SET role = 'caravan'
WHERE role = 'tele';

-- Step 4: Drop status column from touchpoints
ALTER TABLE touchpoints DROP COLUMN IF EXISTS status;

-- Step 5: Drop Time In/Out GPS columns from touchpoints
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_in;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_in_gps_lat;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_in_gps_lng;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_in_gps_address;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_out;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_out_gps_lat;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_out_gps_lng;
ALTER TABLE touchpoints DROP COLUMN IF EXISTS time_out_gps_address;

-- Step 6: Rename user_id back to caravan_id in touchpoints
ALTER TABLE touchpoints RENAME COLUMN user_id TO caravan_id;

-- Step 7: Re-add foreign key constraint for caravan_id
ALTER TABLE touchpoints
ADD CONSTRAINT touchpoints_caravan_id_fkey
FOREIGN KEY (caravan_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 8: Rename user_id back to caravan_id in itineraries
ALTER TABLE itineraries RENAME COLUMN user_id TO caravan_id;

-- Step 9: Re-add foreign key constraint for caravan_id in itineraries
ALTER TABLE itineraries
ADD CONSTRAINT itineraries_caravan_id_fkey
FOREIGN KEY (caravan_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 10: Rename user_id back to caravan_id in approvals
ALTER TABLE approvals RENAME COLUMN user_id TO caravan_id;

-- Step 11: Re-add foreign key constraint for caravan_id in approvals
ALTER TABLE approvals
ADD CONSTRAINT approvals_caravan_id_fkey
FOREIGN KEY (caravan_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 12: Drop touchpoint validation functions
DROP FUNCTION IF EXISTS validate_touchpoint_sequence;
DROP FUNCTION IF EXISTS validate_touchpoint_for_role;
DROP FUNCTION IF EXISTS can_role_create_touchpoint;
DROP FUNCTION IF EXISTS get_next_touchpoint_number;

-- Step 13: Drop Tele user assignment helper functions
DROP FUNCTION IF EXISTS assign_client_to_tele_users;
DROP FUNCTION IF EXISTS get_tele_assigned_clients;

-- Step 14: Remove Tele-specific client edit permissions
-- (This is application-level, but we can update the approvals workflow)

-- Step 15: Re-add approval workflow for touchpoints
-- Create a new approvals table if it doesn't exist (it was dropped in migration 028)
CREATE TABLE IF NOT EXISTS touchpoint_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    touchpoint_id UUID NOT NULL REFERENCES touchpoints(id) ON DELETE CASCADE,
    caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    rejection_reason TEXT
);

-- Step 16: Create index on touchpoint_approvals
CREATE INDEX IF NOT EXISTS idx_touchpoint_approvals_touchpoint_id
ON touchpoint_approvals(touchpoint_id);

CREATE INDEX IF NOT EXISTS idx_touchpoint_approvals_caravan_id
ON touchpoint_approvals(caravan_id);

CREATE INDEX IF NOT EXISTS idx_touchpoint_approvals_status
ON touchpoint_approvals(status);

-- Step 17: Add approval workflow back to touchpoints table
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES touchpoint_approvals(id);

-- Step 18: Update existing touchpoints to be auto-approved (for backward compatibility)
INSERT INTO touchpoint_approvals (touchpoint_id, caravan_id, status, reviewed_at, reviewed_by)
SELECT
    t.id,
    t.caravan_id,
    'approved'::TEXT,
    NOW(),
    t.caravan_id
FROM touchpoints t
WHERE t.approval_id IS NULL;

-- Step 19: Link touchpoints to their approvals
UPDATE touchpoints t
SET approval_id = ta.id
FROM touchpoint_approvals ta
WHERE ta.touchpoint_id = t.id
AND t.approval_id IS NULL;

-- Step 20: Add NOT NULL constraint to approval_id
ALTER TABLE touchpoints ALTER COLUMN approval_id SET NOT NULL;

-- Step 21: Create triggers to enforce approval workflow
CREATE OR REPLACE FUNCTION enforce_touchpoint_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if touchpoint has an approved approval record
    IF NOT EXISTS (
        SELECT 1 FROM touchpoint_approvals
        WHERE id = NEW.approval_id
        AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Touchpoint must have an approved approval record';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 22: Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS touchpoint_approval_trigger ON touchpoints;
CREATE TRIGGER touchpoint_approval_trigger
BEFORE INSERT OR UPDATE ON touchpoints
FOR EACH ROW
EXECUTE FUNCTION enforce_touchpoint_approval();

-- Step 23: Add comments for documentation
COMMENT ON TABLE touchpoint_approvals IS 'Stores approval workflow for touchpoints (re-added after rollback)';

-- Step 24: Update application-level permissions
-- Note: This would need to be done in the application code
-- - Remove Tele role from permission checks
-- - Re-add approval workflow checks
-- - Restore client edit restrictions for non-admin users

COMMIT;

-- Verification queries (run these to verify rollback)
-- SELECT role, COUNT(*) FROM users GROUP BY role;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'touchpoints';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'itineraries';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'approvals';
-- SELECT COUNT(*) FROM touchpoint_approvals;

ROLLBACK; -- Uncomment this line if you want to test the rollback without committing
