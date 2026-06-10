-- Migration 1104: DB trigger backstop for client lifecycle transitions
--
-- This trigger fires AFTER INSERT on touchpoints and releases.
-- It is declared DEFERRABLE INITIALLY DEFERRED so it fires at COMMIT time,
-- not immediately after the INSERT. This allows the backend handler (which also
-- writes history rows) to run first. The NOT EXISTS guard then prevents the
-- trigger from creating duplicate history rows.
--
-- Lifecycle rules (from handoff doc):
--   market_type on touch:   VIRGIN->TOUCHED, TOUCHED->TOUCHED, else unchanged
--   market_type on release: VIRGIN->FULLY-PAID, TOUCHED->FULLY-PAID, FULLY-PAID->EXISTING, EXISTING->EXISTING
--   client_type on touch:   derived from touchpoint_reasons.category via visits.reason / calls.reason
--     Favorable / LEVEL 1 FAVORABLE / LEVEL 2 FAVORABLE -> FAVORABLE
--     Unfavorable / LEVEL 1/2/3 UNFAVORABLE             -> UNFAVORABLE
--     Processing                                         -> PROCESSING
--     General                                            -> GENERAL
--     (no match or no reason)                            -> unchanged (NULL stays NULL)

BEGIN;

-- ============================================================
-- Helper: compute new client_type from a touchpoint reason category
-- ============================================================
CREATE OR REPLACE FUNCTION compute_client_type_from_category(p_category TEXT)
RETURNS client_type_enum
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_category IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN CASE
        WHEN p_category ILIKE 'Favorable'         THEN 'FAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'LEVEL 1 FAVORABLE' THEN 'FAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'LEVEL 2 FAVORABLE' THEN 'FAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'Unfavorable'        THEN 'UNFAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'LEVEL 1 UNFAVORABLE' THEN 'UNFAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'LEVEL 2 UNFAVORABLE' THEN 'UNFAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'LEVEL 3 UNFAVORABLE' THEN 'UNFAVORABLE'::client_type_enum
        WHEN p_category ILIKE 'Processing'         THEN 'PROCESSING'::client_type_enum
        WHEN p_category ILIKE 'General'            THEN 'GENERAL'::client_type_enum
        ELSE NULL
    END;
END;
$$;

-- ============================================================
-- Trigger function for touchpoints (INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION trg_touchpoint_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_client         clients%ROWTYPE;
    v_reason_code    TEXT;
    v_category       TEXT;
    v_new_client_type client_type_enum;
    v_new_market_type market_type_enum;
    v_snapshot       JSONB;
BEGIN
    -- Guard: if the backend handler already wrote a history row for this touchpoint, skip.
    -- (This guard works because the trigger is DEFERRED — it fires at COMMIT time,
    --  after any handler-written history rows are already visible in the transaction.)
    IF EXISTS (
        SELECT 1 FROM client_status_history
        WHERE trigger_touchpoint_id = NEW.id
        LIMIT 1
    ) THEN
        RETURN NEW;
    END IF;

    -- Load current client row
    SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Resolve reason_code from the associated visit or call
    IF NEW.visit_id IS NOT NULL THEN
        SELECT reason INTO v_reason_code FROM visits WHERE id = NEW.visit_id;
    ELSIF NEW.call_id IS NOT NULL THEN
        SELECT reason INTO v_reason_code FROM calls WHERE id = NEW.call_id;
    END IF;

    -- Look up category from touchpoint_reasons
    IF v_reason_code IS NOT NULL THEN
        SELECT category INTO v_category
        FROM touchpoint_reasons
        WHERE reason_code = v_reason_code
        LIMIT 1;
    END IF;

    -- Compute new client_type
    v_new_client_type := compute_client_type_from_category(v_category);

    -- Compute new market_type (touch rule)
    v_new_market_type := CASE v_client.market_type
        WHEN 'VIRGIN'::market_type_enum  THEN 'TOUCHED'::market_type_enum
        WHEN 'TOUCHED'::market_type_enum THEN 'TOUCHED'::market_type_enum
        ELSE v_client.market_type
    END;

    -- If nothing changed, bail early
    IF (v_new_client_type IS NOT DISTINCT FROM v_client.client_type)
       AND (v_new_market_type IS NOT DISTINCT FROM v_client.market_type) THEN
        RETURN NEW;
    END IF;

    -- Snapshot the client row BEFORE the update
    v_snapshot := row_to_json(v_client)::jsonb;

    -- Apply changes to clients table
    UPDATE clients
    SET
        client_type  = COALESCE(v_new_client_type, client_type),
        market_type  = v_new_market_type,
        updated_at   = NOW()
    WHERE id = v_client.id;

    -- Write history rows for each changed field
    IF v_new_client_type IS DISTINCT FROM v_client.client_type
       AND v_new_client_type IS NOT NULL THEN
        INSERT INTO client_status_history
            (client_id, field, old_value, new_value, changed_by_user_id,
             trigger_touchpoint_id, client_snapshot, changed_at)
        VALUES (
            v_client.id,
            'client_type',
            v_client.client_type::TEXT,
            v_new_client_type::TEXT,
            NEW.user_id,
            NEW.id,
            v_snapshot,
            NOW()
        );
    END IF;

    IF v_new_market_type IS DISTINCT FROM v_client.market_type THEN
        INSERT INTO client_status_history
            (client_id, field, old_value, new_value, changed_by_user_id,
             trigger_touchpoint_id, client_snapshot, changed_at)
        VALUES (
            v_client.id,
            'market_type',
            v_client.market_type::TEXT,
            v_new_market_type::TEXT,
            NEW.user_id,
            NEW.id,
            v_snapshot,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================
-- Trigger function for releases (INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION trg_release_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_client          clients%ROWTYPE;
    v_new_market_type market_type_enum;
    v_snapshot        JSONB;
BEGIN
    -- Guard: if the backend handler already wrote a history row for this release, skip.
    IF EXISTS (
        SELECT 1 FROM client_status_history
        WHERE trigger_release_id = NEW.id
        LIMIT 1
    ) THEN
        RETURN NEW;
    END IF;

    -- Load current client row
    SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Compute new market_type (release rule)
    v_new_market_type := CASE v_client.market_type
        WHEN 'VIRGIN'::market_type_enum     THEN 'FULLY-PAID'::market_type_enum  -- edge case
        WHEN 'TOUCHED'::market_type_enum    THEN 'FULLY-PAID'::market_type_enum
        WHEN 'FULLY-PAID'::market_type_enum THEN 'EXISTING'::market_type_enum
        WHEN 'EXISTING'::market_type_enum   THEN 'EXISTING'::market_type_enum
        ELSE 'FULLY-PAID'::market_type_enum  -- NULL / unknown -> FULLY-PAID on first release
    END;

    -- If market_type unchanged, bail early
    IF v_new_market_type IS NOT DISTINCT FROM v_client.market_type THEN
        RETURN NEW;
    END IF;

    -- Snapshot the client row BEFORE the update
    v_snapshot := row_to_json(v_client)::jsonb;

    -- Apply market_type change
    UPDATE clients
    SET
        market_type = v_new_market_type,
        updated_at  = NOW()
    WHERE id = v_client.id;

    -- Write history row
    INSERT INTO client_status_history
        (client_id, field, old_value, new_value, changed_by_user_id,
         trigger_release_id, client_snapshot, changed_at)
    VALUES (
        v_client.id,
        'market_type',
        v_client.market_type::TEXT,
        v_new_market_type::TEXT,
        NEW.user_id,
        NEW.id,
        v_snapshot,
        NOW()
    );

    RETURN NEW;
END;
$$;

-- ============================================================
-- Attach DEFERRABLE INITIALLY DEFERRED triggers
-- (Fire at COMMIT, not at row insert — allows handler to write history first)
-- ============================================================

DROP TRIGGER IF EXISTS trg_touchpoint_lifecycle_insert ON touchpoints;
CREATE CONSTRAINT TRIGGER trg_touchpoint_lifecycle_insert
    AFTER INSERT ON touchpoints
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_touchpoint_lifecycle();

DROP TRIGGER IF EXISTS trg_release_lifecycle_insert ON releases;
CREATE CONSTRAINT TRIGGER trg_release_lifecycle_insert
    AFTER INSERT ON releases
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_release_lifecycle();

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1104_status_transition_trigger',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'DB trigger backstop for client lifecycle transitions. DEFERRABLE INITIALLY DEFERRED so handler-written history rows prevent duplicate trigger writes.'
  )
);

COMMIT;
