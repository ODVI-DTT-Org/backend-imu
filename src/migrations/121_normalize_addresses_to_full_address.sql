-- Migration 121: Normalize addresses to show the original clients.full_address
--
-- Purpose
-- -------
-- A previous backfill script populated addresses.street / street_address from
-- clients.full_address, then ALSO populated structured PSGC fields
-- (barangay / city / province) by parsing/tagging. The mobile display joiner
-- (resolveAddressDisplay -> joinAddressParts) concatenates
--   street + barangay + city + province
-- which produces redundant strings like:
--   "001 PUROK 3 BRGY FORTUNA, FLORIDABLANCA, PAMPANGA, Fortuna, FLORIDABLANCA, PAMPANGA"
-- The user wants the display to show the original full_address only.
--
-- This script normalizes each client's primary address row so the displayed
-- text equals clients.full_address verbatim:
--   * street          := clients.full_address  (display joiner reads this)
--   * street_address  := clients.full_address  (legacy column kept in sync)
--   * barangay        := NULL                  (drop appended PSGC junk)
--   * city            := NULL
--   * province        := NULL
--
-- psgc_id is intentionally preserved — it is not displayed and may be useful
-- to other systems (analytics, search, future reconciliation).
-- is_primary is not changed — the primary row is the one being normalized.
--
-- Idempotent: re-running is a no-op once the row already equals full_address.

BEGIN;

WITH targets AS (
  SELECT
    a.id          AS addr_id,
    c.full_address
  FROM clients c
  JOIN addresses a ON a.client_id = c.id
                  AND a.deleted_at IS NULL
                  AND a.is_primary = true
  WHERE c.full_address IS NOT NULL
    AND btrim(c.full_address) <> ''
    AND c.deleted_at IS NULL
    AND (
         a.street           IS DISTINCT FROM c.full_address
      OR a.street_address   IS DISTINCT FROM c.full_address
      OR a.barangay         IS NOT NULL
      OR a.city             IS NOT NULL
      OR a.province         IS NOT NULL
    )
)
UPDATE addresses a
SET
  street          = t.full_address,
  street_address  = t.full_address,
  barangay        = NULL,
  city            = NULL,
  province        = NULL,
  updated_at      = NOW()
FROM targets t
WHERE a.id = t.addr_id;

-- Report: rows still differing after the update (should be 0).
SELECT
  'Migration 121: ' || COUNT(*) || ' primary addresses still differ from full_address (expected 0)' AS result
FROM clients c
JOIN addresses a ON a.client_id = c.id AND a.deleted_at IS NULL AND a.is_primary = true
WHERE c.full_address IS NOT NULL
  AND btrim(c.full_address) <> ''
  AND c.deleted_at IS NULL
  AND (
       a.street         IS DISTINCT FROM c.full_address
    OR a.street_address IS DISTINCT FROM c.full_address
    OR a.barangay       IS NOT NULL
    OR a.city           IS NOT NULL
    OR a.province       IS NOT NULL
  );

COMMIT;
