-- Migration: Create request_logs table
-- Description: Stores all HTTP requests and responses for analysis and debugging

-- Create request_logs table
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(100) UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Request information
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  query_params JSONB,
  headers JSONB NOT NULL,
  body JSONB,

  -- Client information
  ip_address INET,
  user_agent TEXT,
  origin VARCHAR(500),

  -- User information
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_role VARCHAR(50),

  -- Response information
  status_code INTEGER,
  duration_ms INTEGER,
  response_size BIGINT,

  -- Error information
  error_message TEXT,
  error_name VARCHAR(100),
  error_code VARCHAR(50),

  -- Indexes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_request_logs_method ON request_logs(method);
CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path);
CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address);

-- Create composite index for user activity queries
CREATE INDEX IF NOT EXISTS idx_request_logs_user_timestamp ON request_logs(user_id, timestamp DESC);

-- Create composite index for error tracking
CREATE INDEX IF NOT EXISTS idx_request_logs_errors ON request_logs(status_code, timestamp DESC) WHERE status_code >= 400;

-- Create trigger function to update updated_at column
CREATE OR REPLACE FUNCTION update_request_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_request_logs_updated_at ON request_logs;
CREATE TRIGGER trigger_update_request_logs_updated_at
  BEFORE UPDATE ON request_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_request_logs_updated_at();

-- Add comment
COMMENT ON TABLE request_logs IS 'Stores all HTTP requests and responses for analysis and debugging';
COMMENT ON COLUMN request_logs.request_id IS 'Unique identifier for the request';
COMMENT ON COLUMN request_logs.timestamp IS 'When the request was received';
COMMENT ON COLUMN request_logs.completed_at IS 'When the request processing completed';
COMMENT ON COLUMN request_logs.duration_ms IS 'Request processing time in milliseconds';
COMMENT ON COLUMN request_logs.query_params IS 'Query parameters as JSON';
COMMENT ON COLUMN request_logs.headers IS 'Request headers as JSON (sanitized)';
COMMENT ON COLUMN request_logs.body IS 'Request body as JSON (sanitized)';
