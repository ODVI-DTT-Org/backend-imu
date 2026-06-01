-- Migration 110: Backfill psgc_id and addresses for clients that have
-- full_address/province/municipality text but no psgc_id and no addresses row.
--
-- Uses a PROCEDURE (PostgreSQL 11+) so we can COMMIT every 1,000 rows,
-- keeping row locks brief and not blocking live touchpoint inserts.
--
-- Safe to re-run: skips clients that already have psgc_id set.
-- Expected: ~75,684 clients tagged.

-- Step 1: Temp table of matches (pure SELECT, no row locks)
CREATE TEMP TABLE _psgc_backfill AS
SELECT
  c.id            AS client_id,
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
  AND COALESCE(NULLIF(c.full_address, ''), NULL) IS NOT NULL;

DELETE FROM _psgc_backfill WHERE psgc_id IS NULL;

DO $$ BEGIN RAISE NOTICE 'Matchable clients: %', (SELECT COUNT(*) FROM _psgc_backfill); END $$;

-- Step 2: Procedure that commits every 1,000 rows
CREATE OR REPLACE PROCEDURE _run_psgc_backfill()
LANGUAGE plpgsql AS $proc$
DECLARE
  batch_size  INT := 1000;
  offset_val  INT := 0;
  total       INT;
  chunk       INT;
BEGIN
  SELECT COUNT(*) INTO total FROM _psgc_backfill;

  WHILE offset_val < total LOOP
    UPDATE clients
    SET psgc_id = b.psgc_id
    FROM (
      SELECT client_id, psgc_id
      FROM _psgc_backfill
      ORDER BY client_id
      LIMIT batch_size OFFSET offset_val
    ) b
    WHERE clients.id = b.client_id
      AND clients.psgc_id IS NULL;

    GET DIAGNOSTICS chunk = ROW_COUNT;

    INSERT INTO addresses (client_id, type, street_address, city, province, psgc_id, is_primary)
    SELECT b.client_id, 'home', b.full_address, b.municipality, b.province, b.psgc_id, true
    FROM (
      SELECT client_id, full_address, municipality, province, psgc_id
      FROM _psgc_backfill
      ORDER BY client_id
      LIMIT batch_size OFFSET offset_val
    ) b
    ON CONFLICT (client_id, type) WHERE deleted_at IS NULL DO NOTHING;

    offset_val := offset_val + batch_size;
    RAISE NOTICE 'Progress: %/% (batch updated: %)', LEAST(offset_val, total), total, chunk;

    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'Done.';
END;
$proc$;

-- Step 3: Run it
CALL _run_psgc_backfill();

-- Cleanup
DROP PROCEDURE _run_psgc_backfill();
DROP TABLE _psgc_backfill;
