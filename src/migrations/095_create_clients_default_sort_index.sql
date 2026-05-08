-- ============================================
-- Migration 095: Composite index for default GET /api/clients sort
-- ============================================
-- Purpose: With last_touchpoint_date materialized in migration 094, an
-- index can now cover the sort used by the unfiltered list endpoint:
--
--   ORDER BY loan_released DESC,
--            last_touchpoint_date DESC NULLS LAST,
--            touchpoint_number DESC NULLS LAST,
--            created_at DESC
--
-- WHERE deleted_at IS NULL (partial — covers >99% of rows in practice).
--
-- Must run OUTSIDE a transaction because of CREATE INDEX CONCURRENTLY.
-- ============================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_default_sort
ON clients (
  loan_released DESC,
  last_touchpoint_date DESC NULLS LAST,
  touchpoint_number DESC NULLS LAST,
  created_at DESC
)
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_clients_default_sort IS
  'Covers default ORDER BY on GET /api/clients. Pair with route changes that prefer last_touchpoint_date over touchpoint_summary->-1->>date.';
