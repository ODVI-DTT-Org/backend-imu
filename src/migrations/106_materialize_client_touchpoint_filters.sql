-- Migration 106: Materialize client touchpoint filter fields
-- Purpose:
--   GET /api/clients filters such as visit_status, touchpoint_reason_codes,
--   and touchpoint date ranges were expanding clients.touchpoint_summary JSONB
--   or probing touchpoints per client. These columns keep indexed filter
--   values on clients so list queries stay set-based.

BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS touchpoint_dates date[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS touchpoint_interest_statuses text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS touchpoint_reason_values text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_touchpoint_date date,
  ADD COLUMN IF NOT EXISTS last_touchpoint_user_id uuid,
  ADD COLUMN IF NOT EXISTS last_touchpoint_type text;

CREATE OR REPLACE FUNCTION update_clients_touchpoint_filter_fields()
RETURNS TRIGGER AS $$
DECLARE
  summary jsonb;
  last_entry jsonb;
BEGIN
  summary := COALESCE(NEW.touchpoint_summary, '[]'::jsonb);

  SELECT COALESCE(array_agg(DISTINCT NULLIF(entry->>'date', '')::date), ARRAY[]::date[])
  INTO NEW.touchpoint_dates
  FROM jsonb_array_elements(summary) AS entry
  WHERE NULLIF(entry->>'date', '') IS NOT NULL;

  SELECT MIN(d), MAX(d)
  INTO NEW.first_touchpoint_date, NEW.last_touchpoint_date
  FROM unnest(COALESCE(NEW.touchpoint_dates, ARRAY[]::date[])) AS d;

  SELECT COALESCE(array_agg(DISTINCT normalized_value), ARRAY[]::text[])
  INTO NEW.touchpoint_interest_statuses
  FROM (
    SELECT NULLIF(lower(replace(raw.value, '_', ' ')), '') AS normalized_value
    FROM jsonb_array_elements(summary) AS entry
    CROSS JOIN LATERAL (
      VALUES
        (entry->'visit'->>'reason'),
        (entry->'call'->>'reason'),
        (entry->>'reason'),
        (entry->'visit'->>'status'),
        (entry->'call'->>'status'),
        (entry->>'status')
    ) AS raw(value)
  ) values_to_normalize
  WHERE normalized_value IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT normalized_value), ARRAY[]::text[])
  INTO NEW.touchpoint_reason_values
  FROM (
    SELECT NULLIF(lower(replace(raw.value, '_', ' ')), '') AS normalized_value
    FROM jsonb_array_elements(summary) AS entry
    CROSS JOIN LATERAL (
      VALUES
        (entry->'visit'->>'reason'),
        (entry->'call'->>'reason'),
        (entry->>'reason')
    ) AS raw(value)
  ) values_to_normalize
  WHERE normalized_value IS NOT NULL;

  SELECT entry
  INTO last_entry
  FROM jsonb_array_elements(summary) AS entry
  ORDER BY NULLIF(entry->>'date', '')::timestamptz DESC NULLS LAST,
           NULLIF(entry->>'created_at', '')::timestamptz DESC NULLS LAST
  LIMIT 1;

  NEW.last_touchpoint_user_id := NULLIF(last_entry->>'user_id', '')::uuid;
  NEW.last_touchpoint_type := NULLIF(last_entry->>'type', '');
  NEW.touchpoint_number := COALESCE(jsonb_array_length(summary), 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clients_touchpoint_filter_fields ON clients;
CREATE TRIGGER trigger_clients_touchpoint_filter_fields
  BEFORE INSERT OR UPDATE OF touchpoint_summary ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_touchpoint_filter_fields();

UPDATE clients
SET touchpoint_summary = COALESCE(touchpoint_summary, '[]'::jsonb);

COMMIT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_touchpoint_dates_gin
  ON clients USING GIN (touchpoint_dates);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_touchpoint_interest_statuses_gin
  ON clients USING GIN (touchpoint_interest_statuses);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_touchpoint_reason_values_gin
  ON clients USING GIN (touchpoint_reason_values);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_first_touchpoint_date
  ON clients (first_touchpoint_date)
  WHERE first_touchpoint_date IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_last_touchpoint_user_id
  ON clients (last_touchpoint_user_id)
  WHERE last_touchpoint_user_id IS NOT NULL AND deleted_at IS NULL;
