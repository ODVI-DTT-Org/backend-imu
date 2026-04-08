-- Migration 050: Update PowerSync publication with new tables

-- Drop and recreate publication with new tables
DROP PUBLICATION IF EXISTS powersync;

CREATE PUBLICATION powersync FOR TABLE
    -- Core data tables
    clients,
    itineraries,
    touchpoints,
    visits,      -- NEW
    calls,       -- NEW
    releases,    -- NEW

    -- Related data tables
    addresses,
    phone_numbers,

    -- User profile table
    user_profiles,

    -- User location assignments
    user_locations,

    -- Approvals
    approvals,

    -- PSGC geographic data
    psgc,

    -- Touchpoint reasons
    touchpoint_reasons;
