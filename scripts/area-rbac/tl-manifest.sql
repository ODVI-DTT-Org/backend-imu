-- TL assignments derived from 'CUE CARDS as of 5.5.26.xlsx' Team Summary sheet.
-- Each row: (group_id, user_id, 'team_leader').
-- The 8 TLs were identified by hand from the cue card and matched against
-- the production users table. UUIDs are pinned for reproducibility.
--
-- Verified 2026-06-07:
--   - NORTH AGUILA:    CHRISTOPHER DELA CRUZ, GODWIN RUIZ
--   - UNSTOPPABLE:     JORIS LUCILO
--   - GENERALS:        JOSEPH GARCIA
--   - EXPLORER REBORN: JONYBOY GERONCA
--   - SULTANS:         GEORGE REMOLADO, NECOLUID QUIOKELES
--   - WARRIORS:        AERON ANGELES
--
-- This file is consumed by migration 125. Do not run it standalone.

CREATE TEMP TABLE tl_manifest AS
SELECT * FROM (VALUES
  -- (group_name_lookup, person_full_name_substring)
  ('NORTH AGUILA',    'CHRISTOPHER',  'DELA CRUZ'),
  ('NORTH AGUILA',    'GODWIN',       'RUIZ'),
  ('UNSTOPPABLE',     'JORIS',        'LUCILO'),
  ('GENERALS',        'JOSEPH',       'GARCIA'),
  ('EXPLORER REBORN', 'JONYBOY',      'GERONCA'),
  ('SULTANS',         'GEORGE',       'REMOLADO'),
  ('SULTANS',         'NECOLUID',     'QUIOKELES'),
  ('WARRIORS',        'AERON',        'ANGELES')
) AS t(group_name, first_name_part, last_name_part);
