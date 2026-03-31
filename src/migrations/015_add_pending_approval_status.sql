-- Migration 015: Add pending_approval status to itineraries
-- This allows itineraries to be in a "pending_approval" state when waiting for admin approval
-- after touchpoint submission or loan release requests.

-- Drop the old CHECK constraint and add a new one with pending_approval
ALTER TABLE itineraries DROP CONSTRAINT IF EXISTS itineraries_status_check;

-- Add the new CHECK constraint with pending_approval status
ALTER TABLE itineraries ADD CONSTRAINT itineraries_status_check
  CHECK (status IN ('pending', 'assigned', 'in_progress', 'pending_approval', 'completed', 'cancelled'));

-- Verify the constraint was added
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'itineraries'::regclass
  AND conname = 'itineraries_status_check';
