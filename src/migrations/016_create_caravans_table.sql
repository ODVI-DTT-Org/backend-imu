-- Migration: Create caravans table
-- Date: 2025-03-24
-- Issue: Caravans table referenced in foreign keys but never created
-- Solution: Create caravans table to store field agent profiles separate from users

BEGIN;

-- Create caravans table
CREATE TABLE IF NOT EXISTS caravans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_caravans_user_id ON caravans(user_id);
CREATE INDEX IF NOT EXISTS idx_caravans_is_active ON caravans(is_active);
CREATE INDEX IF NOT EXISTS idx_caravans_email ON caravans(email);

-- Add updated_at trigger
CREATE TRIGGER update_caravans_updated_at
    BEFORE UPDATE ON caravans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Verification query:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'caravans';
