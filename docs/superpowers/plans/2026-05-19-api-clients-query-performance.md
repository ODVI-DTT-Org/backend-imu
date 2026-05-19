# API Clients Query Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `/api/clients` and `/api/clients/assigned` latency by removing avoidable joins/sorts/counts while preserving the current response shape.

**Architecture:** Use `clients.region`, `clients.province`, `clients.municipality`, and `clients.barangay` as the canonical location fields returned by the API, removing list/detail hydration joins to `psgc`. Keep the existing PSGC-based assigned-territory filter because a production comparison showed direct client text filtering can return slightly different counts. Keep favorites in hydrated responses but stop sorting by favorite status unless explicitly requested. For completely unfiltered `/api/clients`, use the partial default-sort index row estimate instead of an exact `COUNT(*)`.

**Tech Stack:** Hono, TypeScript, PostgreSQL, Vitest.

---

### Task 1: Remove PSGC Hydration Joins

**Files:**
- Modify: `src/routes/clients.ts`
- Test: `src/routes/__tests__/clients.filters.test.ts`

- [ ] Replace `psg.region/province/mun_city/barangay` aliases with `c.region/province/municipality/barangay`.
- [ ] Remove `LEFT JOIN psgc psg ON psg.id = c.psgc_id` from `/api/clients`, `/api/clients/assigned`, and `/api/clients/:id`; keep PSGC joins used by assignment/status workflows.
- [ ] Remove `psgc_*` update columns from the single-client PSGC assignment route because production stores canonical location text in the existing client location columns.
- [ ] Change barangay filtering to use `c.barangay` only.

### Task 2: Fix Default Sorting Cost

**Files:**
- Modify: `src/routes/clients.ts`

- [ ] Remove `(cf.client_id IS NOT NULL) DESC` from the default `/api/clients` order.
- [ ] Add `sort_by=favorites` as the opt-in path that applies favorite-first ordering.
- [ ] Only join `client_favorites` in phase 1 when `sort_by=favorites`; keep the phase 2 join so response `is_favorited` remains unchanged.

### Task 3: Avoid Exact Default Count

**Files:**
- Modify: `src/routes/clients.ts`

- [ ] For `/api/clients` with no filters/search, read `pg_class.reltuples` from `idx_clients_default_sort` instead of running `COUNT(*)`.
- [ ] Keep exact count for any filtered or searched request.
- [ ] Cache the count result as before.

### Task 4: Verify

**Files:**
- Modified backend files.

- [ ] Run `COREPACK_ENABLE_STRICT=0 pnpm --config.engine-strict=false test src/routes/__tests__/clients.filters.test.ts`.
- [ ] Run `COREPACK_ENABLE_STRICT=0 pnpm --config.engine-strict=false build`.
- [ ] Run production `EXPLAIN ANALYZE` for no-filter count and no-filter phase-1 IDs.
- [ ] Commit and push with `perf: optimize clients list query`.
