-- Migration 075: Add udi_number column to releases table
-- The mobile form collects UDI number but it wasn't being stored

ALTER TABLE releases ADD COLUMN IF NOT EXISTS udi_number BIGINT;

COMMENT ON COLUMN releases.udi_number IS 'Unified Document Identifier number for the loan release';
