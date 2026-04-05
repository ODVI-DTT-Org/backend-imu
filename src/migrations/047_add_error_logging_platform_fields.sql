-- Migration: Add error logging platform fields
-- Description: Add missing columns for platform-specific error tracking (mobile, web, backend)
-- Date: 2026-04-05

-- Add platform-specific columns to error_logs table
DO $$
BEGIN
    -- Check if table exists first
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'error_logs'
    ) THEN
        -- Add component_stack column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'component_stack'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN component_stack TEXT;
        END IF;

        -- Add app_version column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'app_version'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN app_version VARCHAR(20);
        END IF;

        -- Add os_version column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'os_version'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN os_version VARCHAR(50);
        END IF;

        -- Add fingerprint column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'fingerprint'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN fingerprint VARCHAR(64);
        END IF;

        -- Add last_fingerprint_seen_at column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'last_fingerprint_seen_at'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN last_fingerprint_seen_at TIMESTAMPTZ;
        END IF;

        -- Add occurrences_count column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'error_logs' AND column_name = 'occurrences_count'
        ) THEN
            ALTER TABLE error_logs ADD COLUMN occurrences_count INTEGER DEFAULT 1;
        END IF;

        RAISE NOTICE 'Platform fields added to error_logs table';
    ELSE
        RAISE NOTICE 'error_logs table does not exist, skipping migration';
    END IF;
END $$;

-- Create index on fingerprint for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Create index on app_version for platform-specific filtering
CREATE INDEX IF NOT EXISTS idx_error_logs_app_version ON error_logs(app_version);

-- Create composite index on timestamp and platform for performance
-- Note: platform is stored in details JSONB, not as a separate column
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp_app_version ON error_logs(timestamp DESC, app_version);

-- Add comments to new columns
COMMENT ON COLUMN error_logs.component_stack IS 'React component stack trace for web errors';
COMMENT ON COLUMN error_logs.app_version IS 'Mobile app version (e.g., 1.0.0)';
COMMENT ON COLUMN error_logs.os_version IS 'Mobile OS version (e.g., iOS 15.0, Android 11)';
COMMENT ON COLUMN error_logs.fingerprint IS 'SHA-256 hash for error deduplication';
COMMENT ON COLUMN error_logs.last_fingerprint_seen_at IS 'Last time this error fingerprint was seen';
COMMENT ON COLUMN error_logs.occurrences_count IS 'Number of times this error has occurred (deduplication)';
