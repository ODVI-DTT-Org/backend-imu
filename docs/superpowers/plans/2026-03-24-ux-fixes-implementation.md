# UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical UX inconsistencies and permission issues in the IMU Admin Vue web application - standardize terminology, update permissions, add security checks, improve data display, and remove incomplete features.

**Architecture:** Follow 4-phase sequence: (1) Permission System → (2) Update All Permission Checks → (3) Terminology Updates → (4) Feature Improvements. Each phase builds on the previous, with Phase 1 being critical foundation.

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia stores, TanStack Table, hardcoded permission strings (no PERMISSIONS object)

---

## File Structure

**9 files to modify:**
1. `src/composables/usePermission.ts` - Update JSDoc comments (agents → caravans, add release_loan)
2. `src/stores/auth.ts` - Update staffPermissions array (agents → caravans)
3. `src/views/caravan/CaravansListView.vue` - Rename MR → Caravan (text only)
4. `src/views/clients/ClientsListView.vue` - Add release_loan check, remove Agency column
5. `src/views/clients/ClientFormView.vue` - Remove agency dropdown
6. `src/views/clients/ClientDetailView.vue` - Fetch caravans, show names, remove Agency display
7. `src/components/locations/MunicipalityManager.vue` - Update permission check
8. `src/components/locations/AssignedMunicipalitiesList.vue` - Update permission check
9. `src/lib/types.ts` - No changes (keep Agent alias)

**No new files created.** No database or backend changes required.

---

# PHASE 1: Permission System (CRITICAL - Do First)

> **WHY THIS ORDER:** Permission system is the foundation. If we update component permission checks before updating the permission system, nothing will work. Complete Phase 1 and verify it works before proceeding.

## Task 1: Update usePermission.ts JSDoc Comments

**Files:**
- Modify: `src/composables/usePermission.ts:7-21`

- [ ] **Step 1: Read current usePermission.ts to understand the structure**

Run: `cat imu-web-vue/src/composables/usePermission.ts`
Expected: See JSDoc comments listing permissions with `*_agents` format

- [ ] **Step 2: Update JSDoc comments - change agents to caravans**

The JSDoc comments section (lines ~7-21) lists available permissions. Update the permission names:

**FIND:**
```typescript
/**
 * Permission names for the application
 * @typedef {Object} PermissionNames
 * @property {string} view_agents - Can view agents
 * @property {string} create_agents - Can create new agents
 * @property {string} edit_agents - Can edit existing agents
 * @property {string} delete_agents - Can delete agents
 * ...other permissions...
 */
```

**REPLACE WITH:**
```typescript
/**
 * Permission names for the application
 * @typedef {Object} PermissionNames
 * @property {string} view_caravans - Can view caravans
 * @property {string} create_caravans - Can create new caravans
 * @property {string} edit_caravans - Can edit existing caravans
 * @property {string} delete_caravans - Can delete caravans
 * @property {string} release_loan - Can submit UDI/release loan requests (admin only)
 * ...other permissions...
 */
```

**IMPORTANT:** Only update the JSDoc comments. Do NOT create a PERMISSIONS object. Permissions use hardcoded strings.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors related to usePermission.ts

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/composables/usePermission.ts
git commit -m "docs(usePermission): update JSDoc - agents→caravans, add release_loan

- Update permission names in JSDoc comments from agents to caravans
- Add release_loan permission documentation (admin only)
- Note: Permissions use hardcoded strings, no PERMISSIONS object created"
```

---

## Task 2: Update auth.ts staffPermissions Array

**Files:**
- Modify: `src/stores/auth.ts:87-95`

- [ ] **Step 1: Read current auth.ts staffPermissions array**

Run: `sed -n '80,100p' imu-web-vue/src/stores/auth.ts`
Expected: See staffPermissions array with `*_agents` permissions

- [ ] **Step 2: Update staffPermissions array - change agents to caravans**

**FIND:**
```typescript
const staffPermissions = [
  'view_agents',
  'create_agents',
  'edit_agents',
  // ... other permissions ...
]
```

**REPLACE WITH:**
```typescript
const staffPermissions = [
  'view_caravans',
  'create_caravans',
  'edit_caravans',
  // Note: delete_caravans NOT included - staff cannot delete
  // ... other permissions ...
  // DO NOT add 'release_loan' - admin only
]
```

**CRITICAL:** Do NOT add `'release_loan'` to staffPermissions. This permission is admin-only (admins get all permissions automatically via the `isAdmin` check). Also, do NOT add `'delete_caravans'` - staff users should not have delete permissions.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors related to auth.ts

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/stores/auth.ts
git commit -m "feat(auth): rename staff permissions - agents→caravans

- Update staffPermissions array to use caravan terminology
- Remove: view_agents, create_agents, edit_agents
- Add: view_caravans, create_caravans, edit_caravans
- Note: delete_caravans NOT added (staff cannot delete)
- Note: release_loan NOT added (admin-only permission)"
```

---

## Task 3: Verify Permission System Works

**Files:**
- Test: Manual verification in dev server

- [ ] **Step 1: Start dev server**

Run: `cd imu-web-vue && pnpm dev`
Expected: Server starts on http://localhost:4002

- [ ] **Step 2: Login with Admin account**

1. Navigate to http://localhost:4002
2. Login with an Admin account
3. Open browser DevTools Console
4. Run: `localStorage.getItem('user')` to verify auth state
Expected: Admin user logged in successfully

- [ ] **Step 3: Test Admin has all permissions**

Verify permissions through UI behavior:
1. Navigate to Caravans page - verify you can see all options
2. Try to create a new caravan - should work
3. Navigate to Clients page - verify "Release Loan" button is visible
4. Navigate to Location Assignments - verify edit controls are visible
Expected: Admin has full access to all features

- [ ] **Step 4: Login with Staff account and test limited permissions**

1. Logout
2. Login with a Staff account
3. Navigate to Clients page - verify "Release Loan" button is NOT visible
4. Navigate to Caravans page - verify "New Caravan" button IS visible
5. Try to delete a caravan - should NOT be allowed (no delete button)
Expected: Staff has limited access (no delete, no release_loan)

- [ ] **Step 5: Stop dev server**

Press Ctrl+C in terminal

- [ ] **Step 6: Commit (verification checkpoint)**

```bash
cd imu-web-vue
git commit --allow-empty -m "test(phase1): verify permission system works

- Tested Admin has all permissions including release_loan
- Tested Staff has limited permissions (no release_loan)
- Permission system verified, ready for Phase 2"
```

---

# PHASE 2: Update All Permission Checks

> **WHY THIS ORDER:** Now that the permission system supports caravan permissions, update all component permission checks from `*_agents` to `*_caravans`.

## Task 4: Update MunicipalityManager.vue Permission Check

**Files:**
- Modify: `src/components/locations/MunicipalityManager.vue:~36`

- [ ] **Step 1: Find the exact location of edit_agents permission**

Run: `grep -n "edit_agents" imu-web-vue/src/components/locations/MunicipalityManager.vue`
Expected: Shows line number with `can('edit_agents')`

- [ ] **Step 2: Update permission check**

**FIND:**
```vue
<template v-if="can('edit_agents')">
```

**REPLACE WITH:**
```vue
<template v-if="can('edit_caravans')">
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/components/locations/MunicipalityManager.vue
git commit -m "fix(locations): update permission - edit_agents→edit_caravans"
```

---

## Task 5: Update AssignedMunicipalitiesList.vue Permission Check

**Files:**
- Modify: `src/components/locations/AssignedMunicipalitiesList.vue:~29`

- [ ] **Step 1: Find the exact location of edit_agents permission**

Run: `grep -n "edit_agents" imu-web-vue/src/components/locations/AssignedMunicipalitiesList.vue`
Expected: Shows line number with `can('edit_agents')`

- [ ] **Step 2: Update permission check**

**FIND:**
```vue
<template v-if="can('edit_agents')">
```

**REPLACE WITH:**
```vue
<template v-if="can('edit_caravans')">
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/components/locations/AssignedMunicipalitiesList.vue
git commit -m "fix(locations): update permission - edit_agents→edit_caravans"
```

---

## Task 6: Verify All Permission Checks Updated

**Files:**
- Test: Search for remaining `*_agents` permissions

- [ ] **Step 1: Search for any remaining agents permissions**

Run: `grep -r "can('.*agents')" imu-web-vue/src/ --include="*.vue" --include="*.ts"`
Expected: No results (all agents permissions updated to caravans)

- [ ] **Step 2: If results found, update them**

If grep returns any results, for each file:
1. Note the file path and line number
2. Update `can('*_agents')` to `can('*_caravans')`
3. Run type-check to verify
4. Commit the change

- [ ] **Step 3: Commit (verification checkpoint)**

```bash
cd imu-web-vue
git commit --allow-empty -m "test(phase2): verify all permission checks updated

- Searched for remaining can('*_agents') permission checks
- All permission checks now use caravan terminology
- Ready for Phase 3"
```

---

# PHASE 3: Terminology Updates

> **WHY THIS ORDER:** With permissions working, now update UI text from "MR" to "Caravan" for consistency.

## Task 7: Update CaravansListView.vue - MR → Caravan Text

**Files:**
- Modify: `src/views/caravan/CaravansListView.vue`

- [ ] **Step 1: Find all instances of "MR" in CaravansListView**

Run: `grep -n -i " mr" imu-web-vue/src/views/caravan/CaravansListView.vue | grep -v "import" | grep -v "//"`
Expected: List of lines with "MR" text

- [ ] **Step 2: Update "New MR" button text**

**FIND:**
```vue
<Button onClick={openNewMRDialog}>New MR</Button>
```

**REPLACE WITH:**
```vue
<Button onClick={openNewCaravanDialog}>New Caravan</Button>
```

Also update the function name reference if needed.

- [ ] **Step 3: Update dialog title**

**FIND:**
```vue
<DialogTitle>MR Dialog</DialogTitle>
```

**REPLACE WITH:**
```vue
<DialogTitle>Caravan Dialog</DialogTitle>
```

- [ ] **Step 4: Update empty state text**

**FIND:**
```vue
<p>No MRs found. Create a new MR to get started.</p>
```

**REPLACE WITH:**
```vue
<p>No caravans found. Create a new Caravan to get started.</p>
```

- [ ] **Step 5: Update any other MR references**

Look for:
- "Add MR" → "Add Caravan"
- "Edit MR" → "Edit Caravan"
- "Delete MR" → "Delete Caravan"
- "MR Details" → "Caravan Details"

- [ ] **Step 6: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
cd imu-web-vue
git add src/views/caravan/CaravansListView.vue
git commit -m "fix(caravan): rename MR→Caravan in UI text

- Update button: 'New MR' → 'New Caravan'
- Update dialog title: 'MR Dialog' → 'Caravan Dialog'
- Update empty state text
- Standardize terminology throughout component"
```

---

## Task 8: Verify All MR References Updated

**Files:**
- Test: Search for remaining "MR" references

- [ ] **Step 1: Search for remaining "MR" text in Vue files**

Run: `grep -r -i " new mr\| mr dialog\|no mr" imu-web-vue/src/views/ --include="*.vue" | grep -v "import" | grep -v "//"`
Expected: No results (all MR terminology updated)

- [ ] **Step 2: If results found, update them**

If grep returns results, update each instance from "MR" to "Caravan".

- [ ] **Step 3: Commit (verification checkpoint)**

```bash
cd imu-web-vue
git commit --allow-empty -m "test(phase3): verify MR→Caravan terminology updated

- Searched for remaining 'MR' terminology in views
- All UI text now uses 'Caravan' consistently
- Ready for Phase 4"
```

---

# PHASE 4: Feature Improvements

> **WHY THIS ORDER:** Now that permissions and terminology are fixed, implement the feature improvements (caravan names, security check, Agency removal).

## Task 9: ClientDetailView.vue - Fetch Caravans and Show Names

**Files:**
- Modify: `src/views/clients/ClientDetailView.vue`

- [ ] **Step 1: Read current ClientDetailView imports**

Run: `head -20 imu-web-vue/src/views/clients/ClientDetailView.vue`
Expected: See current imports including useClientsStore

- [ ] **Step 2: Add useCaravansStore import**

**FIND (around line 6):**
```typescript
import { useClientsStore } from '@/stores/clients'
```

**REPLACE WITH:**
```typescript
import { useClientsStore } from '@/stores/clients'
import { useCaravansStore } from '@/stores/caravans'
```

- [ ] **Step 3: Initialize caravansStore in setup()**

**FIND (in setup function, after clientsStore initialization):**
```typescript
const clientsStore = useClientsStore()
```

**REPLACE WITH:**
```typescript
const clientsStore = useClientsStore()
const caravansStore = useCaravansStore()
```

- [ ] **Step 4: Fetch caravans in onMounted**

**FIND (the onMounted hook):**
```typescript
onMounted(async () => {
  await clientsStore.fetchClient(route.params.id as string)
})
```

**REPLACE WITH:**
```typescript
onMounted(async () => {
  // Fetch both client and caravans in parallel for better performance
  await Promise.all([
    clientsStore.fetchClient(route.params.id as string),
    caravansStore.fetchCaravans({ status: 'active' })
  ])
})
```

- [ ] **Step 5: Update caravanName computed property**

**FIND (lines ~64-67):**
```typescript
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  return client.value.caravan_id
})
```

**REPLACE WITH:**
```typescript
const caravanName = computed(() => {
  if (!client.value?.caravan_id) return '-'
  // Handle case where caravans store might not be loaded yet
  if (caravansStore.loading) return 'Loading...'
  const caravan = caravansStore.caravans.find(c => c.id === client.value.caravan_id)
  return caravan?.name || client.value.caravan_id
})
```

- [ ] **Step 6: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
cd imu-web-vue
git add src/views/clients/ClientDetailView.vue
git commit -m "fix(clients): show caravan names instead of IDs

- Import useCaravansStore
- Fetch caravans in parallel with client data
- Update caravanName computed to show names (fallback to ID)
- Handle loading state gracefully"
```

---

## Task 10: ClientDetailView.vue - Remove Agency Display

**Files:**
- Modify: `src/views/clients/ClientDetailView.vue:~57-61`

- [ ] **Step 1: Find Agency display section**

Run: `grep -n -i "agency" imu-web-vue/src/views/clients/ClientDetailView.vue | head -5`
Expected: Shows line numbers with "Agency" text (around lines 57-61)

- [ ] **Step 2: Read the agencyName computed property**

Run: `sed -n '55,65p' imu-web-vue/src/views/clients/ClientDetailView.vue`
Expected: See the agencyName computed property that returns 'N/A'

- [ ] **Step 3: Remove agencyName computed property**

**FIND (around lines 57-61):**
```typescript
// Get agency name
const agencyName = computed(() => {
  if (!client.value?.agency_id) return '-'
  return 'N/A' // Agencies not fully implemented
})
```

**REPLACE WITH:**
```typescript
// Agency field removed - feature incomplete
```

Or simply delete the entire computed property block.

- [ ] **Step 4: Find where agencyName is used in template**

Run: `grep -n "agencyName" imu-web-vue/src/views/clients/ClientDetailView.vue`
Expected: Shows where agencyName is referenced in the template

- [ ] **Step 5: Remove Agency display from template**

**FIND (in template section):**
```vue
<dt>Agency</dt>
<dd>{{ agencyName }}</dd>
```

**REPLACE WITH:**
```vue
<!-- Agency field removed - feature incomplete -->
```

Or simply delete the two lines from the template.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/views/clients/ClientDetailView.vue
git commit -m "remove(clients): remove Agency display from detail view

- Remove Agency field from client detail card
- Feature incomplete, showing 'N/A' - removing to avoid confusion
- agency_id field preserved in database/types for future use"
```

---

## Task 11: ClientsListView.vue - Add Release Loan Permission Check

**Files:**
- Modify: `src/views/clients/ClientsListView.vue:~274-288`

- [ ] **Step 1: Find the Release Loan button in actions column**

Run: `grep -n "Release Loan" imu-web-vue/src/views/clients/ClientsListView.vue`
Expected: Shows line number with Release Loan button

- [ ] **Step 2: Read the actions column definition**

Run: `sed -n '270,295p' imu-web-vue/src/views/clients/ClientsListView.vue`
Expected: See the actions column definition with Release Loan button

- [ ] **Step 3: Add release_loan permission check to Release Loan button**

**FIND (in the actions column cell function):**
```javascript
return h('div', { class: 'flex items-center gap-2' }, [
  can('edit_clients') ? h(Button, {
    variant: 'ghost',
    size: 'sm',
    onClick: () => router.push(`/clients/${client.id}`)
  }, () => 'View') : null,
  h(Button, {
    variant: 'ghost',
    size: 'sm',
    onClick: () => handleReleaseLoan(client)
  }, () => 'Release Loan'),
].filter(Boolean))
```

**REPLACE WITH:**
```javascript
return h('div', { class: 'flex items-center gap-2' }, [
  can('edit_clients') ? h(Button, {
    variant: 'ghost',
    size: 'sm',
    onClick: () => router.push(`/clients/${client.id}`)
  }, () => 'View') : null,
  // SECURITY: Added release_loan permission check (admin only)
  can('release_loan') ? h(Button, {
    variant: 'ghost',
    size: 'sm',
    onClick: () => handleReleaseLoan(client)
  }, () => 'Release Loan') : null,
].filter(Boolean))
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd imu-web-vue
git add src/views/clients/ClientsListView.vue
git commit -m "security(clients): add release_loan permission check

- Wrap Release Loan button with can('release_loan') check
- Button now visible only to Admin users
- Fixes security issue where any authenticated user could submit UDI"
```

---

## Task 12: ClientsListView.vue - Remove Agency Column

**Files:**
- Modify: `src/views/clients/ClientsListView.vue:~237-242`

- [ ] **Step 1: Find Agency column definition**

Run: `grep -n "columnHelper.accessor('agency" imu-web-vue/src/views/clients/ClientsListView.vue`
Expected: Shows line number with Agency column definition (around line 237)

- [ ] **Step 2: Read the Agency column definition**

Run: `sed -n '235,245p' imu-web-vue/src/views/clients/ClientsListView.vue`
Expected: See the columnHelper.accessor pattern for agency_id

- [ ] **Step 3: Remove Agency column from table definition**

**FIND (pattern using TanStack Table with columnHelper):**
```typescript
columnHelper.accessor('agency_id', {
  id: 'agency',
  header: 'Agency',
  cell: ({ getValue }) => getValue() || 'N/A'
}),
```

**REPLACE WITH:**
```typescript
// Agency column removed - feature incomplete
```

Or simply delete the entire column definition block (including the comma at the end).

- [ ] **Step 4: Verify no trailing comma issues**

After removing the Agency column, ensure the preceding column ends with a comma and the following column doesn't have a leading comma.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
cd imu-web-vue
git add src/views/clients/ClientsListView.vue
git commit -m "remove(clients): remove Agency column from table

- Remove Agency column from clients table
- Feature incomplete, showing 'N/A' - removing to avoid confusion
- agency_id field preserved in database/types for future use"
```

---

## Task 13: ClientFormView.vue - Remove Agency Dropdown

**Files:**
- Modify: `src/views/clients/ClientFormView.vue:~283-308`

- [ ] **Step 1: Find Agency dropdown section**

Run: `grep -n -i "agency" imu-web-vue/src/views/clients/ClientFormView.vue | head -5`
Expected: Shows line numbers with Agency dropdown

- [ ] **Step 2: Read the Agency dropdown section**

Run: `sed -n '280,310p' imu-web-vue/src/views/clients/ClientFormView.vue`
Expected: See the Agency dropdown section (approximately 25 lines)

- [ ] **Step 3: Remove entire Agency dropdown section**

**FIND (the entire Agency dropdown section, likely includes):**
```vue
<!-- Agency Selection -->
<div class="field">
  <label class="label">Agency</label>
  <div class="control">
    <div class="select is-fullwidth">
      <select v-model="form.agency_id">
        <option value="">Select agency</option>
        <!-- options... -->
      </select>
    </div>
  </div>
</div>
```

**REPLACE WITH:**
```vue
<!-- Agency dropdown removed - feature incomplete -->
```

Or simply delete all lines related to the Agency dropdown.

- [ ] **Step 4: Remove form.agency_id binding if present**

If `form.agency_id` is referenced elsewhere, ensure it doesn't cause errors. The form state can keep the property for data compatibility.

- [ ] **Step 5: Verify no TypeScript errors**

Run: `cd imu-web-vue && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
cd imu-web-vue
git add src/views/clients/ClientFormView.vue
git commit -m "remove(clients): remove Agency dropdown from form

- Remove Agency selection dropdown from client form
- Feature incomplete with no options - removing to avoid confusion
- agency_id field preserved in database/types for future use"
```

---

# FINAL VERIFICATION

## Task 14: Manual Testing Checklist

**Files:**
- Test: Manual verification in dev server

- [ ] **Step 1: Start dev server**

Run: `cd imu-web-vue && pnpm dev`
Expected: Server starts on http://localhost:4002

- [ ] **Step 2: Test terminology updates (Admin or Staff)**

1. Navigate to Caravans page
2. Verify button says "New Caravan" (not "New MR")
3. Verify empty state mentions "Caravan" (not "MR")
4. Verify dialog title uses "Caravan"

- [ ] **Step 3: Test permissions with Admin account**

1. Login with Admin account
2. Navigate to Clients page
3. Verify "Release Loan" button is visible
4. Navigate to Location Assignments
5. Verify edit controls are visible

- [ ] **Step 4: Test permissions with Staff account**

1. Logout and login with Staff account
2. Navigate to Clients page
3. Verify "Release Loan" button is NOT visible
4. Navigate to Caravans page
5. Verify "New Caravan" button is visible (staff can create)
6. Verify delete button is NOT visible (staff cannot delete)

- [ ] **Step 5: Test caravan name display**

1. Navigate to a Client detail page
2. Verify Caravan field shows the caravan NAME (not ID)
3. Verify if caravan not found, shows ID as fallback

- [ ] **Step 6: Test Agency removal**

1. Navigate to Client list
2. Verify NO Agency column in table
3. Navigate to Client form
4. Verify NO Agency dropdown
5. Navigate to Client detail
6. Verify NO Agency field displayed

- [ ] **Step 7: Stop dev server**

Press Ctrl+C in terminal

- [ ] **Step 8: Run full type-check**

Run: `cd imu-web-vue && npx vue-tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 9: Commit (verification checkpoint)**

```bash
cd imu-web-vue
git commit --allow-empty -m "test(final): complete manual testing

✅ Terminology: All 'MR' → 'Caravan' updates verified
✅ Permissions: Admin has all access, Staff limited appropriately
✅ Security: Release Loan button admin-only
✅ Display: Caravan names shown in ClientDetailView
✅ Removal: Agency field removed from all client UIs

All UX fixes verified and working correctly."
```

---

## Success Criteria

- [ ] All instances of "MR" replaced with "Caravan" in UI text
- [ ] All permission checks use "caravans" terminology
- [ ] "Release Loan" button restricted to Admin only
- [ ] ClientDetailView shows caravan names (not IDs)
- [ ] Agency field removed from all client-related UIs
- [ ] Staff users have appropriate limited access
- [ ] No TypeScript errors
- [ ] All permission checks work correctly

---

## Rollback Plan

If issues arise during implementation:

1. **Revert permission changes:**
   ```bash
   git revert HEAD~13..HEAD  # Revert all commits
   ```

2. **Or rollback specific phases:**
   - Phase 4: `git revert HEAD~5..HEAD`
   - Phase 3: `git revert HEAD~8..HEAD~6`
   - Phase 2: `git revert HEAD~10..HEAD~9`
   - Phase 1: `git revert HEAD~12..HEAD~11`

3. **Test rollback in development environment first**

---

**Document Status:** Ready for execution

**Total Estimated Time:** 2-3 hours (14 tasks × ~10 minutes each)

**Dependencies:** None - all changes are frontend-only with no database or backend changes required.
