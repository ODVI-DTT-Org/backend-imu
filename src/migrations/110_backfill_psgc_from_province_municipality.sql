-- Migration 110: Backfill psgc_id and addresses using a JOIN (fast).
-- Previous version used a correlated subquery per row — too slow on 84k clients.
-- JOIN lets Postgres use hash/merge join; DISTINCT ON picks MIN psgc.id per client.
-- Commits every 1,000 rows via a procedure to keep row locks brief.

-- Step 1: Build match table via JOIN (seconds, not minutes)
CREATE TEMP TABLE _psgc_backfill AS
SELECT DISTINCT ON (c.id)
  c.id           AS client_id,
  c.full_address,
  c.municipality,
  c.province,
  p.id           AS psgc_id
FROM clients c
JOIN psgc p ON (
  LOWER(TRIM(p.province)) = LOWER(TRIM(c.province))
  AND (
    LOWER(TRIM(p.mun_city)) = LOWER(TRIM(c.municipality))
    OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(TRIM(REGEXP_REPLACE(c.municipality, ' CITY$', '', 'i')))
    OR LOWER(TRIM(p.mun_city)) = 'city of ' || LOWER(TRIM(c.municipality))
    OR LOWER(TRIM(p.mun_city)) = LOWER(TRIM(c.municipality)) || ' city'
  )
)
WHERE c.deleted_at IS NULL
  AND c.psgc_id IS NULL
  AND COALESCE(NULLIF(c.full_address, ''), NULL) IS NOT NULL
ORDER BY c.id, p.id;  -- DISTINCT ON picks lowest p.id per client

DO $$ BEGIN RAISE NOTICE 'Matchable clients: %', (SELECT COUNT(*) FROM _psgc_backfill); END $$;

-- Step 2: Apply in batches of 1,000 with a COMMIT between each
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

    INSERT INTO addresses (client_id, type, street_address, city, province, psgc_id, is_primary)
    SELECT b.client_id, 'home', b.full_address, b.municipality, b.province, b.psgc_id, true
    FROM (
      SELECT client_id, full_address, municipality, province, psgc_id
      FROM _psgc_backfill
      ORDER BY client_id
      LIMIT batch_size OFFSET offset_val
    ) b
    ON CONFLICT (client_id, type) WHERE deleted_at IS NULL DO NOTHING;

    GET DIAGNOSTICS chunk = ROW_COUNT;
    offset_val := offset_val + batch_size;
    RAISE NOTICE 'Progress: %/% ', LEAST(offset_val, total), total;

    COMMIT;
    PERFORM pg_sleep(0.05);
  END LOOP;

  RAISE NOTICE 'Done.';
END;
$proc$;

CALL _run_psgc_backfill();

DROP PROCEDURE _run_psgc_backfill();
DROP TABLE _psgc_backfill;
