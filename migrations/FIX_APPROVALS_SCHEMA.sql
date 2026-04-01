-- ============================================================
-- Fix Approvals Table Schema
-- Run this if the approvals table has wrong columns
-- ============================================================

BEGIN;

-- Drop and recreate approvals table with correct schema
DROP TABLE IF EXISTS approvals CASCADE;

CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('client', 'udi')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_approvals_client_id ON approvals(client_id);
CREATE INDEX idx_approvals_caravan_id ON approvals(caravan_id);
CREATE INDEX idx_approvals_type ON approvals(type);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_created_at ON approvals(created_at);

-- Create updated_at trigger
CREATE TRIGGER update_approvals_updated_at
    BEFORE UPDATE ON approvals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Verification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'approvals'
ORDER BY ordinal_position;

SELECT 'Approvals table fixed successfully!' as result;
