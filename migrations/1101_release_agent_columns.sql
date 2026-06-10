-- Migration 1101: Add agent fields to releases table
-- Nullable initially so old APKs that omit these fields still work.
-- XOR constraint enforces: either (with_agent + agent_id) OR (not with_agent + no_agent_reason).
-- All three NULLs allowed for old records / old APKs that don't send the field.

BEGIN;

ALTER TABLE releases
    ADD COLUMN IF NOT EXISTS with_agent BOOLEAN,
    ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id),
    ADD COLUMN IF NOT EXISTS no_agent_reason TEXT;

-- XOR constraint (nullable: all-NULL is allowed for old APK compat)
ALTER TABLE releases
    ADD CONSTRAINT releases_agent_xor_check CHECK (
        (with_agent IS NULL)
        OR (with_agent = true  AND agent_id IS NOT NULL AND no_agent_reason IS NULL)
        OR (with_agent = false AND no_agent_reason IS NOT NULL AND agent_id IS NULL)
    );

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1101_release_agent_columns',
  'completed',
  now(),
  jsonb_build_object('note', 'Add with_agent, agent_id, no_agent_reason to releases with XOR check constraint')
);

COMMIT;
