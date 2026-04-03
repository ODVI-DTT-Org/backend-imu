-- Migration: Add Rate Limiting to Authentication Routes
-- This addresses security by preventing brute force attacks on login

BEGIN;

-- Add rate limiting tracking table (for persistent rate limiting across restarts)
CREATE TABLE IF NOT EXISTS rate_limit_tracker (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracker_key ON rate_limit_tracker(key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracker_window_end ON rate_limit_tracker(window_end);

-- Clean up expired entries automatically (run this via pg_cron or application)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_tracker WHERE window_end < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE rate_limit_tracker IS 'Tracks rate limiting for API requests to prevent abuse';
COMMENT ON FUNCTION cleanup_expired_rate_limits() IS 'Removes expired rate limit entries';

COMMIT;

-- Usage: Call cleanup_expired_rate_limits() periodically (every minute via cron or application)
