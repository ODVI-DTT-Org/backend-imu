-- Make visits.photo_url nullable — visits without photos should be allowed
ALTER TABLE visits ALTER COLUMN photo_url DROP NOT NULL;
-- Also drop the URL format check constraint so null photo_url is fully allowed
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_photo_url_check;
