# All-Clients API Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GET /api/clients` fast for both browsing and search on 170k records by fixing redundant search permutations, adding DB indexes, caching responses in Redis, and increasing debounce delay on both frontends.

**Architecture:** Four independent layers — a DB migration that adds stored computed columns and indexes, a search utility fix that eliminates redundant permutation queries, a Redis caching layer on the list route, and a debounce config change on web and mobile frontends.

**Tech Stack:** Node.js/TypeScript (Hono), PostgreSQL, ioredis, Vue 3, Flutter/Dart

---

## Implementation Status — 2026-05-19

**Backend implemented**
- Created/verified `migrations/050_clients_perf_indexes.sql`.
- Applied the migration to QA4. Verified generated columns `search_vector`, `normalized_municipality`, and `normalized_province` exist.
- Verified indexes `idx_clients_search_vector`, `idx_clients_normalized_municipality`, `idx_clients_normalized_province`, and `idx_clients_default_sort` exist.
- Replaced full-text search permutations with one stored `search_vector @@ plainto_tsquery('simple', $n)` clause.
- Added `src/utils/__tests__/hybrid-search.test.ts` and confirmed the red/green behavior.
- Updated `buildClientFilters` to use exact equality on stored normalized location columns.
- Added 60-second Redis list/count caching for `GET /api/clients`.
- Added cache invalidation on client create/update/patch/delete/bulk-create.
- Also invalidated on address, phone, and favorite changes because the cached list response includes embedded addresses/phones and per-user favorite state/order.

**Frontend implemented**
- Web: `FilterToolbar` now accepts `searchDebounceMs`; `ClientsListView` passes `800` for all-clients search.
- Mobile: all three planned all-clients search entry points now use `Debounce(milliseconds: 800)`.

**Verification**
- `npm_config_engine_strict=false pnpm test src/utils/__tests__/hybrid-search.test.ts --reporter=verbose` passed: 3/3 tests.
- `npm_config_engine_strict=false pnpm build` passed for `backend-imu`.
- `pnpm type-check` in `frontend-web-imu` still fails on pre-existing repo-wide TypeScript errors; the output does not report the new `searchDebounceMs` prop as an error.
- `flutter analyze ...` could not run in this shell because `flutter` is not installed.
- No commits were created because the backend, web, and mobile repositories already had unrelated local changes.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `migrations/050_clients_perf_indexes.sql` | Create | Stored columns + indexes |
| `src/utils/hybrid-search.ts` | Modify | Remove permutation branches |
| `src/routes/clients.ts` | Modify | Location filter + Redis caching + write-route invalidation |
| `frontend-web-imu/src/views/clients/ClientsListView.vue` | Modify | Pass `:debounce-ms="800"` to `<SearchBar>` |
| `imu_flutter/lib/shared/widgets/client_selector_modal.dart` | Modify | `Debounce(milliseconds: 800)` |
| `imu_flutter/lib/features/clients/presentation/pages/clients_page.dart` | Modify | `Debounce(milliseconds: 800)` |
| `imu_flutter/lib/shared/widgets/map_widgets/client_map_view.dart` | Modify | `Debounce(milliseconds: 800)` |

---

## Task 1: Database Migration — Stored Columns + Indexes

**Files:**
- Create: `migrations/050_clients_perf_indexes.sql`

**Background:** PostgreSQL `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Run this migration manually (not via a transaction-wrapping migration runner). The `GENERATED ALWAYS AS ... STORED` syntax requires PostgreSQL 12+ — DigitalOcean managed PostgreSQL supports this.

**DB connection (qa4 environment):**
```
postgresql://doadmin:<REDACTED>@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa4?sslmode=require
```

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/050_clients_perf_indexes.sql
-- Performance: stored computed columns + indexes for all-clients API
-- Run MANUALLY (not in a transaction) because CONCURRENTLY indexes require autocommit

-- 1. Stored search_vector column (replaces runtime to_tsvector in search)
-- Uses 'simple' config: Filipino names don't benefit from English stemming
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(full_name, ''))) STORED;

-- 2. GIN index on search_vector for full-text WHERE + ts_rank_cd
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_search_vector
  ON clients USING GIN (search_vector);

-- 3. Normalized municipality (pre-computed, enables B-tree index on location filter)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS normalized_municipality TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(municipality, ''),
      '^(city of|city|municipality of|municipality)\s+', '', 'i'),
      '\s+(city|municipality)$', '', 'i')))
  ) STORED;

-- 4. Normalized province
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS normalized_province TEXT
  GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(
      COALESCE(province, ''),
      '^(province of|province)\s+', '', 'i'),
      '\s+(province)$', '', 'i')))
  ) STORED;

-- 5. B-tree indexes for location filter equality lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_municipality
  ON clients (normalized_municipality);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_normalized_province
  ON clients (normalized_province);

-- 6. Composite index covering the default ORDER BY (deleted_at, loan_released DESC, last_touchpoint_date DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_default_sort
  ON clients (deleted_at, loan_released DESC, last_touchpoint_date DESC NULLS LAST);

-- 7. Drop the three superseded GIN indexes from migration 048
--    (superseded by idx_clients_search_vector)
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_full_text_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_first_name_full_text;
DROP INDEX CONCURRENTLY IF EXISTS idx_clients_last_name_full_text;
```

- [ ] **Step 2: Run the migration against qa4**

```bash
psql "postgresql://doadmin:<REDACTED>@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa4?sslmode=require" \
  -f migrations/050_clients_perf_indexes.sql
```

Expected output: lines like `ALTER TABLE`, `CREATE INDEX`, `DROP INDEX` with no `ERROR` lines.

- [ ] **Step 3: Verify the columns and indexes exist**

```bash
psql "postgresql://doadmin:<REDACTED>@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa4?sslmode=require" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND column_name IN ('search_vector','normalized_municipality','normalized_province') ORDER BY column_name;"
```

Expected: 3 rows — `normalized_municipality`, `normalized_province`, `search_vector`

```bash
psql "postgresql://doadmin:<REDACTED>@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa4?sslmode=require" \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='clients' AND indexname IN ('idx_clients_search_vector','idx_clients_normalized_municipality','idx_clients_normalized_province','idx_clients_default_sort') ORDER BY indexname;"
```

Expected: 4 rows.

- [ ] **Step 4: Spot-check stored values**

```bash
psql "postgresql://doadmin:<REDACTED>@imu-do-user-21438450-0.j.db.ondigitalocean.com:25060/qa4?sslmode=require" \
  -c "SELECT full_name, search_vector::text, municipality, normalized_municipality, province, normalized_province FROM clients WHERE deleted_at IS NULL LIMIT 5;"
```

Verify: `search_vector` contains tokenized words from `full_name`; `normalized_municipality` is lowercase with "City of"/"Municipality of" stripped.

- [ ] **Step 5: Commit**

```bash
git add migrations/050_clients_perf_indexes.sql
git commit -m "feat: add stored columns and performance indexes for clients API"
```

---

## Task 2: Fix Hybrid Search — Remove Redundant Permutations

**Files:**
- Modify: `src/utils/hybrid-search.ts`

**Background:** `plainto_tsquery('simple', 'word1 word2 word3')` is equivalent to `word1 & word2 & word3` — word order is irrelevant. The current code generates 6 permutations for 3-word queries (12 for 4-word) and ORs them, but they all return identical rows. Replace the entire `fulltext` branch with a single query using the stored `search_vector` column.

- [ ] **Step 1: Run existing hybrid-search tests to establish baseline**

```bash
cd /home/claude-team/loi/imu/backend-imu
pnpm test src/utils/__tests__/search-normalizer.test.ts --reporter=verbose 2>/dev/null || echo "No hybrid-search tests found"
```

Note the output — if there are no `hybrid-search` specific tests, the next step adds one.

- [ ] **Step 2: Add a test for the fulltext branch**

Open `src/utils/__tests__/search-normalizer.test.ts` (or create `src/utils/__tests__/hybrid-search.test.ts` if it doesn't exist) and add:

```typescript
import { describe, it, expect } from 'vitest';
import { parseHybridSearchQuery, buildHybridSearchClause } from '../hybrid-search.js';

describe('buildHybridSearchClause - fulltext branch', () => {
  it('returns a single WHERE clause and single param for 3-word query', () => {
    const parsed = parseHybridSearchQuery('juan dela cruz');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);
    // Must be a single query — no ORs from permutations
    expect(result.params).toHaveLength(1);
    expect(result.whereClause).toContain('search_vector');
    expect(result.whereClause).toContain('plainto_tsquery');
    expect(result.whereClause).not.toContain('OR');
    expect(result.newParamIndex).toBe(2);
  });

  it('returns a single WHERE clause for 4-word query', () => {
    const parsed = parseHybridSearchQuery('juan santos dela cruz');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);
    expect(result.params).toHaveLength(1);
    expect(result.whereClause).not.toContain('OR');
  });

  it('trgm branch is unchanged for 1-word query', () => {
    const parsed = parseHybridSearchQuery('juan');
    expect(parsed.strategy).toBe('trgm');

    const result = buildHybridSearchClause(parsed, 1);
    expect(result.whereClause).toContain('full_name %');
    expect(result.params).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the new test to confirm it fails**

```bash
pnpm test src/utils/__tests__/hybrid-search.test.ts --reporter=verbose
```

Expected: FAIL — `result.params` will have 6 items (not 1) for the 3-word case.

- [ ] **Step 4: Replace the fulltext branch in `hybrid-search.ts`**

Open `src/utils/hybrid-search.ts`. Find the section starting at the comment `// Enhanced full-text search for 3+ words with permutation support` (around line 125) through the end of the `buildHybridSearchClause` function body. Replace everything from that comment through the closing brace of the function with:

```typescript
  // Full-text search for 3+ words: single plainto_tsquery against stored search_vector.
  // plainto_tsquery is word-order-insensitive (word1 & word2 & word3), so permutations
  // of the same words return identical rows — the previous permutation loop was pure waste.
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

Also delete the `generatePermutations` helper function (lines ~66–84) — it is no longer called.

- [ ] **Step 5: Run the tests — all should pass**

```bash
pnpm test src/utils/__tests__/hybrid-search.test.ts --reporter=verbose
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/hybrid-search.ts src/utils/__tests__/hybrid-search.test.ts
git commit -m "perf: remove redundant permutation loop in full-text search (6-12 ops → 1)"
```

---

## Task 3: Update Location Filter to Use Stored Columns

**Files:**
- Modify: `src/routes/clients.ts` (function `buildClientFilters`, ~line 110–138)

**Background:** The current `municipality` and `province` filters apply `REGEXP_REPLACE(c.municipality, ...) ILIKE ANY(...)` which prevents index use. The new stored `normalized_municipality` and `normalized_province` columns are pre-lowercased and stripped — use exact equality `= ANY(...)` against them.

- [ ] **Step 1: Find and update the municipality block**

In `buildClientFilters`, find the block that pushes the municipality condition (around line 110):

```typescript
// BEFORE — remove this block:
const normalizedPatterns = values
  .map(v => normalizeLocationName(v))
  .filter(v => v.length > 0)
  .map(v => `%${v}%`);
conditions.push(`${getNormalizeLocationSQL('c.municipality')} ILIKE ANY($${idx}::text[])`);
params.push(normalizedPatterns);
idx++;
```

Replace with:

```typescript
// AFTER — exact match on stored normalized column
const normalizedValues = values
  .map(v => normalizeLocationName(v).toLowerCase())
  .filter(v => v.length > 0);
if (normalizedValues.length > 0) {
  conditions.push(`c.normalized_municipality = ANY($${idx}::text[])`);
  params.push(normalizedValues);
  idx++;
}
```

- [ ] **Step 2: Find and update the province block**

Find the province block (a few lines below municipality, same pattern):

```typescript
// BEFORE — remove this:
conditions.push(`${getNormalizeLocationSQL('c.province')} ILIKE ANY($${idx}::text[])`);
params.push(normalizedPatterns);
idx++;
```

Replace with:

```typescript
// AFTER
const normalizedProvinceValues = values
  .map(v => normalizeLocationName(v).toLowerCase())
  .filter(v => v.length > 0);
if (normalizedProvinceValues.length > 0) {
  conditions.push(`c.normalized_province = ANY($${idx}::text[])`);
  params.push(normalizedProvinceValues);
  idx++;
}
```

- [ ] **Step 3: Verify the server starts without errors**

```bash
cd /home/claude-team/loi/imu/backend-imu
pnpm dev &
sleep 3
curl -s http://localhost:3000/api/health | grep -i ok
kill %1
```

Expected: health check returns ok.

- [ ] **Step 4: Commit**

```bash
git add src/routes/clients.ts
git commit -m "perf: use stored normalized_municipality/province columns for location filter"
```

---

## Task 4: Add Redis Caching to GET /api/clients

**Files:**
- Modify: `src/routes/clients.ts` — `GET /` handler (~line 352)

**Background:** `getCacheService()` returns the singleton `RedisCacheService`. It has `get<T>(key)`, `set<T>(key, value, ttl?)`, and `delPattern(pattern)`. The import is already in `addresses.ts` as a reference. Add cache check/set around the list and count queries. Use `crypto.createHash` (Node built-in) to hash query params into a cache key.

- [ ] **Step 1: Add the import for crypto at the top of `clients.ts`**

Find the existing imports at the top of `src/routes/clients.ts`. Add after the existing imports:

```typescript
import { createHash } from 'crypto';
import { getCacheService } from '../services/cache/redis-cache.js';
```

- [ ] **Step 2: Add cache key helper functions**

Add these two helper functions directly above the `clients.get('/', ...)` handler (before line 352):

```typescript
function buildClientsListCacheKey(params: Record<string, string | string[] | undefined>): string {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}=${JSON.stringify(params[k])}`)
    .join('&');
  return `v1:clients:list:${createHash('sha256').update(sorted).digest('hex')}`;
}

function buildClientsCountCacheKey(params: Record<string, string | string[] | undefined>): string {
  // Exclude pagination params so count is shared across pages
  const { page: _p, perPage: _pp, ...filterParams } = params as any;
  const sorted = Object.keys(filterParams)
    .sort()
    .map(k => `${k}=${JSON.stringify(filterParams[k])}`)
    .join('&');
  return `v1:clients:count:${createHash('sha256').update(sorted).digest('hex')}`;
}
```

- [ ] **Step 3: Add cache check at the start of the GET / handler**

Inside `clients.get('/', authMiddleware, async (c) => {`, right after the `const user = c.get('user');` line, add:

```typescript
const cache = getCacheService();
const allQueryParams: Record<string, string | string[] | undefined> = {
  page: c.req.query('page'),
  perPage: c.req.query('perPage'),
  search: c.req.query('search'),
  sort_by: c.req.query('sort_by'),
  loan_released: c.req.query('loan_released'),
  caravan_id: c.req.query('caravan_id'),
  agency_id: c.req.query('agency_id'),
  client_type: c.req.queries('client_type'),
  product_type: c.req.queries('product_type'),
  market_type: c.req.queries('market_type'),
  pension_type: c.req.queries('pension_type'),
  loan_type: c.req.queries('loan_type'),
  municipality: c.req.queries('municipality'),
  province: c.req.queries('province'),
  touchpoint_status: c.req.queries('touchpoint_status'),
  next_touchpoint_number: c.req.queries('next_touchpoint_number'),
  touchpoint_reason_codes: c.req.queries('touchpoint_reason_codes'),
  touchpoint_date_from: c.req.query('touchpoint_date_from'),
  touchpoint_date_to: c.req.query('touchpoint_date_to'),
  visit_status: c.req.queries('visit_status'),
  // Include user sub so different users don't share cached favorites ordering
  _user: user.sub,
};
const listCacheKey = buildClientsListCacheKey(allQueryParams);
const cachedList = await cache.get<object>(listCacheKey);
if (cachedList) {
  return c.json(cachedList);
}
```

- [ ] **Step 4: Cache the count query result**

Find the count query section (around line 539):

```typescript
const countResult = await pool.query(
  `SELECT COUNT(*) as count FROM clients c
   WHERE c.deleted_at IS NULL
   ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}`,
  baseParams
);
const totalItems = parseInt(countResult.rows[0].count);
```

Replace with:

```typescript
const countCacheKey = buildClientsCountCacheKey(allQueryParams);
const cachedCount = await cache.get<number>(countCacheKey);
let totalItems: number;
if (cachedCount !== null) {
  totalItems = cachedCount;
} else {
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM clients c
     WHERE c.deleted_at IS NULL
     ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}`,
    baseParams
  );
  totalItems = parseInt(countResult.rows[0].count);
  await cache.set(countCacheKey, totalItems, 60);
}
```

- [ ] **Step 5: Cache the full response before returning**

Find the final `return c.json({...})` inside the GET / handler (around line 695):

```typescript
return c.json({
  items: clientsList,
  page,
  perPage,
  totalItems,
  totalPages: Math.ceil(totalItems / perPage),
});
```

Replace with:

```typescript
const responsePayload = {
  items: clientsList,
  page,
  perPage,
  totalItems,
  totalPages: Math.ceil(totalItems / perPage),
};
await cache.set(listCacheKey, responsePayload, 60);
return c.json(responsePayload);
```

- [ ] **Step 6: Verify the server starts and a basic request works**

```bash
pnpm dev &
sleep 3
# Replace TOKEN with a valid JWT from your dev environment
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/clients?page=1&perPage=5" | jq '.totalItems'
kill %1
```

Expected: a number (total client count).

- [ ] **Step 7: Commit**

```bash
git add src/routes/clients.ts
git commit -m "perf: add Redis response + count caching to GET /api/clients (60s TTL)"
```

---

## Task 5: Add Cache Invalidation to Write Routes

**Files:**
- Modify: `src/routes/clients.ts` — write route handlers

**Background:** Any mutation to the `clients` table must invalidate the list and count caches. The three write routes are: `POST /` (create), `PATCH /:id` (update), `DELETE /:id` (delete). The `POST /bulk-upload` and `POST /bulk-create` routes also create clients. Use `cache.delPattern(pattern)` which is already available.

- [ ] **Step 1: Add invalidation helper**

Above the write routes (before `clients.post('/', ...)` at ~line 1246), add:

```typescript
async function invalidateClientsCache(): Promise<void> {
  const cache = getCacheService();
  await Promise.all([
    cache.delPattern('v1:clients:list:*'),
    cache.delPattern('v1:clients:count:*'),
  ]);
}
```

- [ ] **Step 2: Call invalidation in POST / (create client)**

In the `clients.post('/', ...)` handler, find the final `return c.json(...)` that returns the created client (near the end of the handler). Add the invalidation call just before it:

```typescript
await invalidateClientsCache();
return c.json({ ... }); // existing return
```

- [ ] **Step 3: Call invalidation in PATCH /:id (update client)**

In the `clients.patch('/:id', ...)` handler (~line 1469), find the final `return c.json(...)`. Add before it:

```typescript
await invalidateClientsCache();
```

- [ ] **Step 4: Call invalidation in DELETE /:id**

In the `clients.delete('/:id', ...)` handler (~line 1549), find the final `return c.json(...)`. Add before it:

```typescript
await invalidateClientsCache();
```

- [ ] **Step 5: Call invalidation in POST /bulk-create**

In the `clients.post('/bulk-create', ...)` handler (~line 2646), find the final `return c.json(...)`. Add before it:

```typescript
await invalidateClientsCache();
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/clients.ts
git commit -m "perf: invalidate clients list cache on create/update/delete/bulk-create"
```

---

## Task 6: Web Frontend — Increase Search Debounce to 800ms

**Files:**
- Modify: `frontend-web-imu/src/views/clients/ClientsListView.vue`

**Background:** `SearchBar.vue` accepts a `:debounce-ms` prop (default 300). The debounce timer and the `emit('search', ...)` call live inside `SearchBar.vue` — no changes needed there. Only call sites need updating.

- [ ] **Step 1: Find the SearchBar usage in ClientsListView.vue**

```bash
grep -n "SearchBar\|debounce\|handleSearch" /home/claude-team/loi/imu/frontend-web-imu/src/views/clients/ClientsListView.vue
```

Note the line numbers where `<SearchBar` is rendered and where `@search="handleSearch"` is wired.

- [ ] **Step 2: Add `:debounce-ms="800"` to the SearchBar component**

Find the `<SearchBar` tag in `ClientsListView.vue`. It will look something like:

```vue
<SearchBar
  :model-value="filters.search"
  @search="handleSearch"
  placeholder="Search by name, email, phone, address..."
/>
```

Add the prop:

```vue
<SearchBar
  :model-value="filters.search"
  :debounce-ms="800"
  @search="handleSearch"
  placeholder="Search by name, email, phone, address..."
/>
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd /home/claude-team/loi/imu/frontend-web-imu
pnpm type-check 2>/dev/null || pnpm vue-tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/clients/ClientsListView.vue
git commit -m "perf: increase search debounce to 800ms in ClientsListView"
```

---

## Task 7: Mobile Frontend — Increase Search Debounce to 800ms

**Files:**
- Modify: `frontend-mobile-imu/imu_flutter/lib/shared/widgets/client_selector_modal.dart` (line 95)
- Modify: `frontend-mobile-imu/imu_flutter/lib/features/clients/presentation/pages/clients_page.dart` (line 63)
- Modify: `frontend-mobile-imu/imu_flutter/lib/shared/widgets/map_widgets/client_map_view.dart` (line 49)

**Background:** The `Debounce` class from `lib/core/utils/debounce_utils.dart` takes a `milliseconds` argument at construction time. The delay is set once in the field initializer — there is no way to change it after construction, so update the constructor argument in each file.

Note: `agencies_page.dart` and `call_log_page.dart` also use `Debounce(milliseconds: 300)` but do NOT hit the all-clients API — leave those at 300ms.

- [ ] **Step 1: Update `client_selector_modal.dart`**

Open `lib/shared/widgets/client_selector_modal.dart`. Find line 95:

```dart
final _searchDebounce = Debounce(milliseconds: 300);
```

Change to:

```dart
final _searchDebounce = Debounce(milliseconds: 800);
```

- [ ] **Step 2: Update `clients_page.dart`**

Open `lib/features/clients/presentation/pages/clients_page.dart`. Find line 63:

```dart
final _searchDebounce = Debounce(milliseconds: 300);
```

Change to:

```dart
final _searchDebounce = Debounce(milliseconds: 800);
```

- [ ] **Step 3: Update `client_map_view.dart`**

Open `lib/shared/widgets/map_widgets/client_map_view.dart`. Find line 49:

```dart
final _searchDebounce = Debounce(milliseconds: 300);
```

Change to:

```dart
final _searchDebounce = Debounce(milliseconds: 800);
```

- [ ] **Step 4: Analyze to confirm no errors**

```bash
cd /home/claude-team/loi/imu/frontend-mobile-imu/imu_flutter
flutter analyze lib/shared/widgets/client_selector_modal.dart \
               lib/features/clients/presentation/pages/clients_page.dart \
               lib/shared/widgets/map_widgets/client_map_view.dart
```

Expected: `No issues found!`

- [ ] **Step 5: Commit**

```bash
git add lib/shared/widgets/client_selector_modal.dart \
        lib/features/clients/presentation/pages/clients_page.dart \
        lib/shared/widgets/map_widgets/client_map_view.dart
git commit -m "perf: increase client search debounce to 800ms on mobile"
```

---

## Self-Review Notes

- **Spec coverage:** All five spec sections covered across 7 tasks.
- **Migration number:** 050 (not 049, which is already taken by `049_add_approval_types.sql`).
- **CONCURRENTLY caveat:** Documented in Task 1 — must run outside a transaction.
- **Cache key includes `_user`:** Favorites ORDER BY is user-specific, so the cache key includes `user.sub` to prevent user A seeing user B's favorites-sorted list.
- **`delPattern` vs `invalidatePattern`:** The existing `RedisCacheService` exposes `delPattern(pattern)` — used that, not `invalidatePattern`.
- **Type consistency:** `buildClientsListCacheKey` and `buildClientsCountCacheKey` are consistent with how they're called in Tasks 4 and 5.
- **Mobile files:** Verified exact line numbers via grep before writing plan.
