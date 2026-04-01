-- Migration: Add time_in, time_out, status columns to touchpoints table
-- Migration 031

BEGIN;

-- Add status column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'status'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN status VARCHAR(20) DEFAULT 'Interested';
    END IF;
END $$;

-- Add time_in column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_in'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_in TIMESTAMPTZ;
    END IF;
END $$;

-- Add time_out column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_out'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_out TIMESTAMPTZ;
    END IF;
END $$;

-- Add time_in_gps_lat column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_in_gps_lat'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_in_gps_lat REAL;
    END IF;
END $$;

-- Add time_in_gps_lng column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_in_gps_lng'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_in_gps_lng REAL;
    END IF;
END $$;

-- Add time_in_gps_address column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_in_gps_address'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_in_gps_address TEXT;
    END IF;
END $$;

-- Add time_out_gps_lat column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_out_gps_lat'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_out_gps_lat REAL;
    END IF;
END $$;

-- Add time_out_gps_lng column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_out_gps_lng'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_out_gps_lng REAL;
    END IF;
END $$;

-- Add time_out_gps_address column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'touchpoints' AND column_name = 'time_out_gps_address'
    ) THEN
        ALTER TABLE touchpoints ADD COLUMN time_out_gps_address TEXT;
    END IF;
END $$;

-- Create indexes for time_in and time_out
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_in ON touchpoints(time_in);
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_out ON touchpoints(time_out);

COMMIT;

SELECT 'Migration 031: Added time_in, time_out, status, and GPS columns to touchpoints table successfully!' as result;
