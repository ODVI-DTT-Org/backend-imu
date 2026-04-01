-- IMU Database Migration: Create Group Municipalities Table
-- Allows assigning municipalities to groups for location-based organization

-- Create group_municipalities table
CREATE TABLE IF NOT EXISTS group_municipalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_id ON group_municipalities(group_id);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_municipality_id ON group_municipalities(municipality_id);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_deleted_at ON group_municipalities(deleted_at);

-- Unique constraint to prevent duplicate assignments (excluding soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_municipalities_unique_assignment
ON group_municipalities(group_id, municipality_id)
WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON TABLE group_municipalities IS 'Assigns municipalities to groups for location-based organization';

SELECT 'Migration 015: Group municipalities table created successfully!' as result;
