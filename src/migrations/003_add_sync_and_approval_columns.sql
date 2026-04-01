-- Migration: 003_add_sync_and_approval_columns.sql

-- === Touchpoints Table Updates ===
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edit_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edited_by VARCHAR(255);
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS proposed_changes JSONB;

-- Comments
COMMENT ON COLUMN touchpoints.is_synced IS 'True when touchpoint has been synced to central DB';
COMMENT ON COLUMN touchpoints.synced_at IS 'Timestamp when sync completed';
COMMENT ON COLUMN touchpoints.edit_status IS 'NULL | pending_approval | approved | rejected';
COMMENT ON COLUMN touchpoints.edited_at IS 'Timestamp when edit was submitted for approval';
COMMENT ON COLUMN touchpoints.edited_by IS 'User ID who made the edit';
COMMENT ON COLUMN touchpoints.proposed_changes IS 'JSON object containing proposed field changes';

-- Index for approval queue queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_edit_status ON touchpoints(edit_status) WHERE edit_status IS NOT NULL;

-- === Migration Strategy for Existing Data ===
-- Mark all existing touchpoints as synced
UPDATE touchpoints
SET is_synced = true, synced_at = created_at
WHERE is_synced = false AND created_at IS NOT NULL;

SELECT 'Sync and approval columns migration applied successfully!' as result;