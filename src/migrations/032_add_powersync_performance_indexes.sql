-- Migration: Add indexes for PowerSync performance optimization
-- These indexes improve sync performance for mobile offline mode
-- Migration 032

BEGIN;

-- Client table indexes
CREATE INDEX IF NOT EXISTS idx_clients_municipality ON clients(municipality);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_is_starred ON clients(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at DESC);

-- Addresses table indexes
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_addresses_is_primary ON addresses(is_primary) WHERE is_primary = true;

-- Phone numbers table indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_primary ON phone_numbers(is_primary) WHERE is_primary = true;

-- Touchpoints table indexes
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_id ON touchpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_touchpoint_number ON touchpoints(client_id, touchpoint_number);
CREATE INDEX IF NOT EXISTS idx_touchpoints_date ON touchpoints(date DESC);

-- Composite index for touchpoint status queries (most important for mobile)
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_status ON touchpoints(client_id, touchpoint_number, type);

-- User locations indexes for municipality filtering
CREATE INDEX IF NOT EXISTS idx_user_locations_user_municipality ON user_locations(user_id, municipality_id) WHERE deleted_at IS NULL;

-- Partial index for active touchpoints only
CREATE INDEX IF NOT EXISTS idx_touchpoints_active ON touchpoints(client_id, touchpoint_number) WHERE touchpoint_number <= 7;

COMMIT;

SELECT 'Migration 032: Added PowerSync performance indexes successfully!' as result;

-- Index usage explanation:
-- idx_clients_municipality: Fast filtering by assigned area
-- idx_clients_updated_at: Incremental sync optimization
-- idx_addresses_client_id: Quick address lookups per client
-- idx_phone_numbers_is_primary: Only sync primary numbers (reduces data)
-- idx_touchpoints_client_status: Calculate next touchpoint quickly
-- idx_touchpoints_active: Only sync active touchpoints (1-7)
