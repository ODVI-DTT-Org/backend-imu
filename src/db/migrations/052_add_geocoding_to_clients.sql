-- Migration: 052_add_geocoding_to_clients
-- Adds geocoding columns and a trigger that resets geocode_status to 'pending'
-- whenever a client is inserted or their address fields change (covers both
-- REST-path and PowerSync CRUD-queue writes from manager roles).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_status  TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_clients_geocode_status
  ON clients (geocode_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_lat_lng
  ON clients (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL;

-- Trigger: reset geocode_status to 'pending' on insert or address-field change.
-- The background job polls for geocode_status = 'pending' and handles the rest.
CREATE OR REPLACE FUNCTION fn_geocode_clients_on_change() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR
     (OLD.province IS DISTINCT FROM NEW.province OR
      OLD.municipality IS DISTINCT FROM NEW.municipality OR
      OLD.barangay IS DISTINCT FROM NEW.barangay) THEN
    NEW.geocode_status := 'pending';
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    NEW.geocoded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geocode_clients ON clients;
CREATE TRIGGER trg_geocode_clients
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_geocode_clients_on_change();
