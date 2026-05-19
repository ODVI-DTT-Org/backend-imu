-- Migration 105: Indexed address search for GET /api/clients
--
-- Must run outside a transaction because CREATE INDEX CONCURRENTLY requires
-- autocommit. Keeps the existing address_search API parameter but moves it
-- from LOWER(...) LIKE scans to a GIN-indexed full-text vector.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS address_search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      COALESCE(full_address, '') || ' ' ||
      COALESCE(region, '') || ' ' ||
      COALESCE(province, '') || ' ' ||
      COALESCE(municipality, '') || ' ' ||
      COALESCE(barangay, '')
    )
  ) STORED;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_address_search_vector
  ON clients USING GIN (address_search_vector);

COMMENT ON COLUMN clients.address_search_vector IS
  'Generated full-text vector for fast address_search filtering across full_address, region, province, municipality, and barangay.';

COMMENT ON INDEX idx_clients_address_search_vector IS
  'GIN index for GET /api/clients address_search queries.';
