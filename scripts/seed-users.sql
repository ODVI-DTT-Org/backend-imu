-- ============================================================================
-- IMU Users Table Seed Script
-- ============================================================================
-- Purpose: Seed users table with test accounts for all roles
-- Roles: admin, area_manager, assistant_area_manager, caravan, tele
--
-- Password for all test users: password123
-- Hash: $2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe (bcrypt, cost=10)
-- ============================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Ensure unique constraints exist (for ON CONFLICT to work)
-- ============================================================================
DO $$
BEGIN
    -- Add unique constraint on users.email if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_email_key'
        AND conrelid = 'users'::regclass
    ) THEN
        -- First remove duplicates if any exist
        DELETE FROM users a
        USING users b
        WHERE a.id < b.id
        AND a.email = b.email
        AND a.email LIKE '%@test.imu.local';

        -- Add the unique constraint
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
        RAISE NOTICE 'Added unique constraint on users.email';
    ELSE
        RAISE NOTICE 'Unique constraint on users.email already exists';
    END IF;

    -- Add unique constraint on user_profiles.user_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_user_id_key'
        AND conrelid = 'user_profiles'::regclass
    ) THEN
        -- First remove duplicates if any exist
        DELETE FROM user_profiles a
        USING user_profiles b
        WHERE a.id < b.id
        AND a.user_id = b.user_id
        AND a.user_id IN (
            SELECT id FROM users WHERE email LIKE '%@test.imu.local'
        );

        -- Add the unique constraint
        ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
        RAISE NOTICE 'Added unique constraint on user_profiles.user_id';
    ELSE
        RAISE NOTICE 'Unique constraint on user_profiles.user_id already exists';
    END IF;
END $$;

-- ============================================================================
-- Clean existing test data (optional - comment out to preserve existing data)
-- ============================================================================
DO $$
BEGIN
    -- Get test user IDs first
    WITH test_users AS (
        SELECT id FROM users WHERE email LIKE '%@test.imu.local'
    )
    DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM test_users);

    DELETE FROM users WHERE email LIKE '%@test.imu.local';

    RAISE NOTICE 'Cleaned existing test users and profiles';
END $$;

-- ============================================================================
-- ADMIN USERS (1 user)
-- ============================================================================
INSERT INTO users (
  id,
  email,
  password_hash,
  first_name,
  last_name,
  middle_name,
  role,
  phone,
  avatar_url,
  is_active
) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174000'::UUID,
    'admin@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'System',
    'Administrator',
    NULL,
    'admin',
    '+63 912 345 6789',
    'https://ui-avatars.com/api/?name=System+Administrator&background=0D8ABC&color=fff',
    TRUE
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create user profile for admin
INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url)
VALUES
  (
    '123e4567-e89b-12d3-a456-426614174001'::UUID,
    '123e4567-e89b-12d3-a456-426614174000'::UUID,
    'System Administrator',
    'admin@test.imu.local',
    'admin',
    'https://ui-avatars.com/api/?name=System+Administrator&background=0D8ABC&color=fff'
  )
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- ============================================================================
-- AREA MANAGER USERS (2 users)
-- ============================================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, middle_name, role, phone, avatar_url, is_active) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174100'::UUID,
    'area.manager1@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Roberto',
    'Santos',
    'Reyes',
    'area_manager',
    '+63 917 111 2222',
    'https://ui-avatars.com/api/?name=Roberto+Santos&background=28a745&color=fff',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174101'::UUID,
    'area.manager2@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Maria',
    'Garcia',
    'Lim',
    'area_manager',
    '+63 917 222 3333',
    'https://ui-avatars.com/api/?name=Maria+Garcia&background=28a745&color=fff',
    TRUE
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create user profiles for area managers
INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174102'::UUID,
    '123e4567-e89b-12d3-a456-426614174100'::UUID,
    'Roberto Reyes Santos',
    'area.manager1@test.imu.local',
    'area_manager',
    'https://ui-avatars.com/api/?name=Roberto+Santos&background=28a745&color=fff'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174103'::UUID,
    '123e4567-e89b-12d3-a456-426614174101'::UUID,
    'Maria Lim Garcia',
    'area.manager2@test.imu.local',
    'area_manager',
    'https://ui-avatars.com/api/?name=Maria+Garcia&background=28a745&color=fff'
  )
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- ============================================================================
-- ASSISTANT AREA MANAGER USERS (2 users)
-- ============================================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, middle_name, role, phone, avatar_url, is_active) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174200'::UUID,
    'asst.area.manager1@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Jose',
    'Mendoza',
    'Cruz',
    'assistant_area_manager',
    '+63 918 333 4444',
    'https://ui-avatars.com/api/?name=Jose+Mendoza&background=17a2b8&color=fff',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174201'::UUID,
    'asst.area.manager2@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Ana',
    'Flores',
    'Torres',
    'assistant_area_manager',
    '+63 918 444 5555',
    'https://ui-avatars.com/api/?name=Ana+Flores&background=17a2b8&color=fff',
    TRUE
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create user profiles for assistant area managers
INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174202'::UUID,
    '123e4567-e89b-12d3-a456-426614174200'::UUID,
    'Jose Cruz Mendoza',
    'asst.area.manager1@test.imu.local',
    'assistant_area_manager',
    'https://ui-avatars.com/api/?name=Jose+Mendoza&background=17a2b8&color=fff'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174203'::UUID,
    '123e4567-e89b-12d3-a456-426614174201'::UUID,
    'Ana Torres Flores',
    'asst.area.manager2@test.imu.local',
    'assistant_area_manager',
    'https://ui-avatars.com/api/?name=Ana+Flores&background=17a2b8&color=fff'
  )
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- ============================================================================
-- CARAVAN (FIELD AGENT) USERS (5 users)
-- ============================================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, middle_name, role, phone, avatar_url, is_active) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174300'::UUID,
    'caravan1@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Carlos',
    'Reyes',
    'Dela Cruz',
    'caravan',
    '+63 919 555 6666',
    'https://ui-avatars.com/api/?name=Carlos+Reyes&background=ffc107&color=000',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174301'::UUID,
    'caravan2@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Elena',
    'Ramos',
    'Santos',
    'caravan',
    '+63 919 666 7777',
    'https://ui-avatars.com/api/?name=Elena+Ramos&background=ffc107&color=000',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174302'::UUID,
    'caravan3@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Miguel',
    'Torres',
    'Garcia',
    'caravan',
    '+63 919 777 8888',
    'https://ui-avatars.com/api/?name=Miguel+Torres&background=ffc107&color=000',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174303'::UUID,
    'caravan4@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Isabella',
    'Castillo',
    'Reyes',
    'caravan',
    '+63 919 888 9999',
    'https://ui-avatars.com/api/?name=Isabella+Castillo&background=ffc107&color=000',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174304'::UUID,
    'caravan5@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Antonio',
    'Rivera',
    'Mendoza',
    'caravan',
    '+63 919 999 0000',
    'https://ui-avatars.com/api/?name=Antonio+Rivera&background=ffc107&color=000',
    TRUE
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create user profiles for caravan agents
INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174305'::UUID,
    '123e4567-e89b-12d3-a456-426614174300'::UUID,
    'Carlos Dela Cruz Reyes',
    'caravan1@test.imu.local',
    'caravan',
    'https://ui-avatars.com/api/?name=Carlos+Reyes&background=ffc107&color=000'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174306'::UUID,
    '123e4567-e89b-12d3-a456-426614174301'::UUID,
    'Elena Santos Ramos',
    'caravan2@test.imu.local',
    'caravan',
    'https://ui-avatars.com/api/?name=Elena+Ramos&background=ffc107&color=000'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174307'::UUID,
    '123e4567-e89b-12d3-a456-426614174302'::UUID,
    'Miguel Garcia Torres',
    'caravan3@test.imu.local',
    'caravan',
    'https://ui-avatars.com/api/?name=Miguel+Torres&background=ffc107&color=000'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174308'::UUID,
    '123e4567-e89b-12d3-a456-426614174303'::UUID,
    'Isabella Reyes Castillo',
    'caravan4@test.imu.local',
    'caravan',
    'https://ui-avatars.com/api/?name=Isabella+Castillo&background=ffc107&color=000'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174309'::UUID,
    '123e4567-e89b-12d3-a456-426614174304'::UUID,
    'Antonio Mendoza Rivera',
    'caravan5@test.imu.local',
    'caravan',
    'https://ui-avatars.com/api/?name=Antonio+Rivera&background=ffc107&color=000'
  )
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- ============================================================================
-- TELE (TELEMARKETER) USERS (3 users)
-- ============================================================================
INSERT INTO users (id, email, password_hash, first_name, last_name, middle_name, role, phone, avatar_url, is_active) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174400'::UUID,
    'tele1@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Sofia',
    'Aquino',
    'Reyes',
    'tele',
    '+63 920 111 2222',
    'https://ui-avatars.com/api/?name=Sofia+Aquino&background=6f42c1&color=fff',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174401'::UUID,
    'tele2@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Daniel',
    'Pascual',
    'Santos',
    'tele',
    '+63 920 222 3333',
    'https://ui-avatars.com/api/?name=Daniel+Pascual&background=6f42c1&color=fff',
    TRUE
  ),
  (
    '123e4567-e89b-12d3-a456-426614174402'::UUID,
    'tele3@test.imu.local',
    '$2a$10$dfn.Sky9VTKDnPw5vqeZnO1wyb8OtrYoCwV.nf8o7rYuR/giLflMe',
    'Patricia',
    'Villanueva',
    'Garcia',
    'tele',
    '+63 920 333 4444',
    'https://ui-avatars.com/api/?name=Patricia+Villanueva&background=6f42c1&color=fff',
    TRUE
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create user profiles for tele users
INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url) VALUES
  (
    '123e4567-e89b-12d3-a456-426614174403'::UUID,
    '123e4567-e89b-12d3-a456-426614174400'::UUID,
    'Sofia Reyes Aquino',
    'tele1@test.imu.local',
    'tele',
    'https://ui-avatars.com/api/?name=Sofia+Aquino&background=6f42c1&color=fff'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174404'::UUID,
    '123e4567-e89b-12d3-a456-426614174401'::UUID,
    'Daniel Santos Pascual',
    'tele2@test.imu.local',
    'tele',
    'https://ui-avatars.com/api/?name=Daniel+Pascual&background=6f42c1&color=fff'
  ),
  (
    '123e4567-e89b-12d3-a456-426614174405'::UUID,
    '123e4567-e89b-12d3-a456-426614174402'::UUID,
    'Patricia Garcia Villanueva',
    'tele3@test.imu.local',
    'tele',
    'https://ui-avatars.com/api/?name=Patricia+Villanueva&background=6f42c1&color=fff'
  )
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================
SELECT
  role,
  COUNT(*) as user_count,
  ARRAY_AGG(email ORDER BY email) as emails
FROM users
WHERE email LIKE '%@test.imu.local'
GROUP BY role
ORDER BY
  CASE role
    WHEN 'admin' THEN 1
    WHEN 'area_manager' THEN 2
    WHEN 'assistant_area_manager' THEN 3
    WHEN 'caravan' THEN 4
    WHEN 'tele' THEN 5
  END;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- Default Password: password123 (for all test users)
--
-- Login Credentials by Role:
--
-- ADMIN:
--   Email: admin@test.imu.local
--   Password: password123
--
-- AREA MANAGERS (2 users):
--   Email: area.manager1@test.imu.local
--   Email: area.manager2@test.imu.local
--   Password: password123
--
-- ASSISTANT AREA MANAGERS (2 users):
--   Email: asst.area.manager1@test.imu.local
--   Email: asst.area.manager2@test.imu.local
--   Password: password123
--
-- CARAVAN / FIELD AGENTS (5 users):
--   Email: caravan1@test.imu.local through caravan5@test.imu.local
--   Password: password123
--
-- TELE / TELEMARKETERS (3 users):
--   Email: tele1@test.imu.local through tele3@test.imu.local
--   Password: password123
--
-- To execute this script:
--   psql -U your_user -d your_database -f backend/scripts/seed-users.sql
--
-- Or from within psql:
--   \i backend/scripts/seed-users.sql
--
-- ============================================================================
