-- Migration 112: tagged_psgc_clients
-- Records every client whose coordinates were re-geocoded from PSGC centroid.
-- Used as a reference for the v2 production migration to distinguish
-- original GPS data (collected in the field) from geocoded approximations.

CREATE TABLE IF NOT EXISTS tagged_psgc_clients (
  client_id         UUID        PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  old_latitude      DOUBLE PRECISION,           -- PSGC centroid lat (may be null for first-time geocodes)
  old_longitude     DOUBLE PRECISION,           -- PSGC centroid lng
  new_latitude      DOUBLE PRECISION,           -- result written to clients.latitude
  new_longitude     DOUBLE PRECISION,           -- result written to clients.longitude
  geocode_source    VARCHAR(20) NOT NULL,       -- 'mapbox' | 'nominatim' | 'failed'
  confidence        FLOAT,                      -- Mapbox relevance (0-1); NULL for Nominatim
  address_used      TEXT,                       -- query string sent to the geocoding API
  tagged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tagged_psgc_source    ON tagged_psgc_clients (geocode_source);
CREATE INDEX IF NOT EXISTS idx_tagged_psgc_tagged_at ON tagged_psgc_clients (tagged_at);

COMMENT ON TABLE tagged_psgc_clients IS
  'Audit log of clients re-geocoded from PSGC barangay centroids. '
  'old_latitude/longitude = pre-script value; new_* = what was written. '
  'Clients absent from this table were never touched by the script.';
