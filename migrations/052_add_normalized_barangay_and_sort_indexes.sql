-- 052: Additional performance indexes for /api/clients
-- Run MANUALLY (not in a transaction) because CONCURRENTLY indexes require autocommit.

-- 1) Persisted normalized barangay to avoid expensive runtime LOWER(TRIM()) normalization.
--    This keeps endpoint filtering on `barangay` indexable and consistent with the
--    already-implemented normalized_municipality/province columns.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS normalized_barangay TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(COALESCE(barangay, '')))
  ) STORED;

-- Drop the legacy expression-based index if it exists so we can use the stored
-- column with a regular B-tree index.
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_normalized_barangay;

CREATE INDEX CONCURRENTLY idx_clients_normalized_barangay
  ON clients (normalized_barangay);

-- 2) Stronger default-sort index covering all default ORDER BY keys used by
--    GET /api/clients. This allows PostgreSQL to satisfy the full default order
--    directly from index tuples before applying LIMIT/OFFSET.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_default_sort_v2
  ON clients (
    deleted_at,
    loan_released DESC,
    last_touchpoint_date DESC NULLS LAST,
    (COALESCE(touchpoint_number, 0)) DESC,
    created_at DESC
  );
