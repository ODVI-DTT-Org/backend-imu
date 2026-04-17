# Unified Clients API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `buildClientFilters` helper used by both `/api/clients` and `/api/clients/assigned` so adding any new filter propagates to both endpoints automatically, and update the Flutter sync screen to label locally synced clients as "Assigned clients."

**Architecture:** The two client list endpoints share identical filter-building code for `client_type`, `product_type`, `market_type`, `pension_type`, `agency_id`, `municipality[]`, and `province[]`. A single helper function eliminates the duplication. The Flutter sync screen already queries `SELECT COUNT(*) FROM clients` generically — only the display label needs updating.

**Tech Stack:** Hono (TypeScript) for backend, Flutter (Dart) for mobile sync screen.

---

## File Map

| File | Change |
|------|--------|
| `backend-imu/src/routes/clients.ts` | Add `buildClientFilters()` at top of file; replace duplicated filter blocks in `GET /` (lines ~320–380) and `GET /assigned` (lines ~635–683) |
| `frontend-mobile-imu/imu_flutter/lib/features/sync/presentation/pages/sync_loading_page.dart` | Change `'clients': 'Clients'` to `'clients': 'Assigned clients'` in `_tableDisplayNames` |

---

## Task 1: Add `buildClientFilters` helper to backend clients route

**Files:**
- Modify: `src/routes/clients.ts` (add helper function before the first route definition)

- [ ] **Step 1: Read the current file to confirm line numbers**

Open `src/routes/clients.ts` and locate:
- The imports section (top of file)
- The line just before `clients.get('/', ...)` (first route handler)

- [ ] **Step 2: Add `buildClientFilters` after the imports, before the first route**

Insert the following function. It handles every equality/array filter that appears in both handlers. Search, `touchpoint_status`, and `sort_by` are intentionally excluded — they have route-specific SQL logic and stay in their handlers.

```typescript
interface ClientFilterResult {
  conditions: string[];
  params: any[];
  nextIdx: number;
}

function buildClientFilters(
  q: {
    client_type?: string;
    product_type?: string;
    market_type?: string;
    pension_type?: string;
    agency_id?: string;
    municipality?: string | string[];
    province?: string | string[];
  },
  startIdx: number = 1
): ClientFilterResult {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = startIdx;

  if (q.client_type && q.client_type !== 'all') {
    conditions.push(`c.client_type = $${idx}`);
    params.push(q.client_type);
    idx++;
  }

  if (q.product_type && q.product_type !== 'all') {
    conditions.push(`c.product_type = $${idx}`);
    params.push(q.product_type);
    idx++;
  }

  if (q.market_type && q.market_type !== 'all') {
    conditions.push(`c.market_type = $${idx}`);
    params.push(q.market_type);
    idx++;
  }

  if (q.pension_type && q.pension_type !== 'all') {
    conditions.push(`c.pension_type = $${idx}`);
    params.push(q.pension_type);
    idx++;
  }

  if (q.agency_id) {
    conditions.push(`c.agency_id = $${idx}`);
    params.push(q.agency_id);
    idx++;
  }

  if (q.municipality) {
    const values = Array.isArray(q.municipality) ? q.municipality : [q.municipality];
    if (values.length > 0) {
      const placeholders = values.map((_, i) => `$${idx + i}`).join(', ');
      conditions.push(`c.municipality IN (${placeholders})`);
      params.push(...values);
      idx += values.length;
    }
  }

  if (q.province) {
    const values = Array.isArray(q.province) ? q.province : [q.province];
    if (values.length > 0) {
      const placeholders = values.map((_, i) => `$${idx + i}`).join(', ');
      conditions.push(`c.province IN (${placeholders})`);
      params.push(...values);
      idx += values.length;
    }
  }

  return { conditions, params, nextIdx: idx };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend-imu
node_modules/.bin/tsc --noEmit 2>&1 | grep -i "buildClientFilters\|error" | head -20
```

Expected: no errors mentioning `buildClientFilters`.

---

## Task 2: Replace filter block in `GET /` handler

**Files:**
- Modify: `src/routes/clients.ts` (inside the `clients.get('/', ...)` handler)

- [ ] **Step 1: Locate the filter block in `GET /`**

In `clients.get('/', ...)`, find the section that starts with:
```typescript
const clientType = c.req.query('client_type');
```
and ends just before the `// Hybrid search` section (around the `if (search && search.trim())` block).

- [ ] **Step 2: Replace the duplicated param declarations and filter conditions**

**Remove** these lines from the `GET /` handler:
```typescript
const clientType = c.req.query('client_type');
// ...
const agencyId = c.req.query('agency_id');
const municipalityQuery = c.req.queries('municipality');
const provinceQuery = c.req.queries('province');
// ...
const municipality = municipalityQuery && Array.isArray(municipalityQuery) ? ...
const province = provinceQuery && Array.isArray(provinceQuery) ? ...
```

AND remove the filter condition block:
```typescript
if (clientType && clientType !== 'all') { ... }
if (productType && productType !== 'all') { ... }
if (marketType && marketType !== 'all') { ... }
if (pensionType && pensionType !== 'all') { ... }
if (agencyId) { ... }
// Handle municipality filter ...
if (municipality) { ... }
// Handle province filter ...
if (province) { ... }
```

**Replace with** (keep the existing `search`, `touchpointStatus`, `sortBy`, `caravanId` declarations and their handler logic — those stay):

```typescript
const municipalityQuery = c.req.queries('municipality');
const provinceQuery = c.req.queries('province');
const municipality = municipalityQuery?.length ? municipalityQuery : undefined;
const province = provinceQuery?.length ? provinceQuery : undefined;

const { conditions: sharedConditions, params: sharedParams, nextIdx: sharedNextIdx } = buildClientFilters({
  client_type: c.req.query('client_type'),
  product_type: c.req.query('product_type'),
  market_type: c.req.query('market_type'),
  pension_type: c.req.query('pension_type'),
  agency_id: c.req.query('agency_id'),
  municipality,
  province,
});

const baseWhereConditions: string[] = [...sharedConditions];
const baseParams: any[] = [...sharedParams];
let baseParamIndex = sharedNextIdx;
```

After this, the existing `search` block and `touchpointStatus`/`sortBy` logic continues unchanged — they append to `baseWhereConditions` and `baseParams` using `baseParamIndex` exactly as before.

- [ ] **Step 3: Verify TypeScript compiles with no new errors**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | head -20
```

Expected: same errors as before (pre-existing ones only — none new from `GET /`).

---

## Task 3: Replace filter block in `GET /assigned` handler

**Files:**
- Modify: `src/routes/clients.ts` (inside the `clients.get('/assigned', ...)` handler)

- [ ] **Step 1: Locate the filter block in `GET /assigned`**

Find the section inside `clients.get('/assigned', ...)` starting with:
```typescript
const clientType = c.req.query('client_type');
```
This is around line 535.

- [ ] **Step 2: Replace the duplicated filter block**

**Remove** from `GET /assigned`:
```typescript
const clientType = c.req.query('client_type');
const caravanId = c.req.query('caravan_id');
// ...
const productType = c.req.query('product_type');
```
AND the conditions block for `clientType`, `productType`, `agencyId`, `municipality`, `province` (same pattern as Task 2).

**Replace with:**
```typescript
const municipalityQuery = c.req.queries('municipality');
const provinceQuery = c.req.queries('province');
const municipality = municipalityQuery?.length ? municipalityQuery : undefined;
const province = provinceQuery?.length ? provinceQuery : undefined;

const { conditions: sharedConditions, params: sharedParams, nextIdx: sharedNextIdx } = buildClientFilters({
  client_type: c.req.query('client_type'),
  product_type: c.req.query('product_type'),
  market_type: c.req.query('market_type'),
  pension_type: c.req.query('pension_type'),
  agency_id: c.req.query('agency_id'),
  municipality,
  province,
});

const baseWhereConditions: string[] = ['c.deleted_at IS NULL', ...sharedConditions];
const baseParams: any[] = [...sharedParams];
let baseParamIndex = sharedNextIdx;
```

Note: `'c.deleted_at IS NULL'` is added directly here (as it was before in `/assigned`), **not** via the helper. The area filter (`c.id = ANY(...)`) still appends after, as before.

Note: `market_type` and `pension_type` are **new** for `/assigned` — they were previously missing. The helper adds them for free.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
node_modules/.bin/tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Manual smoke test — verify both endpoints respond**

Start the backend dev server:
```bash
pnpm dev
```

In another terminal, test both endpoints (replace `TOKEN` with a valid admin JWT):
```bash
# All clients with a filter
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/clients?client_type=POTENTIAL&per_page=1" \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('items count:', j.items?.length, 'totalItems:', j.totalItems)"

# Assigned clients with same filter
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/clients/assigned?client_type=POTENTIAL&per_page=1" \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('items count:', j.items?.length, 'totalItems:', j.totalItems)"
```

Expected: both return `{ items: [...], totalItems: N }` without errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/clients.ts
git commit -m "refactor: extract buildClientFilters helper shared by /clients and /clients/assigned"
```

---

## Task 4: Update Flutter sync screen label

**Files:**
- Modify: `frontend-mobile-imu/imu_flutter/lib/features/sync/presentation/pages/sync_loading_page.dart`

- [ ] **Step 1: Find `_tableDisplayNames` map**

Search for the map that contains `'clients': 'Clients'`. It looks like:

```dart
const Map<String, String> _tableDisplayNames = {
  'psgc': 'PSGC (Locations)',
  'touchpoint_reasons': 'Touchpoint Reasons',
  'user_locations': 'User Locations',
  'clients': 'Clients',
  'touchpoints': 'Touchpoints',
  'itineraries': 'Itineraries',
  'approvals': 'Approvals',
};
```

- [ ] **Step 2: Update the `clients` entry**

Change:
```dart
'clients': 'Clients',
```

To:
```dart
'clients': 'Assigned clients',
```

The count row will then display: `Assigned clients: 142 loaded` — using the existing generic row renderer with no further changes needed.

- [ ] **Step 3: Verify the app builds**

```bash
cd frontend-mobile-imu/imu_flutter
flutter analyze lib/features/sync/presentation/pages/sync_loading_page.dart
```

Expected: no issues reported.

- [ ] **Step 4: Commit**

```bash
git add lib/features/sync/presentation/pages/sync_loading_page.dart
git commit -m "feat: show assigned client count on sync screen"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Backend helper ✓, both endpoints use it ✓, `market_type`/`pension_type` added to `/assigned` ✓, Flutter label change ✓
- [x] **No placeholders:** All steps have complete code
- [x] **Type consistency:** `buildClientFilters` signature used identically in Tasks 2 and 3
- [x] **`caravanId` excluded:** It's declared but never used in filter conditions in either handler — confirmed by grep. Not added to helper.
- [x] **`deleted_at IS NULL`:** Excluded from helper; added inline in Task 3 for `/assigned` (same as current behavior)
