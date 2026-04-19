-- Migration 068: Add pg_trgm extension and indexes for fuzzy PSGC matching
-- Enables similarity() queries for spelling-variant matching (e.g. BALIUAG → Baliwag)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_psgc_mun_city_trgm ON psgc USING gin (mun_city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_psgc_province_trgm ON psgc USING gin (province gin_trgm_ops);
