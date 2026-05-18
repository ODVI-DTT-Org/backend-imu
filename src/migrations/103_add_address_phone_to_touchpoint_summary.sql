-- ============================================
-- Migration 103: Add address and phone_number to touchpoint_summary JSONB
-- ============================================
-- Adds two new fields to each entry in clients.touchpoint_summary:
--   address      - from visits.address (for Visit touchpoints)
--   phone_number - from calls.phone_number (for Call touchpoints)
-- These fields let agents see where to go / what number was called
-- directly in the touchpoint history without needing to expand joins.
-- ============================================

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

  -- Aggregate touchpoints that exist as rows in the touchpoints table
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                t.id,
      'touchpoint_number', t.touchpoint_number,
      'type',              t.type,
      'date',              t.date,
      'rejection_reason',  COALESCE(t.rejection_reason, ''),
      'status',            COALESCE(v.status, ca.status, t.status, ''),
      'reason',            COALESCE(v.reason, ca.reason, ''),
      'user_id',           t.user_id,
      'visit_id',          t.visit_id,
      'call_id',           t.call_id,
      'created_at',        t.created_at,
      'updated_at',        t.updated_at,
      'is_legacy',         t.is_legacy,
      'address',           v.address,
      'phone_number',      ca.phone_number
    ) ORDER BY t.date
  )
  INTO db_touchpoints
  FROM touchpoints t
  LEFT JOIN visits v  ON v.id  = t.visit_id
  LEFT JOIN calls  ca ON ca.id = t.call_id
  WHERE t.client_id = affected_client_id;

  db_touchpoints := COALESCE(db_touchpoints, '[]'::jsonb);

  -- Fetch existing summary so we can preserve legacy-only entries
  SELECT COALESCE(touchpoint_summary, '[]'::jsonb)
  INTO existing_summary
  FROM clients
  WHERE id = affected_client_id;

  -- Keep JSONB entries whose id does not appear in the touchpoints table.
  -- These are legacy/imported records that have no touchpoints-table row.
  SELECT COALESCE(jsonb_agg(entry ORDER BY (entry->>'date')), '[]'::jsonb)
  INTO legacy_entries
  FROM jsonb_array_elements(existing_summary) AS entry
  WHERE NOT EXISTS (
    SELECT 1 FROM touchpoints t
    WHERE t.client_id = affected_client_id
      AND t.id::text = entry->>'id'
  );

  -- Merge legacy entries with live touchpoints rows and sort by date
  SELECT jsonb_agg(entry ORDER BY (entry->>'date'))
  INTO merged_summary
  FROM (
    SELECT jsonb_array_elements(legacy_entries)  AS entry
    UNION ALL
    SELECT jsonb_array_elements(db_touchpoints) AS entry
  ) combined;

  merged_summary := COALESCE(merged_summary, '[]'::jsonb);

  SELECT jsonb_array_length(merged_summary) INTO tp_count;

  -- No sequence — next_touchpoint is always NULL (type is role-based, not sequence-driven)
  UPDATE clients
  SET
    touchpoint_summary = merged_summary,
    touchpoint_number  = tp_count,
    next_touchpoint    = NULL,
    updated_at         = NOW()
  WHERE id = affected_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_touchpoint_insert_update_client
  AFTER INSERT ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_touchpoint_update_update_client
  AFTER UPDATE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_touchpoint_delete_update_client
  AFTER DELETE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

-- Back-fill all existing clients so their current touchpoint_summary
-- entries get address and phone_number populated.
UPDATE clients c
SET touchpoint_summary = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN t.id IS NOT NULL THEN
          -- This entry exists in the touchpoints table → enrich with address/phone
          (entry - 'address' - 'phone_number')
          || jsonb_build_object(
               'address',      v.address,
               'phone_number', ca.phone_number
             )
        ELSE
          -- Legacy entry with no touchpoints row → leave as-is
          entry
      END
      ORDER BY (entry->>'date')
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(c.touchpoint_summary) AS entry
  LEFT JOIN touchpoints t
    ON t.client_id = c.id AND t.id::text = entry->>'id'
  LEFT JOIN visits v  ON v.id  = t.visit_id
  LEFT JOIN calls  ca ON ca.id = t.call_id
)
WHERE touchpoint_summary IS NOT NULL
  AND jsonb_array_length(touchpoint_summary) > 0;

COMMIT;
