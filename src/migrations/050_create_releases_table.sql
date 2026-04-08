-- Migration 050: Create releases table
-- This table stores loan release events with approval audit trail

CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    product_type TEXT NOT NULL CHECK (product_type IN ('PUSU', 'LIKA', 'SUB2K')),
    loan_type TEXT NOT NULL CHECK (loan_type IN ('NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM')),
    amount NUMERIC NOT NULL,
    approval_notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed')),
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- Audit field: who approved
    approved_at TIMESTAMPTZ,  -- Audit field: when approved
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for releases
CREATE INDEX IF NOT EXISTS idx_releases_client_id ON releases(client_id);
CREATE INDEX IF NOT EXISTS idx_releases_user_id ON releases(user_id);
CREATE INDEX IF NOT EXISTS idx_releases_visit_id ON releases(visit_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_product_type ON releases(product_type);
CREATE INDEX IF NOT EXISTS idx_releases_loan_type ON releases(loan_type);
CREATE INDEX IF NOT EXISTS idx_releases_created_at ON releases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_approved_by ON releases(approved_at);  -- For audit queries

-- Comment for audit fields
COMMENT ON COLUMN releases.approved_by IS 'User ID of the manager who approved/rejected this release';
COMMENT ON COLUMN releases.approved_at IS 'Timestamp when the release was approved or rejected';
