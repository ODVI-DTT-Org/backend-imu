-- Migration: 057_add_powersync_addresses_phones.sql
-- Description: Add PowerSync publication for addresses and phone_numbers

-- Drop existing publication if exists (for idempotency)
DROP PUBLICATION IF EXISTS powersync_addresses;
DROP PUBLICATION IF EXISTS powersync_phone_numbers;
DROP PUBLICATION IF EXISTS powersync_psgc;

-- Create publication for addresses
CREATE PUBLICATION powersync_addresses FOR TABLE addresses
  WHERE (deleted_at IS NULL);

-- Create publication for phone_numbers
CREATE PUBLICATION powersync_phone_numbers FOR TABLE phone_numbers
  WHERE (deleted_at IS NULL);

-- Create publication for PSGC (geographic codes)
-- CRITICAL: Mobile app needs PSGC data to display addresses properly
CREATE PUBLICATION powersync_psgc FOR TABLE psgc;

-- Grant permissions to powersync user
GRANT SELECT ON addresses TO powersync_user;
GRANT SELECT ON phone_numbers TO powersync_user;
GRANT SELECT ON psgc TO powersync_user;

-- Comment
COMMENT ON PUBLICATION powersync_addresses IS 'PowerSync publication for addresses table (active records only)';
COMMENT ON PUBLICATION powersync_phone_numbers IS 'PowerSync publication for phone_numbers table (active records only)';
COMMENT ON PUBLICATION powersync_psgc IS 'PowerSync publication for PSGC geographic codes table (required for address display)';

-- ROLLBACK
-- To rollback this migration, run:
-- REVOKE SELECT ON psgc FROM powersync_user;
-- REVOKE SELECT ON phone_numbers FROM powersync_user;
-- REVOKE SELECT ON addresses FROM powersync_user;
-- DROP PUBLICATION IF EXISTS powersync_psgc;
-- DROP PUBLICATION IF EXISTS powersync_phone_numbers;
-- DROP PUBLICATION IF EXISTS powersync_addresses;
