#!/bin/bash

# Migration Script: Create error_logs table
# Date: 2026-04-03
# Description: Creates error_logs table for centralized error tracking

set -e

echo "Running Migration 038: Create error_logs table..."
echo ""

# Load database URL from environment
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Run migration SQL
psql "$DATABASE_URL" << 'SQL'
-- Migration: Create error_logs table
-- Description: Create table for logging application errors with detailed context

BEGIN;

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
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_timestamp ON error_logs(resolved, timestamp DESC);

-- Add comment to table
COMMENT ON TABLE error_logs IS 'Logs of application errors with detailed context for debugging and analytics';

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

COMMIT;

SELECT 'Migration 038: Completed successfully!' as result;
SQL

echo ""
echo "✅ Migration 038 completed successfully!"
echo "   - error_logs table created"
echo "   - Indexes created for performance"
echo "   - Trigger function created for updated_at"
