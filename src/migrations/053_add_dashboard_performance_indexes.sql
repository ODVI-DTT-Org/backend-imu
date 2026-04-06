-- Migration: Add dashboard performance indexes
-- Date: 2026-04-06
-- Issue: Dashboard queries need optimization for < 100-200ms response times
-- Solution: Add composite indexes for target progress, team performance, and action items queries

BEGIN;

-- ============================================
-- Touchpoints performance indexes
-- ============================================

-- Index for client touchpoint history (most common query)
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_date
  ON touchpoints(client_id, date DESC);

-- Index for touchpoint type and status filtering
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_type_status
  ON touchpoints(client_id, type, status)
  WHERE date >= CURRENT_DATE - INTERVAL '90 days';

-- Index for date range queries (target progress queries)
CREATE INDEX IF NOT EXISTS idx_touchpoints_date_range
  ON touchpoints(date)
  WHERE date >= CURRENT_DATE - INTERVAL '365 days';

-- Composite index for target progress queries (includes date for sorting)
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_user_date
  ON touchpoints(client_id)
  INCLUDE (date, type)
  WHERE date >= CURRENT_DATE - INTERVAL '90 days';

-- ============================================
-- Clients performance indexes
-- ============================================

-- Index for user-client relationships (team performance queries)
CREATE INDEX IF NOT EXISTS idx_clients_user_type
  ON clients(user_id, client_type)
  WHERE user_id IS NOT NULL;

-- Index for municipality filtering (action items queries)
CREATE INDEX IF NOT EXISTS idx_clients_municipality
  ON clients(municipality)
  WHERE loan_released = false;

-- Index for loan released status (completed clients filtering)
CREATE INDEX IF NOT EXISTS idx_clients_loan_released
  ON clients(loan_released)
  WHERE loan_released = false;

-- ============================================
-- Itineraries performance indexes
-- ============================================

-- Index for user itinerary status queries (action items)
CREATE INDEX IF NOT EXISTS idx_itineraries_user_status_date
  ON itineraries(user_id, status, scheduled_date)
  WHERE scheduled_date >= CURRENT_DATE - INTERVAL '30 days';

-- Index for client itinerary status (action items)
CREATE INDEX IF NOT EXISTS idx_itineraries_client_status
  ON itineraries(client_id, status)
  WHERE status NOT IN ('completed', 'cancelled');

-- ============================================
-- Users performance indexes (for team performance queries)
-- ============================================

-- Index for role-based filtering (team performance)
CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users(role, status)
  WHERE role IN ('caravan', 'tele');

-- Index for area manager relationships (hierarchical filtering)
CREATE INDEX IF NOT EXISTS idx_users_area_manager
  ON users(area_manager_id)
  WHERE area_manager_id IS NOT NULL;

-- Index for assistant area manager relationships
CREATE INDEX IF NOT EXISTS idx_users_assistant_area_manager
  ON users(assistant_area_manager_id)
  WHERE assistant_area_manager_id IS NOT NULL;

-- ============================================
-- Analyze tables to update statistics
-- ============================================

-- Update statistics for query optimizer
ANALYZE touchpoints;
ANALYZE clients;
ANALYZE itineraries;
ANALYZE users;
ANALYZE targets;

COMMIT;

-- Verification queries
-- SELECT indexname FROM pg_indexes WHERE tablename = 'touchpoints' AND indexname LIKE 'idx_touchpoints_%';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'clients' AND indexname LIKE 'idx_clients_%';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'itineraries' AND indexname LIKE 'idx_itineraries_%';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname LIKE 'idx_users_%';
