-- ============================================================================
-- IMU Production Schema - Missing Indexes from QA2
-- ============================================================================
-- This script adds 53 missing indexes identified from QA2 schema comparison
--
-- PREREQUISITE: Run 999_production_schema.sql and 1000_production_schema_fixes.sql first
--
-- Date: 2026-04-10
-- Purpose: Add all missing indexes from QA2 schema to match production
-- Total Missing Indexes: 53
-- Note: user_psgc_assignments table excluded (not in production schema)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CLIENTS TABLE INDEXES (8 missing indexes)
-- ============================================================================

-- Geographic indexes
CREATE INDEX IF NOT EXISTS idx_clients_region ON clients(region);
CREATE INDEX IF NOT EXISTS idx_clients_province ON clients(province);
CREATE INDEX IF NOT EXISTS idx_clients_barangay ON clients(barangay);

-- Business logic indexes
CREATE INDEX IF NOT EXISTS idx_clients_udi ON clients(udi);
CREATE INDEX IF NOT EXISTS idx_clients_loan_released ON clients(loan_released);
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clients_user_type ON clients(user_id, client_type);
CREATE INDEX IF NOT EXISTS idx_clients_municipality_loan ON clients(municipality, loan_released);

-- ============================================================================
-- 2. ADDRESSES & PHONES INDEXES (2 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_addresses_is_primary ON addresses(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_primary ON phone_numbers(is_primary) WHERE is_primary = true;

-- ============================================================================
-- 3. TOUCHPOINTS INDEXES (3 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_touchpoints_client_type ON touchpoints(client_id, type);
CREATE INDEX IF NOT EXISTS idx_touchpoints_client_number_type ON touchpoints(client_id, touchpoint_number, type);
CREATE INDEX IF NOT EXISTS idx_touchpoints_created_at ON touchpoints(created_at DESC);

-- ============================================================================
-- 4. VISITS INDEXES (2 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_visits_time_in ON visits(time_in DESC);
CREATE INDEX IF NOT EXISTS idx_visits_time_out ON visits(time_out DESC);

-- ============================================================================
-- 5. ITINERARIES INDEXES (3 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_itineraries_created_by ON itineraries(created_by);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_status_date ON itineraries(user_id, status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_itineraries_client_status ON itineraries(client_id, status);

-- ============================================================================
-- 6. GROUPS INDEXES (3 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_groups_area_manager_id ON groups(area_manager_id);
CREATE INDEX IF NOT EXISTS idx_groups_assistant_area_manager_id ON groups(assistant_area_manager_id);
CREATE INDEX IF NOT EXISTS idx_groups_caravan_id ON groups(caravan_id);

-- ============================================================================
-- 7. GROUP MUNICIPALITIES INDEXES (3 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_group_municipalities_province ON group_municipalities(province);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_municipality ON group_municipalities(municipality);
CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_province ON group_municipalities(group_id, province) WHERE deleted_at IS NULL;

-- ============================================================================
-- 8. USER LOCATIONS INDEXES (5 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_province ON user_locations(province);
CREATE INDEX IF NOT EXISTS idx_user_locations_municipality ON user_locations(municipality);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_province ON user_locations(user_id, province) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_locations_user_province_municipality ON user_locations(user_id, province, municipality) WHERE deleted_at IS NULL;

-- ============================================================================
-- 9. APPROVALS INDEXES (4 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_approvals_created_at ON approvals(created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_updated_client_information ON approvals USING GIN(updated_client_information);
CREATE INDEX IF NOT EXISTS idx_approvals_updated_udi ON approvals(updated_udi);
CREATE INDEX IF NOT EXISTS idx_approvals_udi_number ON approvals(udi_number);

-- ============================================================================
-- 10. TOUCHPOINT REASONS INDEXES (4 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role ON touchpoint_reasons(role);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_touchpoint_type ON touchpoint_reasons(touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_role_type ON touchpoint_reasons(role, touchpoint_type);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_active ON touchpoint_reasons(is_active) WHERE is_active = true;

-- ============================================================================
-- 11. BACKGROUND JOBS INDEXES (3 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status ON background_jobs(type, status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_by ON background_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at DESC);

-- ============================================================================
-- 12. PSGC INDEXES (1 missing index)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_psgc_zip_code ON psgc(zip_code);

-- ============================================================================
-- 13. TARGETS INDEXES (1 missing index)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_targets_user_period ON targets(user_id, period, year, COALESCE(month, 0), COALESCE(week, 0));

-- ============================================================================
-- 14. AUDIT LOGS ADDITIONAL INDEXES (2 missing indexes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC);

-- ============================================================================
-- 15. INDEXES FOR TABLES THAT MAY NOT EXIST YET
-- ============================================================================

-- Error logs indexes (if error_logs table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
        CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);
        CREATE INDEX IF NOT EXISTS idx_error_logs_status_code ON error_logs(status_code);
        CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
        CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_timestamp ON error_logs(resolved, created_at DESC);
    END IF;
END $$;

-- Feature flags indexes (if feature_flags table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feature_flags' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled) WHERE enabled = true;
        CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
        CREATE INDEX IF NOT EXISTS idx_feature_flags_environment ON feature_flags USING GIN(environment_whitelist);
        CREATE INDEX IF NOT EXISTS idx_feature_flags_role ON feature_flags USING GIN(role_whitelist);
    END IF;
END $$;

-- Action items indexes (if action_items table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'action_items' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_action_items_priority ON action_items(priority);
        CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to ON action_items(assigned_to);
    END IF;
END $$;

-- ============================================================================
-- 16. SCHEMA VERSION UPDATE
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations' AND table_schema = 'public') THEN
        INSERT INTO schema_migrations (version, description, checksum)
        VALUES (
            '1.0.2',
            'Added 53 missing indexes from QA2 schema comparison',
            md5(random()::text)
        )
        ON CONFLICT (version) DO UPDATE SET
            description = EXCLUDED.description,
            checksum = EXCLUDED.checksum;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these to verify the indexes were created:

-- Check total index count
-- SELECT COUNT(*) as total_indexes FROM pg_indexes WHERE schemaname = 'public';

-- Check indexes by table
-- SELECT
--     tablename,
--     COUNT(*) as index_count
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- GROUP BY tablename
-- ORDER BY index_count DESC;

-- Check specific indexes
-- SELECT
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total indexes added: 53
-- Tables affected: 14
-- New tables created: 0
-- Foreign keys added: 0
-- Triggers added: 0
-- ============================================================================

-- ============================================================================
-- END OF MISSING INDEXES MIGRATION
-- ============================================================================
