# All-Clients API Performance Design

**Date:** 2026-05-19
**Status:** Approved
**Scope:** `GET /api/clients` backend, `hybrid-search.ts`, `clients.ts`, web frontend search, mobile search

---

## Problem

`GET /api/clients` is slow both during normal browsing and when searching, across 170k active client records. Users experience multi-second response times. Search is especially slow due to redundant query generation.

## Root Causes

1. **COUNT(\*) on every request** — a full table scan before any page data is returned.
2. **No caching** — every request hits the database; Redis is live for addresses/phones but not for the client listing.
3. **Redundant search permutations** — for a 3-word query, 6 permutations are OR'd together; `plainto_tsquery` is word-order-insensitive so all 6 return identical results. 4-word queries generate 12 permutations. This is 6–12× wasted DB work.
4. **Runtime `tsvector` recomputation for ranking** — `ts_rank_cd(to_tsvector('english', full_name), ...)` recomputes the tsvector on matched rows even though a GIN index exists for WHERE matching.
5. **`REGEXP_REPLACE` in WHERE clause for location filters** — applying a function to the column prevents any index from being used; Postgres evaluates it on every row.
6. **LEFT JOIN `client_favorites` in Phase 1** on every request for the sort-by-favorites ORDER BY clause.

---

## Architecture

Four independent layers, each solving a specific root cause:

```
Request
  ↓
[1] Redis Cache (60s TTL, keyed by sha256 of sorted query params)
       HIT  → return immediately (~5ms)
       MISS ↓
[2] Optimized DB Query
       - stored search_vector column (no runtime tsvector)
       - normalized_municipality/province columns (index-friendly)
       - single plainto_tsquery (no redundant permutations)
       - cached COUNT (separate 60s Redis key)
       ↓
[3] Store result in Redis → return to client

Search input typed
  ↓
[4] 800ms debounce (web + mobile)
       fires → API request
```

No changes to the two-phase query structure, OFFSET pagination, or response shape.

---

## Layer 1: Database Migration

One new migration file with four parts. All indexes built `CONCURRENTLY` to avoid table locks.

### Part 1 — Stored `search_vector` column

Replaces runtime `to_tsvector('english', full_name)` with an auto-maintained stored column. Uses `'simple'` config (not `'english'`) because Filipino names do not benefit from English stemming — `simple` lowercases and splits on whitespace.

```sql
ALTER TABLE clients
  ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(full_name, ''))) STORED;

CREATE INDEX CONCURRENTLY idx_clients_search_vector
  ON clients USING GIN (search_vector);
```

### Part 2 — Stored normalized location columns

Pre-computes the `REGEXP_REPLACE` normalization that currently runs on every row during location filtering. Enables B-tree index usage.

```sql
ALTER TABLE clients
  ADD COLUMN normalized_municipality TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(municipality, ''),
      '^(city of|city|municipality of|municipality)\s+', '', 'i'),
      '\s+(city|municipality)$', '', 'i')))
  ) STORED;

ALTER TABLE clients
  ADD COLUMN normalized_province TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(province, ''),
      '^(province of|province)\s+', '', 'i'),
      '\s+(province)$', '', 'i')))
  ) STORED;

CREATE INDEX CONCURRENTLY idx_clients_normalized_municipality
  ON clients (normalized_municipality);

CREATE INDEX CONCURRENTLY idx_clients_normalized_province
  ON clients (normalized_province);
```

### Part 3 — Composite ORDER BY index

Covers the default sort `(loan_released DESC, last_touchpoint_date DESC NULLS LAST)` so Phase 1 can use an index scan on 170k rows rather than a sort.

```sql
CREATE INDEX CONCURRENTLY idx_clients_default_sort
  ON clients (deleted_at, loan_released DESC, last_touchpoint_date DESC NULLS LAST);
```

### Part 4 — Drop superseded full-text indexes

The three GIN indexes created in migration 048 (`idx_clients_full_text_search`, `idx_clients_first_name_full_text`, `idx_clients_last_name_full_text`) are superseded by `idx_clients_search_vector`. Drop them to reduce index maintenance overhead on writes.

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_full_text_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_first_name_full_text;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_last_name_full_text;
```

---

## Layer 2: Search Fix (`src/utils/hybrid-search.ts`)

### Problem

`buildHybridSearchClause` for the `fulltext` branch generates all permutations of the input words (6 for 3 words, 12 for 4 words) and ORs them together. `plainto_tsquery` treats all words as AND — word order is irrelevant — so every permutation produces identical results.

### Fix

Replace the entire permutation-based fulltext branch with a single query against the stored `search_vector` column. The `trgm` branch (1–2 words) is unchanged.

```typescript
// Full-text branch (3+ words): single query, stored column
if (strategy === 'fulltext') {
  const whereClause = `${tableName}.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
  const similaritySelect = `, ts_rank_cd(${tableName}.search_vector, plainto_tsquery('simple', $${paramIndex})) as similarity_score`;
  const orderBy = `similarity_score DESC`;

  return {
    whereClause,
    params: [normalizedQuery],
    newParamIndex: paramIndex + 1,
    similaritySelect,
    orderBy,
    strategy: 'fulltext',
  };
}
```

Delete the `generatePermutations` function and the `wordCount === 3`, `wordCount === 4`, and `5+` branches — they are fully replaced by the above.

---

## Layer 3: Redis Caching (`src/routes/clients.ts`)

### Cache keys

```
v1:clients:list:{sha256(sorted serialized query params)}   → full JSON response, 60s TTL
v1:clients:count:{sha256(sorted serialized filter params)} → integer, 60s TTL
```

Count is keyed on filter params only (excludes `page`, `perPage`) so navigating pages reuses the cached count.

### Request flow

```typescript
// At the top of GET /api/clients handler:
const listCacheKey = buildListCacheKey(allQueryParams);
const cached = await cache.get(listCacheKey);
if (cached) return c.json(cached);

// Before COUNT(*) query:
const countCacheKey = buildCountCacheKey(filterParams);
const cachedCount = await cache.get<number>(countCacheKey);
const totalItems = cachedCount ?? await runCountQuery();
if (!cachedCount) await cache.set(countCacheKey, totalItems, 60);

// After building response:
await cache.set(listCacheKey, responsePayload, 60);
return c.json(responsePayload);
```

### Cache invalidation

Any route that writes to the `clients` table (create, update, delete, bulk upload) calls:

```typescript
await cache.invalidatePattern('v1:clients:list:*');
await cache.invalidatePattern('v1:clients:count:*');
```

This follows the same pattern already used for `addresses:client:*` invalidation — no new infrastructure.

### Location filter query update

The location filter in `buildClientFilters` is updated to use the stored columns:

```typescript
// Before
conditions.push(`${getNormalizeLocationSQL('c.municipality')} ILIKE ANY($${idx}::text[])`);

// After
const normalizedPatterns = values.map(v => normalizeLocationName(v).toLowerCase());
conditions.push(`c.normalized_municipality = ANY($${idx}::text[])`);
```

Exact match (`= ANY`) instead of `ILIKE ANY` — the stored column is already lowercased and trimmed.

---

## Layer 4: Debounce

### Web frontend (`src/components/ui/SearchBar.vue`)

`SearchBar.vue` accepts a `debounceMs` prop (default 300). The debounce timer lives inside the component. Update all call sites that render `<SearchBar>` for client search to pass the new value:

```vue
<!-- Before -->
<SearchBar @search="handleSearch" />

<!-- After -->
<SearchBar :debounce-ms="800" @search="handleSearch" />
```

No changes to `SearchBar.vue` itself.

### Mobile (4 files using `Debounce` from `debounce_utils.dart`)

The mobile app uses a `Debounce` utility class. Update the constructor argument in each file that triggers a client search API call:

```dart
// Before
final _searchDebounce = Debounce(milliseconds: 300);

// After
final _searchDebounce = Debounce(milliseconds: 800);
```

Files to update:
- `lib/shared/widgets/client_selector_modal.dart` (line 95)
- `lib/features/clients/presentation/pages/clients_page.dart` (line 63)
- `lib/shared/widgets/map_widgets/client_map_view.dart` (line 49)

(`call_log_page.dart` and `agencies_page.dart` also use `Debounce(milliseconds: 300)` but do not hit the all-clients API — leave those at 300ms.)

---

## Files Changed

| File | Change |
|------|--------|
| `migrations/049_clients_perf_indexes.sql` | New migration: stored columns + indexes |
| `src/utils/hybrid-search.ts` | Remove permutation branches, use stored `search_vector` |
| `src/routes/clients.ts` | Add Redis cache layer, update location filter to use stored columns, add cache invalidation to write routes (`POST /`, `PATCH /:id`, `DELETE /:id`, `POST /bulk-upload`) |
| `src/views/clients/ClientsListView.vue` (web) | Pass `:debounce-ms="800"` to `<SearchBar>` |
| `imu_flutter/lib/shared/widgets/client_selector_modal.dart` (mobile) | `Debounce(milliseconds: 300)` → 800 |
| `imu_flutter/lib/features/clients/presentation/pages/clients_page.dart` (mobile) | `Debounce(milliseconds: 300)` → 800 |
| `imu_flutter/lib/shared/widgets/map_widgets/client_map_view.dart` (mobile) | `Debounce(milliseconds: 300)` → 800 |

---

## Error Handling

- Redis unavailable: cache calls are wrapped in try/catch; on failure the request falls through to the DB query. No user-visible error.
- Migration failure: all `ALTER TABLE` and `CREATE INDEX CONCURRENTLY` statements are idempotent (`IF NOT EXISTS` / `IF EXISTS`).
- Empty search vector: `COALESCE(full_name, '')` prevents null tsvector on rows with no name.

---

## Performance Expectations

| Scenario | Before | After |
|----------|--------|-------|
| Default page load (cache hit) | 2–5s | ~5ms |
| Default page load (cache miss) | 2–5s | ~200–400ms |
| 1–2 word search | 1–3s | ~100–300ms |
| 3–4 word search | 3–8s (6–12 DB ops) | ~100–300ms (1 DB op) |
| Location filter | 1–3s (full scan) | ~50–200ms (index) |

---

## Out of Scope

- Cursor/keyset pagination (OFFSET kept as-is)
- Caching for `GET /api/clients/assigned` (separate endpoint)
- Changes to the two-phase query structure or response shape
