-- migrations/110_auto_populate_full_name.sql
-- Add a Postgres trigger so clients.full_name is auto-populated on INSERT/UPDATE.
-- The mobile app's PowerSync SQLite already has this trigger (mobile migration 049),
-- but the production Postgres backend never got it, which meant any client created
-- via POST /clients or via approval (with NULL full_name) was invisible to the
-- full-text search vector (which is GENERATED ALWAYS AS to_tsvector(full_name)).

CREATE OR REPLACE FUNCTION clients_compute_full_name() RETURNS trigger AS $$
BEGIN
  NEW.full_name :=
    COALESCE(NULLIF(TRIM(NEW.last_name), ''), '') ||
    CASE
      WHEN COALESCE(NULLIF(TRIM(NEW.first_name), ''), '') <> '' THEN ', ' || TRIM(NEW.first_name)
      ELSE ''
    END ||
    CASE
      WHEN COALESCE(NULLIF(TRIM(NEW.middle_name), ''), '') <> '' THEN ' ' || TRIM(NEW.middle_name)
      ELSE ''
    END;
  IF NEW.full_name = '' THEN NEW.full_name := NULL; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_full_name_trigger ON clients;
CREATE TRIGGER clients_full_name_trigger
  BEFORE INSERT OR UPDATE OF first_name, last_name, middle_name ON clients
  FOR EACH ROW
  EXECUTE FUNCTION clients_compute_full_name();

-- Backfill any existing rows where full_name is NULL/empty.
UPDATE clients
SET first_name = first_name  -- no-op write to fire the trigger and recompute full_name
WHERE (full_name IS NULL OR full_name = '')
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);
