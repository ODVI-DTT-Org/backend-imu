-- Migration: Integrate PSGC table for geographic data
-- Replaces regions and municipalities tables with views from PSGC

-- ============================================
-- STEP 1: Create indexes on PSGC table for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_psgc_region ON psgc(region);
CREATE INDEX IF NOT EXISTS idx_psgc_province ON psgc(province);
CREATE INDEX IF NOT EXISTS idx_psgc_mun_city ON psgc(mun_city);
CREATE INDEX IF NOT EXISTS idx_psgc_barangay ON psgc(barangay);
CREATE INDEX IF NOT EXISTS idx_psgc_zip_code ON psgc(zip_code);

-- ============================================
-- STEP 2: Create PSGC regions view
-- ============================================

DROP VIEW IF EXISTS psgc_regions;
CREATE VIEW psgc_regions AS
SELECT DISTINCT
    ROW_NUMBER() OVER (ORDER BY region) as id,
    region as name,
    region as code
FROM psgc
ORDER BY region;

-- ============================================
-- STEP 3: Create PSGC provinces view
-- ============================================

DROP VIEW IF EXISTS psgc_provinces;
CREATE VIEW psgc_provinces AS
SELECT DISTINCT
    province as id,
    region,
    province as name
FROM psgc
ORDER BY region, province;

-- ============================================
-- STEP 4: Create PSGC municipalities/cities view
-- ============================================

DROP VIEW IF EXISTS psgc_municipalities;
CREATE VIEW psgc_municipalities AS
SELECT DISTINCT
    province || '-' || mun_city as id,
    region,
    province,
    mun_city as name,
    mun_city_kind as kind,
    CASE WHEN mun_city_kind ILIKE '%city%' THEN true ELSE false END as is_city
FROM psgc
ORDER BY region, province, mun_city;

-- ============================================
-- STEP 5: Create PSGC barangays view
-- ============================================

DROP VIEW IF EXISTS psgc_barangays;
CREATE VIEW psgc_barangays AS
SELECT
    id,
    region,
    province,
    mun_city as municipality,
    barangay as name,
    pin_location,
    zip_code
FROM psgc
ORDER BY region, province, mun_city, barangay;

-- ============================================
-- STEP 6: Create junction table for PSGC assignments
-- Using barangay-level assignments for more granular control
-- ============================================

CREATE TABLE IF NOT EXISTS user_psgc_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    psgc_id INTEGER NOT NULL REFERENCES psgc(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, psgc_id)
);

CREATE INDEX IF NOT EXISTS idx_user_psgc_user ON user_psgc_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_psgc_psgc ON user_psgc_assignments(psgc_id);
CREATE INDEX IF NOT EXISTS idx_user_psgc_active ON user_psgc_assignments(user_id, psgc_id) WHERE deleted_at IS NULL;

-- ============================================
-- STEP 7: Create trigger for updated_at
-- ============================================

DROP TRIGGER IF EXISTS update_user_psgc_assignments_updated_at ON user_psgc_assignments;
CREATE TRIGGER update_user_psgc_assignments_updated_at
    BEFORE UPDATE ON user_psgc_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 8: Create aliases for backward compatibility
-- These views mimic the old table structure
-- ============================================

-- Create aliases that point to PSGC views for backward compatibility
DROP VIEW IF EXISTS regions;
CREATE VIEW regions AS
SELECT
    ROW_NUMBER() OVER (ORDER BY name) as id,
    name,
    name as code,
    NOW() as created_at
FROM (
    SELECT DISTINCT region as name FROM psgc ORDER BY region
) subq;

DROP VIEW IF EXISTS municipalities;
CREATE VIEW municipalities AS
SELECT
    ROW_NUMBER() OVER (ORDER BY region, province, name) as id,
    region as region_id,
    name,
    province,
    kind as code,
    is_city,
    NOW() as created_at
FROM (
    SELECT DISTINCT
        region,
        province,
        mun_city as name,
        mun_city_kind as kind,
        CASE WHEN mun_city_kind ILIKE '%city%' THEN true ELSE false END as is_city
    FROM psgc
    ORDER BY region, province, mun_city
) subq;

-- ============================================
-- Done!
-- ============================================

SELECT 'Migration 010: PSGC integration completed successfully!' as result;
