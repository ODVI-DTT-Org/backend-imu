-- Migration 1100: Create agents table
-- Agents are loan release agents managed by admins.
-- No FK to users; seeded list, admin-managed via web.

BEGIN;

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only one active agent per name
CREATE UNIQUE INDEX IF NOT EXISTS agents_active_name_uniq
    ON agents(name)
    WHERE is_active = true;

-- updated_at auto-update trigger
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1100_create_agents',
  'completed',
  now(),
  jsonb_build_object('note', 'Create agents table with partial unique index on active names')
);

COMMIT;
