-- Set a default empty string for any existing null photo_url rows, then add NOT NULL constraint
UPDATE visits SET photo_url = '' WHERE photo_url IS NULL;
ALTER TABLE visits ALTER COLUMN photo_url SET NOT NULL;
