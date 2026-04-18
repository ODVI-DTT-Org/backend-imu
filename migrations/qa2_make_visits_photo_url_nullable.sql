-- Make visits.photo_url nullable — visits without photos should be allowed
ALTER TABLE visits ALTER COLUMN photo_url DROP NOT NULL;
