-- ============================================
-- Migration 094: Materialize last_touchpoint_date for fast ORDER BY
-- ============================================
-- Purpose: GET /api/clients sorts by `(touchpoint_summary->-1->>'date')`
-- which is unindexable. Postgres falls back to an external merge sort
-- of the entire clients table (~3.2s on a 316k-row dataset).
--
-- Materialize the value into a column maintained by a BEFORE trigger,
-- so an index can cover the sort. See migration 095 for the index.
-- ============================================

BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS last_touchpoint_date timestamptz;

COMMENT ON COLUMN clients.last_touchpoint_date IS
  'Date of the last entry in touchpoint_summary, materialized for fast ORDER BY. Maintained by trigger_clients_last_touchpoint_date — do not write directly.';

-- Backfill from existing touchpoint_summary
UPDATE clients
SET last_touchpoint_date = NULLIF(touchpoint_summary->-1->>'date', '')::timestamptz
WHERE touchpoint_summary IS NOT NULL
  AND touchpoint_summary != '[]'::jsonb
  AND last_touchpoint_date IS NULL;

CREATE OR REPLACE FUNCTION update_clients_last_touchpoint_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_touchpoint_date := NULLIF(NEW.touchpoint_summary->-1->>'date', '')::timestamptz;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clients_last_touchpoint_date ON clients;
CREATE TRIGGER trigger_clients_last_touchpoint_date
  BEFORE INSERT OR UPDATE OF touchpoint_summary ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_last_touchpoint_date();

COMMENT ON FUNCTION update_clients_last_touchpoint_date() IS
  'Keeps clients.last_touchpoint_date in sync with the last entry of touchpoint_summary.';

COMMIT;
