-- Migration: Create/Recreate Audit Logs Table
-- Date: 2025-03-26
-- Purpose: Ensure audit_logs table has correct schema with all required columns and indexes
--
-- This migration fixes the issue where the audit table may have been created with
-- an incorrect schema or missing columns.

BEGIN;

-- Drop existing audit_logs table if it exists (will be recreated with correct schema)
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Create audit_logs table with correct schema
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Create composite index for common queries
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Audit trail for all CRUD operations and system events';
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL for system actions)';
COMMENT ON COLUMN audit_logs.action IS 'Action type: create, update, delete, login, logout, approve, reject, etc.';
COMMENT ON COLUMN audit_logs.entity IS 'Entity type: user, client, caravan, agency, touchpoint, itinerary, group, etc.';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN audit_logs.old_values IS 'Previous values for update/delete operations (JSONB)';
COMMENT ON COLUMN audit_logs.new_values IS 'New values for create/update operations (JSONB)';
COMMENT ON COLUMN audit_logs.ip_address IS 'Client IP address';
COMMENT ON COLUMN audit_logs.user_agent IS 'Client user agent string';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context: success status, rejection reasons, etc.';
COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp of the audit event';

COMMIT;

-- Verification queries:
-- SELECT COUNT(*) FROM audit_logs;
-- SELECT action, entity, COUNT(*) FROM audit_logs GROUP BY action, entity ORDER BY count DESC LIMIT 10;
-- SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;
