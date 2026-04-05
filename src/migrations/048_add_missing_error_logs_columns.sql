-- Migration: Add missing columns to error_logs table
-- Description: Add platform-specific fields and mobile queue management columns
-- Date: 2026-04-05
-- Related: Fixes "column 'platform' does not exist" error

-- Add platform column for distinguishing error sources
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS platform VARCHAR(20);

-- Add component_stack for frontend React/Vue errors
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS component_stack TEXT;

-- Add fingerprint for deduplication
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64);

-- Add last_fingerprint_seen_at for duplicate tracking
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS last_fingerprint_seen_at TIMESTAMPTZ;

-- Add occurrences_count for high-frequency error tracking
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS occurrences_count INTEGER DEFAULT 1;

-- Add app_version for mobile app version tracking
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS app_version VARCHAR(20);

-- Add os_version for mobile OS version tracking
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS os_version VARCHAR(50);

-- Add is_synced for mobile queue management
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT FALSE;

-- Add device_info for mobile device information
ALTER TABLE error_logs
ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}';

-- Create indexes for performance

-- Index on platform for filtering by platform type
CREATE INDEX IF NOT EXISTS idx_error_logs_platform ON error_logs(platform);

-- Index on fingerprint for duplicate detection
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Index on app_version for mobile version filtering
CREATE INDEX IF NOT EXISTS idx_error_logs_app_version ON error_logs(app_version);

-- Composite index on platform and timestamp for platform-specific queries
CREATE INDEX IF NOT EXISTS idx_error_logs_platform_timestamp ON error_logs(platform, timestamp DESC);

-- Composite index on is_synced for mobile queue processing
CREATE INDEX IF NOT EXISTS idx_error_logs_is_synced ON error_logs(is_synced) WHERE is_synced = FALSE;

-- Add comments for documentation
COMMENT ON COLUMN error_logs.platform IS 'Platform that generated the error: mobile, web, or backend';
COMMENT ON COLUMN error_logs.component_stack IS 'React/Vue component stack for frontend errors';
COMMENT ON COLUMN error_logs.fingerprint IS 'SHA-256 hash for error deduplication';
COMMENT ON COLUMN error_logs.last_fingerprint_seen_at IS 'Last time this error fingerprint was seen';
COMMENT ON COLUMN error_logs.occurrences_count IS 'Number of times this error has occurred';
COMMENT ON COLUMN error_logs.app_version IS 'Mobile app version (e.g., "1.0.0")';
COMMENT ON COLUMN error_logs.os_version IS 'Mobile OS version (e.g., "iOS 15.0")';
COMMENT ON COLUMN error_logs.is_synced IS 'Whether mobile error has been synced to main table';
COMMENT ON COLUMN error_logs.device_info IS 'Mobile device information (model, manufacturer, etc.)';
