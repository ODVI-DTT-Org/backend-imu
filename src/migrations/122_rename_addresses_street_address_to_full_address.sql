BEGIN;
ALTER TABLE addresses RENAME COLUMN street_address TO full_address;
COMMIT;
