-- IMU Complete Setup Script for Digital Ocean + PowerSync
-- Copy-paste this entire script into DBeaver and run it

-- ============================================
-- STEP 1: CREATE TABLES
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT DEFAULT 'caravan',
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);

-- User profiles table (for PowerSync sync)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'caravan',
    avatar_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);

-- Agencies table
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    birth_date DATE,
    email TEXT,
    phone TEXT,
    agency_name TEXT,
    department TEXT,
    position TEXT,
    employment_status TEXT,
    payroll_date TEXT,
    tenure INTEGER,
    client_type TEXT DEFAULT 'POTENTIAL',
    product_type TEXT,
    market_type TEXT,
    pension_type TEXT,
    pan TEXT,
    facebook_link TEXT,
    remarks TEXT,
    agency_id UUID REFERENCES agencies(id),
    caravan_id UUID REFERENCES users(id),
    is_starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Addresses table
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    street TEXT,
    barangay TEXT,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    number TEXT NOT NULL,
    label TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Touchpoints table
CREATE TABLE IF NOT EXISTS touchpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    touchpoint_number INTEGER CHECK (touchpoint_number BETWEEN 1 AND 7),
    type TEXT NOT NULL CHECK (type IN ('Visit', 'Call')),
    date DATE NOT NULL,
    address TEXT,
    time_arrival TEXT,
    time_departure TEXT,
    odometer_arrival TEXT,
    odometer_departure TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Interested', 'Undecided', 'Not Interested', 'Completed')),
    next_visit_date DATE,
    notes TEXT,
    photo_url TEXT,
    audio_url TEXT,
    latitude REAL,
    longitude REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itineraries table
CREATE TABLE IF NOT EXISTS itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id),
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    time_in TIMESTAMPTZ,
    time_out TIMESTAMPTZ,
    location_in_lat REAL,
    location_in_lng REAL,
    location_out_lat REAL,
    location_out_lng REAL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Targets table
CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    period TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER,
    week INTEGER,
    target_clients INTEGER DEFAULT 0,
    target_touchpoints INTEGER DEFAULT 1,
    target_visits INTEGER DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    team_leader_id UUID REFERENCES users(id),
    members TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group members junction table
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, client_id)
);

-- Tele assignments table
CREATE TABLE IF NOT EXISTS tele_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tele_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tele_user_id, client_id, is_active)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id),
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    role TEXT,
    touchpoint_number INTEGER,
    reason TEXT,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 2: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_clients_caravan_id ON clients(caravan_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_caravan_id ON touchpoints(caravan_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_date ON touchpoints(date);
CREATE INDEX IF NOT EXISTS idx_itineraries_caravan_id ON itineraries(caravan_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_scheduled_date ON itineraries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_tele_assignments_tele_user_id ON tele_assignments(tele_user_id);
CREATE INDEX IF NOT EXISTS idx_tele_assignments_client_id ON tele_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_tele_assignments_assigned_by ON tele_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tele_assignments_is_active ON tele_assignments(is_active);

-- ============================================
-- STEP 3: CREATE TRIGGERS
-- ============================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_touchpoints_updated_at ON touchpoints;
CREATE TRIGGER update_touchpoints_updated_at BEFORE UPDATE ON touchpoints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tele_assignments_updated_at ON tele_assignments;
CREATE TRIGGER update_tele_assignments_updated_at BEFORE UPDATE ON tele_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 4: CREATE PUBLICATION FOR POWERSYNC
-- ============================================

CREATE PUBLICATION IF NOT EXISTS powersync FOR TABLE
    clients,
    itineraries,
    touchpoints,
    addresses,
    phone_numbers,
    user_profiles;

-- ============================================
-- STEP 5: SEED DATA
-- ============================================

-- Insert admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES (
    'admin@imu.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Admin',
    'User',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insert test user (password: test123)
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES (
    'test@imu.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Test',
    'User',
    'caravan'
) ON CONFLICT (email) DO NOTHING;

-- Insert sample agencies
INSERT INTO agencies (name, code, address)
VALUES
    ('Philippine National Police', 'PNP', 'Camp Crame, Quezon City'),
    ('Department of Education', 'DEPED', 'UL Complex, Pasig City'),
    ('Bureau of Internal Revenue', 'BIR', 'Quezon City')
ON CONFLICT (code) DO NOTHING;

-- Insert sample field agents (caravans)
INSERT INTO users (email, password_hash, first_name, last_name, role, phone)
VALUES
    ('john.field@imu.com', '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o', 'John', 'Agent', 'field_agent', '+639123456789'),
    ('jane.field@imu.com', '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o', 'Jane', 'Agent', 'field_agent', '+639234567890')
ON CONFLICT (email) DO NOTHING;

-- Insert sample clients
INSERT INTO clients (first_name, last_name, middle_name, email, phone, client_type, product_type, market_type, pension_type, agency_name, department, position)
VALUES
    ('Juan', 'Dela Cruz', 'Santos', 'juan.delacruz@email.com', '+639123456789', 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS', 'Philippine National Police', 'Retirement Division', 'Police Officer III'),
    ('Maria', 'Santos', 'Reyes', 'maria.santos@email.com', '+639234567890', 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'SSS', 'Department of Education', 'Human Resources', 'Teacher III'),
    ('Pedro', 'Garcia', 'Cruz', 'pedro.garcia@email.com', '+639345678901', 'POTENTIAL', 'CASH_LOAN', 'PRIVATE', 'PRIVATE', 'Metro Manila Development Authority', 'Operations', 'Traffic Enforcer'),
    ('Ana', 'Reyes', 'Mendoza', 'ana.reyes@email.com', '+639456789012', 'POTENTIAL', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS', 'Bureau of Internal Revenue', 'Assessment', 'Revenue Officer'),
    ('Jose', 'Mendoza', 'Torres', 'jose.mendoza@email.com', '+639567890123', 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS', 'Philippine National Police', 'Retirement Division', 'Police Senior Sergeant')
ON CONFLICT DO NOTHING;

-- Insert sample itineraries for today and tomorrow
INSERT INTO itineraries (client_id, caravan_id, scheduled_date, scheduled_time, status, priority, notes)
SELECT
    c.id,
    u.id,
    CURRENT_DATE,
    '09:00',
    'pending',
    'high',
    'Initial client visit'
FROM clients c, users u
WHERE u.role = 'field_agent'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================
-- DONE!
-- ============================================
-- Verify the setup
SELECT 'Tables created successfully!' as status;
SELECT COUNT(*) || 0 as client_count FROM clients;
SELECT COUNT(*) >= 1 as publication_exists FROM pg_publication WHERE pubname = 'powersync';
