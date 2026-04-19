-- Migrate notes → remarks for all activity tables
-- notes was the old free-text field; remarks is the new canonical field

UPDATE touchpoints SET remarks = notes WHERE remarks IS NULL AND notes IS NOT NULL;
UPDATE calls       SET remarks = notes WHERE remarks IS NULL AND notes IS NOT NULL;
UPDATE visits      SET remarks = notes WHERE remarks IS NULL AND notes IS NOT NULL;
-- releases uses approval_notes (not notes), no backfill needed
