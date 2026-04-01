-- ============================================================
-- IMU Database Migrations - Run All
-- Date: 2025-03-24
-- Description: Complete migration script for all pending changes
--
-- This script will:
-- 1. Add created_by column to itineraries table
-- 2. Create/update user_municipalities_simple table
-- 3. Create approvals table with all required columns
-- ============================================================

BEGIN;

-- ============================================================
-- MIGRATION 013: Add created_by column to itineraries
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'itineraries' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE itineraries ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Migration 013: Added itineraries.created_by';
    ELSE
        RAISE NOTICE 'Migration 013: itineraries.created_by already exists';
    END IF;
END $$;

-- ============================================================
-- MIGRATION 005: Create/update user_municipalities_simple table
-- ============================================================

-- Drop table if it exists with wrong structure (to be safe)
DROP TABLE IF EXISTS user_municipalities_simple CASCADE;

-- Create user_municipalities_simple table with correct schema
CREATE TABLE user_municipalities_simple (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, municipality_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_user_municipalities_user ON user_municipalities_simple(user_id);
CREATE INDEX idx_user_municipalities_municipality ON user_municipalities_simple(municipality_id);
CREATE INDEX idx_user_municipalities_active ON user_municipalities_simple(user_id, municipality_id)
    WHERE deleted_at IS NULL;

RAISE NOTICE 'Migration 005: Created user_municipalities_simple table';

-- ============================================================
-- MIGRATION 014: Create approvals table
-- ============================================================

-- Drop table if it exists with wrong structure
DROP TABLE IF EXISTS approvals CASCADE;

-- Create approvals table
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('client', 'udi')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_approvals_client_id ON approvals(client_id);
CREATE INDEX idx_approvals_caravan_id ON approvals(caravan_id);
CREATE INDEX idx_approvals_type ON approvals(type);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_created_at ON approvals(created_at);

RAISE NOTICE 'Migration 014: Created approvals table';

-- ============================================================
-- CREATE UPDATED_AT TRIGGERS
-- ============================================================

-- Trigger for user_municipalities_simple
DROP TRIGGER IF EXISTS update_user_municipalities_simple_updated_at ON user_municipalities_simple;
CREATE TRIGGER update_user_municipalities_simple_updated_at
    BEFORE UPDATE ON user_municipalities_simple
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for approvals
DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at
    BEFORE UPDATE ON approvals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check itineraries.created_by
SELECT
    'itineraries.created_by' as column_name,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'itineraries' AND column_name = 'created_by') as exists;

-- Check user_municipalities_simple table
SELECT
    'user_municipalities_simple' as table_name,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'user_municipalities_simple') as exists;

-- Check approvals table
SELECT
    'approvals' as table_name,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'approvals') as exists;

-- Get all approvals table columns (for verification)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'approvals'
ORDER BY ordinal_position;

SELECT 'All migrations completed successfully!' as result;
