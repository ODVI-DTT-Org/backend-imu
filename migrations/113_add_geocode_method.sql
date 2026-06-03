-- 113: Track which step of the geocoding pipeline produced each client's coords
--
-- Pipeline (geocode-clients-processor.ts):
--   psgc    — Step 1: direct psgc.pin_location lookup (barangay centroid, coarse)
--   haiku   — Step 2: Claude Haiku resolved address to a PSGC row, then Step 1
--   mapbox  — Step 3: Mapbox forward geocode (street-level)
--
-- Backfill: any existing geocoded client whose coords match their PSGC
-- barangay's pin_location exactly is marked 'psgc'. Everything else stays
-- NULL — we can't reliably distinguish Haiku-derived PSGC pins from
-- Mapbox results without re-running the pipeline.

BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS geocode_method text;

COMMENT ON COLUMN clients.geocode_method IS
  'Which step of the geocoding pipeline produced the coords: '
  '''psgc'' (barangay centroid), ''haiku'' (AI-resolved PSGC), ''mapbox'' (street-level), '
  'or NULL (unknown / pre-tracking).';

-- Backfill: clients whose coords exactly match their PSGC barangay pin
-- are tagged 'psgc'. Use 5-decimal rounding to absorb minor float drift.
UPDATE clients c
   SET geocode_method = 'psgc'
  FROM psgc p
 WHERE c.deleted_at IS NULL
   AND c.latitude IS NOT NULL
   AND c.longitude IS NOT NULL
   AND p.id = c.psgc_id
   AND p.pin_location IS NOT NULL
   AND ROUND(c.latitude::numeric, 5)  = ROUND((p.pin_location->>'latitude')::numeric, 5)
   AND ROUND(c.longitude::numeric, 5) = ROUND((p.pin_location->>'longitude')::numeric, 5);

CREATE INDEX IF NOT EXISTS idx_clients_geocode_method
  ON clients (geocode_method)
  WHERE deleted_at IS NULL;

COMMIT;
