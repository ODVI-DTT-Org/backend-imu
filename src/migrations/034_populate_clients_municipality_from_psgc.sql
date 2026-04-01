-- Migration: Populate clients.municipality with random values from PSGC table
-- This updates the municipality field for clients that have NULL or empty municipality

-- ============================================
-- STEP 1: Check current state
-- ============================================

SELECT
    'Before update' as step,
    COUNT(*) as total_clients,
    COUNT(municipality) as clients_with_municipality,
    COUNT(*) - COUNT(municipality) as clients_without_municipality
FROM clients;

-- ============================================
-- STEP 2: Update clients with NULL or empty municipality
-- Uses random PSGC municipality for each client
-- ============================================

-- Update clients where municipality is NULL or empty string
UPDATE clients c
SET municipality = (
    SELECT p.mun_city
    FROM psgc p
    ORDER BY RANDOM()
    LIMIT 1
)
WHERE c.municipality IS NULL
OR c.municipality = ''
OR c.municipality IS NULL;

-- ============================================
-- STEP 3: Verify the update
-- ============================================

SELECT
    'After update' as step,
    COUNT(*) as total_clients,
    COUNT(municipality) as clients_with_municipality,
    COUNT(*) - COUNT(municipality) as clients_without_municipality,
    COUNT(DISTINCT municipality) as unique_municipalities
FROM clients;

-- ============================================
-- STEP 4: Show sample of updated municipalities
-- ============================================

SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.municipality,
    p.province,
    p.region
FROM clients c
LEFT JOIN psgc p ON p.mun_city = c.municipality
ORDER BY c.updated_at DESC
LIMIT 10;

SELECT 'Migration completed: Clients municipality populated with random PSGC values!' as result;
