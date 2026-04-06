-- Add unique constraint on (client_id, touchpoint_number) to touchpoints table
-- This ensures each client can only have one of each touchpoint number (1-7)
-- Required for loan release functionality which creates touchpoint #7

-- First, check for and remove any duplicate touchpoints that would violate the constraint
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- Count how many duplicates exist
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT client_id, touchpoint_number, COUNT(*) as cnt
        FROM touchpoints
        GROUP BY client_id, touchpoint_number
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate touchpoints. Keeping the most recent one for each (client_id, touchpoint_number) combination.', duplicate_count;

        -- Delete duplicates, keeping the most recent one (based on created_at)
        DELETE FROM touchpoints
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM touchpoints
            GROUP BY client_id, touchpoint_number
        );
    END IF;
END $$;

-- Add the unique constraint
DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'touchpoints_client_id_touchpoint_number_key'
          AND conrel = 'touchpoints'::regclass
    ) THEN
        ALTER TABLE touchpoints
        ADD CONSTRAINT touchpoints_client_id_touchpoint_number_key
        UNIQUE (client_id, touchpoint_number);

        RAISE NOTICE 'Unique constraint touchpoints_client_id_touchpoint_number_key added to touchpoints table.';
    ELSE
        RAISE NOTICE 'Unique constraint touchpoints_client_id_touchpoint_number_key already exists on touchpoints table.';
    END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id_touchpoint_number
ON touchpoints(client_id, touchpoint_number);
