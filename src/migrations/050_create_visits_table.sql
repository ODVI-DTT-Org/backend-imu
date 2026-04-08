-- Migration 050: Create visits table
-- This table stores physical visit data with GPS and odometer tracking

CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'regular_visit' CHECK (type IN ('regular_visit', 'release_loan')),
    time_in TIMESTAMPTZ,
    time_out TIMESTAMPTZ,
    odometer_arrival TEXT,
    odometer_departure TEXT,
    photo_url TEXT,
    notes TEXT,
    reason TEXT,
    status TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for visits
CREATE INDEX idx_visits_client_id ON visits(client_id);
CREATE INDEX idx_visits_user_id ON visits(user_id);
CREATE INDEX idx_visits_type ON visits(type);
CREATE INDEX idx_visits_time_in ON visits(time_in DESC);
CREATE INDEX idx_visits_time_out ON visits(time_out DESC);
CREATE INDEX idx_visits_created_at ON visits(created_at DESC);
CREATE INDEX idx_visits_client_user ON visits(client_id, user_id);
