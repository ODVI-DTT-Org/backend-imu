-- Reset and seed 10 test clients for IMU
-- This script deletes all clients and related data, then seeds 10 new clients

-- ============================================
-- STEP 1: DELETE ALL CLIENT DATA
-- ============================================

-- Delete from child tables first (due to foreign key constraints)
DELETE FROM imu_db.public.touchpoints;
DELETE FROM imu_db.public.itineraries;  -- Must delete before clients
DELETE FROM imu_db.public.phone_numbers;
DELETE FROM imu_db.public.addresses;
DELETE FROM imu_db.public.approvals;
DELETE FROM imu_db.public.group_members;
DELETE FROM imu_db.public.clients;

-- ============================================
-- STEP 2: SEED 10 TEST CLIENTS
-- ============================================

DO $$
    DECLARE
        v_client_id UUID;
        v_address_id UUID;
        v_phone_id UUID;
    BEGIN
        -- Client 1: Juan Dela Cruz - Existing Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Juan',
            'Santos',
            'Dela Cruz',
            'EXISTING',
            'PENSION_LOAN',
            'PROVINCE',
            'SSP_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '123 Main Street',
            'Barangay 1',
            'Muntinlupa',
            'MM',
            '1800',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639171234567',
            'mobile',
            true,
            NOW()
        );

        -- Client 2: Maria Garcia - Potential Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Maria',
            'Reyes',
            'Garcia',
            'POTENTIAL',
            'PENSION_LOAN',
            'PROVINCE',
            'SSP_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '456 Rizal Avenue',
            'Barangay 2',
            'Quezon City',
            'MM',
            '1100',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639187654321',
            'mobile',
            true,
            NOW()
        );

        -- Client 3: Carlos Santos - Existing Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Carlos',
            'Tan',
            'Santos',
            'EXISTING',
            'PENSION_LOAN',
            'PROVINCE',
            'SSS_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '789 Bonifacio Street',
            'Barangay 3',
            'Manila',
            'NCR',
            '1000',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639123456789',
            'mobile',
            true,
            NOW()
        );

        -- Client 4: Ana Fernandez - Potential Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Ana',
            'Ponce',
            'Fernandez',
            'POTENTIAL',
            'PENSION_LOAN',
            'PROVINCE',
            'SSS_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '234 Makati Avenue',
            'Barangay 4',
            'Makati',
            'MM',
            '1200',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639234567890',
            'mobile',
            true,
            NOW()
        );

        -- Client 5: Jose Ramos - Existing Client with touchpoints
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Jose',
            'Aquino',
            'Ramos',
            'EXISTING',
            'PENSION_LOAN',
            'PROVINCE',
            'GSIS_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        -- Add touchpoints for this client
        INSERT INTO imu_db.public.touchpoints (id, client_id, touchpoint_number, type, date, reason, created_at, updated_at)
        VALUES
            (gen_random_uuid(), v_client_id, 1, 'visit', NOW() - INTERVAL '30 days', 'initial_visit', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 2, 'call', NOW() - INTERVAL '25 days', 'follow_up', NOW(), NOW());

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '567 Shaw Boulevard',
            'Barangay 5',
            'Mandaluyong',
            'MM',
            '1550',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639345678901',
            'mobile',
            true,
            NOW()
        );

        -- Client 6: Lorna Reyes - Potential Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Lorna',
            'Dizon',
            'Reyes',
            'POTENTIAL',
            'PENSION_LOAN',
            'PROVINCE',
            'SSP_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '890 Ortigas Avenue',
            'Barangay 6',
            'Pasig',
            'MM',
            '1600',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639456789012',
            'mobile',
            true,
            NOW()
        );

        -- Client 7: Fernando Castillo - Existing Client with multiple touchpoints
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Fernando',
            'Lim',
            'Castillo',
            'EXISTING',
            'PENSION_LOAN',
            'PROVINCE',
            'SSS_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        -- Add 3 touchpoints for this client
        INSERT INTO imu_db.public.touchpoints (id, client_id, touchpoint_number, type, date, reason, created_at, updated_at)
        VALUES
            (gen_random_uuid(), v_client_id, 1, 'visit', NOW() - INTERVAL '60 days', 'initial_visit', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 2, 'call', NOW() - INTERVAL '50 days', 'follow_up', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 3, 'call', NOW() - INTERVAL '40 days', 'follow_up', NOW(), NOW());

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '123 EDSA',
            'Barangay 7',
            'Pasay',
            'MM',
            '1300',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639567890123',
            'mobile',
            true,
            NOW()
        );

        -- Client 8: Grace Mendoza - Potential Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Grace',
            'Torres',
            'Mendoza',
            'POTENTIAL',
            'PENSION_LOAN',
            'PROVINCE',
            'GSIS_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '456 Sen Gil Street',
            'Barangay 8',
            'San Juan',
            'MM',
            '1500',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639678901234',
            'mobile',
            true,
            NOW()
        );

        -- Client 9: Antonio Villanueva - Existing Client with 5 touchpoints
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Antonio',
            'Rivera',
            'Villanueva',
            'EXISTING',
            'PENSION_LOAN',
            'PROVINCE',
            'SSP_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        -- Add 5 touchpoints for this client
        INSERT INTO imu_db.public.touchpoints (id, client_id, touchpoint_number, type, date, reason, created_at, updated_at)
        VALUES
            (gen_random_uuid(), v_client_id, 1, 'visit', NOW() - INTERVAL '90 days', 'initial_visit', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 2, 'call', NOW() - INTERVAL '80 days', 'follow_up', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 3, 'call', NOW() - INTERVAL '70 days', 'follow_up', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 4, 'visit', NOW() - INTERVAL '60 days', 'follow_up', NOW(), NOW()),
            (gen_random_uuid(), v_client_id, 5, 'call', NOW() - INTERVAL '50 days', 'follow_up', NOW(), NOW());

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '789 Paseo de Roxas',
            'Barangay 9',
            'Manila',
            'NCR',
            '1000',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639789012345',
            'mobile',
            true,
            NOW()
        );

        -- Client 10: Sofia Santiago - Potential Client
        INSERT INTO imu_db.public.clients (id, first_name, middle_name, last_name, client_type, product_type, market_type, pension_type, caravan_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Sofia',
            'Castillo',
            'Santiago',
            'POTENTIAL',
            'PENSION_LOAN',
            'PROVINCE',
            'SSP_PENSION',
            NULL,
            NOW(),
            NOW()
        ) RETURNING id INTO v_client_id;

        INSERT INTO imu_db.public.addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            'home',
            '234 Taft Avenue',
            'Barangay 10',
            'Ermita',
            'Manila',
            '1000',
            true,
            NOW()
        );

        INSERT INTO imu_db.public.phone_numbers (id, client_id, number, type, is_primary, created_at)
        VALUES (
            gen_random_uuid(),
            v_client_id,
            '+639890123456',
            'mobile',
            true,
            NOW()
        );

        RAISE NOTICE 'Successfully seeded 10 clients with addresses and phone numbers!';

    END;
$$;
