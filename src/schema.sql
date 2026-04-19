-- IMU PostgreSQL Database Schema
-- Verified against live qa2 database on 2026-04-19.
--
-- For the complete schema including RBAC, materialized views,
-- functions, triggers, and seed data, use:
--   backend/migrations/COMPLETE_SCHEMA.sql
--
-- Key notes about the live DB (differs from naive schema assumptions):
--   - Only 3 FK constraints exist in the DB:
--       group_members.client_id -> users.id
--       releases.approved_by -> users.id
--       releases.call_id -> calls.id
--   - phone_numbers uses `label` (NOT `type`) for the label column
--   - addresses has extra columns: psgc_id, street_address, deleted_at, updated_at
--   - clients has many extra legacy import columns
--   - users has theme_color and theme_mode columns
--   - user_psgc_assignments does NOT exist in the live DB
--   - group_municipalities does NOT have a deleted_at column

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users
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
    theme_color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    theme_mode VARCHAR(5) NOT NULL DEFAULT 'light',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);

-- User profiles (PowerSync sync target)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'caravan',
    avatar_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);

-- Agencies
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
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
    agency_id UUID,
    is_starred BOOLEAN DEFAULT FALSE,
    psgc_id INTEGER,
    region TEXT,
    province TEXT,
    municipality TEXT,
    barangay TEXT,
    udi TEXT,
    loan_released BOOLEAN DEFAULT FALSE,
    loan_released_at TIMESTAMP,
    loan_type TEXT,
    touchpoint_summary JSONB DEFAULT '[]',
    touchpoint_number INTEGER DEFAULT 1,
    next_touchpoint VARCHAR(10) DEFAULT 'Visit',
    -- Legacy import fields
    full_name TEXT,
    ext_name TEXT,
    fullname TEXT,
    full_address TEXT,
    account_code TEXT,
    account_number TEXT,
    rank TEXT,
    monthly_pension_amount NUMERIC,
    monthly_pension_gross NUMERIC,
    atm_number TEXT,
    applicable_republic_act TEXT,
    unit_code TEXT,
    pcni_acct_code TEXT,
    dob TEXT,
    g_company TEXT,
    g_status TEXT,
    status TEXT DEFAULT 'active',
    dmval_code TEXT,
    dmval_name TEXT,
    created_by VARCHAR(255),
    deleted_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT clients_loan_type_check
      CHECK (loan_type IN ('NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM'))
);

-- Addresses
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID,
    type TEXT NOT NULL,
    street TEXT,
    barangay TEXT,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    psgc_id INTEGER,
    street_address TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_unique_type_per_client
    ON addresses (client_id, type) WHERE deleted_at IS NULL;

-- Phone numbers
-- Note: uses `label` not `type`
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID,
    number TEXT NOT NULL,
    label TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visits
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,
    user_id UUID NOT NULL,
    type TEXT NOT NULL DEFAULT 'regular_visit',
    odometer_arrival TEXT,
    odometer_departure TEXT,
    photo_url TEXT,
    notes TEXT,
    reason TEXT,
    status TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    time_in TIMESTAMPTZ,
    time_out TIMESTAMPTZ,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT visits_type_check CHECK (type IN ('regular_visit', 'release_loan'))
);

-- Calls
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,
    user_id UUID NOT NULL,
    phone_number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'regular_call',
    dial_time TIMESTAMPTZ,
    duration INTEGER,
    notes TEXT,
    reason TEXT,
    status TEXT,
    photo_url TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT calls_type_check CHECK (type IN ('regular_call', 'release_loan'))
);

-- Touchpoints
CREATE TABLE IF NOT EXISTS touchpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,
    user_id UUID NOT NULL,
    touchpoint_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    visit_id UUID,
    call_id UUID,
    date DATE,
    status TEXT,
    next_visit_date DATE,
    notes TEXT,
    is_legacy BOOLEAN DEFAULT FALSE,
    latitude REAL,
    longitude REAL,
    address TEXT,
    CONSTRAINT touchpoint_has_record CHECK (visit_id IS NOT NULL OR call_id IS NOT NULL),
    UNIQUE (client_id, touchpoint_number)
);

-- Releases
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,
    user_id UUID NOT NULL,
    visit_id UUID,
    call_id UUID REFERENCES calls(id),
    product_type TEXT NOT NULL,
    loan_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    approval_notes TEXT,
    udi_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT releases_product_type_check
      CHECK (product_type IN ('BFP_ACTIVE', 'BFP_PENSION', 'PNP_PENSION', 'NAPOLCOM', 'BFP_STP')),
    CONSTRAINT release_activity_check
      CHECK (
        (visit_id IS NOT NULL AND call_id IS NULL) OR
        (visit_id IS NULL AND call_id IS NOT NULL) OR
        (visit_id IS NULL AND call_id IS NULL)
      )
);

-- Itineraries
CREATE TABLE IF NOT EXISTS itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    client_id UUID,
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
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

-- Targets
CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly')),
    year INTEGER NOT NULL,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    quarter INTEGER CHECK (quarter >= 1 AND quarter <= 4),
    week INTEGER CHECK (week >= 1 AND week <= 53),
    target_clients INTEGER DEFAULT 0 CHECK (target_clients >= 0),
    target_touchpoints INTEGER DEFAULT 0 CHECK (target_touchpoints >= 0),
    target_visits INTEGER DEFAULT 0 CHECK (target_visits >= 0),
    target_calls INTEGER DEFAULT 0 CHECK (target_calls >= 0),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    area_manager_id UUID,
    assistant_area_manager_id UUID,
    caravan_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group members (client_id stores user IDs — legacy naming)
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID,
    client_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, client_id)
);

-- Group municipalities
CREATE TABLE IF NOT EXISTS group_municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL,
    province TEXT,
    municipality TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User locations
CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    province TEXT NOT NULL,
    municipality TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approvals
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    client_id UUID,
    user_id UUID,
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,
    updated_client_information JSONB,
    updated_udi TEXT,
    udi_number TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT approvals_type_check
      CHECK (type IN ('client', 'udi', 'address_add', 'phone_add', 'loan_release_v2', 'client_delete')),
    CONSTRAINT approvals_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Audit logs
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

-- Touchpoint reasons
CREATE TABLE IF NOT EXISTS touchpoint_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_code TEXT NOT NULL,
    label TEXT NOT NULL,
    touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN ('Visit', 'Call')),
    role TEXT NOT NULL CHECK (role IN ('caravan', 'tele')),
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reason_code, role, touchpoint_type)
);

-- Background jobs
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    params JSONB,
    result JSONB,
    error TEXT,
    progress INTEGER DEFAULT 0,
    total_items INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID
);

-- Files
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by UUID NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Report jobs
CREATE TABLE IF NOT EXISTS report_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    params JSONB DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    created_by UUID NOT NULL,
    file_url TEXT,
    file_size BIGINT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    params JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PSGC (Philippine Standard Geographic Code)
-- Note: id is SERIAL (integer), not UUID
CREATE TABLE IF NOT EXISTS psgc (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    mun_city_kind VARCHAR(50) NOT NULL,
    mun_city VARCHAR(100) NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    pin_location JSONB,
    zip_code VARCHAR(4)
);

-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    user_whitelist TEXT[] DEFAULT '{}',
    role_whitelist TEXT[] DEFAULT '{}',
    environment_whitelist TEXT[] DEFAULT '{}',
    percentage INTEGER DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Error logs
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(36) NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    code VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    path VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    stack_trace TEXT,
    suggestions TEXT[] DEFAULT '{}',
    documentation_url VARCHAR(500),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Mobile error tracking
    app_version VARCHAR(20),
    os_version VARCHAR(50),
    component_stack TEXT,
    fingerprint VARCHAR(64),
    last_fingerprint_seen_at TIMESTAMPTZ,
    occurrences_count INTEGER DEFAULT 1,
    platform VARCHAR(20),
    is_synced BOOLEAN DEFAULT FALSE,
    device_info JSONB DEFAULT '{}'
);

-- RBAC: Roles
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

-- RBAC: Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    constraint_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource, action, constraint_name)
);

-- RBAC: Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID,
    UNIQUE(role_id, permission_id)
);

-- RBAC: User roles
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- Migration tables (from legacy data import)
CREATE TABLE IF NOT EXISTS migration_errors (
    id SERIAL PRIMARY KEY,
    script_name TEXT NOT NULL,
    error_type TEXT NOT NULL,
    old_id BIGINT,
    error_message TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    script_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    details JSONB
);

CREATE TABLE IF NOT EXISTS migration_mappings (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    old_id BIGINT,
    new_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_name, old_id)
);

CREATE TABLE IF NOT EXISTS temp_clients (
    old_id BIGINT,
    first_name VARCHAR,
    last_name VARCHAR,
    middle_name VARCHAR,
    ext_name VARCHAR,
    fullname VARCHAR,
    barangay VARCHAR,
    client_type VARCHAR,
    municipal_city VARCHAR,
    province VARCHAR,
    region VARCHAR,
    full_address VARCHAR,
    account_code VARCHAR,
    contact_number VARCHAR,
    account_number VARCHAR,
    rank VARCHAR,
    monthly_pension_amount DOUBLE PRECISION,
    monthly_pension_gross DOUBLE PRECISION,
    atm_number VARCHAR,
    applicable_republic_act VARCHAR,
    unit_code VARCHAR,
    pension_type VARCHAR,
    pcni_acct_code VARCHAR,
    dob VARCHAR,
    g3_company VARCHAR,
    g3_status VARCHAR,
    market_type VARCHAR,
    product_type VARCHAR,
    dmval_code VARCHAR,
    dmval_name VARCHAR,
    dmval_amount VARCHAR,
    next_visit VARCHAR,
    last_visit VARCHAR,
    client_status VARCHAR,
    created_at TIMESTAMP,
    created_by VARCHAR,
    secondary_municipal_city VARCHAR,
    secondary_province VARCHAR,
    secondary_full_address VARCHAR,
    pan VARCHAR
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_municipality ON clients(municipality);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_psgc_id ON clients(psgc_id);
CREATE INDEX IF NOT EXISTS idx_clients_next_touchpoint ON clients(next_touchpoint) WHERE next_touchpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_account_number ON clients(account_number);
CREATE INDEX IF NOT EXISTS idx_clients_loan_type ON clients(loan_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_addresses_client_id_deleted ON addresses(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_primary_deleted ON addresses(client_id, is_primary) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id_deleted ON phone_numbers(client_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_client_id ON visits(client_id);
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_time_in ON visits(time_in);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_dial_time ON calls(dial_time DESC);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_id ON touchpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_touchpoint_number ON touchpoints(client_id, touchpoint_number);
CREATE INDEX IF NOT EXISTS idx_touchpoints_visit_id ON touchpoints(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touchpoints_call_id ON touchpoints(call_id) WHERE call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_releases_client_id ON releases(client_id);
CREATE INDEX IF NOT EXISTS idx_releases_user_id ON releases(user_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_created_at ON releases(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_scheduled_date ON itineraries(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

CREATE INDEX IF NOT EXISTS idx_targets_user_id ON targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_period ON targets(period, year, month, quarter, week);

CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_psgc_region ON psgc(region);
CREATE INDEX IF NOT EXISTS idx_psgc_province ON psgc(province);
CREATE INDEX IF NOT EXISTS idx_psgc_mun_city ON psgc(mun_city);
CREATE INDEX IF NOT EXISTS idx_psgc_barangay ON psgc(barangay);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_single_primary_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        UPDATE addresses
        SET is_primary = FALSE
        WHERE client_id = NEW.client_id
          AND id != NEW.id
          AND is_primary = TRUE
          AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_single_primary_phone()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        UPDATE phone_numbers
        SET is_primary = FALSE
        WHERE client_id = NEW.client_id
          AND id != NEW.id
          AND is_primary = TRUE
          AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_audit_log_new()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('audit_log_new', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_addresses_updated_at ON addresses;
CREATE TRIGGER trigger_update_addresses_updated_at BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_addresses_updated_at();

DROP TRIGGER IF EXISTS trigger_ensure_single_primary_address ON addresses;
CREATE TRIGGER trigger_ensure_single_primary_address AFTER INSERT OR UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_address();

DROP TRIGGER IF EXISTS trigger_ensure_single_primary_phone ON phone_numbers;
CREATE TRIGGER trigger_ensure_single_primary_phone AFTER INSERT OR UPDATE ON phone_numbers FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_phone();

DROP TRIGGER IF EXISTS update_visits_updated_at ON visits;
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_releases_updated_at ON releases;
CREATE TRIGGER update_releases_updated_at BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_error_logs_updated_at ON error_logs;
CREATE TRIGGER update_error_logs_updated_at BEFORE UPDATE ON error_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_log_insert_trigger ON audit_logs;
CREATE TRIGGER audit_log_insert_trigger AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION notify_audit_log_new();
