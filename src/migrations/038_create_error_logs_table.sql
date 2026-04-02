-- Migration: Create error_logs table
-- Description: Create table for logging application errors with detailed context
-- Date: 2026-04-02

-- Create error_logs table
CREATE TABLE IF NOT EXISTS error_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request identification
  request_id VARCHAR(36) UNIQUE NOT NULL,

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Error details
  code VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status_code INTEGER NOT NULL,

  -- Request details
  path VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,

  -- User details
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,

  -- Error context (JSONB for flexible storage)
  details JSONB DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  stack_trace TEXT,

  -- Resolution suggestions
  suggestions TEXT[] DEFAULT '{}',
  documentation_url VARCHAR(500),

  -- Resolution tracking
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance

-- Index on request_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);

-- Index on timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);

-- Index on code for error type filtering
CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);

-- Index on resolved status for filtering unresolved errors
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);

-- Index on user_id for user-specific error history
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- Composite index on resolved and timestamp for dashboard queries
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_timestamp ON error_logs(resolved, timestamp DESC);

-- Add comment to table
COMMENT ON TABLE error_logs IS 'Logs of application errors with detailed context for debugging and analytics';

-- Add comments to important columns
COMMENT ON COLUMN error_logs.request_id IS 'Unique identifier for the request that generated this error';
COMMENT ON COLUMN error_logs.code IS 'Error code (e.g., VALIDATION_ERROR, NOT_FOUND)';
COMMENT ON COLUMN error_logs.status_code IS 'HTTP status code (e.g., 400, 404, 500)';
COMMENT ON COLUMN error_logs.details IS 'Additional error details stored as JSONB';
COMMENT ON COLUMN error_logs.errors IS 'Array of field errors for validation errors';
COMMENT ON COLUMN error_logs.resolved IS 'Whether this error has been reviewed and resolved';
COMMENT ON COLUMN error_logs.resolution_notes IS 'Notes about how this error was resolved';

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_error_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_error_logs_updated_at
  BEFORE UPDATE ON error_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_error_logs_updated_at();
