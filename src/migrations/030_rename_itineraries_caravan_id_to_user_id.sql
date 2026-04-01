-- Migration: Rename caravan_id to user_id in itineraries table
-- This supports both Caravan and Tele users creating itineraries
-- Migration 030

BEGIN;

-- 1. Rename column (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'itineraries' AND column_name = 'caravan_id'
    ) THEN
        ALTER TABLE itineraries RENAME COLUMN caravan_id TO user_id;
    END IF;
END $$;

-- 2. Update column comment
COMMENT ON COLUMN itineraries.user_id IS 'The user (caravan or tele) assigned to this itinerary';

-- 3. Drop old foreign key constraint if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'itineraries' AND constraint_name = 'itineraries_caravan_id_fkey'
    ) THEN
        ALTER TABLE itineraries DROP CONSTRAINT itineraries_caravan_id_fkey;
    END IF;
END $$;

-- 4. Add foreign key constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'itineraries' AND constraint_name = 'itineraries_user_id_fkey'
    ) THEN
        ALTER TABLE itineraries ADD CONSTRAINT itineraries_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Update indexes
DROP INDEX IF EXISTS idx_itineraries_caravan_id;
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);

COMMIT;

SELECT 'Migration 030: caravan_id renamed to user_id in itineraries table successfully!' as result;
