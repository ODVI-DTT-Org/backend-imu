-- Migration 1109: Add classification column to agents and seed official agent list

BEGIN;

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ORGANIC CARAVAN';

-- Drop and recreate the partial unique index to include classification awareness
-- (name still unique per active agent, classification is informational)

-- Seed official loan advisor list
-- Existing 2 rows will keep default classification (handled below)
INSERT INTO agents (name, classification, is_active) VALUES
  ('AVESTRUZ, HERMELITO',           'ORGANIC CARAVAN', true),
  ('AVILA, KENNY LYN',              'ORGANIC CARAVAN', true),
  ('BALINGIT, ANTONIO',             'ORGANIC CARAVAN', true),
  ('BOY, REY',                      'ORGANIC CARAVAN', true),
  ('BULTRON, JAYSON',               'ORGANIC CARAVAN', true),
  ('CAMACHO, WARLITO',              'ORGANIC CARAVAN', true),
  ('CRUZ, DEXTER',                  'ORGANIC CARAVAN', true),
  ('DRILON, GOLDELYN V.',           'ORGANIC CARAVAN', true),
  ('ENDONG, WARLITA',               'ORGANIC CARAVAN', true),
  ('ESPINO, ELIONOR',               'ORGANIC CARAVAN', true),
  ('FERMINO, ARLYN',                'ORGANIC CARAVAN', true),
  ('GUIASELON, NELSON',             'ORGANIC CARAVAN', true),
  ('LORENA, TEOTISMA',              'ORGANIC CARAVAN', true),
  ('MADRID, ARNALDO',               'ORGANIC CARAVAN', true),
  ('MELANIO, ROWENA',               'ORGANIC CARAVAN', true),
  ('ODI, ROLAND',                   'ORGANIC CARAVAN', true),
  ('OLIVA, TERRENCE JESON',         'ORGANIC CARAVAN', true),
  ('PIOQUINTO, PAUL MICHAEL',       'ORGANIC CARAVAN', true),
  ('QUIBAN JR, NEMECIO',            'ORGANIC CARAVAN', true),
  ('SA-AVEDRA, HERCOLITO',          'ORGANIC CARAVAN', true),
  ('SESBRENO, RAMIRO',              'ORGANIC CARAVAN', true),
  ('SOBRINO, FRED',                 'ORGANIC CARAVAN', true),
  ('SUBIDO, HAIDEE',                'ORGANIC CARAVAN', true),
  ('SUERTO JR, GUMERSINDO',         'ORGANIC CARAVAN', true),
  ('TADEO, OLIVER',                 'ORGANIC CARAVAN', true),
  ('TALUSAN, DATU ABDUL SAMIR',     'ORGANIC CARAVAN', true),
  ('AGUILAR, MARLYN',               'ORGANIC MSS', true),
  ('ARGOSINO, ROSARIO A.',          'ORGANIC MSS', true),
  ('BALANSAY, JOCEIWIN M.',         'ORGANIC MSS', true),
  ('BALLESTER, RAIN RICH',          'ORGANIC MSS', true),
  ('BARIUAN JR, ALEXANDER',         'ORGANIC MSS', true),
  ('BONILLA, CAY MARGARETTE',       'ORGANIC MSS', true),
  ('BULURAN, ROSS KELLY',           'ORGANIC MSS', true),
  ('CORONEL, GINA',                 'ORGANIC MSS', true),
  ('DE GUZMAN, MARIE ZARA JANE',    'ORGANIC MSS', true),
  ('FELIZARTA, GALLERY',            'ORGANIC MSS', true),
  ('FLORES, EMMANUEL',              'ORGANIC MSS', true),
  ('GREGORIO, HELEN',               'ORGANIC MSS', true),
  ('LEAÑO, MARIBEL',                'ORGANIC MSS', true),
  ('LLAGAS, MARL IVAN L.',          'ORGANIC MSS', true),
  ('MAGANA, MARK JOSEPH',           'ORGANIC MSS', true),
  ('NUHASAN, EMELDA HAJARAL',       'ORGANIC MSS', true),
  ('PADILLA, RONNIE',               'ORGANIC MSS', true),
  ('PAGELA, IRENE',                 'ORGANIC MSS', true),
  ('PASION, ERNALINDA E.',          'ORGANIC MSS', true),
  ('REYES, JESSIE',                 'ORGANIC MSS', true),
  ('SAGARBARRIA, JOCELYN',          'ORGANIC MSS', true),
  ('SAMDAIN, SHARNALYN A.',         'ORGANIC MSS', true),
  ('STO DOMINGO, CAROL',            'ORGANIC MSS', true),
  ('TUAZON, RICHARD',               'ORGANIC MSS', true),
  ('TUNACAO, JOSEFA',               'SP AGENTS', true),
  ('MAYOL, MERLA',                  'SP AGENTS', true),
  ('ANTONIO, SHEILA',               'SP AGENTS', true),
  ('CLARION, CORA F.',              'SP AGENTS', true),
  ('INDICO, LUZMINDA T.',           'SP AGENTS', true),
  ('JAYME, ROSEMARIE P.',           'SP AGENTS', true)
ON CONFLICT (name) WHERE is_active = true DO NOTHING;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES (
  '1109_add_classification_seed_agents',
  'completed',
  now(),
  jsonb_build_object(
    'note', 'Add classification column to agents; seed 56 official loan advisors (ORGANIC CARAVAN, ORGANIC MSS, SP AGENTS)'
  )
);

COMMIT;
