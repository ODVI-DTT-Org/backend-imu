-- Migration: Add dashboard performance indexes
-- Date: 2026-04-06
-- Issue: Dashboard queries need optimization for < 100-200ms response times
-- Solution: Add composite indexes for target progress, team performance, and action items queries

-- ============================================
-- Touchpoints performance indexes
-- ============================================

-- Index for client touchpoint history (most common query)
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_date
  ON touchpoints(client_id, date DESC);

-- Index for touchpoint type and status filtering
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_type_status
  ON touchpoints(client_id, type, status);

-- Index for date range queries (target progress queries)
CREATE INDEX IF NOT EXISTS idx_touchpoints_date
  ON touchpoints(date DESC);

-- Composite index for target progress queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_user_date
  ON touchpoints(client_id, date DESC, type);

-- ============================================
-- Clients performance indexes
-- ============================================

-- Index for user-client relationships (team performance queries)
CREATE INDEX IF NOT EXISTS idx_clients_user_type
  ON clients(user_id, client_type);

-- Index for municipality filtering (action items queries)
CREATE INDEX IF NOT EXISTS idx_clients_municipality_loan
  ON clients(municipality, loan_released);

-- Index for loan released status (completed clients filtering)
CREATE INDEX IF NOT EXISTS idx_clients_loan_released
  ON clients(loan_released);

-- ============================================
-- Itineraries performance indexes
-- ============================================

-- Index for user itinerary status queries (action items)
CREATE INDEX IF NOT EXISTS idx_itineraries_user_status_date
  ON itineraries(user_id, status, scheduled_date);

-- Index for client itinerary status (action items)
CREATE INDEX IF NOT EXISTS idx_itineraries_client_status
  ON itineraries(client_id, status);

-- ============================================
-- Users performance indexes (for team performance queries)
-- ============================================

-- Index for role-based filtering (team performance)
CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);

-- ============================================
-- Analyze tables to update statistics
-- ============================================

-- Update statistics for query optimizer
ANALYZE touchpoints;
ANALYZE clients;
ANALYZE itineraries;
ANALYZE users;
ANALYZE targets;
