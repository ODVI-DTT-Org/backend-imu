# PSGC Trigram Matching Improvement

**Date:** 2026-04-20  
**Status:** Approved

## Problem

The current `/psgc/assign` endpoint uses two in-memory strategies (direct substring match, normalized keyword match) that fail on spelling variants and structural data issues. Example: `BALIUAG` (client data) does not match `Baliwag` (PSGC). Both false negatives (misses) and structural issues (combined `"Municipality Province"` in a single field) are present.

## Solution

Add `pg_trgm` trigram similarity as **Strategy 3** — a fallback that only activates for clients unmatched by the existing two strategies. No regression risk on currently-working matches.

## Database Changes

New migration (`068_add_psgc_trigram_indexes.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_psgc_mun_city_trgm ON psgc USING gin (mun_city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_psgc_province_trgm ON psgc USING gin (province gin_trgm_ops);
```

No schema changes to `clients`.

## Matching Logic

**Strategy 3 query** (runs once per `/psgc/assign` call for all unmatched clients):

```sql
SELECT DISTINCT ON (client_id)
  v.client_id,
  p.id AS psgc_id,
  p.region, p.province, p.mun_city, p.barangay,
  similarity(p.mun_city, v.municipality) AS mun_score,
  similarity(p.province, v.province) AS prov_score
FROM (VALUES ...) AS v(client_id, municipality, province)
JOIN psgc p ON similarity(p.mun_city, v.municipality) > 0.4
           AND similarity(p.province, v.province) > 0.5
ORDER BY client_id, (similarity(p.mun_city, v.municipality) + similarity(p.province, v.province)) DESC
```

Thresholds:
- Municipality: `> 0.4` — catches spelling variants like BALIUAG/Baliwag
- Province: `> 0.5` — stricter; prevents cross-province false positives

Chunked at 1000 clients per query (2000 params) to stay within PostgreSQL's 65535-parameter limit.

## Match Tags

All matches tagged with `match_type`:
- `direct_match` — existing strategy 1
- `keyword_match` — existing strategy 2
- `trigram_match` — new strategy 3

## Scope

- `src/routes/clients.ts` — add Strategy 3 to `/psgc/assign`
- `src/migrations/068_add_psgc_trigram_indexes.sql` — new migration

Out of scope: queue processor alignment, barangay-level matching, `/psgc/batch` completion.
