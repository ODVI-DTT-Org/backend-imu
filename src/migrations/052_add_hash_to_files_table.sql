-- Migration: Add hash column to files table for file deduplication
-- Date: 2026-04-06
-- Bug Fix: Photo upload fails because code tries to insert hash column that doesn't exist

-- Add hash column with index for performance
ALTER TABLE files ADD COLUMN IF NOT EXISTS hash VARCHAR(64);

-- Create index on hash column for fast duplicate file lookups
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);

-- Create index on entity_type + hash for touchpoint duplicate lookups
CREATE INDEX IF NOT EXISTS idx_files_entity_type_hash ON files(entity_type, hash);

-- Add comment explaining the hash column
COMMENT ON COLUMN files.hash IS 'SHA-256 hash of file contents for deduplication';
