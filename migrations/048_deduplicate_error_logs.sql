-- Migration 048: Deduplicate error_logs by fingerprint before adding unique constraint
-- Purpose: Remove duplicate error logs with the same fingerprint, keeping only the most recent one
-- Date: 2025-04-22

-- First, let's see the duplicates
SELECT
    fingerprint,
    COUNT(*) as count,
    MAX(created_at) as latest_created_at
FROM error_logs
WHERE fingerprint IS NOT NULL
GROUP BY fingerprint
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;

-- Delete duplicates, keeping only the most recent one for each fingerprint
WITH ranked_duplicates AS (
    SELECT
        id,
        fingerprint,
        ROW_NUMBER() OVER (
            PARTITION BY fingerprint
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM error_logs
    WHERE fingerprint IS NOT NULL
)
DELETE FROM error_logs
WHERE id IN (
    SELECT id FROM ranked_duplicates WHERE rn > 1
);

-- Now add the unique constraint
ALTER TABLE error_logs
ADD CONSTRAINT error_logs_fingerprint_key UNIQUE (fingerprint);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Comment
COMMENT ON CONSTRAINT error_logs_fingerprint_key ON error_logs IS
'Unique constraint on fingerprint to prevent duplicate error logs with the same signature';
