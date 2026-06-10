-- Migration 1105: Add agents and client_status_history to PowerSync publication
-- These tables need to sync to mobile devices.
-- Depends on: 1100_create_agents, 1103_client_status_history

BEGIN;

ALTER PUBLICATION powersync ADD TABLE agents, client_status_history;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1105_powersync_publication_add',
  'completed',
  now(),
  jsonb_build_object('note', 'Added agents and client_status_history tables to powersync publication')
);

COMMIT;
