-- Migration 109: Add admin duplicate-review decision to clients
-- Purpose: Complements duplicate_metadata (migration 108, the detection result)
-- with the human review outcome and the merge target, so an admin can confirm a
-- flagged client as unique or as a duplicate (merged into a canonical client).

BEGIN;

-- Nullable, no default, no FK => metadata-only change, instant even on a large table.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS duplicate_review_status TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_into UUID;

-- Allowed states: NULL = not yet reviewed; 'unique' = admin confirmed distinct;
-- 'duplicate' = admin confirmed a duplicate (record merged into merged_into).
-- ('pending' is permitted for an explicit review-queue state if ever needed.)
-- NULL passes the CHECK, so unreviewed rows are valid.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_duplicate_review_status_chk;
ALTER TABLE clients
  ADD CONSTRAINT clients_duplicate_review_status_chk
  CHECK (duplicate_review_status IN ('pending', 'unique', 'duplicate'));

COMMENT ON COLUMN clients.duplicate_review_status IS
  'Admin review of a possible duplicate: NULL = unreviewed, unique = confirmed distinct, duplicate = confirmed duplicate (merged)';
COMMENT ON COLUMN clients.duplicate_reviewed_by IS 'users.id of the admin who reviewed';
COMMENT ON COLUMN clients.duplicate_reviewed_at IS 'When the duplicate review decision was made';
COMMENT ON COLUMN clients.merged_into IS
  'When duplicate_review_status = duplicate: clients.id of the canonical client this record was merged into';

-- Partial index to drive the admin review list/filters quickly. Covers only the
-- small set of flagged, non-deleted clients, keyed by review status so
-- "needs review" (status IS NULL), "confirmed duplicate", and "marked unique"
-- filters are all index-served.
CREATE INDEX IF NOT EXISTS idx_clients_duplicate_review
  ON clients (duplicate_review_status)
  WHERE deleted_at IS NULL
    AND (duplicate_metadata->>'is_possible_duplicate') = 'true';

COMMIT;
