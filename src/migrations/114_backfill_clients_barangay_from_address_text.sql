-- Migration 114: Backfill clients.barangay from addresses.street free-text
--
-- Root cause: bulk-import via scripts/cms-cleanup/in/PCNICMS-20260416.sql
-- defaulted barangay='Banaban' for ALL Angat clients regardless of actual
-- barangay. The real barangay is embedded in the street text, e.g.:
--   street = "BINAGBAG, ANGAT BULACAN", barangay = 'Banaban'
--
-- Strategy: for each client whose barangay is 'Banaban' (or NULL), look at
-- their primary address street text, find which PSGC barangay (scoped to the
-- same municipality) appears as a whole-word match in the combined text, and
-- update barangay + normalized_barangay. If there are multiple matches or no
-- match, set to NULL (better to be unknown than wrong).
--
-- Apply manually:
--   psql ... -f 114_backfill_clients_barangay_from_address_text.sql
-- Then verify with the sample queries at the bottom.
-- After applying, insert into migration_log.

BEGIN;

-- STEP 1 (dry run): preview what would be updated.
-- Run this SELECT first to verify results look sane before the UPDATE.
/*
WITH street_text AS (
  SELECT
    c.id,
    c.municipality,
    c.barangay                                            AS old_barangay,
    LOWER(COALESCE(a.street, '') || ' ' || COALESCE(a.street_address, '')) AS haystack
  FROM clients c
  JOIN addresses a ON a.client_id = c.id AND a.deleted_at IS NULL AND a.is_primary = 1
  WHERE UPPER(COALESCE(c.municipality,'')) = 'ANGAT'
),
matches AS (
  SELECT
    st.id,
    st.old_barangay,
    p.barangay                                            AS matched_barangay,
    ROW_NUMBER() OVER (PARTITION BY st.id ORDER BY length(p.barangay) DESC) AS rn,
    COUNT(*) OVER (PARTITION BY st.id)                    AS match_count
  FROM street_text st
  JOIN psgc p ON UPPER(p.mun_city) = 'ANGAT'
  WHERE st.haystack ~* ('\m' || lower(p.barangay) || '\M')
)
SELECT id, old_barangay, matched_barangay, match_count
FROM matches
WHERE rn = 1
ORDER BY matched_barangay
LIMIT 50;
*/

-- STEP 2: actual backfill.
-- Scope: any client where barangay is 'Banaban' (the bulk-import default).
-- We update in two passes:
--   Pass A: single unambiguous match → set to that barangay.
--   Pass B: no match or multiple matches → set to NULL (unknown is better than wrong).

WITH street_text AS (
  -- Combine street + street_address into one lowercase haystack per client.
  -- Use the client's first non-deleted address.
  SELECT DISTINCT ON (c.id)
    c.id,
    c.municipality,
    LOWER(COALESCE(a.street, '') || ' ' || COALESCE(a.street_address, '')) AS haystack
  FROM clients c
  JOIN addresses a ON a.client_id = c.id AND a.deleted_at IS NULL
  WHERE LOWER(COALESCE(c.barangay, '')) = 'banaban'
  ORDER BY c.id, a.is_primary DESC, a.created_at
),
matches AS (
  SELECT
    st.id,
    p.barangay                                            AS matched_barangay,
    COUNT(*) OVER (PARTITION BY st.id)                    AS match_count,
    ROW_NUMBER() OVER (PARTITION BY st.id ORDER BY length(p.barangay) DESC) AS rn
  FROM street_text st
  JOIN psgc p ON UPPER(p.mun_city) = UPPER(st.municipality)
  WHERE st.haystack ~* ('\m' || lower(p.barangay) || '\M')
),
single_match AS (
  SELECT id, matched_barangay
  FROM matches
  WHERE rn = 1 AND match_count = 1
)
-- normalized_barangay is a generated column — omit it; it updates automatically.
UPDATE clients c
SET
  barangay   = sm.matched_barangay,
  updated_at = NOW()
FROM single_match sm
WHERE c.id = sm.id;

-- Pass B: clients with 'Banaban' but no single unambiguous PSGC match → NULL.
WITH street_text AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    c.municipality,
    LOWER(COALESCE(a.street, '') || ' ' || COALESCE(a.street_address, '')) AS haystack
  FROM clients c
  JOIN addresses a ON a.client_id = c.id AND a.deleted_at IS NULL
  WHERE LOWER(COALESCE(c.barangay, '')) = 'banaban'
  ORDER BY c.id, a.is_primary DESC, a.created_at
),
matches AS (
  SELECT st.id, COUNT(*) AS match_count
  FROM street_text st
  JOIN psgc p ON UPPER(p.mun_city) = UPPER(st.municipality)
  WHERE st.haystack ~* ('\m' || lower(p.barangay) || '\M')
  GROUP BY st.id
),
no_single_match AS (
  -- Clients that had no match OR multiple matches
  SELECT st.id
  FROM street_text st
  LEFT JOIN matches m ON m.id = st.id
  WHERE m.id IS NULL OR m.match_count != 1
)
-- normalized_barangay is generated; only update barangay.
UPDATE clients c
SET
  barangay   = NULL,
  updated_at = NOW()
FROM no_single_match nsm
WHERE c.id = nsm.id;

-- Record migration
INSERT INTO migration_log (script_name, status, completed_at)
VALUES ('114_backfill_clients_barangay_from_address_text', 'completed', NOW());

COMMIT;

-- Post-apply verification queries:
-- 1. How many Angat clients now have a non-null, non-Banaban barangay?
--    SELECT barangay, COUNT(*) FROM clients WHERE UPPER(municipality)='ANGAT' GROUP BY barangay ORDER BY 2 DESC;
-- 2. Spot-check a Binagbag client:
--    SELECT id, first_name, last_name, barangay, normalized_barangay FROM clients WHERE UPPER(municipality)='ANGAT' AND LOWER(barangay)='binagbag' LIMIT 5;
