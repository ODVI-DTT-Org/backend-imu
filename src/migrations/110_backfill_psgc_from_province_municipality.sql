-- Migration 110: Backfill psgc_id and addresses for clients that have
-- full_address/province/municipality text but no psgc_id and no addresses row.
--
-- Matching strategy (province + municipality, case-insensitive, trimmed):
--   1. Exact match:            "QUEZON CITY"         → "Quezon City"
--   2. Strip " CITY" suffix:   "CEBU CITY"           → "City of Cebu"
--   3. Plain name:             "MANILA"              → "City of Manila"
--   4. Append " city" suffix:  "TUGUEGARAO"          → "Tuguegarao City"
--
-- Picks MIN(psgc.id) per municipality as the representative row (consistent,
-- repeatable — no randomness). Skips UNCATEGORIZED and any clients where no
-- PSGC row can be found.
--
-- Expected impact: ~75,684 clients get psgc_id + a new 'home' addresses row.

BEGIN;

WITH best_psgc AS (
  SELECT
    c.id   AS client_id,
    c.full_address,
    c.municipality,
    c.province,
    (
      SELECT MIN(p.id)
      FROM psgc p
      WHERE LOWER(TRIM(p.province)) = LOWER(TRIM(c.province))
        AND (
          LOWER(TRIM(p.mun_city)) = LOWER(TRIM(c.municipality))
          OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(TRIM(REGEXP_REPLACE(c.municipality, ' CITY$', '', 'i')))
          OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(TRIM(c.municipality))
          OR LOWER(TRIM(p.mun_city)) = LOWER(TRIM(c.municipality)) || ' city'
        )
    ) AS psgc_id
  FROM clients c
  WHERE c.deleted_at IS NULL
    AND c.psgc_id IS NULL
    AND COALESCE(NULLIF(c.full_address, ''), NULL) IS NOT NULL
),

matched AS (
  SELECT * FROM best_psgc WHERE psgc_id IS NOT NULL
),

updated_clients AS (
  UPDATE clients
  SET psgc_id = m.psgc_id
  FROM matched m
  WHERE clients.id = m.client_id
  RETURNING clients.id, m.full_address, m.municipality, m.province, m.psgc_id
)

INSERT INTO addresses (client_id, type, street_address, city, province, psgc_id, is_primary)
SELECT
  u.id,
  'home',
  u.full_address,
  u.municipality,
  u.province,
  u.psgc_id,
  true
FROM updated_clients u
ON CONFLICT (client_id, type) WHERE deleted_at IS NULL DO NOTHING;

COMMIT;
