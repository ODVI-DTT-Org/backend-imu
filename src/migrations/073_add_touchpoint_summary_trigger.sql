-- ============================================
-- Migration 073: Add Trigger to Update Client Touchpoint Summary
-- ============================================
-- Purpose: Automatically update clients.touchpoint_summary, touchpoint_number, and next_touchpoint
--          when touchpoints are created, updated, or deleted
--
-- This ensures that the denormalized columns on the clients table stay in sync
-- with the actual touchpoints data, preventing all clients from showing the same touchpoint history
-- ============================================

BEGIN;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_touchpoint_insert_update_client ON touchpoints;
DROP TRIGGER IF EXISTS trigger_touchpoint_update_update_client ON touchpoints;
DROP TRIGGER IF EXISTS trigger_touchpoint_delete_update_client ON touchpoints;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS update_client_touchpoint_summary();

-- Create function to update client touchpoint summary
CREATE OR REPLACE FUNCTION update_client_touchpoint_summary()
RETURNS TRIGGER AS $$
DECLARE
  client_touchpoints JSONB;
  tp_count INTEGER;
  next_tp_num INTEGER;
  next_tp_type VARCHAR(10);
BEGIN
  -- Only proceed if client_id exists
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get all touchpoints for this client, ordered by touchpoint_number
  -- Using actual database schema: id, client_id, user_id, touchpoint_number, type, date, status, next_visit_date, notes, rejection_reason, visit_id, call_id, created_at, updated_at, is_legacy
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'touchpoint_number', t.touchpoint_number,
      'type', t.type,
      'date', t.date,
      'rejection_reason', COALESCE(t.rejection_reason, ''),
      'status', COALESCE(t.status, ''),
      'user_id', t.user_id,
      'visit_id', t.visit_id,
      'call_id', t.call_id,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'is_legacy', t.is_legacy
    ) ORDER BY t.touchpoint_number
  )
  INTO client_touchpoints
  FROM touchpoints t
  WHERE t.client_id = NEW.client_id;

  -- Count touchpoints
  SELECT COALESCE(jsonb_array_length(client_touchpoints), 0)
  INTO tp_count;

  -- Determine next touchpoint number and type
  IF tp_count >= 7 THEN
    next_tp_num := 7;
    next_tp_type := NULL; -- Complete
  ELSE
    next_tp_num := tp_count + 1;

    -- Touchpoint sequence: Visit → Call → Call → Visit → Call → Call → Visit
    CASE next_tp_num
      WHEN 1 THEN next_tp_type := 'Visit';
      WHEN 2 THEN next_tp_type := 'Call';
      WHEN 3 THEN next_tp_type := 'Call';
      WHEN 4 THEN next_tp_type := 'Visit';
      WHEN 5 THEN next_tp_type := 'Call';
      WHEN 6 THEN next_tp_type := 'Call';
      WHEN 7 THEN next_tp_type := 'Visit';
      ELSE next_tp_type := 'Visit';
    END CASE;
  END IF;

  -- Update clients table with new summary
  UPDATE clients
  SET
    touchpoint_summary = COALESCE(client_touchpoints, '[]'::jsonb),
    touchpoint_number = tp_count,
    next_touchpoint = next_tp_type,
    updated_at = NOW()
  WHERE id = NEW.client_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for touchpoint INSERT
DROP TRIGGER IF EXISTS trigger_touchpoint_insert_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_insert_update_client
  AFTER INSERT ON touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_client_touchpoint_summary();

-- Create trigger for touchpoint UPDATE
DROP TRIGGER IF EXISTS trigger_touchpoint_update_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_update_update_client
  AFTER UPDATE ON touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_client_touchpoint_summary();

-- Create trigger for touchpoint DELETE
DROP TRIGGER IF EXISTS trigger_touchpoint_delete_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_delete_update_client
  AFTER DELETE ON touchpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_client_touchpoint_summary();

-- Add comment for documentation
COMMENT ON FUNCTION update_client_touchpoint_summary() IS 'Automatically update clients.touchpoint_summary, touchpoint_number, and next_touchpoint when touchpoints are created, updated, or deleted';

COMMIT;
