-- Migration: Create client_favorites table for starring/favoriting clients
-- Description: Allows users to mark clients as favorites for quick access
-- Date: 2025-04-21

CREATE TABLE IF NOT EXISTS client_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure a user can only favorite a client once
  CONSTRAINT unique_user_client UNIQUE (user_id, client_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_favorites_user_id ON client_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_client_favorites_client_id ON client_favorites(client_id);
CREATE INDEX IF NOT EXISTS idx_client_favorites_created_at ON client_favorites(created_at DESC);

-- Comment for documentation
COMMENT ON TABLE client_favorites IS 'Stores user favorites/stars for clients';
