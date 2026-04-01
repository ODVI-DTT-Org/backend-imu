-- Add rejection_reason column to touchpoints table for approval workflow
-- Run this with: psql -U your_user -d your_database -f src/migrations/011_add_rejection_reason_to_touchpoints.sql

-- Add rejection_reason column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints'
        AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN rejection_reason TEXT;
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN touchpoints.rejection_reason IS 'Reason for rejecting a touchpoint during approval process';

-- Add index on edit_status for faster filtering of pending approvals
CREATE INDEX IF NOT EXISTS idx_touchpoints_edit_status ON touchpoints(edit_status);
CREATE INDEX IF NOT EXISTS idx_touchpoints_status_caravan ON touchpoints(edit_status, caravan_id);

-- Verify the changes
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'touchpoints'
AND column_name IN ('edit_status', 'rejection_reason', 'is_synced')
ORDER BY ordinal_position;
