-- Migration 1103: Create client_status_history table
-- Records every client_type and market_type transition with a snapshot of the client row
-- at the time of change. One row per field change per event.

BEGIN;

CREATE TABLE IF NOT EXISTS client_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field TEXT NOT NULL CHECK (field IN ('client_type', 'market_type')),
    old_value TEXT,
    new_value TEXT,
    changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    trigger_touchpoint_id UUID REFERENCES touchpoints(id) ON DELETE SET NULL,
    trigger_release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
    client_snapshot JSONB,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance index: most common query is "show history for client X, newest first"
CREATE INDEX IF NOT EXISTS idx_client_status_history_client_changed_at
    ON client_status_history(client_id, changed_at DESC);

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1103_client_status_history',
  'completed',
  now(),
  jsonb_build_object('note', 'Create client_status_history table for lifecycle transition audit trail')
);

COMMIT;
