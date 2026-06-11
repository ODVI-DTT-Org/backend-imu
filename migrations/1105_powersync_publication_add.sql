-- Migration 1105: Add agents and client_status_history to PowerSync publication
-- These tables need to sync to mobile devices.
-- Depends on: 1100_create_agents, 1103_client_status_history

BEGIN;

-- Idempotent: handles both fresh DBs (no publication yet) and existing DBs
-- where powersync already includes the base 10 tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE
      clients, itineraries, touchpoints, addresses, phone_numbers,
      user_profiles, user_locations, approvals, psgc, touchpoint_reasons,
      agents, client_status_history;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='powersync' AND tablename='agents') THEN
      ALTER PUBLICATION powersync ADD TABLE agents;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='powersync' AND tablename='client_status_history') THEN
      ALTER PUBLICATION powersync ADD TABLE client_status_history;
    END IF;
  END IF;
END $$;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1105_powersync_publication_add',
  'completed',
  now(),
  jsonb_build_object('note', 'Added agents and client_status_history tables to powersync publication')
);

COMMIT;
