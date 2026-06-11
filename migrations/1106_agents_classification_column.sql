-- Migration 1106: Add classification column to agents
--
-- Categorizes loan-release agents by source/program. Values observed in prod:
--   ORGANIC CARAVAN  — in-house caravan team agents
--   ORGANIC MSS      — in-house MSS agents
--   SP AGENTS        — service-provider agents
--
-- NOT NULL with default 'ORGANIC CARAVAN' so existing agent rows backfill
-- safely and old APK / web inserts that omit the field still succeed.
-- No CHECK constraint (matches the production-side definition); validation
-- happens at the app layer via the /admin/agents form.

BEGIN;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ORGANIC CARAVAN';

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1106_agents_classification_column',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'Added agents.classification TEXT NOT NULL DEFAULT ''ORGANIC CARAVAN''. Values: ORGANIC CARAVAN, ORGANIC MSS, SP AGENTS.'
  )
);

COMMIT;
