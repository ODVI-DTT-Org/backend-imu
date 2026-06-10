-- Migration 122: Rename addresses.street_address → addresses.full_address
--
-- The mobile PowerSync SQLite schema has always called this column `full_address`.
-- Renaming the server-side column to match eliminates the need for any aliasing
-- in sync rules and makes the intent clear: this is the human-readable computed
-- address string (e.g. "0612, Donacion, Angat, Bulacan"), not just the raw street.
-- The raw street value remains in the `street` column.

BEGIN;

ALTER TABLE addresses RENAME COLUMN street_address TO full_address;

COMMIT;
