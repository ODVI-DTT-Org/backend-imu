-- Migration: Recreate user_locations table with correct schema
-- Date: 2026-04-03
-- Issue: Production database has incorrect column name ('municipality' instead of 'municipality_id')
-- Solution: Drop and recreate user_locations table with correct schema

BEGIN;

-- Step 1: Drop existing table (will be recreated with correct schema)
DROP TABLE IF EXISTS user_locations CASCADE;

RAISE NOTICE 'Dropped existing user_locations table';

-- Step 2: Recreate user_locations table with correct schema
CREATE TABLE user_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

RAISE NOTICE 'Created user_locations table with correct schema';

-- Step 3: Create indexes for efficient queries
CREATE INDEX idx_user_locations_user ON user_locations(user_id);
CREATE INDEX idx_user_locations_municipality ON user_locations(municipality_id);
CREATE INDEX idx_user_locations_active ON user_locations(user_id, municipality_id) WHERE deleted_at IS NULL;

RAISE NOTICE 'Created indexes for user_locations table';

-- Step 4: Add unique constraint for active assignments
ALTER TABLE user_locations
ADD CONSTRAINT user_locations_user_municipality_unique
UNIQUE (user_id, municipality_id)
DEFERRABLE INITIALLY DEFERRED;

RAISE NOTICE 'Added unique constraint to user_locations table';

-- Step 5: Create index for unique active assignments
CREATE UNIQUE INDEX idx_user_locations_unique_active
ON user_locations (user_id, municipality_id)
WHERE deleted_at IS NULL;

RAISE NOTICE 'Created unique index for active assignments';

-- Step 6: Add updated_at trigger
CREATE TRIGGER update_user_locations_updated_at
    BEFORE UPDATE ON user_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

RAISE NOTICE 'Created updated_at trigger for user_locations table';

-- Step 7: Add comments for documentation
COMMENT ON TABLE user_locations IS 'Assigns municipalities to users (field agents/caravans) for location-based work management';
COMMENT ON COLUMN user_locations.municipality_id IS 'Format: "province-municipality" (e.g., "Tawi-Tawi-Bongao")';
COMMENT ON COLUMN user_locations.assigned_at IS 'When this municipality was assigned to the user';
COMMENT ON COLUMN user_locations.assigned_by IS 'User ID of admin who made this assignment';
COMMENT ON COLUMN user_locations.deleted_at IS 'Soft delete timestamp - NULL means active assignment';

-- Step 8: Verify the table structure
SELECT
    'user_locations table recreated successfully' as status,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_locations'
ORDER BY ordinal_position;

COMMIT;

-- Expected result: Should show all columns with correct names (municipality_id, not municipality)
