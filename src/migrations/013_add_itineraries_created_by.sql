-- Migration: Add created_by column to itineraries table
-- Date: 2025-03-24
-- Issue: Itineraries route tries to insert created_by but column doesn't exist
-- Solution: Add created_by column with FK to users table

BEGIN;

-- Add created_by column
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

COMMIT;

-- Verification query
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'itineraries';
