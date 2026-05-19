-- migrations/050_clients_perf_indexes.sql
-- Performance: stored computed columns + indexes for all-clients API
-- Run MANUALLY (not in a transaction) because CONCURRENTLY indexes require autocommit

-- 1. Stored search_vector column (replaces runtime to_tsvector in search)
-- Uses 'simple' config: Filipino names don't benefit from English stemming
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(full_name, ''))) STORED;

-- 2. GIN index on search_vector for full-text WHERE + ts_rank_cd
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_search_vector
  ON clients USING GIN (search_vector);

-- 3. Normalized municipality (pre-computed, enables B-tree index on location filter)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS normalized_municipality TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(municipality, ''),
      '^(city of|city|municipality of|municipality)\s+', '', 'i'),
      '\s+(city|municipality)$', '', 'i')))
  ) STORED;

-- 4. Normalized province
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS normalized_province TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(province, ''),
      '^(province of|province)\s+', '', 'i'),
      '\s+(province)$', '', 'i')))
  ) STORED;

-- 5. B-tree indexes for location filter equality lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_municipality
  ON clients (normalized_municipality);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_province
  ON clients (normalized_province);

-- 6. Composite index covering the default ORDER BY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_default_sort
  ON clients (deleted_at, loan_released DESC, last_touchpoint_date DESC NULLS LAST);

-- 7. Drop the three superseded GIN indexes from migration 048
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_full_text_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_first_name_full_text;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_last_name_full_text;
