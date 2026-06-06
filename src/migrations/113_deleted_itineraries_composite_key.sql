-- Migration 113: Add composite key columns to deleted_itineraries
--
-- The original tombstone table only stores the UUID that was deleted.
-- If mobile re-uploads the same logical itinerary (same user+client+date)
-- with a FRESH UUID (because the server previously ignored the mobile UUID
-- and generated its own), the UUID-only gate cannot block it.
--
-- This migration adds (user_id, client_id, scheduled_date) so the PUT gate
-- can block resurrection by logical identity, not just by UUID.
--
-- deleted_at is already in the table; deleted_by is already present.

ALTER TABLE deleted_itineraries
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Index for the composite lookup done in the sync PUT gate.
CREATE INDEX IF NOT EXISTS idx_deleted_itineraries_composite
  ON deleted_itineraries (user_id, client_id, scheduled_date)
  WHERE user_id IS NOT NULL AND client_id IS NOT NULL AND scheduled_date IS NOT NULL;

-- Backfill the one existing tombstone row from the itineraries table if the
-- row still exists (it won't — it was deleted — so this is a no-op in prod,
-- but safe to run).
UPDATE deleted_itineraries di
SET user_id    = i.user_id,
    client_id  = i.client_id,
    scheduled_date = i.scheduled_date::date
FROM itineraries i
WHERE i.id = di.id
  AND di.user_id IS NULL;
