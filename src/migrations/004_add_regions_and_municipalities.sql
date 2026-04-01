-- Migration: Add regions and municipalities tables
-- Date: 2024-03-24
-- Description: Create reference tables for Philippine geographic hierarchy (PSGC-based)

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Regions table
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,  -- PSGC region code (e.g., 'NCR', '01', '02')
    name TEXT NOT NULL,
    code TEXT UNIQUE,     -- Alternative code (e.g., 'NCRO', 'R01')
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Municipalities table (includes cities)
CREATE TABLE IF NOT EXISTS municipalities (
    id TEXT PRIMARY KEY,       -- PSGC municipality code
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,                 -- Alternative code
    province TEXT,             -- Province name for reference
    is_city BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_municipalities_region_id ON municipalities(region_id);
CREATE INDEX IF NOT EXISTS idx_municipalities_province ON municipalities(province);

-- Group regions junction table (links groups to regions)
CREATE TABLE IF NOT EXISTS group_regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_group_regions_group_id ON group_regions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_regions_region_id ON group_regions(region_id);

-- Insert default NCR region (most common for IMU)
INSERT INTO regions (id, name, code) VALUES
    ('NCR', 'National Capital Region', 'NCRO')
ON CONFLICT (id) DO NOTHING;

SELECT 'Migration 004: Regions and municipalities tables created successfully!' as result;
