-- Fix group_members.client_id FK: was referencing clients(id) but stores caravan user IDs
-- Drop the incorrect FK and replace with one referencing users(id)

DO $$
BEGIN
  -- Drop old FK if it exists (name varies depending on how it was created)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'group_members'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'group_members_client_id_fkey'
  ) THEN
    ALTER TABLE group_members DROP CONSTRAINT group_members_client_id_fkey;
  END IF;

  -- Add correct FK referencing users(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'group_members'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'group_members_client_id_users_fkey'
  ) THEN
    ALTER TABLE group_members
      ADD CONSTRAINT group_members_client_id_users_fkey
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
