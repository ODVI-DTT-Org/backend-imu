-- ============================================
-- Migration 063: Add Client Search Indexes
-- ============================================
-- Purpose: Optimize All Clients API for 300k+ records
-- Strategy: PostgreSQL-centric with GIN index for full-text search
--
-- Indexes Created:
-- 1. GIN index on fulltext search vector (first_name, middle_name, last_name)
-- 2. Compound index on (client_type, product_type) for filtering
-- 3. Compound index on (market_type, pension_type) for filtering
-- 4. Index on created_at for sorting
--
-- Expected Impact:
-- - Full-text search: ~5000ms → ~50ms (100x faster)
-- - Filter queries: ~2000ms → ~100ms (20x faster)
-- - Storage overhead: ~50MB for 300k clients
-- ============================================

-- Enable pg_trgm extension for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 1. GIN INDEX for Full-Text Search
-- ============================================
-- Uses a GIN index with text_pattern_ops for faster text search
-- Supports both exact match and prefix matching on name columns
CREATE INDEX IF NOT EXISTS idx_clients_search_gin
ON clients
USING GIN (
  (lower(first_name || ' ' || COALESCE(middle_name, '') || ' ' || last_name) gin_trgm_ops)
);

-- ============================================
-- 2. COMPOUND INDEXES for Filtering
-- ============================================
-- Supports filtering by client_type and product_type
CREATE INDEX IF NOT EXISTS idx_clients_type_product
ON clients(client_type, product_type)
WHERE deleted_at IS NULL;

-- Supports filtering by market_type and pension_type
CREATE INDEX IF NOT EXISTS idx_clients_market_pension
ON clients(market_type, pension_type)
WHERE deleted_at IS NULL;

-- ============================================
-- 3. INDEX for Sorting
-- ============================================
-- Supports sorting by created_at (newest/oldest)
CREATE INDEX IF NOT EXISTS idx_clients_created_at
ON clients(created_at DESC NULLS LAST)
WHERE deleted_at IS NULL;

-- ============================================
-- 4. PARTIAL INDEX for Active Clients
-- ============================================
-- Optimizes queries filtering only active (non-deleted) clients
CREATE INDEX IF NOT EXISTS idx_clients_active
ON clients(id, client_type, created_at)
WHERE deleted_at IS NULL;

-- ============================================
-- Verification Query (Run this to test)
-- ============================================
-- Test full-text search performance:
-- EXPLAIN ANALYZE
-- SELECT id, first_name, middle_name, last_name
-- FROM clients
-- WHERE deleted_at IS NULL
--   AND lower(first_name || ' ' || COALESCE(middle_name, '') || ' ' || last_name) LIKE '%john%'
-- LIMIT 20;
--
-- Expected: Should use "idx_clients_search_gin" index
-- Time: < 100ms for 300k clients
--
-- Test filter performance:
-- EXPLAIN ANALYZE
-- SELECT id, first_name, last_name, client_type, product_type
-- FROM clients
-- WHERE deleted_at IS NULL
--   AND client_type = 'EXISTING'
--   AND product_type = 'PENSION'
-- LIMIT 20 OFFSET 0;
--
-- Expected: Should use "idx_clients_type_product" index
-- Time: < 50ms for 300k clients
