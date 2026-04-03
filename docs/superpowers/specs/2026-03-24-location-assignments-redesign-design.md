# Location Assignments Page Redesign Design

**Date:** 2026-03-24
**Status:** Draft
**Related:** Location Assignments Feature, Municipality Management

## Overview

Redesign the Location Assignments page (`/locations`) with a two-pane master-detail layout and hierarchical bulk selection for assigning municipalities to caravans (field agents).

**Key Requirements:**
- Master-detail split view (caravan selector + municipality manager)
- Bulk municipality selection with hierarchical checkboxes (Region → Province → Municipality)
- Single view (no tabs) showing both bulk selector and assigned list
- Two-step assignment process (select checkboxes → click "Assign Selected")

## Layout

### Two-Pane Master-Detail

```
┌────────────────────────────────────────────────────────────────────┐
│  Location Assignments                                              │
├──────────────────────┬─────────────────────────────────────────────┤
│  LEFT PANE (30%)     │  RIGHT PANE (70%)                          │
│                      │                                             │
│  ┌────────────────┐  │  ┌──────────────────────────────────────┐ │
│  │ Caravans List  │  │  │ Header: [Caravan Name]                │ │
│  │                │  │  │ <email>                               │ │
│  │ • Avatar grid  │  │  │                                       │ │
│  │   (compact)    │  │  ├──────────────────────────────────────┤ │
│  │ • 2 columns    │  │  │ BULK ASSIGN                          │ │
│  │ • Click to     │  │  │                                      │ │
│  │   select       │  │  │ □ Region - Province - Municipality  │ │
│  │                │  │  │   [hierarchical checkboxes]         │ │
│  │ Scrollable     │  │  │                                      │ │
│  └────────────────┘  │  │ [Assign Selected (0)]                 │ │
│                      │  ├──────────────────────────────────────┤ │
│                      │  │ ASSIGNED MUNICIPALITIES (X)           │ │
│                      │  │                                      │ │
│                      │  │ [List of assigned with remove]       │ │
│                      │  └──────────────────────────────────────┘ │
└──────────────────────┴─────────────────────────────────────────────┘
```

### Responsive Breakpoints

- **Desktop (> 1024px):** Two-pane (30% / 70%)
- **Tablet (768px - 1024px):** Two-pane (40% / 60%)
- **Mobile (< 768px):** Stacked (full-width caravan selector, full-width manager)

## Components

### LocationAssignmentsView.vue (Parent)
- **Responsibilities:** Overall layout, selected caravan state
- **State:** `selectedCaravanId: string`
- **Layout:** Two-pane split (flex row)

### CaravanSelector.vue (Left Pane)
- **Responsibilities:** Display and select caravan
- **Uses:** `useCaravansStore`
- **UI:** Compact avatar grid (2 columns, 64px avatars)
- **Avatar Generation:** Reuse `getInitials()` function from `CaravansListView.vue` (creates 2-letter initials from name)
- **Events:** `@select(caravanId)` emits selected ID
- **States:** Default (white bg), Selected (ring-2 ring-indigo-600), Hover (bg-neutral-50)
- **Pagination:** If caravans > 20, show virtual scroll or load more (reuse existing pagination from `useCaravansStore`)

### MunicipalityManager.vue (Right Pane)
- **Props:** `caravanId: string`
- **Responsibilities:** Header, coordinate bulk selector and assigned list, API calls
- **API:**
  - `GET /caravans/:id/municipalities` (fetch assigned)
  - `POST /caravans/:id/municipalities` (bulk assign)
  - `DELETE /caravans/:id/municipalities/:municipalityId` (remove)

### BulkMunicipalitySelector.vue
- **Responsibilities:** Hierarchical accordion with checkboxes for bulk selection
- **Component Strategy:** NEW component (does NOT reuse `LocationPicker.vue`)
  - Reason: Different use case - `LocationPicker` is for single selection in forms, this is for bulk multi-selection with accordion
  - Both will use `usePsgcStore` for data fetching (shared dependency)
- **Uses:** `usePsgcStore` for PSGC data
- **State:**
  - `expandedRegions: Set<string>`
  - `expandedProvinces: Set<string>`
  - `checkedMunicipalities: Set<string>` (municipality_id format)
  - `assignedMunicipalities: Set<string>` (for disabled state)
- **Events:** `@assign(municipality_ids: string[])`
- **Lazy Loading:** Load provinces/municipalities on expand
- **Accordion Icons:** Use `chevron-right` (collapsed) → `chevron-down` (expanded) from Heroicons

### AssignedMunicipalitiesList.vue
- **Props:** `assignments: LocationAssignment[]`
- **Events:** `@remove(municipality_id: string)`
- **UI:** List with municipality name, province, region, remove button
- **Pagination:** 20 per page (if > 50 items)

## Data Flow

```
LocationAssignmentsView
├── selectedCaravanId: string
│
├── CaravanSelector
│   └── Uses: useCaravansStore.caravans
│   └── Emits: @select(caravanId)
│
└── MunicipalityManager (caravanId)
    ├── assignedMunicipalities: LocationAssignment[]
    ├── loading: boolean
    │
    ├── BulkMunicipalitySelector
    │   └── Uses: usePsgcStore (municipalities)
    │   └── Emits: @assign(municipality_ids[])
    │
    └── AssignedMunicipalitiesList
        └── Props: assignments[]
        └── Emits: @remove(municipality_id)
```

## Hierarchical Checkbox Behavior

**Rules:**
1. **Check Parent → Check All Children**
   - Check Region → All provinces checked → All municipalities checked
   - Check Province → All municipalities under it checked

2. **Uncheck Parent → Uncheck All Children**
   - Uncheck Region → Uncheck all provinces → Uncheck all municipalities
   - Uncheck Province → Uncheck all municipalities under it

3. **Indeterminate State**
   - When some (but not all) children are checked
   - Parent checkbox shows dash (─) instead of checkmark
   - Clicking indeterminate parent checks all children

4. **Already Assigned**
   - Disabled/checked appearance
   - Cannot be unchecked in bulk selector
   - Must be removed from assigned list instead

5. **Selection Count**
   - "Assign Selected" button shows count of newly selected (excludes already assigned)
   - Count updates in real-time as checkboxes change

## User Flow

### Primary Flow: Bulk Assign Municipalities

1. Navigate to `/locations`
2. Click caravan avatar in left pane
3. Right pane loads caravan's current assignments
4. Expand Region accordion (▶ → ▼)
5. Expand Province accordion
6. Click Province checkbox → all municipalities auto-check
7. Uncheck any already-assigned municipalities (shown disabled)
8. Click "Assign Selected (X)" button
9. Loading state on button
10. Success toast: "X municipalities assigned successfully"
11. Assigned list updates automatically

### Secondary Flow: Remove Individual Assignment

1. In Assigned Municipalities list
2. Click [×] button next to municipality
3. Confirmation dialog (optional, can skip for speed)
4. Loading state
5. Success toast: "Municipality removed successfully"
6. Item removed from list

### Edge Cases

- **No caravans:** Show empty state with "Create caravan first" message
- **Caravan with no assignments:** Show "No municipalities assigned yet" message
- **Region with 50+ municipalities:** Load more button or virtual scrolling
- **Network error:** Retry button, keep selections checked
- **Concurrent edits:** Refresh list after each operation (last-write-wins)
- **"Remove All" button:** Intentionally omitted for safety reasons - bulk removal should require explicit confirmation per item or a separate administrative flow

## Visual Design

### Colors
- **Primary:** Use existing `primary-500` and `primary-600` from design system (for consistency with existing Button.vue component)
- **Border:** `neutral-200` (card borders, dividers)
- **Background:** `white` (cards), `neutral-50` (hover, expanded accordion)
- **Text:** `neutral-900` (primary), `neutral-500` (secondary), `neutral-600` (muted)
- **Success:** `green-100` bg, `green-700` text
- **Error:** `red-50` bg, `red-600` text
- **Disabled:** `neutral-100` bg, `neutral-400` text

**Note:** The existing codebase uses `primary-500` and `secondary-500` color tokens. This design uses those tokens for consistency rather than hardcoding `indigo-600`.

### Spacing
- Card padding: `p-6` (24px)
- Section gap: `space-y-6` (24px)
- Avatar size: `64px × 64px` (compact)
- Row height: `h-12` (48px)

### Typography
- Header: `text-lg font-semibold`
- Section headers: `text-sm font-semibold`
- Body: `text-sm`
- Muted: `text-xs text-neutral-500`

### Interactive States

**Checkbox:**
- Unchecked: `border-neutral-300 bg-white`
- Checked: `bg-primary-600 border-primary-600`
- Indeterminate: `bg-primary-600 border-primary-600` with dash icon (Heroicons `minus` path)
- Disabled (already assigned): `bg-neutral-100 border-neutral-200 cursor-not-allowed`

**Remove Button (×):**
- Icon: Heroicons `x-mark` (path: M6 18L18 6M6 6l12 12)
- Default: `text-neutral-400 hover:text-red-600 hover:bg-red-50`
- Loading: `animate-spin text-neutral-400`

**Caravan Card:**
- Default: `bg-white border-neutral-200`
- Selected: `ring-2 ring-primary-600 border-primary-600`
- Hover: `bg-neutral-50`

**Accordion:**
- Expanded: `bg-neutral-50`
- Collapsed: `bg-white`
- Header hover: `bg-neutral-50`
- Expand icon (collapsed): Heroicons `chevron-right` (path: M9 5l7 7-7 7)
- Collapse icon (expanded): Heroicons `chevron-down` (path: M19 9l-7 7-7-7)

**Button (Assign Selected):**
- 0 selected: `disabled bg-neutral-100 text-neutral-400 cursor-not-allowed`
- 1+ selected: `enabled bg-primary-600 text-white hover:bg-primary-700`

## API Specification

All required endpoints already exist. No new endpoints needed.

### Existing Endpoints Used

```
GET /api/caravans
→ Returns: { items: Caravan[], page, perPage, totalItems, totalPages }
→ Used by: CaravanSelector

GET /api/caravans/:id/municipalities
→ Returns: { items: LocationAssignment[] }
→ Response format matches backend implementation (caravans.ts lines 293-331)
→ Used by: MunicipalityManager

POST /api/caravans/:id/municipalities
→ Body: { municipality_ids: string[] }
→ Returns: { message: string, assigned_count: number }
→ Used by: BulkMunicipalitySelector

DELETE /api/caravans/:id/municipalities/:municipalityId
→ Returns: { message: string }
→ Used by: AssignedMunicipalitiesList

GET /api/psgc/regions
→ Returns: { items: { id, name }[] }
→ Used by: BulkMunicipalitySelector

GET /api/psgc/provinces?region=xxx
→ Returns: { items: { id, region, name }[] }
→ Used by: BulkMunicipalitySelector

GET /api/psgc/municipalities?region=xxx&province=xxx
→ Returns: { items: { id, region, province, name, kind, isCity }[] }
→ Used by: BulkMunicipalitySelector
```

**Note:** The backend `GET /api/caravans/:id/municipalities` endpoint (lines 293-331 in caravans.ts) constructs the response by joining PSGC data with assignment data. The `LocationAssignment` interface in this spec matches that actual response format.

### Data Types

```typescript
interface LocationAssignment {
  id: string
  municipality_id: string  // Format: "province-municipality" (constructed as province + '-' + mun_city)
  municipality_name: string  // From PSGC mun_city field
  municipality_code: string  // Same as municipality_id
  region_name: string  // From PSGC region field
  region_code: string  // Same as region_name
  assigned_at: string
  assigned_by: string
}

interface PsgcMunicipality {
  id: string  // Format: "province-municipality" (constructed as province + '-' + mun_city)
  region: string
  province: string
  name: string  // From PSGC mun_city field
  kind: string
  isCity: boolean
}
```

**Note on Municipality ID Format:**
- The backend constructs `municipality_id` as `province + '-' + mun_city` from the PSGC table
- Municipalities with hyphens in their names (e.g., "Biñan City") are handled by the existing backend logic
- The frontend uses this ID for comparison and API calls - no additional parsing needed

## Error Handling

### Loading States
- **Left pane (CaravanSelector):** Skeleton loaders while fetching caravans
- **Right pane header:** Spinner when switching caravans
- **Assigned municipalities list:** Spinner with "Loading assignments..." text when caravan selection changes
- **Bulk selector:** Progressive loading (regions first, provinces/municipalities on expand)
- **Buttons:** Loading spinner + disabled state during operation
- **Accordion items:** Show spinner when loading municipalities for a province

### Error States
- **API fetch error:** Toast message + empty state with retry button
- **Assign error:** Toast with error message, keep selections checked (can retry)
- **Remove error:** Toast with error message, keep item in list

### Empty States
- **No caravans:** "No caravans available. Create one first."
- **Caravan selected, no assignments:** "No municipalities assigned yet. Use Bulk Assign to add locations."
- **Bulk selector, no results:** "No municipalities found. Try selecting a different region."

## Performance Considerations

1. **Lazy Loading:** Load provinces/municipalities on accordion expand
2. **Caching:** Cache PSGC data in component state (don't re-fetch)
3. **Debouncing:** 300ms debounce on search input (if added)
4. **Pagination:** Assigned list shows 20 per page (trigger at 50+ items)
5. **Optimistic UI:** Update assigned list immediately, rollback on error

## Accessibility

- **Keyboard Navigation:** Arrow keys for accordion, Space for checkboxes
- **ARIA Labels:** `aria-expanded`, `aria-checked`, `aria-label` on all interactive elements
- **Focus Management:** Return focus after modal/close
- **Screen Reader:** Announcements for selection count changes
- **Color Contrast:** WCAG AA compliant (Tailwind defaults)

## Security & Permissions

- **Permission Check:** Use existing `edit_agents` permission (from `usePermission` composable)
- **Backend Authorization:** Existing endpoints use `requireAnyRole` with manager roles (admin, area_manager, assistant_area_manager)
- **View-only Mode:** Users without `edit_agents` permission see read-only view
  - No bulk selector displayed
  - No remove buttons on assigned list
  - Lock icon or message: "You don't have permission to modify location assignments"
- All API calls respect RBAC middleware (already implemented in backend)

## File Structure

```
imu-web-vue/src/
├── views/
│   └── locations/
│       └── LocationAssignmentsView.vue  (parent)
├── components/
│   └── locations/
│       ├── CaravanSelector.vue
│       ├── MunicipalityManager.vue
│       ├── BulkMunicipalitySelector.vue
│       └── AssignedMunicipalitiesList.vue
└── stores/
    ├── caravans.ts  (existing)
    └── psgc.ts  (existing)
```

## Dependencies

**Existing (no new dependencies):**
- Vue 3 Composition API
- Pinia stores
- Tailwind CSS
- Existing API client

**No new libraries required**

## Success Criteria

1. Admin can select a caravan from left pane
2. Admin can see currently assigned municipalities
3. Admin can expand Region → Province → Municipality hierarchy
4. Admin can check province to auto-select all municipalities
5. Admin can click "Assign Selected" to bulk assign
6. Admin receives success/error feedback
7. Assigned list updates in real-time
8. Admin can remove individual assignments
9. Page works on desktop, tablet, and mobile
10. Page is accessible via keyboard and screen reader

## Open Questions

None - all requirements clarified.

## Related Documents

- Backend routes: `backend/src/routes/caravans.ts`
- PSGC API: `backend/src/routes/psgc.ts`
- Original location assignments: `imu-web-vue/src/views/locations/LocationAssignmentsView.vue`
- PSGC types: `imu-web-vue/src/lib/psgc.ts`

## Changelog

**2026-03-24 (Revision 1):** Addressed spec review feedback
- Clarified avatar generation: Reuse `getInitials()` from `CaravansListView.vue`
- Added pagination note for CaravanSelector (use existing from `useCaravansStore`)
- Updated permission check to use existing `edit_agents` permission
- Added component reuse strategy: BulkMunicipalitySelector is NEW (not reusing LocationPicker)
- Clarified municipality ID format and backend construction logic
- Added accordion icon specification (Heroicons chevron-right/chevron-down)
- Updated colors to use existing `primary-500/primary-600` tokens
- Added loading state specification for assigned municipalities list
- Added checkbox and remove button visual states with specific icons
- Added note about "Remove All" button intentionally omitted for safety
- Added API response format note matching actual backend implementation
- Added SVG icon paths for interactive elements

**2026-03-24 (Initial):** Initial design created
- User clarified: Municipality-level assignments only (no barangays)
- User selected: Multi-select checkboxes in expandable list
- User selected: Master-detail split view layout
- User selected: Single view (no tabs)
