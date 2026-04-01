-- Migration: Add Time In/Out columns to touchpoints table
-- Description: Adds GPS-tracked time_in and time_out fields for visit tracking
-- Date: 2025-01-23

-- ============================================
-- 1. TIME IN COLUMNS
-- ============================================

-- Timestamp when the agent arrived at the client location
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in TIMESTAMP;

-- GPS coordinates at time of arrival
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_lng DOUBLE PRECISION;

-- Address resolved from GPS coordinates at time of arrival
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_address TEXT;

-- ============================================
-- 2. TIME OUT COLUMNS
-- ============================================

-- Timestamp when the agent left the client location
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out TIMESTAMP;

-- GPS coordinates at time of departure
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_lng DOUBLE PRECISION;

-- Address resolved from GPS coordinates at time of departure
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_address TEXT;

-- ============================================
-- 3. INDEXES FOR QUERY PERFORMANCE
-- ============================================

-- Index for queries filtering by time_in (e.g., finding active visits)
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_in ON touchpoints(time_in);

-- Index for queries filtering by time_out (e.g., finding completed visits)
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_out ON touchpoints(time_out);

-- ============================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN touchpoints.time_in IS 'Timestamp when the field agent arrived at the client location';
COMMENT ON COLUMN touchpoints.time_in_gps_lat IS 'Latitude coordinate captured at time of arrival';
COMMENT ON COLUMN touchpoints.time_in_gps_lng IS 'Longitude coordinate captured at time of arrival';
COMMENT ON COLUMN touchpoints.time_in_gps_address IS 'Human-readable address resolved from GPS at arrival';

COMMENT ON COLUMN touchpoints.time_out IS 'Timestamp when the field agent left the client location';
COMMENT ON COLUMN touchpoints.time_out_gps_lat IS 'Latitude coordinate captured at time of departure';
COMMENT ON COLUMN touchpoints.time_out_gps_lng IS 'Longitude coordinate captured at time of departure';
COMMENT ON COLUMN touchpoints.time_out_gps_address IS 'Human-readable address resolved from GPS at departure';

SELECT 'Time In/Out columns migration applied successfully!' as result;
