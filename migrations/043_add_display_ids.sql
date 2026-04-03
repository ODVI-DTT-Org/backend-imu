-- ============================================
-- SOLUTION: Add Display IDs for Human-Readability
-- ============================================
-- This adds human-readable display IDs while keeping UUIDs internally
-- This gives you the best of both worlds:
-- - Security and distributed system benefits of UUIDs
-- - Human-readable display IDs for UI

BEGIN;

-- Add display_id column to main tables
ALTER TABLE clients ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE agencies ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE groups ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE touchpoints ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE itineraries ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE approvals ADD COLUMN display_id SERIAL PRIMARY KEY;
ALTER TABLE caravans ADD COLUMN display_id SERIAL PRIMARY KEY;

-- Create unique constraints on the UUID id columns (since they're no longer primary keys)
ALTER TABLE clients ADD UNIQUE (id);
ALTER TABLE agencies ADD UNIQUE (id);
ALTER TABLE groups ADD UNIQUE (id);
ALTER TABLE touchpoints ADD UNIQUE (id);
ALTER TABLE itineraries ADD UNIQUE (id);
ALTER TABLE approvals ADD UNIQUE (id);
ALTER TABLE caravans ADD UNIQUE (id);

-- Update foreign key references to use display_id instead of UUID id
-- Note: This is a simplified example - you'll need to update all FK references

-- Example: Update touchpoints table
-- ALTER TABLE touchpoints DROP CONSTRAINT touchpoints_client_id_fkey;
-- ALTER TABLE touchpoints ADD CONSTRAINT touchpoints_client_id_fkey
--   FOREIGN KEY (client_id) REFERENCES clients(display_id);

-- Create views that use display_id for easier querying
CREATE OR REPLACE VIEW clients_with_display AS
SELECT
    display_id,
    id AS internal_id,
    first_name,
    last_name,
    email,
    created_at
FROM clients;

CREATE OR REPLACE VIEW touchpoints_with_display AS
SELECT
    display_id,
    id AS internal_id,
    client_id,
    type,
    status,
    created_at
FROM touchpoints;

COMMIT;

-- Usage in application:
-- SELECT * FROM clients_with_display WHERE display_id = 123;
-- This gives you human-readable IDs while keeping UUIDs internally

-- In your API responses, return display_id instead of id:
-- {
--   "id": 123,          // display_id (human-readable)
--   "internal_id": "uuid-string",  // actual UUID (kept for security)
--   "first_name": "John",
--   ...
-- }
