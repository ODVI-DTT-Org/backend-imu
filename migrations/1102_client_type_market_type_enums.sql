-- Migration 1102: Replace client_type and market_type TEXT columns with strict PG enums
-- Old values remap:
--   market_type: 'VIRGIN'->'VIRGIN', 'FULLY PAID'->'FULLY-PAID', 'EXISTING'->'EXISTING', else NULL
--   client_type: 'POTENTIAL'->'POTENTIAL', 'EXISTING'->'GENERAL', else NULL
-- Both columns remain nullable so old APK inserts that omit these fields still work.

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
            ELSE NULL
        END
    );

-- Migrate client_type: map old text values to new enum, unknown -> NULL
ALTER TABLE clients
    ALTER COLUMN client_type TYPE client_type_enum
    USING (
        CASE client_type
            WHEN 'POTENTIAL'    THEN 'POTENTIAL'::client_type_enum
            WHEN 'FAVORABLE'    THEN 'FAVORABLE'::client_type_enum
            WHEN 'UNFAVORABLE'  THEN 'UNFAVORABLE'::client_type_enum
            WHEN 'PROCESSING'   THEN 'PROCESSING'::client_type_enum
            WHEN 'GENERAL'      THEN 'GENERAL'::client_type_enum
            WHEN 'EXISTING'     THEN 'GENERAL'::client_type_enum  -- old value -> GENERAL
            ELSE NULL
        END
    );

-- Drop DEFAULT 'POTENTIAL' string default and re-add as enum
ALTER TABLE clients ALTER COLUMN client_type DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN client_type SET DEFAULT 'POTENTIAL'::client_type_enum;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1102_client_type_market_type_enums',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'Replaced client_type and market_type TEXT columns with PG ENUM types. Old EXISTING->GENERAL, FULLY PAID->FULLY-PAID'
  )
);

COMMIT;
