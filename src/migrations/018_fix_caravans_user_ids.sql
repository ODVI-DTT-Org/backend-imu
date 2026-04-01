-- Migration: Fix caravans table - link existing users to caravans
-- Date: 2025-03-26
-- Issue: Caravans created without user_id reference, causing municipality assignment to fail
-- Solution: Link existing caravans to their corresponding users by email

BEGIN;

-- Add user_id column if not exists (for caravans created before migration 016)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'caravans' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE caravans ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_caravans_user_id ON caravans(user_id);
    END IF;
END $$;

-- Link existing caravans to users by matching email
-- For caravans that don't have a user_id, find the corresponding user and link them
UPDATE caravans c
SET user_id = u.id
FROM users u
WHERE c.user_id IS NULL
  AND c.email = u.email
  AND u.role IN ('field_agent', 'caravan');

-- Log the results
DO $$
DECLARE
    linked_count INTEGER;
    unlinked_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO linked_count FROM caravans WHERE user_id IS NOT NULL;
    SELECT COUNT(*) INTO unlinked_count FROM caravans WHERE user_id IS NULL;

    RAISE NOTICE 'Caravans linked to users: %', linked_count;
    RAISE NOTICE 'Caravans still unlinked: %', unlinked_count;
END $$;

-- Make user_id required for future inserts (but allow NULL for existing data during migration)
-- ALTER TABLE caravans ALTER COLUMN user_id SET NOT NULL;
-- Commented out to avoid breaking existing rows - run separately after verifying all caravans are linked

COMMIT;

-- Verification queries:
-- 1. Check all caravans with user_id:
--    SELECT c.id, c.email, c.user_id, u.email as user_email FROM caravans c LEFT JOIN users u ON c.user_id = u.id;
--
-- 2. Check caravans without user_id:
--    SELECT id, email, first_name, last_name FROM caravans WHERE user_id IS NULL;
--
-- 3. After verifying all caravans are linked, make user_id required:
--    ALTER TABLE caravans ALTER COLUMN user_id SET NOT NULL;
