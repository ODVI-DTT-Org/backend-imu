-- Migration 108: Add duplicate detection metadata column
-- Purpose: Store duplicate detection results including confidence scores and similar clients

BEGIN;

-- Add duplicate_metadata JSONB column to track potential duplicates
ALTER TABLE clients ADD COLUMN IF NOT EXISTS duplicate_metadata JSONB;

-- Comment for documentation
COMMENT ON COLUMN clients.duplicate_metadata IS
'Stores duplicate detection results: {is_possible_duplicate: bool, confidence_score: 0-100, similar_clients: [{id, name, similarity_method, score}], ai_flagged: bool, last_checked_at: ISO8601 timestamp}';

COMMIT;
