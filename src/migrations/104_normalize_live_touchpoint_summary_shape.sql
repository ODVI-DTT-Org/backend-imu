-- Migration 104: Normalize live touchpoint_summary entries to legacy-compatible shape
-- Problem: live touchpoints appended to clients.touchpoint_summary were flattened
-- while imported CMS entries use nested visit/call objects. This makes the same
-- summary array contain two schemas.

BEGIN;

DROP FUNCTION IF EXISTS update_client_touchpoint_summary() CASCADE;

CREATE OR REPLACE FUNCTION update_client_touchpoint_summary()
RETURNS TRIGGER AS $$
DECLARE
  affected_client_id UUID;
  db_touchpoints     JSONB;
  existing_summary   JSONB;
  legacy_entries     JSONB;
  merged_summary     JSONB;
  tp_count           INTEGER;
BEGIN
  affected_client_id := COALESCE(NEW.client_id, OLD.client_id);
  IF affected_client_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                t.id,
      'call',              CASE WHEN t.type = 'Call' THEN jsonb_build_object(
                              'id',           ca.id,
                              'type',         COALESCE(ca.type, 'regular_call'),
                              'notes',        COALESCE(ca.notes, ''),
                              'reason',       COALESCE(ca.reason, ''),
                              'source',       ca.source,
                              'status',       COALESCE(ca.status, ''),
                              'remarks',      COALESCE(ca.remarks, ca.notes, ''),
                              'phone_number', ca.phone_number,
                              'dial_time',    ca.dial_time,
                              'duration',     ca.duration,
                              'photo_url',    ca.photo_url
                            ) ELSE NULL END,
      'date',              t.date,
      'type',              t.type,
      'visit',             CASE WHEN t.type = 'Visit' THEN jsonb_build_object(
                              'id',                 v.id,
                              'type',               COALESCE(v.type, 'regular_visit'),
                              'notes',              COALESCE(v.notes, ''),
                              'reason',             COALESCE(v.reason, ''),
                              'source',             v.source,
                              'status',             COALESCE(v.status, ''),
                              'address',            v.address,
                              'remarks',            COALESCE(v.remarks, v.notes, ''),
                              'time_in',            v.time_in,
                              'latitude',           v.latitude,
                              'time_out',           v.time_out,
                              'longitude',          v.longitude,
                              'photo_url',          v.photo_url,
                              'odometer_arrival',   v.odometer_arrival,
                              'odometer_departure', v.odometer_departure
                            ) ELSE NULL END,
      'status',            CASE lower(COALESCE(v.status, ca.status, t.status, ''))
                              WHEN 'completed' THEN 'Completed'
                              WHEN 'interested' THEN 'Interested'
                              WHEN 'undecided' THEN 'Undecided'
                              WHEN 'not interested' THEN 'Not Interested'
                              ELSE COALESCE(v.status, ca.status, t.status, '')
                            END,
      'user_id',           t.user_id,
      'is_legacy',         COALESCE(t.is_legacy, false),
      'created_at',        t.created_at,
      'updated_at',        t.updated_at,
      'rejection_reason',  COALESCE(t.rejection_reason, ''),
      'touchpoint_number', t.touchpoint_number
    ) ORDER BY t.date
  )
  INTO db_touchpoints
  FROM touchpoints t
  LEFT JOIN visits v ON v.id = t.visit_id
  LEFT JOIN calls ca ON ca.id = t.call_id
  WHERE t.client_id = affected_client_id;

  db_touchpoints := COALESCE(db_touchpoints, '[]'::jsonb);

  SELECT COALESCE(touchpoint_summary, '[]'::jsonb)
  INTO existing_summary
  FROM clients
  WHERE id = affected_client_id;

  SELECT COALESCE(jsonb_agg(entry ORDER BY (entry->>'date')), '[]'::jsonb)
  INTO legacy_entries
  FROM jsonb_array_elements(existing_summary) AS entry
  WHERE NOT EXISTS (
    SELECT 1 FROM touchpoints t
    WHERE t.client_id = affected_client_id
      AND t.id::text = entry->>'id'
  );

  SELECT jsonb_agg(entry ORDER BY (entry->>'date'))
  INTO merged_summary
  FROM (
    SELECT jsonb_array_elements(legacy_entries) AS entry
    UNION ALL
    SELECT jsonb_array_elements(db_touchpoints) AS entry
  ) combined;

  merged_summary := COALESCE(merged_summary, '[]'::jsonb);

  SELECT jsonb_array_length(merged_summary) INTO tp_count;

  UPDATE clients
  SET
    touchpoint_summary = merged_summary,
    touchpoint_number = tp_count,
    next_touchpoint = NULL,
    updated_at = NOW()
  WHERE id = affected_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_touchpoint_summary_insert
  AFTER INSERT ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_update_touchpoint_summary_update
  AFTER UPDATE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_update_touchpoint_summary_delete
  AFTER DELETE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

-- Rebuild summaries for clients that have live touchpoint rows. Legacy-only
-- JSONB entries are preserved by the same id-not-in-touchpoints merge rule.
WITH db_touchpoints AS (
  SELECT
    t.client_id,
    COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                t.id,
      'call',              CASE WHEN t.type = 'Call' THEN jsonb_build_object(
                              'id',           ca.id,
                              'type',         COALESCE(ca.type, 'regular_call'),
                              'notes',        COALESCE(ca.notes, ''),
                              'reason',       COALESCE(ca.reason, ''),
                              'source',       ca.source,
                              'status',       COALESCE(ca.status, ''),
                              'remarks',      COALESCE(ca.remarks, ca.notes, ''),
                              'phone_number', ca.phone_number,
                              'dial_time',    ca.dial_time,
                              'duration',     ca.duration,
                              'photo_url',    ca.photo_url
                            ) ELSE NULL END,
      'date',              t.date,
      'type',              t.type,
      'visit',             CASE WHEN t.type = 'Visit' THEN jsonb_build_object(
                              'id',                 v.id,
                              'type',               COALESCE(v.type, 'regular_visit'),
                              'notes',              COALESCE(v.notes, ''),
                              'reason',             COALESCE(v.reason, ''),
                              'source',             v.source,
                              'status',             COALESCE(v.status, ''),
                              'address',            v.address,
                              'remarks',            COALESCE(v.remarks, v.notes, ''),
                              'time_in',            v.time_in,
                              'latitude',           v.latitude,
                              'time_out',           v.time_out,
                              'longitude',          v.longitude,
                              'photo_url',          v.photo_url,
                              'odometer_arrival',   v.odometer_arrival,
                              'odometer_departure', v.odometer_departure
                            ) ELSE NULL END,
      'status',            CASE lower(COALESCE(v.status, ca.status, t.status, ''))
                              WHEN 'completed' THEN 'Completed'
                              WHEN 'interested' THEN 'Interested'
                              WHEN 'undecided' THEN 'Undecided'
                              WHEN 'not interested' THEN 'Not Interested'
                              ELSE COALESCE(v.status, ca.status, t.status, '')
                            END,
      'user_id',           t.user_id,
      'is_legacy',         COALESCE(t.is_legacy, false),
      'created_at',        t.created_at,
      'updated_at',        t.updated_at,
      'rejection_reason',  COALESCE(t.rejection_reason, ''),
      'touchpoint_number', t.touchpoint_number
    ) ORDER BY t.date), '[]'::jsonb) AS entries
  FROM touchpoints t
  LEFT JOIN visits v ON v.id = t.visit_id
  LEFT JOIN calls ca ON ca.id = t.call_id
  GROUP BY t.client_id
),
legacy_entries AS (
  SELECT
    c.id AS client_id,
    COALESCE(jsonb_agg(entry ORDER BY (entry->>'date')), '[]'::jsonb) AS entries
  FROM clients c
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(c.touchpoint_summary, '[]'::jsonb)) AS entry ON true
  WHERE EXISTS (SELECT 1 FROM db_touchpoints db WHERE db.client_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM touchpoints t
      WHERE t.client_id = c.id
        AND t.id::text = entry->>'id'
    )
  GROUP BY c.id
),
merged AS (
  SELECT
    db.client_id,
    COALESCE(jsonb_agg(entry ORDER BY (entry->>'date')), '[]'::jsonb) AS merged_summary
  FROM db_touchpoints db
  LEFT JOIN legacy_entries legacy ON legacy.client_id = db.client_id
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements(COALESCE(legacy.entries, '[]'::jsonb)) AS entry
    UNION ALL
    SELECT jsonb_array_elements(db.entries) AS entry
  ) combined
  GROUP BY db.client_id
)
UPDATE clients c
SET touchpoint_summary = merged.merged_summary,
    touchpoint_number = jsonb_array_length(merged.merged_summary),
    next_touchpoint = NULL,
    updated_at = NOW()
FROM merged
WHERE merged.client_id = c.id;

COMMIT;
