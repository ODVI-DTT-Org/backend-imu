-- ============================================================
-- IMU Complete Database Schema
-- ============================================================
-- This script creates the complete IMU database schema
-- including all tables, indexes, triggers, and views
-- Version: 1.1 (as of 2026-04-02) - Added RBAC System
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- ============================================================
-- TABLES
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    role TEXT DEFAULT 'caravan',
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
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
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_starred BOOLEAN DEFAULT FALSE,

    -- PSGC fields for geographic data
    psgc_id INTEGER,
    region TEXT,
    province TEXT,
    municipality TEXT,
    barangay TEXT,

    -- UDI (Unique Document Identifier)
    udi TEXT,

    -- Loan release tracking
    loan_released BOOLEAN DEFAULT FALSE,
    loan_released_at TIMESTAMP,

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
    touchpoint_number INTEGER NOT NULL CHECK (touchpoint_number BETWEEN 1 AND 7),
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

    -- Time In/Out GPS-tracked fields
    time_in TIMESTAMP,
    time_in_gps_lat DOUBLE PRECISION,
    time_in_gps_lng DOUBLE PRECISION,
    time_in_gps_address TEXT,
    time_out TIMESTAMP,
    time_out_gps_lat DOUBLE PRECISION,
    time_out_gps_lng DOUBLE PRECISION,
    time_out_gps_address TEXT,

    -- Rejection reason (for unfavorable status)
    rejection_reason TEXT,

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
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
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
    target_touchpoints INTEGER DEFAULT 0,
    target_visits INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    area_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assistant_area_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

-- Group municipalities table
CREATE TABLE IF NOT EXISTS group_municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, municipality_id)
);

-- User locations table (renamed from user_municipalities_simple)
CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, municipality_id)
);

-- User PSGC assignments table (for barangay-level assignments)
CREATE TABLE IF NOT EXISTS user_psgc_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    psgc_id INTEGER NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, psgc_id)
);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('client', 'udi')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,

    -- Updated client information for approvals
    updated_client_information JSONB,
    updated_udi TEXT,
    udi_number TEXT,

    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Touchpoint reasons table
CREATE TABLE IF NOT EXISTS touchpoint_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_code TEXT NOT NULL,
    label TEXT NOT NULL,
    touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN ('Visit', 'Call')),
    role TEXT NOT NULL CHECK (role IN ('caravan', 'tele')),
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reason_code, role, touchpoint_type)
);

-- ============================================================
-- PSGC TABLE (Philippine Standard Geographic Code)
-- ============================================================
-- Note: This is a placeholder. In production, you should import
-- the actual PSGC data from the official CSV file.
-- The PSGC table should have these columns:
-- id, region, province, mun_city, mun_city_kind, barangay, pin_location, zip_code

CREATE TABLE IF NOT EXISTS psgc (
    id INTEGER PRIMARY KEY,
    region TEXT NOT NULL,
    province TEXT NOT NULL,
    mun_city TEXT NOT NULL,
    mun_city_kind TEXT,
    barangay TEXT NOT NULL,
    pin_location TEXT,
    zip_code TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Clients indexes
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_is_starred ON clients(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_municipality ON clients(municipality);
CREATE INDEX IF NOT EXISTS idx_clients_udi ON clients(udi);
CREATE INDEX IF NOT EXISTS idx_clients_loan_released ON clients(loan_released);
CREATE INDEX IF NOT EXISTS idx_clients_region ON clients(region);
CREATE INDEX IF NOT EXISTS idx_clients_province ON clients(province);
CREATE INDEX IF NOT EXISTS idx_clients_barangay ON clients(barangay);
CREATE INDEX IF NOT EXISTS idx_clients_psgc_id ON clients(psgc_id);

-- Addresses indexes
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_addresses_is_primary ON addresses(is_primary) WHERE is_primary = true;

-- Phone numbers indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_primary ON phone_numbers(is_primary) WHERE is_primary = true;

-- Touchpoints indexes
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_id ON touchpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_date ON touchpoints(date DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_touchpoint_number ON touchpoints(client_id, touchpoint_number);
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_in ON touchpoints(time_in);
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_out ON touchpoints(time_out);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_status ON touchpoints(client_id, touchpoint_number, type);
CREATE INDEX IF NOT EXISTS idx_touchpoints_active ON touchpoints(client_id, touchpoint_number) WHERE touchpoint_number <= 7;

-- Itineraries indexes
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_scheduled_date ON itineraries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_itineraries_created_by ON itineraries(created_by);

-- Attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- Targets indexes
CREATE INDEX IF NOT EXISTS idx_targets_user_id ON targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_period ON targets(period, year);

-- Groups indexes
CREATE INDEX IF NOT EXISTS idx_groups_area_manager_id ON groups(area_manager_id);
CREATE INDEX IF NOT EXISTS idx_groups_assistant_area_manager_id ON groups(assistant_area_manager_id);
CREATE INDEX IF NOT EXISTS idx_groups_caravan_id ON groups(caravan_id);

-- Group members indexes
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_client_id ON group_members(client_id);

-- Group municipalities indexes
CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_id ON group_municipalities(group_id);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_municipality_id ON group_municipalities(municipality_id);

-- User locations indexes
CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_municipality ON user_locations(municipality_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(user_id, municipality_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_locations_user_municipality ON user_locations(user_id, municipality_id) WHERE deleted_at IS NULL;

-- User PSGC assignments indexes
CREATE INDEX IF NOT EXISTS idx_user_psgc_user ON user_psgc_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_psgc_psgc ON user_psgc_assignments(psgc_id);
CREATE INDEX IF NOT EXISTS idx_user_psgc_active ON user_psgc_assignments(user_id, psgc_id) WHERE deleted_at IS NULL;

-- Approvals indexes
CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_created_at ON approvals(created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_updated_client_information ON approvals(updated_client_information);
CREATE INDEX IF NOT EXISTS idx_approvals_updated_udi ON approvals(updated_udi);
CREATE INDEX IF NOT EXISTS idx_approvals_udi_number ON approvals(udi_number);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC);

-- Touchpoint reasons indexes
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role ON touchpoint_reasons(role);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_touchpoint_type ON touchpoint_reasons(touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role_type ON touchpoint_reasons(role, touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_active ON touchpoint_reasons(is_active) WHERE is_active = true;

-- PSGC indexes
CREATE INDEX IF NOT EXISTS idx_psgc_region ON psgc(region);
CREATE INDEX IF NOT EXISTS idx_psgc_province ON psgc(province);
CREATE INDEX IF NOT EXISTS idx_psgc_mun_city ON psgc(mun_city);
CREATE INDEX IF NOT EXISTS idx_psgc_barangay ON psgc(barangay);
CREATE INDEX IF NOT EXISTS idx_psgc_zip_code ON psgc(zip_code);

-- ============================================================
-- VIEWS
-- ============================================================

-- PSGC regions view
CREATE OR REPLACE VIEW psgc_regions AS
SELECT DISTINCT
    ROW_NUMBER() OVER (ORDER BY region) as id,
    region as name,
    region as code
FROM psgc
ORDER BY region;

-- PSGC provinces view
CREATE OR REPLACE VIEW psgc_provinces AS
SELECT DISTINCT
    province as id,
    region,
    province as name
FROM psgc
ORDER BY region, province;

-- PSGC municipalities/cities view
CREATE OR REPLACE VIEW psgc_municipalities AS
SELECT DISTINCT
    province || '-' || mun_city as id,
    region,
    province,
    mun_city as name,
    mun_city_kind as kind,
    CASE WHEN mun_city_kind ILIKE '%city%' THEN true ELSE false END as is_city
FROM psgc
ORDER BY region, province, mun_city;

-- PSGC barangays view
CREATE OR REPLACE VIEW psgc_barangays AS
SELECT
    id,
    region,
    province,
    mun_city as municipality,
    barangay as name,
    pin_location,
    zip_code
FROM psgc
ORDER BY region, province, mun_city, barangay;

-- Regions view (backward compatibility)
CREATE OR REPLACE VIEW regions AS
SELECT
    ROW_NUMBER() OVER (ORDER BY name) as id,
    name,
    name as code,
    NOW() as created_at
FROM (
    SELECT DISTINCT region as name FROM psgc ORDER BY region
) subq;

-- Municipalities view (backward compatibility)
CREATE OR REPLACE VIEW municipalities AS
SELECT
    ROW_NUMBER() OVER (ORDER BY region, province, name) as id,
    region as region_id,
    name,
    province,
    kind as code,
    is_city,
    NOW() as created_at
FROM (
    SELECT DISTINCT
        region,
        province,
        mun_city as name,
        mun_city_kind as kind,
        CASE WHEN mun_city_kind ILIKE '%city%' THEN true ELSE false END as is_city
    FROM psgc
    ORDER BY region, province, mun_city
) subq;

-- Active touchpoint reasons view
CREATE OR REPLACE VIEW active_touchpoint_reasons AS
SELECT
    id,
    reason_code,
    label,
    touchpoint_type,
    role,
    category,
    sort_order
FROM touchpoint_reasons
WHERE is_active = true
ORDER BY role, touchpoint_type, category, sort_order;

-- ============================================================
-- TRIGGERS
-- ============================================================

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

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_touchpoints_updated_at ON touchpoints;
CREATE TRIGGER update_touchpoints_updated_at BEFORE UPDATE ON touchpoints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_locations_updated_at ON user_locations;
CREATE TRIGGER update_user_locations_updated_at BEFORE UPDATE ON user_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_psgc_assignments_updated_at ON user_psgc_assignments;
CREATE TRIGGER update_user_psgc_assignments_updated_at BEFORE UPDATE ON user_psgc_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_touchpoint_reasons_updated_at ON touchpoint_reasons;
CREATE TRIGGER update_touchpoint_reasons_updated_at BEFORE UPDATE ON touchpoint_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

-- Ensure a caravan can only be assigned to one group
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_unique_caravan
    ON groups(caravan_id)
    WHERE caravan_id IS NOT NULL;

-- Ensure unique active user location assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_unique_active
ON user_locations (user_id, municipality_id);

-- ============================================================
-- SEED DATA: Touchpoint Reasons
-- ============================================================

-- Insert Caravan Visit reasons
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order) VALUES
    ('ABROAD', 'Abroad', 'Visit', 'caravan', 'General', 1),
    ('APPLY_MEMBERSHIP', 'Apply for PUSU Membership / LIKA Membership', 'Visit', 'caravan', 'General', 2),
    ('BACKED_OUT', 'Backed Out', 'Visit', 'caravan', 'Unfavorable', 3),
    ('CI_BI', 'CI/BI', 'Visit', 'caravan', 'General', 4),
    ('DECEASED', 'Deceased', 'Visit', 'caravan', 'Unfavorable', 5),
    ('DISAPPROVED', 'Disapproved', 'Visit', 'caravan', 'Unfavorable', 6),
    ('FOR_ADA_COMPLIANCE', 'For ADA Compliance', 'Visit', 'caravan', 'Processing', 7),
    ('FOR_PROCESSING', 'For Processing / Approval / Request / Buy-Out', 'Visit', 'caravan', 'Processing', 8),
    ('FOR_UPDATE', 'For Update', 'Visit', 'caravan', 'Processing', 9),
    ('FOR_VERIFICATION', 'For Verification', 'Visit', 'caravan', 'Processing', 10),
    ('INACCESSIBLE_AREA', 'Inaccessible / Critical Area', 'Visit', 'caravan', 'Unfavorable', 11),
    ('INTERESTED', 'Interested', 'Visit', 'caravan', 'Favorable', 12),
    ('LOAN_INQUIRY', 'Loan Inquiry', 'Visit', 'caravan', 'Favorable', 13),
    ('MOVED_OUT', 'Moved Out', 'Visit', 'caravan', 'Unfavorable', 14),
    ('NOT_AMENABLE', 'Not Amenable to Our Product Criteria', 'Visit', 'caravan', 'Unfavorable', 15),
    ('NOT_AROUND', 'Not Around', 'Visit', 'caravan', 'General', 16),
    ('NOT_IN_LIST', 'Not In the List', 'Visit', 'caravan', 'General', 17),
    ('NOT_INTERESTED', 'Not Interested', 'Visit', 'caravan', 'Unfavorable', 18),
    ('OVERAGE', 'Overage', 'Visit', 'caravan', 'Unfavorable', 19),
    ('POOR_HEALTH', 'Poor Health Condition', 'Visit', 'caravan', 'Unfavorable', 20),
    ('RETURNED_ATM', 'Returned ATM / Pick-up ATM', 'Visit', 'caravan', 'Processing', 21),
    ('TELEMARKETING', 'Telemarketing', 'Visit', 'caravan', 'Favorable', 22),
    ('UNDECIDED', 'Undecided', 'Visit', 'caravan', 'Favorable', 23),
    ('UNLOCATED', 'Unlocated', 'Visit', 'caravan', 'Unfavorable', 24),
    ('WITH_OTHER_LENDING', 'With Other Lending', 'Visit', 'caravan', 'General', 25),
    ('INTERESTED_FAMILY_DECLINED', 'Interested, But Declined Due to Family Decision', 'Visit', 'caravan', 'Unfavorable', 26)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- Insert Tele Call reasons
INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order) VALUES
    -- LEVEL 1 FAVORABLE
    ('L1_BORROWED', 'LEVEL 1 FAVORABLE - BORROWED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 1),
    ('L1_FULLY_PAID', 'LEVEL 1 FAVORABLE - FULLYPAID', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 2),
    ('L1_INTERESTED', 'LEVEL 1 FAVORABLE - INTERESTED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 3),
    ('L1_LOAN_INQUIRY', 'LEVEL 1 FAVORABLE - LOAN INQUIRY / FOR VERIFICATION', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 4),
    ('L1_UNDECIDED', 'LEVEL 1 FAVORABLE - UNDECIDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 5),
    ('L1_WILL_CALL_IF_NEEDED', 'LEVEL 1 FAVORABLE - WILL CALL IF NEEDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 6),
    ('L1_ENDORSED_TO_CARAVAN', 'LEVEL 1 FAVORABLE - ENDORSED TO CARAVAN', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 7),
    ('L1_NOT_IN_LIST', 'LEVEL 1 FAVORABLE - NOT IN THE LIST', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 8),
    -- LEVEL 2 FAVORABLE
    ('L2_NOT_AROUND', 'LEVEL 2 FAVORABLE - NOT AROUND', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 9),
    ('L2_RINGING', 'LEVEL 2 FAVORABLE - RINGING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 10),
    ('L2_LINE_BUSY', 'LEVEL 2 FAVORABLE - LINE BUSY', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 11),
    ('L2_EXISTING_CLIENT', 'LEVEL 2 FAVORABLE - EXISTING CLIENT', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 12),
    ('L2_WITH_OTHER_LENDING', 'LEVEL 2 FAVORABLE - WITH OTHER LENDING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 13),
    -- LEVEL 1 UNFAVORABLE
    ('L1_NOT_INTERESTED', 'LEVEL 1 UNFAVORABLE - NOT INTERESTED', 'Call', 'tele', 'LEVEL 1 UNFAVORABLE', 14),
    -- LEVEL 2 UNFAVORABLE
    ('L2_INCORRECT_NUMBER', 'LEVEL 2 UNFAVORABLE - INCORRECT / INCOMPLETE NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 15),
    ('L2_WRONG_NUMBER', 'LEVEL 2 UNFAVORABLE - WRONG NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 16),
    ('L2_DROPCALL', 'LEVEL 2 UNFAVORABLE - DROPCALL', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 17),
    ('L2_CANNOT_BE_REACHED', 'LEVEL 2 UNFAVORABLE - CANNOT BE REACH / UNATTENDED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 18),
    ('L2_NOT_YET_IN_SERVICE', 'LEVEL 2 UNFAVORABLE - NOT YET IN SERVICE / CANNOT BE COMPLETED IF DIALLED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 19),
    ('L2_FAMILY_DECLINED', 'LEVEL 2 UNFAVORAVLE - INTERESTED, BUT DECLINED DUE TO FAMILY''S DECISION', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 20),
    ('L2_ABROAD', 'LEVEL 2 UNFAVORABLE - ABROAD', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 21),
    -- LEVEL 3 UNFAVORABLE
    ('L3_NOT_QUALIFIED', 'LEVEL 3 UNFAVORABLE - NOT QUALIFIED - LOW / NEGATIVE LOAN PROCEEDS', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 22),
    ('L3_DISQUALIFIED', 'LEVEL 3 UNFAVORABLE - DISQUALIFIED - HEALTH CONDITION / OVERAGE', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 23),
    ('L3_BACKED_OUT', 'LEVEL 3 UNFAVORABLE - BACKED OUT', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 24),
    ('L3_DISAPPROVED', 'LEVEL 3 UNFAVORABLE - DISAPPROVED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 25),
    ('L3_DECEASED', 'LEVEL 3 UNFAVORABLE - DECEASED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 26)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- ============================================================
-- RBAC SYSTEM (Role-Based Access Control)
-- ============================================================
-- Migration 039: Add Robust RBAC System with Permissions
-- This creates a proper role-based access control system
-- with fine-grained permissions while maintaining backward compatibility

-- Roles table (replaces hardcoded role values)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    level INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    constraint_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource, action, constraint_name)
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

-- User roles junction table (supports multiple roles per user)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- Indexes for RBAC tables
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- Updated at trigger for roles
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed system roles
INSERT INTO roles (name, slug, description, level, is_system) VALUES
    ('System Administrator', 'admin', 'Full system access with no restrictions', 100, TRUE),
    ('Area Manager', 'area_manager', 'Regional oversight with full access to assigned areas', 50, TRUE),
    ('Assistant Area Manager', 'assistant_area_manager', 'Area management support with limited permissions', 40, TRUE),
    ('Caravan (Field Agent)', 'caravan', 'Field agents who conduct in-person client visits', 20, TRUE),
    ('Telemarketer', 'tele', 'Telemarketers who conduct phone-based outreach', 15, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Seed permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('users', 'create', NULL, 'Create new users'),
    ('users', 'read', NULL, 'View user information'),
    ('users', 'update', NULL, 'Edit user information'),
    ('users', 'delete', NULL, 'Delete users'),
    ('users', 'assign_role', NULL, 'Assign roles to users'),
    ('users', 'assign_area', NULL, 'Assign municipalities to users')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('clients', 'create', NULL, 'Create new clients'),
    ('clients', 'read', 'own', 'View own assigned clients'),
    ('clients', 'read', 'area', 'View all clients in assigned area'),
    ('clients', 'read', 'all', 'View all clients'),
    ('clients', 'update', 'own', 'Edit own assigned clients'),
    ('clients', 'update', 'area', 'Edit any client in assigned area'),
    ('clients', 'update', 'all', 'Edit any client'),
    ('clients', 'delete', 'all', 'Delete clients'),
    ('clients', 'assign', 'own', 'Assign clients to self'),
    ('clients', 'assign', 'area', 'Assign clients to users in area')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('touchpoints', 'create', 'visit', 'Create Visit touchpoints (1, 4, 7)'),
    ('touchpoints', 'create', 'call', 'Create Call touchpoints (2, 3, 5, 6)'),
    ('touchpoints', 'create', 'any', 'Create any touchpoint type'),
    ('touchpoints', 'read', 'own', 'View own touchpoints'),
    ('touchpoints', 'read', 'area', 'View touchpoints in assigned area'),
    ('touchpoints', 'update', 'own', 'Edit own touchpoints'),
    ('touchpoints', 'update', 'area', 'Edit any touchpoint in area'),
    ('touchpoints', 'delete', 'all', 'Delete touchpoints')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('itineraries', 'create', NULL, 'Create itineraries'),
    ('itineraries', 'read', 'own', 'View own itineraries'),
    ('itineraries', 'read', 'area', 'View itineraries in assigned area'),
    ('itineraries', 'update', 'own', 'Edit own itineraries'),
    ('itineraries', 'update', 'area', 'Edit any itinerary in area'),
    ('itineraries', 'delete', 'all', 'Delete itineraries')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('reports', 'read', 'own', 'View own reports'),
    ('reports', 'read', 'area', 'View reports for assigned area'),
    ('reports', 'read', 'all', 'View all reports'),
    ('reports', 'export', 'area', 'Export reports for assigned area'),
    ('reports', 'export', 'all', 'Export any reports')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('agencies', 'read', NULL, 'View agency information'),
    ('agencies', 'create', NULL, 'Create new agencies'),
    ('agencies', 'update', NULL, 'Edit agency information'),
    ('agencies', 'delete', NULL, 'Delete agencies')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('groups', 'read', NULL, 'View group information'),
    ('groups', 'create', NULL, 'Create new groups'),
    ('groups', 'update', NULL, 'Edit group information'),
    ('groups', 'delete', NULL, 'Delete groups'),
    ('groups', 'manage_members', NULL, 'Add/remove group members')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('targets', 'read', 'own', 'View own targets'),
    ('targets', 'read', 'area', 'View targets for users in area'),
    ('targets', 'set', 'area', 'Set targets for users in area')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('attendance', 'create', 'own', 'Mark own attendance'),
    ('attendance', 'read', 'area', 'View attendance for area'),
    ('attendance', 'read', 'all', 'View all attendance')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('system', 'configure', NULL, 'Configure system settings'),
    ('audit_logs', 'read', 'own', 'View own audit logs'),
    ('audit_logs', 'read', 'area', 'View audit logs for area'),
    ('audit_logs', 'read', 'all', 'View all audit logs')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign permissions to roles
-- Admin: All permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Area Manager: Full area access, no system config
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('users', 'clients', 'touchpoints', 'itineraries', 'reports', 'groups', 'targets', 'attendance', 'audit_logs')
    AND (p.constraint_name IS NULL OR p.constraint_name IN ('area', 'all'))
    AND p.action NOT IN ('delete', 'configure', 'system')
)
WHERE r.slug = 'area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assistant Area Manager: Limited area access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('clients', 'touchpoints', 'itineraries', 'reports', 'targets', 'attendance')
    AND (p.constraint_name IN ('area', 'own') OR p.action = 'read')
    AND p.action NOT IN ('delete')
)
WHERE r.slug = 'assistant_area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Caravan: Client and touchpoint management (own data only, Visit touchpoints only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'clients' AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'touchpoints' AND p.action = 'create' AND p.constraint_name = 'visit')
    OR (p.resource = 'touchpoints' AND p.action IN ('read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'itineraries' AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'attendance' AND p.action = 'create' AND p.constraint_name = 'own')
    OR (p.resource = 'targets' AND p.action = 'read' AND p.constraint_name = 'own')
)
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Tele: Touchpoint management (Call touchpoints only), read-only clients
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'clients' AND p.action = 'read' AND p.constraint_name = 'own')
    OR (p.resource = 'touchpoints' AND p.action = 'create' AND p.constraint_name = 'call')
    OR (p.resource = 'touchpoints' AND p.action IN ('read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'itineraries' AND p.action = 'read' AND p.constraint_name = 'assigned')
    OR (p.resource = 'targets' AND p.action = 'read' AND p.constraint_name = 'own')
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Migrate existing users to new RBAC system
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
    u.id,
    r.id,
    u.id
FROM users u
JOIN roles r ON r.slug = u.role
LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = r.id
WHERE ur.id IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- View: User permissions (flattened for easy querying)
CREATE OR REPLACE VIEW user_permissions_view AS
SELECT
    ur.user_id,
    r.slug AS role_slug,
    r.name AS role_name,
    p.resource,
    p.action,
    p.constraint_name,
    r.level AS role_level
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE ur.is_active = TRUE
  AND (ur.expires_at IS NULL OR ur.expires_at > NOW());

-- Function: Check if user has specific permission
CREATE OR REPLACE FUNCTION has_permission(
    p_user_id UUID,
    p_resource TEXT,
    p_action TEXT,
    p_constraint TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM user_permissions_view
        WHERE user_id = p_user_id
          AND resource = p_resource
          AND action = p_action
          AND (constraint_name = p_constraint OR constraint_name IS NULL OR p_constraint IS NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE (
    resource TEXT,
    action TEXT,
    constraint_name TEXT,
    role_slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        upv.resource,
        upv.action,
        upv.constraint_name,
        upv.role_slug
    FROM user_permissions_view upv
    WHERE upv.user_id = p_user_id
    ORDER BY upv.resource, upv.action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user has any role (for backward compatibility)
CREATE OR REPLACE FUNCTION has_role(p_user_id UUID, p_role_slug TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
          AND r.slug = p_role_slug
          AND ur.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View: Users with their primary role (for backward compatibility)
CREATE OR REPLACE VIEW users_with_roles AS
SELECT
    u.id, u.email, u.password_hash, u.first_name, u.last_name, u.middle_name,
    u.phone, u.avatar_url, u.is_active, u.last_login_at,
    u.created_at, u.updated_at,
    r.slug AS role,
    r.name AS role_name
FROM users u
LEFT JOIN LATERAL (
    SELECT r.slug, r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = u.id
      AND ur.is_active = TRUE
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ORDER BY r.level DESC
    LIMIT 1
) r ON TRUE;

-- ============================================================
-- END RBAC SYSTEM
-- ============================================================

COMMIT;

-- ============================================================
-- POST-SETUP VERIFICATION
-- ============================================================

-- Verify RBAC system was created
SELECT 'RBAC System' as component, 'Roles created' as description, COUNT(*) as count FROM roles
UNION ALL
SELECT 'RBAC System', 'Permissions created', COUNT(*) FROM permissions
UNION ALL
SELECT 'RBAC System', 'Role permissions assigned', COUNT(*) FROM role_permissions
UNION ALL
SELECT 'RBAC System', 'Users migrated to RBAC', COUNT(*) FROM user_roles WHERE is_active = TRUE;

-- Verify all tables were created
SELECT
    'Tables created' as description,
    COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

-- Verify all indexes were created
SELECT
    'Indexes created' as description,
    COUNT(*) as count
FROM pg_indexes
WHERE schemaname = 'public';

-- Verify all views were created
SELECT
    'Views created' as description,
    COUNT(*) as count
FROM information_schema.views
WHERE table_schema = 'public';

-- ============================================================
-- POWERSYNC PUBLICATION SETUP
-- ============================================================
-- PowerSync requires a PostgreSQL publication to sync data to mobile devices
-- This publication includes all tables that need to be synced offline
--
-- IMPORTANT: These tables must match the PowerSync schema in the Flutter app
-- (mobile/imu_flutter/lib/services/sync/powersync_service.dart)

DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE
    -- Core data tables
    clients,
    itineraries,
    touchpoints,

    -- Related data tables
    addresses,
    phone_numbers,

    -- User profile table (for PowerSync sync metadata)
    user_profiles,

    -- User location assignments (for municipality-based filtering)
    user_locations,

    -- Approvals (for caravan/tele approval workflow)
    approvals,

    -- PSGC geographic data (for location picker)
    psgc,

    -- Touchpoint reasons (global data for touchpoint form dropdowns)
    touchpoint_reasons;

-- Verify publication was created
SELECT
    'PowerSync publication created' as description,
    pubname as publication_name,
    COUNT(*) as table_count
FROM pg_publication
WHERE pubname = 'powersync';

SELECT 'IMU database schema created successfully!' as result;
