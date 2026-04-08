-- Migration 053: Add fuzzy name search support
-- Enable pg_trgm extension for trigram-based fuzzy string matching
-- Add computed full_name column for efficient searching
-- Create GIN index for fast fuzzy search queries

-- Step 1: Enable pg_trgm extension (non-blocking, safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Add computed full_name column (fast, uses existing data)
-- This column is automatically updated when first_name, last_name, or middle_name changes
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS full_name TEXT
GENERATED ALWAYS AS (
  TRIM(
    COALESCE(last_name, '') || ' ' ||
    COALESCE(first_name, '') || ' ' ||
    COALESCE(middle_name, '')
  )
) STORED;

-- Step 3: Create GIN index CONCURRENTLY (doesn't block reads/writes)
-- gin_trgm_ops enables trigram similarity operations (% operator)
-- Index is created in the background, safe for production
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_full_name_trgm
ON clients
USING GIN (full_name gin_trgm_ops);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN clients.full_name IS 'Computed full name for fuzzy search: "last_name first_name middle_name"';
COMMENT ON INDEX idx_clients_full_name_trgm IS 'GIN trigram index for fuzzy name search using pg_trgm';
