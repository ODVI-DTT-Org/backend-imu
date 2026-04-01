-- ===========================================
-- IMU QA Environment Seed Data
-- ===========================================
-- This script populates the QA database with test data
-- Run this after deploying the schema to QA environment

BEGIN;

-- ===========================================
-- STEP 1: Create QA Test Users
-- ===========================================

-- Admin user (password: admin123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'admin@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'QA',
    'Admin',
    'admin',
    true
) ON CONFLICT (id) DO NOTHING;

-- Area Manager (password: manager123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'area.manager@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'John',
    'Area Manager',
    'area_manager',
    '+639001000001',
    true
) ON CONFLICT (id) DO NOTHING;

-- Assistant Area Manager (password: manager123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    'asst.manager@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Jane',
    'Assistant Manager',
    'assistant_area_manager',
    '+639001000002',
    true
) ON CONFLICT (id) DO NOTHING;

-- Caravan / Field Agent 1 (password: caravan123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active)
VALUES (
    '44444444-4444-4444-4444-444444444444',
    'caravan1@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Carlos',
    'Caravan One',
    'caravan',
    '+639101000001',
    true
) ON CONFLICT (id) DO NOTHING;

-- Caravan / Field Agent 2 (password: caravan123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    'caravan2@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Maria',
    'Caravan Two',
    'caravan',
    '+639101000002',
    true
) ON CONFLICT (id) DO NOTHING;

-- Telemarketer 1 (password: tele123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active)
VALUES (
    '66666666-6666-6666-6666-666666666666',
    'tele1@imu-qa.com',
    '$2a$10$VpGqFvLcPa7ZyFyrQflr53uLplmrFd8o',
    'Tele',
    'Operator One',
    'tele',
    '+639201000001',
    true
) ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 2: Create QA Test Agencies
-- ===========================================

INSERT INTO agencies (id, name, code, address)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'QA Test Agency 1', 'QA-AGENCY-1', '123 QA Street, Test City'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'QA Test Agency 2', 'QA-AGENCY-2', '456 QA Avenue, Test Town')
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 3: Create QA Test Clients
-- ===========================================

-- Test clients with different statuses and scenarios
INSERT INTO clients (
    id, first_name, last_name, middle_name, email, phone,
    agency_name, department, position, employment_status,
    client_type, product_type, market_type, pension_type,
    agency_id, user_id, is_starred,
    region, province, municipality, barangay,
    created_at, updated_at
) VALUES
-- Existing client with all touchpoints completed
('cccccccc-cccc-cccc-cccc-cccccccccc', 'Juan', 'Dela Cruz', 'Santos', 'juan.test@imu-qa.com', '+639123456001',
 'QA Test Agency 1', 'Retirement Division', 'Police Officer III', 'Active',
 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', true,
 'NCR', 'Metro Manila', 'Quezon City', 'Batasan Hills',
 NOW(), NOW()),

-- Potential client - first touchpoint
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Maria', 'Santos', 'Reyes', 'maria.test@imu-qa.com', '+639123456002',
 'QA Test Agency 1', 'Human Resources', 'Teacher III', 'Active',
 'POTENTIAL', 'PENSION_LOAN', 'GOVERNMENT', 'SSS',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', false,
 'NCR', 'Metro Manila', 'Quezon City', 'Commonwealth',
 NOW(), NOW()),

-- Potential client - no touchpoints yet
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Pedro', 'Garcia', 'Cruz', 'pedro.test@imu-qa.com', '+639123456003',
 'QA Test Agency 2', 'Operations', 'Traffic Enforcer', 'Active',
 'POTENTIAL', 'CASH_LOAN', 'PRIVATE', 'PRIVATE',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', false,
 'NCR', 'Metro Manila', 'Makati', 'Poblacion',
 NOW(), NOW()),

-- Interested client with 2 touchpoints
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Ana', 'Reyes', 'Mendoza', 'ana.test@imu-qa.com', '+639123456004',
 'QA Test Agency 2', 'Assessment', 'Revenue Officer', 'Active',
 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', true,
 'NCR', 'Metro Manila', 'Quezon City', 'Loyola Heights',
 NOW(), NOW()),

-- Not interested client
('10101010-1010-1010-1010-101010101010', 'Jose', 'Mendoza', 'Torres', 'jose.test@imu-qa.com', '+639123456005',
 'QA Test Agency 1', 'Retirement Division', 'Police Senior Sergeant', 'Active',
 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', false,
 'Region I', 'Pangasinan', 'Dagupan', 'Bolson',
 NOW(), NOW()),

-- Undecided client
('20202020-2020-2020-2020-202020202020', 'Rosa', 'Fernandez', 'Santos', 'rosa.test@imu-qa.com', '+639123456006',
 'QA Test Agency 2', 'Finance', 'Accountant', 'Active',
 'POTENTIAL', 'PENSION_LOAN', 'GOVERNMENT', 'SSS',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', false,
 'Region III', 'Pampanga', 'Angeles City', 'Balibago',
 NOW(), NOW()),

-- Client with loan released
('30303030-3030-3030-3030-303030303030', 'Miguel', 'Torres', 'Reyes', 'miguel.test@imu-qa.com', '+639123456007',
 'QA Test Agency 1', 'Operations', 'Supervisor', 'Active',
 'EXISTING', 'PENSION_LOAN', 'GOVERNMENT', 'GSIS',
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', true,
 'NCR', 'Metro Manila', 'Manila', 'Intramuros',
 NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 4: Create QA Test Touchpoints
-- ===========================================

-- Existing client - completed all 7 touchpoints
INSERT INTO touchpoints (
    id, client_id, user_id, touchpoint_number, type, date, reason, status,
    time_in, time_out, notes, created_at, updated_at
) VALUES
('tttttttt-tttt-tttt-tttt-tttttttttttt', 'cccccccc-cccc-cccc-cccc-cccccccccc', '44444444-4444-4444-4444-444444444444', 1, 'Visit', CURRENT_DATE - INTERVAL '28 days', 'INTERESTED', 'Completed', CURRENT_DATE - INTERVAL '28 days', CURRENT_DATE - INTERVAL '28 days' + INTERVAL '30 minutes', 'Initial visit - very interested', NOW(), NOW()),
('uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuu', 'cccccccc-cccc-cccc-cccc-cccccccccc', '66666666-6666-6666-6666-666666666666', 2, 'Call', CURRENT_DATE - INTERVAL '21 days', 'L2_RINGING', 'Interested', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE - INTERVAL '21 days' + INTERVAL '5 minutes', 'Call answered - interested in proceeding', NOW(), NOW()),
('vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv', 'cccccccc-cccc-cccc-cccc-cccccccccc', '66666666-6666-6666-6666-666666666666', 3, 'Call', CURRENT_DATE - INTERVAL '14 days', 'L1_LOAN_INQUIRY', 'Undecided', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '14 days' + INTERVAL '10 minutes', 'Called to discuss loan details - client thinking about it', NOW(), NOW()),
('wwwwwwww-wwww-wwww-wwww-wwwwwwwwwwww', 'cccccccc-cccc-cccc-cccc-cccccccccc', '44444444-4444-4444-4444-444444444444', 4, 'Visit', CURRENT_DATE - INTERVAL '7 days', 'INTERESTED', 'Completed', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days' + INTERVAL '45 minutes', 'Second visit - client ready to proceed', NOW(), NOW()),
('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'cccccccc-cccc-cccc-cccc-cccccccccc', '66666666-6666-6666-6666-666666666666', 5, 'Call', CURRENT_DATE - INTERVAL '5 days', 'L1_INTERESTED', 'Completed', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 minutes', 'Follow-up call - documents ready', NOW(), NOW()),
('yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy', 'cccccccc-cccc-cccc-cccc-cccccccccc', '66666666-6666-6666-6666-666666666666', 6, 'Call', CURRENT_DATE - INTERVAL '2 days', 'L1_FULLY_PAID', 'Completed', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE - INTERVAL '2 days' + INTERVAL '8 minutes', 'Payment verification call', NOW(), NOW()),
('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzzz', 'cccccccc-cccc-cccc-cccc-cccccccccc', '44444444-4444-4444-4444-444444444444', 7, 'Visit', CURRENT_DATE, 'COMPLETED', 'Completed', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 hour', 'Final visit - loan processing started', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Potential client - first touchpoint
INSERT INTO touchpoints (
    id, client_id, user_id, touchpoint_number, type, date, reason, status,
    notes, created_at, updated_at
) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 1, 'Visit', CURRENT_DATE, 'LOAN_INQUIRY', 'Interested', 'First visit - client interested in pension loan', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Interested client - 2 touchpoints
INSERT INTO touchpoints (
    id, client_id, user_id, touchpoint_number, type, date, reason, status,
    notes, created_at, updated_at
) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '44444444-4444-4444-4444-444444444444', 1, 'Visit', CURRENT_DATE - INTERVAL '7 days', 'INTERESTED', 'Interested', 'First visit - client very interested', NOW(), NOW()),
('cccccccc-cccc-cccc-cccc-dddddddddddd', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '66666666-6666-6666-6666-666666666666', 2, 'Call', CURRENT_DATE - INTERVAL '3 days', 'L1_INTERESTED', 'Interested', 'Follow-up call - client gathering requirements', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Not interested client - 1 touchpoint
INSERT INTO touchpoints (
    id, client_id, user_id, touchpoint_number, type, date, reason, status,
    rejection_reason, notes, created_at, updated_at
) VALUES
('dddddddd-dddd-dddd-dddd-eeeeeeeeeeee', '10101010-1010-1010-1010-101010101010', '55555555-5555-5555-5555-555555555555', 1, 'Visit', CURRENT_DATE - INTERVAL '14 days', 'NOT_INTERESTED', 'Not Interested', 'Client not interested at this time', 'Client declined - said they already have a loan', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 5: Create QA Test Itineraries
-- ===========================================

INSERT INTO itineraries (
    id, user_id, client_id, scheduled_date, scheduled_time, status, priority,
    created_by, created_at, updated_at
) VALUES
('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', '44444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', CURRENT_DATE, '09:00', 'pending', 'high', '22222222-2222-2222-2222-222222222222', NOW(), NOW()),
('jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '44444444-4444-4444-4444-444444444444', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', CURRENT_DATE, '10:30', 'pending', 'normal', '22222222-2222-2222-2222-222222222222', NOW(), NOW()),
('kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', '55555555-5555-5555-5555-555555555555', 'ffffffff-ffff-ffff-ffff-ffffffffffff', CURRENT_DATE + INTERVAL '1 day', '14:00', 'pending', 'normal', '22222222-2222-2222-2222-222222222222', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ===========================================
-- STEP 6: Create QA User Location Assignments
-- ===========================================

-- Assign Caravan 1 to Metro Manila municipalities
INSERT INTO user_locations (id, user_id, municipality_id, assigned_at, assigned_by, created_at, updated_at)
VALUES
('llllllll-llll-llll-llll-llllllllllll', '44444444-4444-4444-4444-444444444444', 'Metro Manila-Quezon City', NOW(), '22222222-2222-2222-2222-222222222222', NOW(), NOW()),
('mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmmm', '44444444-4444-4444-4444-444444444444', 'Metro Manila-Manila', NOW(), '22222222-2222-2222-2222-222222222222', NOW(), NOW()),
('nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnnn', '44444444-4444-4444-4444-444444444444', 'Metro Manila-Makati', NOW(), '22222222-2222-2222-2222-222222222222', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Assign Caravan 2 to Region I municipalities
INSERT INTO user_locations (id, user_id, municipality_id, assigned_at, assigned_by, created_at, updated_at)
VALUES
('oooooooo-oooo-oooo-oooo-oooooooooooo', '55555555-5555-5555-5555-555555555555', 'Region I-Pangasinan-Dagupan', NOW(), '22222222-2222-2222-2222-222222222222', NOW(), NOW()),
('pppppppp-pppp-pppp-pppp-pppppppppppp', '55555555-5555-5555-5555-555555555555', 'Region III-Pampanga-Angeles City', NOW(), '22222222-2222-2222-2222-222222222222', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Verify users created
SELECT 'Users' as table_name, COUNT(*) as count FROM users;

-- Verify clients created
SELECT 'Clients' as table_name, COUNT(*) as count FROM clients;

-- Verify touchpoints created
SELECT 'Touchpoints' as table_name, COUNT(*) as count FROM touchpoints;

-- Verify itineraries created
SELECT 'Itineraries' as table_name, COUNT(*) as count FROM itineraries;

-- Verify user locations created
SELECT 'User Locations' as table_name, COUNT(*) as count FROM user_locations;

COMMIT;

SELECT 'QA seed data loaded successfully!' as result;
