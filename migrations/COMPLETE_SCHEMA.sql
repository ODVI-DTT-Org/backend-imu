-- ============================================================
-- IMU Complete Database Schema
-- ============================================================
-- This script creates the complete IMU database schema
-- including all tables, indexes, triggers, and views.
-- Verified against live qa2 database on 2026-04-19.
-- Version: 2.0
-- Changes from v1.5:
--   - Removed user_psgc_assignments (not in live DB)
--   - Added temp_clients, migration_errors, migration_log, migration_mappings
--   - addresses: added deleted_at, psgc_id, street_address, updated_at
--   - phone_numbers: removed type column, label is NOT NULL, added deleted_at/updated_at
--   - clients: added full_name, ext_name, fullname, full_address, account_code,
--     account_number, rank, monthly_pension_amount, monthly_pension_gross,
--     atm_number, applicable_republic_act, unit_code, pcni_acct_code, dob,
--     g_company, g_status, status, dmval_code, dmval_name, loan_type,
--     created_by, deleted_by; loan_released_at is TIMESTAMP (not TIMESTAMPTZ)
--   - users: added theme_color VARCHAR(7) NOT NULL, theme_mode VARCHAR(5) NOT NULL
--   - user_profiles: added UNIQUE(user_id) constraint
--   - user_locations: province and municipality are NOT NULL
--   - group_municipalities: removed deleted_at (not in live DB)
--   - approvals: expanded type CHECK, client_id is nullable
--   - touchpoints: added UNIQUE(client_id, touchpoint_number)
--   - releases: fixed constraints to match live DB
--   - error_logs: added app_version, os_version, component_stack, fingerprint,
--     last_fingerprint_seen_at, occurrences_count, platform, is_synced, device_info
--   - psgc: changed to SERIAL id, VARCHAR column types
--   - Removed PSGC views (not in live DB)
--   - Added callable_clients_mv, client_touchpoint_summary_mv materialized views
--   - Only FK constraints that exist in live DB are included
--   - Only indexes that exist in live DB are included
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
    theme_color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    theme_mode VARCHAR(5) NOT NULL DEFAULT 'light',
    CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'))
);

-- User profiles table (for PowerSync sync)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE,  -- REFERENCES users(id) ON DELETE CASCADE
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
    agency_id UUID,  -- REFERENCES agencies(id)
    is_starred BOOLEAN DEFAULT FALSE,

    -- PSGC geographic fields
    psgc_id INTEGER,
    region TEXT,
    province TEXT,
    municipality TEXT,
    barangay TEXT,

    -- UDI (Unique Document Identifier)
    udi TEXT,

    -- Loan tracking
    loan_released BOOLEAN DEFAULT FALSE,
    loan_released_at TIMESTAMP,  -- Note: TIMESTAMP not TIMESTAMPTZ
    loan_type TEXT,

    -- Touchpoint summary (denormalized for performance)
    touchpoint_summary JSONB DEFAULT '[]',
    touchpoint_number INTEGER DEFAULT 1,
    next_touchpoint VARCHAR(10) DEFAULT 'Visit',

    -- Legacy migration fields (populated from old system import)
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

-- Addresses table
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID,  -- REFERENCES clients(id) ON DELETE CASCADE
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

-- Unique active address type per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_unique_type_per_client
    ON addresses (client_id, type) WHERE (deleted_at IS NULL);

-- Phone numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID,  -- REFERENCES clients(id) ON DELETE CASCADE
    number TEXT NOT NULL,
    label TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visits table (physical visit data with GPS and odometer tracking)
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,  -- REFERENCES clients(id) ON DELETE CASCADE
    user_id UUID NOT NULL,    -- REFERENCES users(id) ON DELETE SET NULL
    type TEXT NOT NULL DEFAULT 'regular_visit',
    odometer_arrival TEXT,
    odometer_departure TEXT,
    photo_url TEXT,
    notes TEXT,       -- legacy; use remarks for new records
    remarks TEXT,
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

-- Calls table (phone call data for tele touchpoints)
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,  -- REFERENCES clients(id) ON DELETE CASCADE
    user_id UUID NOT NULL,    -- REFERENCES users(id) ON DELETE SET NULL
    phone_number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'regular_call',
    dial_time TIMESTAMPTZ,
    duration INTEGER,
    notes TEXT,       -- legacy; use remarks for new records
    remarks TEXT,
    reason TEXT,
    status TEXT,
    photo_url TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT calls_type_check CHECK (type IN ('regular_call', 'release_loan'))
);

-- Touchpoints table
CREATE TABLE IF NOT EXISTS touchpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,  -- REFERENCES clients(id) ON DELETE CASCADE
    user_id UUID NOT NULL,    -- REFERENCES users(id) ON DELETE SET NULL
    touchpoint_number INTEGER NOT NULL,
    type TEXT NOT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    visit_id UUID,  -- REFERENCES visits(id) ON DELETE SET NULL
    call_id UUID,   -- REFERENCES calls(id) ON DELETE SET NULL
    date DATE,
    status TEXT,
    next_visit_date DATE,
    notes TEXT,       -- legacy; use remarks for new records
    remarks TEXT,
    is_legacy BOOLEAN DEFAULT FALSE,
    CONSTRAINT touchpoint_has_record CHECK (visit_id IS NOT NULL OR call_id IS NOT NULL),
    CONSTRAINT touchpoints_client_id_touchpoint_number_key UNIQUE (client_id, touchpoint_number)
);

-- Releases table (loan release events)
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL,  -- REFERENCES clients(id) ON DELETE CASCADE
    user_id UUID NOT NULL,    -- REFERENCES users(id) ON DELETE SET NULL
    visit_id UUID,
    call_id UUID REFERENCES calls(id),
    product_type TEXT NOT NULL,
    loan_type TEXT NOT NULL,
    udi_number TEXT,
    approval_notes TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT releases_product_type_check
      CHECK (product_type IN ('BFP_ACTIVE', 'BFP_PENSION', 'PNP_PENSION', 'NAPOLCOM', 'BFP_STP')),
    -- Allows both null (offline-created), or exactly one of visit_id/call_id
    CONSTRAINT release_activity_check
      CHECK (
        (visit_id IS NOT NULL AND call_id IS NULL) OR
        (visit_id IS NULL AND call_id IS NOT NULL) OR
        (visit_id IS NULL AND call_id IS NULL)
      )
);

-- Itineraries table
CREATE TABLE IF NOT EXISTS itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,    -- REFERENCES users(id) ON DELETE SET NULL
    client_id UUID,  -- REFERENCES clients(id)
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    notes TEXT,
    created_by UUID,  -- REFERENCES users(id) ON DELETE SET NULL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,  -- REFERENCES users(id)
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

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    area_manager_id UUID,           -- REFERENCES users(id) ON DELETE SET NULL
    assistant_area_manager_id UUID, -- REFERENCES users(id) ON DELETE SET NULL
    caravan_id UUID,                -- REFERENCES users(id) ON DELETE SET NULL
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group members junction table
-- NOTE: client_id stores user IDs (caravan agents) — naming is legacy
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID,  -- REFERENCES groups(id) ON DELETE CASCADE
    client_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, client_id)
);

-- Group municipalities table
CREATE TABLE IF NOT EXISTS group_municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL,  -- REFERENCES groups(id) ON DELETE CASCADE
    province TEXT,
    municipality TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User locations table
CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,  -- REFERENCES users(id) ON DELETE CASCADE
    province TEXT NOT NULL,
    municipality TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID,  -- REFERENCES users(id) ON DELETE SET NULL
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    client_id UUID,  -- REFERENCES clients(id) ON DELETE CASCADE (nullable)
    user_id UUID,    -- REFERENCES users(id) ON DELETE SET NULL
    touchpoint_number INTEGER,
    role TEXT,
    reason TEXT,
    notes TEXT,
    updated_client_information JSONB,
    updated_udi TEXT,
    udi_number TEXT,
    approved_by UUID,  -- REFERENCES users(id) ON DELETE SET NULL
    approved_at TIMESTAMPTZ,
    rejected_by UUID,  -- REFERENCES users(id) ON DELETE SET NULL
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT approvals_type_check
      CHECK (type IN ('client', 'udi', 'address_add', 'phone_add', 'loan_release_v2', 'client_delete')),
    CONSTRAINT approvals_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'))
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
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reason_code, role, touchpoint_type)
);

-- Background jobs table
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
    created_by UUID  -- REFERENCES users(id) ON DELETE SET NULL
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by UUID NOT NULL,  -- REFERENCES users(id)
    entity_type TEXT,
    entity_id UUID,
    hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Report jobs table
CREATE TABLE IF NOT EXISTS report_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    params JSONB DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    created_by UUID NOT NULL,  -- REFERENCES users(id)
    file_url TEXT,
    file_size BIGINT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled reports table
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    params JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL,  -- REFERENCES users(id)
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PSGC table (Philippine Standard Geographic Code)
-- Note: id is SERIAL (auto-increment integer), not UUID
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

-- ============================================================
-- RBAC TABLES
-- ============================================================

-- Roles table
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
    role_id UUID NOT NULL,  -- REFERENCES roles(id) ON DELETE CASCADE
    permission_id UUID NOT NULL,  -- REFERENCES permissions(id) ON DELETE CASCADE
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID,  -- REFERENCES users(id)
    UNIQUE(role_id, permission_id)
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,  -- REFERENCES users(id) ON DELETE CASCADE
    role_id UUID NOT NULL,  -- REFERENCES roles(id) ON DELETE CASCADE
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID,  -- REFERENCES users(id)
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- ============================================================
-- DASHBOARD TABLES
-- ============================================================

-- Targets table
CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- REFERENCES users(id) ON DELETE CASCADE
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly')),
    year INTEGER NOT NULL,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    quarter INTEGER CHECK (quarter >= 1 AND quarter <= 4),
    week INTEGER CHECK (week >= 1 AND week <= 53),
    target_clients INTEGER DEFAULT 0 CHECK (target_clients >= 0),
    target_touchpoints INTEGER DEFAULT 0 CHECK (target_touchpoints >= 0),
    target_visits INTEGER DEFAULT 0 CHECK (target_visits >= 0),
    target_calls INTEGER DEFAULT 0 CHECK (target_calls >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID  -- REFERENCES users(id)
);

-- Feature flags table
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

-- ============================================================
-- ERROR LOGS TABLE
-- ============================================================

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
    resolved_by UUID,  -- REFERENCES users(id) ON DELETE SET NULL
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Mobile error tracking fields
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

-- ============================================================
-- MIGRATION TABLES (from legacy data import)
-- ============================================================

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

-- Temporary staging table for legacy client data import
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

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_is_starred ON clients(is_starred) WHERE is_starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_municipality ON clients(municipality);
CREATE INDEX IF NOT EXISTS idx_clients_psgc_id ON clients(psgc_id);
CREATE INDEX IF NOT EXISTS idx_clients_next_touchpoint ON clients(next_touchpoint) WHERE next_touchpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_account_number ON clients(account_number);
CREATE INDEX IF NOT EXISTS idx_clients_loan_type ON clients(loan_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_legacy_dob ON clients(dob) WHERE dob IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_by ON clients(deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_first_name_full_text ON clients USING GIN (to_tsvector('english', first_name));
CREATE INDEX IF NOT EXISTS idx_clients_last_name_full_text ON clients USING GIN (to_tsvector('english', last_name));
CREATE INDEX IF NOT EXISTS idx_clients_full_text_search ON clients USING GIN (to_tsvector('english', full_name));

-- Addresses
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_addresses_client_id_deleted ON addresses(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at ON addresses(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_label_deleted ON addresses(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_primary_deleted ON addresses(client_id, is_primary) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_addresses_psgc_id_deleted ON addresses(psgc_id) WHERE deleted_at IS NULL;

-- Phone numbers
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id ON phone_numbers(client_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_client_id_deleted ON phone_numbers(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_deleted_at ON phone_numbers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_label_deleted ON phone_numbers(label) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_primary_deleted ON phone_numbers(client_id, is_primary) WHERE deleted_at IS NULL;

-- Visits
CREATE INDEX IF NOT EXISTS idx_visits_client_id ON visits(client_id);
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_type ON visits(type);
CREATE INDEX IF NOT EXISTS idx_visits_time_in ON visits(time_in);
CREATE INDEX IF NOT EXISTS idx_visits_time_out ON visits(time_out);
CREATE INDEX IF NOT EXISTS idx_visits_client_user ON visits(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_created_at_legacy ON visits(created_at) WHERE created_at IS NOT NULL;

-- Calls
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_dial_time ON calls(dial_time DESC);
CREATE INDEX IF NOT EXISTS idx_calls_dial_time_legacy ON calls(dial_time) WHERE dial_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_client_user ON calls(client_id, user_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

-- Touchpoints
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id ON touchpoints(client_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_id ON touchpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_touchpoint_number ON touchpoints(client_id, touchpoint_number);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_id_touchpoint_number ON touchpoints(client_id, touchpoint_number);
CREATE INDEX IF NOT EXISTS idx_touchpoints_visit_id ON touchpoints(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touchpoints_call_id ON touchpoints(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touchpoints_is_legacy ON touchpoints(is_legacy);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_legacy ON touchpoints(client_id) WHERE is_legacy = TRUE;
CREATE INDEX IF NOT EXISTS idx_touchpoints_legacy_created ON touchpoints(created_at) WHERE is_legacy = TRUE;

-- Releases
CREATE INDEX IF NOT EXISTS idx_releases_client_id ON releases(client_id);
CREATE INDEX IF NOT EXISTS idx_releases_user_id ON releases(user_id);
CREATE INDEX IF NOT EXISTS idx_releases_visit_id ON releases(visit_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_releases_product_type ON releases(product_type);
CREATE INDEX IF NOT EXISTS idx_releases_loan_type ON releases(loan_type);
CREATE INDEX IF NOT EXISTS idx_releases_created_at ON releases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_approved_by ON releases(approved_by);

-- Itineraries
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_scheduled_date ON itineraries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_itineraries_client_id ON itineraries(client_id);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- Groups
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_client_id ON group_members(client_id);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_id ON group_municipalities(group_id);

-- User locations
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(user_id, province, municipality) WHERE deleted_at IS NULL;

-- Approvals
CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC);

-- Targets
CREATE INDEX IF NOT EXISTS idx_targets_user_id ON targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_period ON targets(period, year, month, quarter, week);
CREATE INDEX IF NOT EXISTS idx_targets_created_by ON targets(created_by);

-- Files
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

-- Report jobs
CREATE INDEX IF NOT EXISTS idx_report_jobs_created_by ON report_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_report_jobs_created_at ON report_jobs(created_at DESC);

-- Scheduled reports
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_created_by ON scheduled_reports(created_by);

-- PSGC
CREATE INDEX IF NOT EXISTS idx_psgc_region ON psgc(region);
CREATE INDEX IF NOT EXISTS idx_psgc_province ON psgc(province);
CREATE INDEX IF NOT EXISTS idx_psgc_mun_city ON psgc(mun_city);
CREATE INDEX IF NOT EXISTS idx_psgc_barangay ON psgc(barangay);

-- Error logs
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- RBAC
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- Migration mappings
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_mappings_lookup ON migration_mappings(table_name, old_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Addresses-specific updated_at (separate function exists in live DB)
CREATE OR REPLACE FUNCTION update_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure only one primary address per client (clears others on insert/update)
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

-- Ensure only one primary phone per client
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

-- Notify via pg_notify when a new audit log row is inserted
CREATE OR REPLACE FUNCTION notify_audit_log_new()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('audit_log_new', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update clients.touchpoint_summary when touchpoints change
CREATE OR REPLACE FUNCTION update_client_touchpoint_summary()
RETURNS TRIGGER AS $$
DECLARE
    client_touchpoints JSONB;
    tp_count INTEGER;
    next_tp_num INTEGER;
    next_tp_type VARCHAR(10);
BEGIN
    IF NEW.client_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', t.id,
            'touchpoint_number', t.touchpoint_number,
            'type', t.type,
            'date', t.date,
            'rejection_reason', COALESCE(t.rejection_reason, ''),
            'status', COALESCE(t.status, ''),
            'user_id', t.user_id,
            'visit_id', t.visit_id,
            'call_id', t.call_id,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'is_legacy', t.is_legacy
        ) ORDER BY t.touchpoint_number
    )
    INTO client_touchpoints
    FROM touchpoints t
    WHERE t.client_id = NEW.client_id;

    SELECT COALESCE(jsonb_array_length(client_touchpoints), 0)
    INTO tp_count;

    IF tp_count >= 7 THEN
        next_tp_num := 7;
        next_tp_type := NULL;
    ELSE
        next_tp_num := tp_count + 1;
        CASE next_tp_num
            WHEN 1 THEN next_tp_type := 'Visit';
            WHEN 2 THEN next_tp_type := 'Call';
            WHEN 3 THEN next_tp_type := 'Call';
            WHEN 4 THEN next_tp_type := 'Visit';
            WHEN 5 THEN next_tp_type := 'Call';
            WHEN 6 THEN next_tp_type := 'Call';
            WHEN 7 THEN next_tp_type := 'Visit';
            ELSE next_tp_type := 'Visit';
        END CASE;
    END IF;

    UPDATE clients
    SET
        touchpoint_summary = COALESCE(client_touchpoints, '[]'::jsonb),
        touchpoint_number = tp_count,
        next_touchpoint = next_tp_type,
        updated_at = NOW()
    WHERE id = NEW.client_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Refresh callable_clients_mv materialized view (returns status and duration)
CREATE OR REPLACE FUNCTION refresh_touchpoint_summary_mv()
RETURNS TABLE(status TEXT, duration_ms NUMERIC) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
BEGIN
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY client_touchpoint_summary_mv;
    end_time := clock_timestamp();
    RETURN QUERY
    SELECT
        'success' AS status,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 AS duration_ms;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_addresses_updated_at ON addresses;
CREATE TRIGGER trigger_update_addresses_updated_at
    BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_addresses_updated_at();

DROP TRIGGER IF EXISTS trigger_ensure_single_primary_address ON addresses;
CREATE TRIGGER trigger_ensure_single_primary_address
    AFTER INSERT OR UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_address();

DROP TRIGGER IF EXISTS trigger_ensure_single_primary_phone ON phone_numbers;
CREATE TRIGGER trigger_ensure_single_primary_phone
    AFTER INSERT OR UPDATE ON phone_numbers FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_phone();

DROP TRIGGER IF EXISTS update_visits_updated_at ON visits;
CREATE TRIGGER update_visits_updated_at
    BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_releases_updated_at ON releases;
CREATE TRIGGER update_releases_updated_at
    BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
CREATE TRIGGER update_itineraries_updated_at
    BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals;
CREATE TRIGGER update_approvals_updated_at
    BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_touchpoint_reasons_updated_at ON touchpoint_reasons;
CREATE TRIGGER update_touchpoint_reasons_updated_at
    BEFORE UPDATE ON touchpoint_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_locations_updated_at ON user_locations;
CREATE TRIGGER update_user_locations_updated_at
    BEFORE UPDATE ON user_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_targets_updated_at ON targets;
CREATE TRIGGER update_targets_updated_at
    BEFORE UPDATE ON targets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_error_logs_updated_at ON error_logs;
CREATE TRIGGER update_error_logs_updated_at
    BEFORE UPDATE ON error_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_log_insert_trigger ON audit_logs;
CREATE TRIGGER audit_log_insert_trigger
    AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION notify_audit_log_new();

DROP TRIGGER IF EXISTS trigger_touchpoint_insert_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_insert_update_client
    AFTER INSERT ON touchpoints FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

DROP TRIGGER IF EXISTS trigger_touchpoint_update_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_update_update_client
    AFTER UPDATE ON touchpoints FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

DROP TRIGGER IF EXISTS trigger_touchpoint_delete_update_client ON touchpoints;
CREATE TRIGGER trigger_touchpoint_delete_update_client
    AFTER DELETE ON touchpoints FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

-- ============================================================
-- MATERIALIZED VIEWS
-- ============================================================

-- Per-client touchpoint summary (used by callable_clients_mv)
CREATE MATERIALIZED VIEW IF NOT EXISTS client_touchpoint_summary_mv AS
SELECT
    c.id AS client_id,
    COALESCE(tp.total_count, 0) AS total_count,
    COALESCE(tp.completed_count, 0) AS completed_count,
    tp.last_touchpoint_type,
    tp.last_touchpoint_date,
    CASE
        WHEN COALESCE(tp.total_count, 0) >= 7 THEN NULL
        ELSE COALESCE(tp.total_count, 0) + 1
    END AS next_touchpoint_number,
    CASE
        WHEN COALESCE(tp.total_count, 0) >= 7 THEN NULL
        WHEN COALESCE(tp.total_count, 0) IN (0, 1, 4) THEN 'Visit'
        WHEN COALESCE(tp.total_count, 0) IN (2, 3, 5) THEN 'Call'
        ELSE 'Visit'
    END AS next_touchpoint_type,
    NOW() AS updated_at
FROM clients c
LEFT JOIN (
    WITH touchpoint_data AS (
        SELECT
            client_id,
            COUNT(*) AS total_count,
            COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count,
            MAX(date) AS last_touchpoint_date
        FROM touchpoints
        GROUP BY client_id
    ),
    last_touchpoint AS (
        SELECT DISTINCT
            t.client_id,
            t.type AS last_touchpoint_type,
            ROW_NUMBER() OVER (PARTITION BY t.client_id ORDER BY t.date DESC) AS rn
        FROM touchpoints t
    )
    SELECT
        td.client_id,
        td.total_count,
        td.completed_count,
        lt.last_touchpoint_type,
        td.last_touchpoint_date
    FROM touchpoint_data td
    LEFT JOIN last_touchpoint lt ON lt.client_id = td.client_id AND lt.rn = 1
) tp ON tp.client_id = c.id
WHERE c.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_touchpoint_summary_client_id
    ON client_touchpoint_summary_mv (client_id);
CREATE INDEX IF NOT EXISTS idx_client_touchpoint_summary_next_type
    ON client_touchpoint_summary_mv (next_touchpoint_type) WHERE next_touchpoint_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_touchpoint_summary_callable
    ON client_touchpoint_summary_mv (next_touchpoint_type, completed_count);

-- Callable clients (clients eligible for next touchpoint)
CREATE MATERIALIZED VIEW IF NOT EXISTS callable_clients_mv AS
SELECT
    c.id, c.first_name, c.last_name, c.middle_name, c.birth_date, c.email,
    c.phone, c.agency_name, c.department, c.position, c.employment_status,
    c.payroll_date, c.tenure, c.client_type, c.product_type, c.market_type,
    c.pension_type, c.loan_type, c.pan, c.facebook_link, c.remarks,
    c.agency_id, c.psgc_id, c.region, c.province, c.municipality, c.barangay,
    c.udi, c.is_starred, c.loan_released, c.created_at, c.updated_at,
    c.created_by, c.deleted_by, c.deleted_at,
    mv.completed_count,
    mv.total_count,
    mv.next_touchpoint_type,
    mv.next_touchpoint_number,
    t.type AS last_touchpoint_type,
    t.user_id AS last_touchpoint_user_id,
    t.date AS last_touchpoint_date
FROM clients c
JOIN client_touchpoint_summary_mv mv ON mv.client_id = c.id
LEFT JOIN LATERAL (
    SELECT type, user_id, date
    FROM touchpoints
    WHERE client_id = c.id
    ORDER BY date DESC
    LIMIT 1
) t ON TRUE
WHERE c.deleted_at IS NULL
  AND (
    (mv.completed_count < 7 AND NOT c.loan_released) OR
    (mv.completed_count = 0 AND NOT c.loan_released)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_callable_mv_id ON callable_clients_mv (id);
CREATE INDEX IF NOT EXISTS idx_callable_mv_next_type
    ON callable_clients_mv (next_touchpoint_type, created_at DESC) WHERE next_touchpoint_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callable_mv_area
    ON callable_clients_mv (province, municipality, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_callable_mv_area_type
    ON callable_clients_mv (next_touchpoint_type, province, municipality, created_at DESC)
    WHERE next_touchpoint_type IS NOT NULL;

-- ============================================================
-- RBAC SYSTEM
-- ============================================================

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

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard statistics and metrics'),
    ('dashboard', 'read_performance', NULL, 'View performance metrics and analytics')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('approvals', 'read', NULL, 'View all approval requests'),
    ('approvals', 'create', NULL, 'Create approval requests'),
    ('approvals', 'approve', NULL, 'Approve requests'),
    ('approvals', 'reject', NULL, 'Reject requests'),
    ('approvals', 'update', NULL, 'Update approval details'),
    ('approvals', 'delete', NULL, 'Delete approval requests')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('error_logs', 'read', NULL, 'View all error logs'),
    ('error_logs', 'resolve', NULL, 'Resolve error logs'),
    ('error_logs', 'delete', NULL, 'Delete error logs')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Assign all permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Area Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('users', 'clients', 'touchpoints', 'itineraries', 'reports', 'groups', 'targets', 'attendance', 'audit_logs', 'dashboard', 'approvals')
    AND (p.constraint_name IS NULL OR p.constraint_name IN ('area', 'all'))
    AND p.action NOT IN ('delete', 'configure', 'system')
)
WHERE r.slug = 'area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assistant Area Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('clients', 'touchpoints', 'itineraries', 'reports', 'targets', 'attendance', 'dashboard')
    AND (p.constraint_name IN ('area', 'own') OR p.action = 'read')
    AND p.action NOT IN ('delete')
)
WHERE r.slug = 'assistant_area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Caravan
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

-- Tele
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'clients' AND p.action = 'read' AND p.constraint_name = 'own')
    OR (p.resource = 'clients' AND p.action = 'update' AND p.constraint_name = 'own')
    OR (p.resource = 'touchpoints' AND p.action = 'create' AND p.constraint_name = 'call')
    OR (p.resource = 'touchpoints' AND p.action IN ('read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'targets' AND p.action = 'read' AND p.constraint_name = 'own')
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Migrate existing users to RBAC
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u
JOIN roles r ON r.slug = u.role
LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = r.id
WHERE ur.id IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ============================================================
-- VIEWS
-- ============================================================

-- User permissions flattened view (only regular view in live DB)
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

-- ============================================================
-- SEED DATA: Touchpoint Reasons
-- ============================================================

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

INSERT INTO touchpoint_reasons (reason_code, label, touchpoint_type, role, category, sort_order) VALUES
    ('L1_BORROWED', 'LEVEL 1 FAVORABLE - BORROWED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 1),
    ('L1_FULLY_PAID', 'LEVEL 1 FAVORABLE - FULLYPAID', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 2),
    ('L1_INTERESTED', 'LEVEL 1 FAVORABLE - INTERESTED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 3),
    ('L1_LOAN_INQUIRY', 'LEVEL 1 FAVORABLE - LOAN INQUIRY / FOR VERIFICATION', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 4),
    ('L1_UNDECIDED', 'LEVEL 1 FAVORABLE - UNDECIDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 5),
    ('L1_WILL_CALL_IF_NEEDED', 'LEVEL 1 FAVORABLE - WILL CALL IF NEEDED', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 6),
    ('L1_ENDORSED_TO_CARAVAN', 'LEVEL 1 FAVORABLE - ENDORSED TO CARAVAN', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 7),
    ('L1_NOT_IN_LIST', 'LEVEL 1 FAVORABLE - NOT IN THE LIST', 'Call', 'tele', 'LEVEL 1 FAVORABLE', 8),
    ('L2_NOT_AROUND', 'LEVEL 2 FAVORABLE - NOT AROUND', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 9),
    ('L2_RINGING', 'LEVEL 2 FAVORABLE - RINGING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 10),
    ('L2_LINE_BUSY', 'LEVEL 2 FAVORABLE - LINE BUSY', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 11),
    ('L2_EXISTING_CLIENT', 'LEVEL 2 FAVORABLE - EXISTING CLIENT', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 12),
    ('L2_WITH_OTHER_LENDING', 'LEVEL 2 FAVORABLE - WITH OTHER LENDING', 'Call', 'tele', 'LEVEL 2 FAVORABLE', 13),
    ('L1_NOT_INTERESTED', 'LEVEL 1 UNFAVORABLE - NOT INTERESTED', 'Call', 'tele', 'LEVEL 1 UNFAVORABLE', 14),
    ('L2_INCORRECT_NUMBER', 'LEVEL 2 UNFAVORABLE - INCORRECT / INCOMPLETE NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 15),
    ('L2_WRONG_NUMBER', 'LEVEL 2 UNFAVORABLE - WRONG NUMBER', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 16),
    ('L2_DROPCALL', 'LEVEL 2 UNFAVORABLE - DROPCALL', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 17),
    ('L2_CANNOT_BE_REACHED', 'LEVEL 2 UNFAVORABLE - CANNOT BE REACH / UNATTENDED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 18),
    ('L2_NOT_YET_IN_SERVICE', 'LEVEL 2 UNFAVORABLE - NOT YET IN SERVICE / CANNOT BE COMPLETED IF DIALLED', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 19),
    ('L2_FAMILY_DECLINED', 'LEVEL 2 UNFAVORAVLE - INTERESTED, BUT DECLINED DUE TO FAMILY''S DECISION', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 20),
    ('L2_ABROAD', 'LEVEL 2 UNFAVORABLE - ABROAD', 'Call', 'tele', 'LEVEL 2 UNFAVORABLE', 21),
    ('L3_NOT_QUALIFIED', 'LEVEL 3 UNFAVORABLE - NOT QUALIFIED - LOW / NEGATIVE LOAN PROCEEDS', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 22),
    ('L3_DISQUALIFIED', 'LEVEL 3 UNFAVORABLE - DISQUALIFIED - HEALTH CONDITION / OVERAGE', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 23),
    ('L3_BACKED_OUT', 'LEVEL 3 UNFAVORABLE - BACKED OUT', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 24),
    ('L3_DISAPPROVED', 'LEVEL 3 UNFAVORABLE - DISAPPROVED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 25),
    ('L3_DECEASED', 'LEVEL 3 UNFAVORABLE - DECEASED', 'Call', 'tele', 'LEVEL 3 UNFAVORABLE', 26)
ON CONFLICT (reason_code, role, touchpoint_type) DO NOTHING;

-- ============================================================
-- POWERSYNC PUBLICATION SETUP
-- ============================================================

DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE
    clients,
    addresses,
    phone_numbers,
    visits,
    calls,
    itineraries,
    touchpoints,
    releases,
    groups,
    targets,
    attendance,
    user_profiles,
    user_locations,
    approvals,
    psgc,
    touchpoint_reasons;

COMMIT;
