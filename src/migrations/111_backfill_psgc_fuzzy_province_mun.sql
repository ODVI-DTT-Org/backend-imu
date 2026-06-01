-- Migration 111: Backfill psgc_id for clients missed by migration 110 due to:
--   1. Renamed provinces: MAGUINDANAO → Norte/Sur, COMPOSTELA VALLEY → Davao de Oro, etc.
--   2. Parenthetical old municipality names: "GENERAL SANTOS (DADIANGAS)" → "GENERAL SANTOS"
--   3. "Island Garden City of Samal" pattern
--
-- Expected: ~4,584 additional clients tagged.

CREATE TEMP TABLE _psgc_fuzzy AS
SELECT DISTINCT ON (c.id)
  c.id           AS client_id,
  c.full_address,
  c.municipality,
  c.province,
  p.id           AS psgc_id
FROM clients c
-- Pre-strip parenthetical from municipality via lateral
CROSS JOIN LATERAL (
  SELECT TRIM(REGEXP_REPLACE(c.municipality, '\s*\([^)]*\)\s*$', '', 'g')) AS mun
) m
JOIN psgc p ON (
  -- Province: normalize renamed/misspelled provinces
  (
    LOWER(TRIM(p.province)) = LOWER(TRIM(c.province))
    OR (LOWER(TRIM(c.province)) IN ('maguindanao')
        AND LOWER(TRIM(p.province)) IN ('maguindanao del norte', 'maguindanao del sur'))
    OR (LOWER(TRIM(c.province)) IN ('compostela valley')
        AND LOWER(TRIM(p.province)) = 'davao de oro')
    OR (LOWER(TRIM(c.province)) IN ('dinagat island')
        AND LOWER(TRIM(p.province)) = 'dinagat islands')
    OR (LOWER(TRIM(c.province)) IN ('zambonga del sur', 'zambboanga del sur', 'zamboanga dell sur')
        AND LOWER(TRIM(p.province)) = 'zamboanga del sur')
    OR (LOWER(TRIM(c.province)) IN ('zambonga sibugay')
        AND LOWER(TRIM(p.province)) = 'zamboanga sibugay')
    OR (LOWER(TRIM(c.province)) IN ('zaboanga del norte')
        AND LOWER(TRIM(p.province)) = 'zamboanga del norte')
  )
  AND (
    LOWER(TRIM(p.mun_city)) = LOWER(m.mun)
    OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(TRIM(REGEXP_REPLACE(m.mun, ' CITY$', '', 'i')))
    OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(m.mun)
    OR LOWER(TRIM(p.mun_city)) = LOWER(m.mun) || ' city'
    OR LOWER(TRIM(p.mun_city)) = 'island garden city of ' || LOWER(m.mun)
  )
)
WHERE c.deleted_at IS NULL
  AND c.psgc_id IS NULL
  AND COALESCE(NULLIF(c.full_address, ''), NULL) IS NOT NULL
  AND c.province != 'UNCATEGORIZED'
ORDER BY c.id, p.id;

DO $$ BEGIN RAISE NOTICE 'Matchable clients: %', (SELECT COUNT(*) FROM _psgc_fuzzy); END $$;

CREATE OR REPLACE PROCEDURE _run_psgc_fuzzy()
LANGUAGE plpgsql AS $proc$
DECLARE
  batch_size  INT := 1000;
  offset_val  INT := 0;
  total       INT;
BEGIN
  SELECT COUNT(*) INTO total FROM _psgc_fuzzy;

  WHILE offset_val < total LOOP
    UPDATE clients
    SET psgc_id = b.psgc_id
    FROM (
      SELECT client_id, psgc_id
      FROM _psgc_fuzzy
      ORDER BY client_id
      LIMIT batch_size OFFSET offset_val
    ) b
    WHERE clients.id = b.client_id
      AND clients.psgc_id IS NULL;

    INSERT INTO addresses (client_id, type, street_address, city, province, psgc_id, is_primary)
    SELECT b.client_id, 'home', b.full_address, b.municipality, b.province, b.psgc_id, true
    FROM (
      SELECT client_id, full_address, municipality, province, psgc_id
      FROM _psgc_fuzzy
      ORDER BY client_id
      LIMIT batch_size OFFSET offset_val
    ) b
    ON CONFLICT (client_id, type) WHERE deleted_at IS NULL DO NOTHING;

    offset_val := offset_val + batch_size;
    RAISE NOTICE 'Progress: %/%', LEAST(offset_val, total), total;
    COMMIT;
    PERFORM pg_sleep(0.05);
  END LOOP;

  RAISE NOTICE 'Done.';
END;
$proc$;

CALL _run_psgc_fuzzy();

DROP PROCEDURE _run_psgc_fuzzy();
DROP TABLE _psgc_fuzzy;
