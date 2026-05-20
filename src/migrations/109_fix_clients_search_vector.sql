-- Migration 109: Rebuild clients.search_vector from populated name fields
--
-- Bug: search_vector was GENERATED from clients.full_name (migration 050), but
-- full_name (underscore) is never populated by the app — only fullname (no
-- underscore) and first_name/last_name are. The generated vector was therefore
-- always empty, so the full-text search (clients GET / and /assigned, which use
-- `search_vector @@ plainto_tsquery(...)`) matched nothing.
--
-- Fix: redefine search_vector to index the actually-populated name fields. Uses
-- the 'simple' config (Filipino names don't benefit from English stemming),
-- matching migration 050. Re-adding the STORED generated column backfills every
-- existing row, so no separate backfill is needed.
--
-- Transaction-safe: run via src/scripts/run-migration.ts (wraps in BEGIN/COMMIT),
-- so the index is created NON-concurrently.

-- Drop the dependent GIN index first, then the old generated column.
DROP INDEX IF EXISTS idx_clients_search_vector;
ALTER TABLE clients DROP COLUMN IF EXISTS search_vector;

-- Recreate from the populated name columns (full_name kept for any legacy rows
-- that happen to have it; fullname holds "LASTNAME, FIRSTNAME MIDDLE" legacy data).
ALTER TABLE clients
  ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      COALESCE(first_name, '') || ' ' ||
      COALESCE(middle_name, '') || ' ' ||
      COALESCE(last_name, '') || ' ' ||
      COALESCE(fullname, '') || ' ' ||
      COALESCE(full_name, '')
    )
  ) STORED;

-- Recreate the GIN index used by the full-text WHERE + ts_rank_cd ordering.
CREATE INDEX IF NOT EXISTS idx_clients_search_vector
  ON clients USING GIN (search_vector);

-- Verification:
-- SELECT id, first_name, last_name FROM clients
-- WHERE search_vector @@ plainto_tsquery('simple', 'rebecca villavicencio');
