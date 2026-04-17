# Unified Clients API Design

**Date:** 2026-04-17
**Status:** Approved
**Scope:** Backend filter unification + Flutter sync screen count display

---

## Problem

The backend has two client list endpoints — `/api/clients` (all clients, used by web admin and mobile "all clients" screen) and `/api/clients/assigned` (area-filtered, used by web tele view and mobile "assigned clients" via PowerSync). Both endpoints contain independent, hand-written filter-building blocks. When a new filter is added to one, it must be manually duplicated on the other. They can and do drift.

The mobile sync screen shows `"Clients: X loaded"` but gives no indication that these are the agent's assigned clients.

---

## Goals

1. One place to add a client filter — both endpoints get it automatically.
2. Mobile "all clients" (REST) and web admin share the same filter behavior with no extra effort.
3. Sync screen clearly communicates assigned client count after sync.

---

## Non-Goals

- Merging `/api/clients` and `/api/clients/assigned` into a single route.
- Changing the response shape (already consistent: `{ items, page, perPage, totalItems, totalPages }`).
- Changing the Vue web stores (already correct).
- Changing the Flutter "all clients" screen UI.

---

## Architecture

### Backend: Shared Filter Builder

Extract a `buildClientFilters` helper in the backend clients route (or a shared utility file):

```typescript
function buildClientFilters(
  q: Record<string, string | string[]>,
  params: any[],
  idx: number
): { conditions: string[]; params: any[]; idx: number }
```

**Filters handled:**

| Param | SQL condition |
|-------|--------------|
| `search` | `c.first_name ILIKE`, `c.last_name ILIKE`, `c.middle_name ILIKE` (pg_trgm / full-text) |
| `client_type` | `c.client_type = $n` |
| `product_type` | `c.product_type = $n` |
| `market_type` | `c.market_type = $n` |
| `pension_type` | `c.pension_type = $n` |
| `agency_id` | `c.agency_id = $n` |
| `caravan_id` | `c.caravan_id = $n` |
| `province[]` | `c.province = ANY($n)` |
| `municipality[]` | `c.municipality = ANY($n)` |
| `touchpoint_status[]` | Group-based filter (callable, completed, has_progress, no_progress) |
| `sort_by` | ORDER BY clause selection |

Both `/api/clients` and `/api/clients/assigned` call `buildClientFilters` for the shared part. Each route still appends its own conditions after (e.g., `/assigned` appends the area filter `c.id = ANY($n)`).

**File:** `src/routes/clients.ts` — helper defined at top of file, used in both route handlers.

---

### Flutter: Sync Screen Count

**File:** `lib/features/sync/presentation/pages/sync_loading_page.dart`

PowerSync sync rules only sync clients in the agent's assigned territory. Therefore, all locally synced clients are assigned clients — `SELECT COUNT(*) FROM clients` gives the assigned client count.

**Change:** Replace the generic `"Clients: X loaded"` row label with `"Assigned clients: X synced"`.

Use the existing `ClientRepository.getClientsCount()` method which already executes `SELECT COUNT(*) as count FROM clients`.

Display after sync completes:
```
Assigned clients: 142 synced
```

No new queries, no new services — just a label change using the existing count method.

---

## Data Flow

```
Web admin (Vue)          → GET /api/clients?search=...&client_type=...
Mobile "all clients"     → GET /api/clients?search=...&client_type=...   (same endpoint, same params)
Mobile "assigned clients"→ PowerSync local SQLite (offline, no REST call)
Web tele view (Vue)      → GET /api/clients/assigned?touchpoint_status=callable

Both REST endpoints call buildClientFilters() → consistent filter behavior
```

---

## Changes Summary

### `backend-imu`

| File | Change |
|------|--------|
| `src/routes/clients.ts` | Extract `buildClientFilters()` helper; replace duplicated filter blocks in both `GET /` and `GET /assigned` handlers |

### `frontend-mobile-imu`

| File | Change |
|------|--------|
| `lib/features/sync/presentation/pages/sync_loading_page.dart` | Change `"Clients: X loaded"` label to `"Assigned clients: X synced"` |

### `frontend-web-imu`

No changes required.

---

## Testing

- **Backend:** Add a new filter param to `buildClientFilters`, verify it appears in responses from both `/api/clients` and `/api/clients/assigned` without any per-endpoint change.
- **Flutter:** After sync, confirm sync screen shows `"Assigned clients: X synced"` with the correct count from local SQLite.

---

## Risk

Low. The refactor is internal to the route file — no response shape changes, no new endpoints, no client-side store changes. The Flutter change is a label only.
