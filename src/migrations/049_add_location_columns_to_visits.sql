-- Migration: Add structured location columns to visits table
-- Date: 2026-04-22
-- Description: Add municipality, province, and region columns for better location tracking and reporting

-- Add structured location columns
ALTER TABLE visits
ADD COLUMN IF NOT EXISTS barangay TEXT,
ADD COLUMN IF NOT EXISTS municipality TEXT,
ADD COLUMN IF NOT EXISTS province TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;

-- Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_visits_municipality ON visits(municipality) WHERE municipality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_province ON visits(province) WHERE province IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_region ON visits(region) WHERE region IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN visits.barangay IS 'Barangay name from PSGC data';
COMMENT ON COLUMN visits.municipality IS 'Municipality/City name from PSGC data';
COMMENT ON COLUMN visits.province IS 'Province name from PSGC data';
COMMENT ON COLUMN visits.region IS 'Region name from PSGC data';
