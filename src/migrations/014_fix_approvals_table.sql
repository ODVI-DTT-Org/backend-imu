-- Migration: Fix approvals table - add missing columns
-- Date: 2025-03-24
-- Issue: Approvals table exists but is missing caravan_id and other columns
-- Solution: Add missing columns to existing approvals table

BEGIN;

-- Check if table exists and add missing columns
DO $$
BEGIN
    -- Add caravan_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'caravan_id'
    ) THEN
        ALTER TABLE approvals ADD COLUMN caravan_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Add touchpoint_number column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'touchpoint_number'
    ) THEN
        ALTER TABLE approvals ADD COLUMN touchpoint_number INTEGER;
    END IF;

    -- Add role column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'role'
    ) THEN
        ALTER TABLE approvals ADD COLUMN role TEXT;
    END IF;

    -- Add reason column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'reason'
    ) THEN
        ALTER TABLE approvals ADD COLUMN reason TEXT;
    END IF;

    -- Add notes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'notes'
    ) THEN
        ALTER TABLE approvals ADD COLUMN notes TEXT;
    END IF;

    -- Add approved_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'approved_by'
    ) THEN
        ALTER TABLE approvals ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Add approved_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE approvals ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;

    -- Add rejected_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'rejected_by'
    ) THEN
        ALTER TABLE approvals ADD COLUMN rejected_by UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Add rejected_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE approvals ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;

    -- Add rejection_reason column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approvals' AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE approvals ADD COLUMN rejection_reason TEXT;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_caravan_id ON approvals(caravan_id);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Create updated_at trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_approvals_updated_at') THEN
        CREATE TRIGGER update_approvals_updated_at
            BEFORE UPDATE ON approvals
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

COMMIT;

SELECT 'Migration 014: Approvals table columns added successfully!' as result;
