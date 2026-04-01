-- IMU Database Migration: User Municipalities Simple
-- Creates a simplified table for user-municipality assignments with soft delete support
-- This replaces the complex caravan_municipalities approach with a simpler design
-- Note: municipality_id is TEXT in format "province-municipality" (references PSGC data)

-- ============================================
-- USER MUNICIPALITIES SIMPLE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_municipalities_simple (
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

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_municipalities_user ON user_municipalities_simple(user_id);
CREATE INDEX IF NOT EXISTS idx_user_municipalities_municipality ON user_municipalities_simple(municipality_id);
CREATE INDEX IF NOT EXISTS idx_user_municipalities_active ON user_municipalities_simple(user_id, municipality_id) WHERE deleted_at IS NULL;

-- Updated at trigger
CREATE TRIGGER update_user_municipalities_simple_updated_at
    BEFORE UPDATE ON user_municipalities_simple
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Migration 005: user_municipalities_simple table created successfully!' as result;
