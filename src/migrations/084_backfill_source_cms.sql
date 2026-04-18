-- Backfill existing rows: records without a source came from CMS (web app)
UPDATE visits SET source = 'CMS' WHERE source IS NULL OR source = '';
UPDATE calls SET source = 'CMS' WHERE source IS NULL OR source = '';
