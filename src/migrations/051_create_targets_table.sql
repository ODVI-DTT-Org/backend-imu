-- Migration: Create targets table for dashboard tracking
-- Date: 2026-04-06
-- Issue: Dashboard needs target tracking for clients, touchpoints, visits
-- Solution: Create targets table with monthly/weekly/daily periods and performance indexes

-- Drop table if it exists from partial migration
DROP TABLE IF EXISTS targets CASCADE;

-- Create targets table
CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly')),
  year INTEGER NOT NULL CHECK (year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1),
  month INTEGER CHECK (month >= 1 AND month <= 12),
  quarter INTEGER CHECK (quarter >= 1 AND quarter <= 4),
  week INTEGER CHECK (week >= 1 AND week <= 53),
  target_clients INTEGER DEFAULT 0 CHECK (target_clients >= 0),
  target_touchpoints INTEGER DEFAULT 0 CHECK (target_touchpoints >= 0),
  target_visits INTEGER DEFAULT 0 CHECK (target_visits >= 0),
  target_calls INTEGER DEFAULT 0 CHECK (target_calls >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Index for user queries (most common: get targets for specific user)
CREATE INDEX idx_targets_user_period ON targets(user_id, period, year, month, quarter, week);

-- Index for admin queries (all targets for a period)
CREATE INDEX idx_targets_period ON targets(period, year, month, quarter, week);

-- Index for manager queries (area-based, filtered by created_by)
CREATE INDEX idx_targets_created_by ON targets(created_by);

-- Create updated_at trigger
CREATE TRIGGER update_targets_updated_at
    BEFORE UPDATE ON targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
