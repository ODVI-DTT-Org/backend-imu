-- Migration: 059_add_deleted_at_indexes.sql
-- Description: Add indexes on deleted_at for better query performance
-- I8: Performance optimization - queries filtering by deleted_at IS NULL need indexes

-- Index for addresses table
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at
ON addresses(deleted_at)
WHERE deleted_at IS NULL;

-- Index for phone_numbers table
CREATE INDEX IF NOT EXISTS idx_phone_numbers_deleted_at
ON phone_numbers(deleted_at)
WHERE deleted_at IS NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_addresses_deleted_at IS 'Improves performance of queries filtering active addresses';
COMMENT ON INDEX idx_phone_numbers_deleted_at IS 'Improves performance of queries filtering active phone numbers';

-- ROLLBACK
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_addresses_deleted_at;
-- DROP INDEX IF EXISTS idx_phone_numbers_deleted_at;
