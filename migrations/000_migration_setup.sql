-- ============================================================
-- Migration 000: Setup Migration Infrastructure
-- ============================================================
-- Creates logging tables for tracking migration progress
-- and persistent mapping tables for ID translation

BEGIN;

-- Migration logging table
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    script_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'started', 'completed', 'failed'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    details JSONB
);

-- Persistent ID mapping table (CRITICAL: Not TEMP!)
CREATE TABLE IF NOT EXISTS migration_mappings (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    old_id BIGINT,
    new_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_mappings_lookup
ON migration_mappings(table_name, old_id);

-- Error logging table (log errors, don't fail)
CREATE TABLE IF NOT EXISTS migration_errors (
    id SERIAL PRIMARY KEY,
    script_name TEXT NOT NULL,
    error_type TEXT NOT NULL,
    old_id BIGINT,
    error_message TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log setup completion
INSERT INTO migration_log (script_name, status, details)
VALUES ('000_migration_setup', 'completed', '{"phase":"setup"}'::jsonb);

COMMIT;
