# All Clients Fast Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make All Clients search use indexed PostgreSQL full-text search for names and addresses instead of sequential trigram/LIKE scans.

**Architecture:** Route code keeps the same API parameters and response shape. Name search always uses the existing `clients.search_vector` GIN index because typo tolerance is not required. Address search gets a generated `clients.address_search_vector` column plus GIN index, and `address_search` filters use that vector.

**Tech Stack:** Hono backend, TypeScript, PostgreSQL generated columns, GIN indexes, Vitest.

---

### Task 1: Full-Text Name Search

**Files:**
- Modify: `src/utils/hybrid-search.ts`
- Modify: `src/utils/__tests__/hybrid-search.test.ts`

- [ ] **Step 1: Update tests**

Assert 1-word and 2-word queries resolve to the full-text branch and produce `search_vector @@ plainto_tsquery(...)`.

- [ ] **Step 2: Update implementation**

Set the default full-text threshold to `1`, keeping `buildHybridSearchClause` behavior unchanged for callers that explicitly pass another threshold.

- [ ] **Step 3: Run test**

Run: `COREPACK_ENABLE_STRICT=0 pnpm --config.engine-strict=false test src/utils/__tests__/hybrid-search.test.ts`

### Task 2: Indexed Address Search

**Files:**
- Create: `src/migrations/105_add_clients_address_search_vector.sql`
- Modify: `src/routes/clients.ts`
- Modify: `src/routes/__tests__/clients.filters.test.ts`

- [ ] **Step 1: Add migration**

Create a generated `address_search_vector` over `full_address`, `region`, `province`, `municipality`, and `barangay`, then add a GIN index concurrently.

- [ ] **Step 2: Update route filter**

Replace per-word `LOWER(...) LIKE '%word%'` address conditions with one `c.address_search_vector @@ plainto_tsquery('simple', $n)` condition.

- [ ] **Step 3: Update filter test**

Assert `address_search` produces one indexed vector condition and a normalized query parameter.

- [ ] **Step 4: Run tests**

Run: `COREPACK_ENABLE_STRICT=0 pnpm --config.engine-strict=false test src/routes/__tests__/clients.filters.test.ts src/utils/__tests__/hybrid-search.test.ts`

### Task 3: Verify And Ship

**Files:**
- Backend source, tests, migration, and this plan.

- [ ] **Step 1: Run backend build**

Run: `COREPACK_ENABLE_STRICT=0 pnpm --config.engine-strict=false build`

- [ ] **Step 2: Commit and push**

Commit message: `perf: use indexed full text client search`

- [ ] **Step 3: Apply migration to QA and production**

Run the migration with `psql` against both QA and production after the build passes.
