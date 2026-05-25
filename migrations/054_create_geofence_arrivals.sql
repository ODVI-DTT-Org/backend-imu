CREATE TABLE IF NOT EXISTS geofence_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_latitude DOUBLE PRECISION NOT NULL,
  agent_longitude DOUBLE PRECISION NOT NULL,
  client_latitude DOUBLE PRECISION NOT NULL,
  client_longitude DOUBLE PRECISION NOT NULL,
  distance_meters INTEGER NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 400,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_arrivals_user_client_arrived
  ON geofence_arrivals(user_id, client_id, arrived_at DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_arrivals_client_arrived
  ON geofence_arrivals(client_id, arrived_at DESC);
