# UX Fixes Design Document

> **Date:** 2025-03-24
> **Status:** Approved
> **Priority:** High

## Overview

Fix critical UX inconsistencies and permission issues in the IMU Admin web application to improve user experience and maintain security.

## Goals

1. Standardize terminology throughout the application
2. Update permission system to match UI terminology
3. Add missing permission check for sensitive financial operations
4. Improve data display to show user-friendly information
5. Remove incomplete features that confuse users

## Scope

### 0. Current State Verification

**Verified Issues:**
- ✅ "Release Loan" button has NO permission check (ClientsListView.vue:280-285)
- ✅ ClientDetailView shows caravan ID instead of name (lines 64-67)
- ✅ Agency dropdown shows "Select agency" with no options (ClientFormView.vue:283-308)
- ✅ Permission system uses "agents" terminology (usePermission.ts:12-19)
- ⚠️ Current permission checks use hardcoded strings, no PERMISSIONS object exists

### 1. Terminology Standardization

**Current State:** Mixed usage of "Caravan", "MR", and "Agent" for the same entity.

**Target State:** Use "Caravan" consistently throughout the web application.

| Component | Current | Target |
|-----------|---------|--------|
| Sidebar | "Caravan" | (no change) |
| Button labels | "New MR" | "New Caravan" |
| Dialog titles | "MR Dialog" | "Caravan Dialog" |
| Empty states | "new MR" | "new Caravan" |
| Code comments | "renamed from Agent" | (keep as historical note) |
| Type alias | `Agent = Caravan` | (keep for backward compatibility) |

### 2. Permission System Updates

**Current State:** Permission names use "agents" but UI uses "caravans", causing confusion.
**Current Implementation:** Permission checks use hardcoded strings (no PERMISSIONS constant object exists).

**Permission Pattern:**
- All permissions are **hardcoded strings** passed to `can('permission_name')`
- The only documentation of available permissions is in **JSDoc comments** in `usePermission.ts` (lines 7-21)
- Admin users get ALL permissions automatically (via `isAdmin` check in `can()` function)
- Staff users only get permissions listed in the `staffPermissions` array in `auth.ts`

**Target State:** Update all permission strings to use "caravans" consistently.

**IMPORTANT:** We are NOT creating a PERMISSIONS constant object. We are simply updating the hardcoded permission strings throughout the codebase and updating the JSDoc comments for documentation.

**Permission String Updates:**

| Old String | New String |
|------------|------------|
| `'view_agents'` | `'view_caravans'` |
| `'create_agents'` | `'create_caravans'` |
| `'edit_agents'` | `'edit_caravans'` |
| `'delete_agents'` | `'delete_caravans'` |

**New Permission String:**
- `'release_loan'` - For UDI submission (admin only)

**usePermission.ts Updates:**
- Update JSDoc comments (lines 7-21) to reference caravan permissions instead of agents
- Add `release_loan` to the JSDoc comments for documentation
- Note: No PERMISSIONS object to create; we're only updating documentation/comments

**auth.ts Updates:**
- Update `staffPermissions` array (lines 87-95): rename agents → caravans
- DO NOT add `'release_loan'` to staffPermissions (admin only)

**Implementation Note:** The `can()` function checks `isAdmin` first (returns true for admins), then checks against the staffPermissions array for staff users. This means:
- Admins automatically have ALL permissions, including `release_loan`
- Staff users only have permissions explicitly listed in staffPermissions array
- We DO NOT add `release_loan` to staffPermissions because it's admin-only

### 3. UDI/Release Loan Permission

**Problem:** The "Release Loan" button in ClientsListView has NO permission check, allowing any authenticated user to submit UDI requests.

**Solution:** Add `release_loan` permission (admin only) and wrap the button with permission check.

**Permission Definition:**
```typescript
// Added to JSDoc comments in usePermission.ts for documentation
// The actual check uses the hardcoded string: can('release_loan')
release_loan  // Admin only - submit UDI requests
```

**Access Control:**
- **Admin:** Has `release_loan` permission (can submit UDI requests)
- **Staff:** Does NOT have `release_loan` permission (button hidden)
- **Rationale:** Financial transactions require admin-level oversight

**Implementation:**
1. Add `release_loan` to JSDoc comments in `usePermission.ts` (for documentation)
2. The permission check uses hardcoded string: `can('release_loan')`
3. Admin users automatically have this permission (via `isAdmin` check)
4. DO NOT add to staffPermissions (admin-only feature)
5. Wrap "Release Loan" button with `can('release_loan') ? ... : null` check

### 4. Caravan Name Display

**Problem:** ClientDetailView shows caravan ID instead of caravan name.

**Current Behavior:**
```typescript
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  return client.value.caravan_id  // Shows ID: "abc-123-def"
})
```

**Target Behavior:**
```typescript
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  const caravan = caravansStore.caravans.find(c => c.id === client.value.caravan_id)
  return caravan?.name || client.value.caravan_id  // Shows: "Caravan Name"
})
```

**Implementation:**
- Fetch caravans when ClientDetailView mounts
- Use same pattern as ClientsListView (already working correctly)
- Fallback to ID if caravan not found in store

### 5. Agency Feature Removal

**Problem:** Agency dropdown shows "Select agency" with no options, displaying "N/A" in client list.

**Solution:** Remove Agency field from ClientForm and table.

**Changes:**
- **ClientFormView.vue:** Remove agency dropdown section
- **ClientsListView.vue:** Remove Agency column from table
- **ClientDetailView.vue:** Remove "Agency: N/A" display (lines ~131-132)
- **types.ts:** Keep `agency_id` field (for data integrity, may be used later)

**Rationale:** Feature is incomplete and adds no value. Better to remove than confuse users.

## Technical Implementation

### Files to Modify

#### Core Permission System
1. `src/composables/usePermission.ts`
   - Update JSDoc comments (lines 7-21) to change agents → caravans terminology
   - Add release_loan to JSDoc comments (documentation only)
   - Note: No PERMISSIONS object exists; permissions use hardcoded strings

2. `src/stores/auth.ts`
   - Update staffPermissions array (lines 87-95)
   - Change agents → caravans: view_caravans, create_caravans, edit_caravans, delete_caravans
   - DO NOT add release_loan (admin-only)

#### Caravan Management
3. `src/views/caravan/CaravansListView.vue`
   - Rename "New MR" → "New Caravan"
   - Update dialog titles and empty states
   - Note: Permission checks already use `can('create_caravans')` - no code changes needed, only text updates

#### Client Management
4. `src/views/clients/ClientsListView.vue`
   - Add permission check to "Release Loan" button
   - Remove Agency column
   - Update any agent permission checks (if any)

5. `src/views/clients/ClientFormView.vue`
   - Remove agency dropdown section (lines ~283-308)

6. `src/views/clients/ClientDetailView.vue`
   - Import `useCaravansStore`
   - Fetch caravans in `onMounted`
   - Update caravanName computed property
   - Remove "Agency: N/A" display (lines ~131-132)

#### Location Components
7. `src/components/locations/MunicipalityManager.vue`
   - Update permission check: `can('view_agents')` → `can('view_caravans')`

8. `src/components/locations/AssignedMunicipalitiesList.vue`
   - Update permission check: `can('view_agents')` → `can('view_caravans')`

#### Types
9. `src/lib/types.ts`
   - No changes needed (keep Agent alias for compatibility)

### Detailed Implementation: ClientDetailView Caravan Name Fix

**Current Code (ClientDetailView.vue):**
```typescript
// Line 6 - Missing import
import { useClientsStore } from '@/stores/clients'

// Lines 64-67 - Shows ID instead of name
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  return client.value.caravan_id  // BUG: Shows ID
})
```

**Fixed Code:**
```typescript
// Line 6 - Add caravan store import
import { useClientsStore } from '@/stores/clients'
import { useCaravansStore } from '@/stores/caravans'  // ADD THIS

// Inside setup()
const clientsStore = useClientsStore()
const caravansStore = useCaravansStore()  // ADD THIS

// Fetch caravans when component mounts (parallel with client fetch)
onMounted(async () => {
  // Fetch both client and caravans in parallel for better performance
  await Promise.all([
    clientsStore.fetchClient(route.params.id as string),
    caravansStore.fetchCaravans({ status: 'active' })
  ])
})

// Lines 64-67 - Updated computed with loading state handling
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  // Handle case where caravans store might not be loaded yet
  if (caravansStore.loading) return 'Loading...'
  const caravan = caravansStore.caravans.find(c => c.id === client.value.caravan_id)
  return caravan?.name || client.value.caravan_id  // Shows name, falls back to ID
})
```

**Timing Consideration:** By fetching caravans in parallel with the client using `Promise.all()`, we ensure the caravan data is available by the time the component renders, minimizing the "Loading..." state duration.

### Detailed Implementation: Release Loan Permission Check

**Current Code (ClientsListView.vue ~274-288):**
```vue
{
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => {
    const client = row.original
    return h('div', { class: 'flex items-center gap-2' }, [
      can('edit_clients') ? h(Button, {
        variant: 'ghost',
        size: 'sm',
        class: 'text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50',
        onClick: () => router.push(`/clients/${client.id}`)
      }, () => 'View') : null,
      // SECURITY ISSUE: No permission check on Release Loan button!
      h(Button, {
        variant: 'ghost',
        size: 'sm',
        class: 'text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50',
        onClick: () => handleReleaseLoan(client)
      }, () => 'Release Loan'),
    ].filter(Boolean))
  }
}
```

**Fixed Code:**
```vue
{
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => {
    const client = row.original
    return h('div', { class: 'flex items-center gap-2' }, [
      can('edit_clients') ? h(Button, {
        variant: 'ghost',
        size: 'sm',
        class: 'text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50',
        onClick: () => router.push(`/clients/${client.id}`)
      }, () => 'View') : null,
      // FIXED: Added release_loan permission check (admin only)
      can('release_loan') ? h(Button, {
        variant: 'ghost',
        size: 'sm',
        class: 'text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50',
        onClick: () => handleReleaseLoan(client)
      }, () => 'Release Loan') : null,
    ].filter(Boolean))
  }
}
```

**Changes:** Wrap entire "Release Loan" button with `can('release_loan') ? ... : null`

### Component Updates Summary

| Component | Changes |
|-----------|----------|
| Sidebar | No changes (already uses "Caravan") |
| CaravansListView | Rename MR→Caravan, update permissions |
| ClientsListView | Add release_loan check, remove Agency column |
| ClientFormView | Remove agency dropdown |
| ClientDetailView | Fetch caravans, show name instead of ID, remove Agency display |
| usePermission | Update JSDoc comments (agents → caravans, add release_loan) |
| auth store | Update staffPermissions |

## Testing Strategy

### Manual Testing Checklist

#### Terminology
- [ ] Sidebar shows "Caravan" (unchanged)
- [ ] Caravan page shows "New Caravan" button (was "New MR")
- [ ] Empty state says "new Caravan" (was "new MR")
- [ ] Dialog titles use "Caravan"

#### Permissions
- [ ] Admin can see all caravan management options
- [ ] Staff can view caravans but not delete
- [ ] "Release Loan" button visible only for Admin
- [ ] Staff users do NOT see "Release Loan" button

#### Caravan Display
- [ ] ClientDetailView shows caravan name instead of ID
- [ ] Fallback to ID if caravan not found
- [ ] Caravan column in ClientsListView shows names (unchanged)

#### Agency Removal
- [ ] ClientForm has no agency dropdown
- [ ] ClientsListView has no Agency column
- [ ] ClientDetailView has no Agency display
- [ ] No "N/A" displayed in client lists or detail views

### Permission Test Matrix

| Action | Admin | Staff |
|--------|-------|-------|
| View caravans | ✅ | ✅ |
| Create caravan | ✅ | ✅ |
| Edit caravan | ✅ | ✅ |
| Delete caravan | ✅ | ❌ |
| View clients | ✅ | ✅ |
| Create client | ✅ | ✅ |
| Edit client | ✅ | ✅ |
| Delete client | ✅ | ❌ |
| Release Loan (UDI) | ✅ | ❌ |
| View approvals | ✅ | ❌ |
| Approve/reject | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Manage settings | ✅ | ❌ |

## Migration Notes

### Database Changes
**None required** - This is purely frontend/UI changes.

### Backend Changes
**None required** - Existing API endpoints support all needed data.

### Breaking Changes
**None** - All changes are backwards compatible.

### Data Migration: Agency Field
**Current State:** Some clients may have `agency_id` values in the database.

**Strategy:** Keep `agency_id` field in database and types.ts (for data integrity), but remove from UI.
- No data migration needed
- Existing `agency_id` values are preserved
- Field can be re-added to UI later when Agency feature is implemented
- Agency display removed from: ClientForm dropdown, ClientsListView table, ClientDetailView detail card

### Implementation Sequence

**IMPORTANT:** Execute in this exact order to avoid breaking functionality:

**Phase 1: Permission System (CRITICAL - Do First)**
1. Update `src/composables/usePermission.ts` - Add caravan permissions and release_loan
2. Update `src/stores/auth.ts` - Update staffPermissions array
3. Verify permission system works before proceeding

**Phase 2: Update All Permission Checks**
4. Update ALL files using `*_agents` permissions (see Complete File List below)
5. Test with both Admin and Staff accounts

**Phase 3: Terminology Updates**
6. Update CaravansListView.vue - Rename MR → Caravan
7. Update any other MR references

**Phase 4: Feature Improvements**
8. Update ClientDetailView.vue - Fetch and show caravan names
9. Add permission check to "Release Loan" button
10. Remove Agency field from ClientForm, table, and detail view

### Rollback Plan
If issues arise:
1. Revert permission name changes (caravans → agents)
2. Re-add Agency dropdown/field
3. Remove release_loan permission check
4. Test rollback in development environment first

### Complete File List: Permission Check Updates

**CRITICAL:** All files using `*_agents` permissions must be updated:

| File | Line/Section | Current Check | New Check |
|------|--------------|---------------|------------|
| `src/views/caravan/CaravansListView.vue` | Multiple | `can('create_agents')` | `can('create_caravans')` |
| `src/views/clients/ClientsListView.vue` | Multiple | `can('view_clients')` | (unchanged) |
| `src/components/locations/MunicipalityManager.vue` | ~36 | `can('edit_agents')` | `can('edit_caravans')` |
| `src/components/locations/AssignedMunicipalitiesList.vue` | ~29 | `can('edit_agents')` | `can('edit_caravans')` |
| `src/views/locations/LocationAssignmentsView.vue` | N/A | N/A | N/A |

**Search Pattern:** `grep -r "agents'" src/ --include="*.vue" --include="*.ts"`

### Component/File Naming Decision

**Decision:** Keep component filenames as-is (no rename).

**Rationale:**
- `NewMRDialog.vue` - Keep filename, only update displayed text
- Reducing file rename risk
- Less git history disruption
- Internal naming doesn't affect UX

**What gets renamed:**
- Button labels: "New MR" → "New Caravan"
- Dialog titles: "MR Dialog" → "Caravan Dialog"
- Empty state text
- Variable names (where semantic)

## Dependencies

### Internal Dependencies
- Permission system must be updated BEFORE component checks
- Caravan store must be loaded for ClientDetailView to work

### External Dependencies
- None

## Success Criteria

1. ✅ All instances of "MR" replaced with "Caravan"
2. ✅ All permission checks use "caravans" terminology
3. ✅ "Release Loan" button restricted to Admin only
4. ✅ ClientDetailView shows caravan names (not IDs)
5. ✅ Agency field removed from client forms and detail views
6. ✅ Staff users have appropriate (limited) access
7. ✅ No TypeScript errors
8. ✅ All permission checks work correctly

## Future Considerations

### Mobile App Integration
- Mobile app (Flutter) will have its own UDI submission flow
- Caravans can submit UDI requests directly from mobile
- Web admin approves these requests via "Approvals - UDI" page

### Potential Enhancements
- Add diff view to Client Approvals (show what changed)
- Add bulk operations for approvals
- Implement Agency management if needed in future
- Add calendar view for Itineraries

---

**Document Status:** Ready for implementation planning
