-- 110_itinerary_tombstones.sql
--
-- Tombstone table for deleted itineraries. PowerSync mobile clients
-- can re-upload locally cached itineraries via the sync-operations
-- processor after a web admin deletes them; this table lets the
-- processor recognise resurrected ids and skip the re-insert.
--
-- See backend src/queues/processors/sync-operations-processor.ts and
-- src/routes/itineraries.ts (delete + bulk-delete handlers).

CREATE TABLE IF NOT EXISTS deleted_itineraries (
    id UUID PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by UUID
);

CREATE INDEX IF NOT EXISTS idx_deleted_itineraries_deleted_at
    ON deleted_itineraries(deleted_at);
