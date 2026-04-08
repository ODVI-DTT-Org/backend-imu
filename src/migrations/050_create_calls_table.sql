-- Migration 050: Create calls table
-- This table stores phone call data for tele touchpoints

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    dial_time TIMESTAMPTZ,
    duration INTEGER,
    notes TEXT,
    reason TEXT,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calls
CREATE INDEX idx_calls_client_id ON calls(client_id);
CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_calls_dial_time ON calls(dial_time DESC);
CREATE INDEX idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX idx_calls_client_user ON calls(client_id, user_id);
