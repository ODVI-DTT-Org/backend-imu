-- Migration: Create files table for file upload tracking
-- Version: 047
-- Date: 2026-04-04
-- Description: Creates the files table to store metadata for uploaded files (photos, audio, documents)

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on uploaded_by for faster user file lookups
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);

-- Create index on entity_type and entity_id for faster entity file lookups
CREATE INDEX IF NOT EXISTS idx_files_entity ON files(entity_type, entity_id);

-- Create index on created_at for sorting by upload date
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

-- Add comment to table
COMMENT ON TABLE files IS 'Stores metadata for uploaded files (photos, audio, documents)';

-- Add comments to columns
COMMENT ON COLUMN files.id IS 'Unique file identifier';
COMMENT ON COLUMN files.filename IS 'Storage filename (extracted from storage key)';
COMMENT ON COLUMN files.original_filename IS 'Original filename from upload';
COMMENT ON COLUMN files.mime_type IS 'MIME type (image/jpeg, audio/mpeg, etc.)';
COMMENT ON COLUMN files.size IS 'File size in bytes';
COMMENT ON COLUMN files.url IS 'Full URL to access the file';
COMMENT ON COLUMN files.storage_key IS 'Storage service key (S3 key)';
COMMENT ON COLUMN files.uploaded_by IS 'User ID who uploaded the file';
COMMENT ON COLUMN files.entity_type IS 'Optional: Entity type (touchpoint, client, etc.)';
COMMENT ON COLUMN files.entity_id IS 'Optional: Entity ID if linked to a specific record';
COMMENT ON COLUMN files.created_at IS 'Upload timestamp';
COMMENT ON COLUMN files.updated_at IS 'Last update timestamp';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_files_updated_at
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION update_files_updated_at();

-- Migration success message
DO $$
BEGIN
  RAISE NOTICE 'Files table created successfully';
END $$;
