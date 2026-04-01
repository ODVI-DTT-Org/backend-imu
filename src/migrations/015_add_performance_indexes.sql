-- Performance Indexes for IMU Backend
-- These indexes improve query performance for common mobile app operations

-- ============================================
-- 1. CLIENT QUERIES
-- ============================================

-- Index for filtering clients by caravan_id (used by PowerSync and mobile app)
CREATE INDEX IF NOT EXISTS idx_clients_caravan_id ON clients(caravan_id)
WHERE deleted_at IS NULL;

-- Index for searching clients by name (used in client search)
CREATE INDEX IF NOT EXISTS idx_clients_full_name ON clients(full_name)
WHERE deleted_at IS NULL;

-- Index for filtering clients by type and caravan
CREATE INDEX IF NOT EXISTS idx_clients_type_caravan ON clients(client_type, caravan_id)
WHERE deleted_at IS NULL;

-- ============================================
-- 2. TOUCHPOINT QUERIES
-- ============================================

-- Index for touchpoints by caravan and date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_touchpoints_caravan_date ON touchpoints(caravan_id, date)
WHERE deleted_at IS NULL;

-- Index for touchpoints by client
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id)
WHERE deleted_at IS NULL;

-- Index for touchpoints by number and type (for filtering by touchpoint sequence)
CREATE INDEX IF NOT EXISTS idx_touchpoints_number_type ON touchpoints(touchpoint_number, type)
WHERE deleted_at IS NULL;

-- ============================================
-- 3. ITINERARY QUERIES
-- ============================================

-- Index for itineraries by caravan and scheduled date
CREATE INDEX IF NOT EXISTS idx_itineraries_caravan_date ON itineraries(caravan_id, scheduled_date)
WHERE deleted_at IS NULL;

-- Index for itineraries by status and date (for pending/completed filters)
CREATE INDEX IF NOT EXISTS idx_itineraries_status_date ON itineraries(status, scheduled_date)
WHERE deleted_at IS NULL;

-- Index for itineraries by created by (for user's own itineraries)
CREATE INDEX IF NOT EXISTS idx_itineraries_created_by ON itineraries(created_by)
WHERE deleted_at IS NULL;

-- ============================================
-- 4. ATTENDANCE QUERIES
-- ============================================

-- Index for attendance by user and date (for check-in/out status)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);

-- Index for attendance by date range (for history queries)
CREATE INDEX IF NOT EXISTS idx_attendance_date_range ON attendance(date);

-- ============================================
-- 5. ADDRESS & PHONE QUERIES
-- ============================================

-- Index for addresses by client_id
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);

-- Index for phone numbers by client_id
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);

-- ============================================
-- 6. USER MUNICIPALITIES
-- ============================================

-- Index for user_municipalities with soft delete filtering
CREATE INDEX IF NOT EXISTS idx_user_municipalities_deleted ON user_municipalities_simple(deleted_at)
WHERE deleted_at IS NULL;

-- Index for user_municipalities by user_id
CREATE INDEX IF NOT EXISTS idx_user_municipalities_user_id ON user_municipalities_simple(user_id)
WHERE deleted_at IS NULL;

-- ============================================
-- 7. MY DAY QUERIES
-- ============================================

-- Index for my_day_tasks by user and date
CREATE INDEX IF NOT EXISTS idx_my_day_tasks_user_date ON my_day_tasks(user_id, date);

-- Index for my_day_tasks by status
CREATE INDEX IF NOT EXISTS idx_my_day_tasks_status ON my_day_tasks(status);

-- ============================================
-- 8. APPROVAL QUERIES
-- ============================================

-- Index for approvals by status and created_at (for pending approvals list)
CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status, created_at);

-- Index for approvals by requested_by
CREATE INDEX IF NOT EXISTS idx_approvals_requested_by ON approvals(requested_by);

-- ============================================
-- 9. PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================

-- Index for active clients only (faster than full table scan)
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(id, full_name, caravan_id)
WHERE deleted_at IS NULL;

-- Index for pending itineraries only
CREATE INDEX IF NOT EXISTS idx_itineraries_pending ON itineraries(id, client_id, scheduled_date)
WHERE deleted_at IS NULL AND status = 'pending';

-- Index for completed touchpoints only
CREATE INDEX IF NOT EXISTS idx_touchpoints_completed ON touchpoints(id, client_id, date)
WHERE deleted_at IS NULL;

SELECT 'Performance indexes created successfully!' as result;
