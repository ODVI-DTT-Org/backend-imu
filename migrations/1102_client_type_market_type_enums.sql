-- Migration 1102: Replace client_type and market_type TEXT columns with strict PG enums
-- Old values remap:
--   market_type: 'VIRGIN'->'VIRGIN', 'FULLY PAID'->'FULLY-PAID', 'EXISTING'->'EXISTING', unknown/NULL -> 'VIRGIN'
--   client_type: 'POTENTIAL'->'POTENTIAL', 'EXISTING'->'GENERAL', unknown/NULL -> 'POTENTIAL'
-- Existing rows with NULL or unmapped values are defaulted (VIRGIN / POTENTIAL) rather than left NULL.
-- Columns remain nullable in schema so old APK inserts that omit these fields still work.
--
-- NOTE: drops + recreates callable_clients_mv (depends on both columns).
-- Definition mirrors COMPLETE_SCHEMA.sql lines 1152-1190.

BEGIN;

-- Create new enum types
CREATE TYPE client_type_enum AS ENUM (
    'POTENTIAL',
    'FAVORABLE',
    'UNFAVORABLE',
    'PROCESSING',
    'GENERAL'
);

CREATE TYPE market_type_enum AS ENUM (
    'VIRGIN',
    'TOUCHED',
    'FULLY-PAID',
    'EXISTING'
);

-- Drop the old TEXT CHECK constraints (they block the TYPE change)
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_market_type_check;

-- Drop dependent matview so ALTER COLUMN TYPE can proceed
DROP MATERIALIZED VIEW IF EXISTS callable_clients_mv;

-- Migrate market_type: map old text values to new enum, unknown -> NULL
ALTER TABLE clients
    ALTER COLUMN market_type TYPE market_type_enum
    USING (
        CASE market_type
            WHEN 'VIRGIN'     THEN 'VIRGIN'::market_type_enum
            WHEN 'TOUCHED'    THEN 'TOUCHED'::market_type_enum
            WHEN 'FULLY PAID' THEN 'FULLY-PAID'::market_type_enum
            WHEN 'FULLY-PAID' THEN 'FULLY-PAID'::market_type_enum
            WHEN 'EXISTING'   THEN 'EXISTING'::market_type_enum
            ELSE 'VIRGIN'::market_type_enum
        END
    );

ALTER TABLE clients ALTER COLUMN market_type SET DEFAULT 'VIRGIN'::market_type_enum;

-- Migrate client_type: map old text values to new enum, unknown -> 'POTENTIAL'
ALTER TABLE clients
    ALTER COLUMN client_type DROP DEFAULT;

ALTER TABLE clients
    ALTER COLUMN client_type TYPE client_type_enum
    USING (
        CASE client_type
            WHEN 'POTENTIAL'    THEN 'POTENTIAL'::client_type_enum
            WHEN 'FAVORABLE'    THEN 'FAVORABLE'::client_type_enum
            WHEN 'UNFAVORABLE'  THEN 'UNFAVORABLE'::client_type_enum
            WHEN 'PROCESSING'   THEN 'PROCESSING'::client_type_enum
            WHEN 'GENERAL'      THEN 'GENERAL'::client_type_enum
            WHEN 'EXISTING'     THEN 'GENERAL'::client_type_enum
            ELSE 'POTENTIAL'::client_type_enum
        END
    );

ALTER TABLE clients ALTER COLUMN client_type SET DEFAULT 'POTENTIAL'::client_type_enum;

-- Recreate matview with same definition + indexes
CREATE MATERIALIZED VIEW callable_clients_mv AS
SELECT
    c.id, c.first_name, c.last_name, c.middle_name, c.birth_date, c.email,
    c.phone, c.agency_name, c.department, c.position, c.employment_status,
    c.payroll_date, c.tenure, c.client_type, c.product_type, c.market_type,
    c.pension_type, c.loan_type, c.pan, c.facebook_link, c.remarks,
    c.agency_id, c.psgc_id, c.region, c.province, c.municipality, c.barangay,
    c.udi, c.is_starred, c.loan_released, c.created_at, c.updated_at,
    c.created_by, c.deleted_by, c.deleted_at,
    mv.completed_count,
    mv.total_count,
    mv.next_touchpoint_type,
    mv.next_touchpoint_number,
    t.type AS last_touchpoint_type,
    t.user_id AS last_touchpoint_user_id,
    t.date AS last_touchpoint_date
FROM clients c
JOIN client_touchpoint_summary_mv mv ON mv.client_id = c.id
LEFT JOIN LATERAL (
    SELECT type, user_id, date
    FROM touchpoints
    WHERE client_id = c.id
    ORDER BY date DESC
    LIMIT 1
) t ON TRUE
WHERE c.deleted_at IS NULL
  AND (
    (mv.completed_count < 7 AND NOT c.loan_released) OR
    (mv.completed_count = 0 AND NOT c.loan_released)
  );

CREATE UNIQUE INDEX idx_callable_mv_id ON callable_clients_mv (id);
CREATE INDEX idx_callable_mv_next_type
    ON callable_clients_mv (next_touchpoint_type, created_at DESC) WHERE next_touchpoint_type IS NOT NULL;
CREATE INDEX idx_callable_mv_area
    ON callable_clients_mv (province, municipality, created_at DESC);
CREATE INDEX idx_callable_mv_area_type
    ON callable_clients_mv (next_touchpoint_type, province, municipality, created_at DESC)
    WHERE next_touchpoint_type IS NOT NULL;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1102_client_type_market_type_enums',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'Replaced client_type and market_type TEXT columns with PG ENUM types. Dropped+recreated callable_clients_mv. Old EXISTING->GENERAL, FULLY PAID->FULLY-PAID. NULL/unknown client_type->POTENTIAL, NULL/unknown market_type->VIRGIN. Added market_type default VIRGIN.'
  )
);

COMMIT;
