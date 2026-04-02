-- ============================================================
-- MIGRATION 038: Error Handling System
-- ============================================================
-- This migration adds the comprehensive error handling system
-- to the IMU backend. All errors are logged to the error_logs table
-- for debugging and monitoring purposes.
--
-- Features:
-- - Async database logging (fire-and-forget pattern)
-- - Sensitive data redaction (passwords, tokens, API keys)
-- - Request ID tracking for debugging
-- - Admin-only access with RBAC
-- - Full CRUD API endpoints
-- - Admin UI with filtering and resolution
--
-- Related Files:
-- - Backend: backend/src/errors/, backend/src/services/errorLogger.ts
-- - API: backend/src/routes/error-logs.ts
-- - Admin UI: imu-web-vue/src/views/admin/ErrorLogsView.vue
-- - Error Handler: backend/src/index.ts (app.onError)
--
-- Author: IMU Development Team
-- Date: 2026-04-02
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ERROR LOGS TABLE
-- ============================================================
-- This table stores all errors that occur in the backend API
-- It provides a centralized location for error tracking and debugging
-- Admin users can view and resolve errors through the admin dashboard

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,              -- Error code (e.g., INVALID_CREDENTIALS)
    message TEXT NOT NULL,           -- Error message
    status_code INTEGER NOT NULL,    -- HTTP status code (401, 500, etc.)
    path TEXT NOT NULL,              -- Request path (e.g., /api/auth/login)
    method TEXT NOT NULL,            -- HTTP method (GET, POST, etc.)
    user_id UUID,                    -- User who made the request
    ip_address TEXT,                 -- Client IP address
    user_agent TEXT,                 -- Client user agent
    details JSONB,                   -- Additional error details (JSON)
    errors JSONB,                    -- Field validation errors (JSON)
    stack_trace TEXT,                -- Error stack trace
    suggestions TEXT[],              -- Array of suggestions for fixing the error
    documentation_url TEXT,          -- Link to documentation
    resolved BOOLEAN DEFAULT FALSE,  -- Whether the error has been resolved
    resolved_at TIMESTAMPTZ,         -- When the error was resolved
    resolved_by UUID,                -- Admin user who resolved the error
    resolution_notes TEXT,           -- Notes about the resolution
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
-- Create indexes for error_logs table to improve query performance

CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);
CREATE INDEX IF NOT EXISTS idx_error_logs_status_code ON error_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger for error_logs table
DROP TRIGGER IF EXISTS update_error_logs_updated_at ON error_logs;
CREATE TRIGGER update_error_logs_updated_at BEFORE UPDATE ON error_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PERMISSIONS (RBAC)
-- ============================================================
-- Add error_logs permission to the permissions table
-- This allows admin users to access error logs

INSERT INTO permissions (name, description, resource, action)
VALUES (
    'error_logs',
    'View and manage error logs',
    'error_logs',
    'read'
) ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description, resource, action)
VALUES (
    'error_logs_resolve',
    'Resolve error logs',
    'error_logs',
    'resolve'
) ON CONFLICT (name) DO NOTHING;

-- Grant error_logs permissions to admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'area_manager', 'assistant_area_manager')
  AND p.name IN ('error_logs', 'error_logs_resolve')
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Verify that the error_logs table was created successfully

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'error_logs'
    ) THEN
        RAISE NOTICE '✅ Migration 038: error_logs table created successfully';
    ELSE
        RAISE EXCEPTION '❌ Migration 038: Failed to create error_logs table';
    END IF;
END $$;

-- Verify indexes were created
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = 'error_logs';

    IF index_count >= 6 THEN
        RAISE NOTICE '✅ Migration 038: error_logs indexes created successfully (% indexes)', index_count;
    ELSE
        RAISE EXCEPTION '❌ Migration 038: Failed to create all error_logs indexes (only % created)', index_count;
    END IF;
END $$;

-- Verify permissions were created
DO $$
DECLARE
    perm_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO perm_count
    FROM permissions
    WHERE name IN ('error_logs', 'error_logs_resolve');

    IF perm_count = 2 THEN
        RAISE NOTICE '✅ Migration 038: error_logs permissions created successfully';
    ELSE
        RAISE WARNING '⚠️  Migration 038: Some error_logs permissions may be missing';
    END IF;
END $$;

-- ============================================================
-- ROLLBACK (for testing purposes)
-- ============================================================
-- To rollback this migration, run:
--
-- DROP TABLE IF EXISTS error_logs CASCADE;
-- DELETE FROM permissions WHERE name IN ('error_logs', 'error_logs_resolve');
-- DELETE FROM role_permissions WHERE permission_id IN (
--     SELECT id FROM permissions WHERE name IN ('error_logs', 'error_logs_resolve')
-- );
--
-- ============================================================
