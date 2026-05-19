-- migrations/051_clients_barangay_filter_indexes.sql
-- Performance: expression indexes for the clients barangay filter.
-- Run MANUALLY (not in a transaction) because CONCURRENTLY indexes require autocommit.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_barangay
  ON clients ((LOWER(TRIM(COALESCE(barangay, '')))));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_psgc_barangay
  ON clients ((LOWER(TRIM(COALESCE(psgc_barangay, '')))));
