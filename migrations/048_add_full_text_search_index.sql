-- Migration 048: Add Full-Text Search Index for Multi-Word Searches
-- Description: Add GIN index for PostgreSQL full-text search to handle 3+ word searches
-- Date: 2026-04-09

-- Add GIN index for full-text search on client names
-- This enables efficient 3+ word searches using to_tsvector and plainto_tsquery
CREATE INDEX IF NOT EXISTS idx_clients_full_text_search
  ON clients
  USING gin(to_tsvector('english', full_name));

-- Add GIN index for first_name and last_name as well for more flexible searches
CREATE INDEX IF NOT EXISTS idx_clients_first_name_full_text
  ON clients
  USING gin(to_tsvector('english', first_name));

CREATE INDEX IF NOT EXISTS idx_clients_last_name_full_text
  ON clients
  USING gin(to_tsvector('english', last_name));

-- Add comment to document the purpose
COMMENT ON INDEX idx_clients_full_text_search IS 'Full-text search index for multi-word name searches using trigram';
COMMENT ON INDEX idx_clients_first_name_full_text IS 'Full-text search index for first name searches';
COMMENT ON INDEX idx_clients_last_name_full_text IS 'Full-text search index for last name searches';
