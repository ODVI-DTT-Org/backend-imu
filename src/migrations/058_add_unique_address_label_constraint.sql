-- Add unique constraint to prevent duplicate address labels per client
-- This ensures each client can only have one address of each type (Home, Work, Relative, Other)
-- Soft deleted records are excluded from the constraint

CREATE UNIQUE INDEX idx_addresses_unique_label_per_client
ON addresses(client_id, label)
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_addresses_unique_label_per_client IS 'Prevents duplicate address labels per active client (e.g., two Home addresses)';

-- ROLLBACK
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_addresses_unique_label_per_client;
