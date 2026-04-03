# Elephant Carpaccio v3.0 - IMU Vue Admin Dashboard

> **Created:** 2026-03-03
> **Project:** IMU Vue Admin Dashboard (`imu-web-vue`)
> **Methodology:** Vertical Slicing (Elephant Carpaccio)

---

## Progress Overview

```
Phase 1: Project Setup & Auth  [████████████████████████] 100%  5/5 slices ✅
Phase 2: Dashboard & Layout    [████████████████████████] 100%  3/3 slices ✅
Phase 3: Users CRUD            [████████████████████████] 100%  6/6 slices ✅
Phase 4: Agents CRUD           [████████████████████████] 100%  6/6 slices ✅
Phase 5: Clients CRUD          [████████████████████████] 100%  7/7 slices ✅
Phase 6: Polish & RBAC         [████████████████████████] 100%  4/4 slices ✅

TOTAL: 31/31 slices complete (100%) ✅
```

### Legend

| Status | Symbol | Description |
|--------|--------|-------------|
| Complete | `✅` | Slice implemented and verified |
| In progress | `📊` | Currently being worked on |
| Blocked | `🚫` | Waiting on dependency |
| Not started | `[░░░░]` | Not yet started |

---

## Blockers & Issues

| ID | Slice | Issue | Raised By | Date | Status |
|----|-------|-------|-----------|------|--------|
| - | - | No active blockers | - | - | - |

---

## Decision Log

| ID | Decision | Impact | Date | Made By |
|----|----------|--------|------|---------|
| D001 | Vue 3 + Tailwind + HeadlessUI | Flexible, matches Figma design | 2026-03-03 | Team |
| D002 | PocketBase backend | Rapid development, already in use | 2026-03-03 | Team |
| D003 | 2 RBAC roles (Admin/Staff) | Simplified permissions model | 2026-03-03 | Team |
| D004 | TanStack Table for data tables | Headless, customizable, performant | 2026-03-03 | Team |

---

## Phase 1: Project Setup & Auth

### Slice 1.1: Walking Skeleton ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Create minimal Vue 3 project that starts without errors and connects to PocketBase.

**Acceptance Criteria:**
- [x] Vue 3 + Vite + TypeScript project created in `imu-web-vue/`
- [x] Tailwind CSS configured with IMU brand colors
- [x] PocketBase client setup in `/lib/pocketbase.ts`
- [x] App starts and shows "IMU Admin" title
- [x] No console errors

**Files:**
- `package.json`
- `vite.config.ts`
- `tailwind.config.js`
- `src/main.ts`
- `src/App.vue`
- `src/lib/pocketbase.ts`
- `src/styles/main.css`

---

### Slice 1.2: Auth Layout & Login Page UI ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Create login page with form UI (no functionality yet).

**Acceptance Criteria:**
- [x] `AuthLayout.vue` created with centered container
- [x] `LoginView.vue` with email/password inputs
- [x] "Forgot password?" link (non-functional)
- [x] Login button with loading state
- [x] IMU logo displayed
- [x] Matches Figma login design (colors, typography)

**Files:**
- `src/layouts/AuthLayout.vue`
- `src/views/auth/LoginView.vue`
- `src/components/ui/Button.vue`
- `src/components/ui/Input.vue`
- `src/assets/images/logo.svg`

---

### Slice 1.3: PocketBase Auth Integration ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Connect login form to PocketBase authentication.

**Acceptance Criteria:**
- [x] `authStore` created with Pinia
- [x] Login form calls PocketBase `authWithPassword`
- [x] Successful login stores user in authStore
- [x] Failed login shows error message
- [x] Auth state persisted across page refresh

**Files:**
- `src/stores/auth.ts`
- `src/views/auth/LoginView.vue` (connect form)

---

### Slice 1.4: Admin Layout Shell ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Create main admin layout with sidebar and header.

**Acceptance Criteria:**
- [x] `AdminLayout.vue` with sidebar + main content area
- [x] `Sidebar.vue` with navigation items (Dashboard, Users, Agents, Clients, Settings)
- [x] `Header.vue` with user menu and logout
- [x] Responsive: sidebar collapses on mobile
- [x] Active nav item highlighted

**Files:**
- `src/layouts/AdminLayout.vue`
- `src/components/shared/Sidebar.vue`
- `src/components/shared/Header.vue`

---

### Slice 1.5: Auth Guards & Redirects ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Protect routes and handle auth state changes.

**Acceptance Criteria:**
- [x] Unauthenticated users redirected to `/login`
- [x] Authenticated users redirected away from `/login`
- [x] Logout clears auth state and redirects to login
- [x] Page title updates based on route

**Files:**
- `src/router/index.ts`
- `src/stores/auth.ts`

---

## Phase 2: Dashboard & Layout

### Slice 2.1: Dashboard Page with Stats Cards ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Create dashboard with hardcoded stats.

**Acceptance Criteria:**
- [x] `DashboardView.vue` created
- [x] 4 stat cards: Total Agents, Total Clients, Today's Visits, Pending Tasks
- [x] Stats use hardcoded values initially
- [x] Cards use proper styling (Tailwind)
- [x] Page header with "Dashboard" title

**Files:**
- `src/views/dashboard/DashboardView.vue`
- `src/components/shared/PageHeader.vue`
- `src/components/ui/Card.vue`

---

### Slice 2.2: Dashboard - Real Stats from PocketBase ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Replace hardcoded stats with real PocketBase queries.

**Acceptance Criteria:**
- [x] Agent count from `agents` collection
- [x] Client count from `clients` collection
- [x] Today's visits from `itineraries` collection
- [x] Loading states while fetching
- [x] Error handling for failed requests

**Files:**
- `src/views/dashboard/DashboardView.vue`
- `src/stores/dashboard.ts`

---

### Slice 2.3: Dashboard - Recent Activity Table ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Show recent touchpoints/visits on dashboard.

**Acceptance Criteria:**
- [x] Table shows last 10 touchpoints
- [x] Columns: Agent, Client, Type, Status, Date
- [x] TanStack Table implementation
- [x] Loading and empty states
- [x] Click row to navigate to detail (placeholder)

**Files:**
- `src/views/dashboard/DashboardView.vue`
- `src/components/ui/DataTable.vue`
- `src/stores/dashboard.ts`

---

## Phase 3: Users CRUD

### Slice 3.1: Users List Page ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Display users in a data table.

**Acceptance Criteria:**
- [x] `UsersListView.vue` created at `/users`
- [x] TanStack Table with columns: Name, Email, Role, Status, Actions
- [x] Data fetched from PocketBase `users` collection
- [x] Loading skeleton while fetching
- [x] Empty state when no users

**Files:**
- `src/views/users/UsersListView.vue`
- `src/stores/users.ts`
- `src/components/ui/DataTable.vue`

---

### Slice 3.2: Users List - Search & Filter ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Add search and role filter to users list.

**Acceptance Criteria:**
- [x] Search input filters by name/email (debounced)
- [x] Role filter dropdown (Admin/Staff/All)
- [x] Filters work together (AND logic)
- [x] Clear filters button
- [x] URL params update with filters

**Files:**
- `src/views/users/UsersListView.vue`
- `src/components/shared/SearchInput.vue`
- `src/components/shared/FilterDropdown.vue`

---

### Slice 3.3: Create User Form ✅
**Time:** 2.5 hours
**Status:** COMPLETE

**Description:** Form to create new users.

**Acceptance Criteria:**
- [x] `UserFormView.vue` at `/users/new`
- [x] Form fields: Name, Email, Role, Password, Confirm Password
- [x] Zod validation schema
- [x] Inline error messages
- [x] Submit creates user in PocketBase
- [x] Success toast + redirect to list
- [x] Error toast on failure

**Files:**
- `src/views/users/UserFormView.vue`
- `src/validations/user.ts`
- `src/composables/useToast.ts`
- `src/components/ui/Toast.vue`

---

### Slice 3.4: Edit User Form ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Form to edit existing users.

**Acceptance Criteria:**
- [x] Same form as create, pre-filled with user data
- [x] Password fields optional (only update if changed)
- [x] Updates user in PocketBase
- [x] Success toast + redirect to list

**Files:**
- `src/views/users/UserFormView.vue`

---

### Slice 3.5: Delete User ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Delete user with confirmation.

**Acceptance Criteria:**
- [x] Delete button in actions column
- [x] `ConfirmDialog.vue` modal on click
- [x] Confirm deletes user from PocketBase
- [x] Success toast + remove from list
- [x] Cancel closes modal

**Files:**
- `src/views/users/UsersListView.vue`
- `src/components/shared/ConfirmDialog.vue`
- `src/components/ui/Modal.vue`

---

### Slice 3.6: Users Pagination ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Add pagination to users table.

**Acceptance Criteria:**
- [x] 20 users per page
- [x] Prev/Next buttons
- [x] Page info (e.g., "1-20 of 45")
- [x] URL param for page number

**Files:**
- `src/views/users/UsersListView.vue`
- `src/components/ui/DataTable.vue` (enhance)

---

## Phase 4: Agents CRUD

### Slice 4.1: Agents List Page ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Display agents in a data table.

**Acceptance Criteria:**
- [x] `AgentsListView.vue` created at `/agents`
- [x] Table columns: Name, Email, Phone, Assigned Area, Status, Actions
- [x] Data from PocketBase `agents` collection
- [x] Loading and empty states

**Files:**
- `src/views/agents/AgentsListView.vue`
- `src/stores/agents.ts` (enhance)

---

### Slice 4.2: Agents List - Filters ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Add filters and search to agents list.

**Acceptance Criteria:**
- [x] Search by name/email
- [x] Filter by status (Active/Inactive)
- [x] Filter by assigned area (dropdown)

**Files:**
- `src/views/agents/AgentsListView.vue`

---

### Slice 4.3: Agent Detail Page ✅
**Time:** 2.5 hours
**Status:** COMPLETE

**Description:** Show agent profile with related data.

**Acceptance Criteria:**
- [x] `AgentDetailView.vue` at `/agents/:id`
- [x] Profile card with agent info
- [x] Assigned clients list (table)
- [x] Recent visits (last 5 touchpoints)
- [x] Back button to list

**Files:**
- `src/views/agents/AgentDetailView.vue`
- `src/stores/agents.ts` (fetchAgent method)

---

### Slice 4.4: Create Agent Form ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Form to create new agents.

**Acceptance Criteria:**
- [x] Form fields: Name, Email, Phone, Assigned Area, Status
- [x] Zod validation
- [x] Creates agent in PocketBase
- [x] Success/error handling

**Files:**
- `src/views/agents/AgentFormView.vue` (new)
- `src/validations/agent.ts`
- `src/router/index.ts` (add route)

---

### Slice 4.5: Edit Agent Form ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Form to edit existing agents.

**Acceptance Criteria:**
- [x] Pre-filled with agent data
- [x] Updates agent in PocketBase
- [x] Success redirect to detail page

**Files:**
- `src/views/agents/AgentFormView.vue` (enhance)

---

### Slice 4.6: Delete Agent ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Delete agent with confirmation.

**Acceptance Criteria:**
- [x] Delete button with confirm modal
- [x] Success toast + redirect to list

**Files:**
- `src/views/agents/AgentsListView.vue`
- `src/views/agents/AgentDetailView.vue`

---

## Phase 5: Clients CRUD

### Slice 5.1: Clients List Page ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Display clients in a data table.

**Acceptance Criteria:**
- [x] `ClientsListView.vue` created at `/clients`
- [x] Table columns: Name, Type, Agency, Agent, Status, Actions
- [x] Data from PocketBase `clients` collection
- [x] Expand relations (agency, agent names)

**Files:**
- `src/views/clients/ClientsListView.vue`
- `src/stores/clients.ts` (enhance)

---

### Slice 5.2: Clients List - Filters ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Add filters to clients list.

**Acceptance Criteria:**
- [x] Search by name
- [x] Filter by type (Potential/Existing)
- [x] Filter by agency
- [x] Filter by assigned agent

**Files:**
- `src/views/clients/ClientsListView.vue`

---

### Slice 5.3: Client Detail Page ✅
**Time:** 3 hours
**Status:** COMPLETE

**Description:** Show client profile with touchpoint history.

**Acceptance Criteria:**
- [x] `ClientDetailView.vue` at `/clients/:id`
- [x] Personal info card
- [x] Addresses list
- [x] Phone numbers list
- [x] Touchpoint history (7-step timeline)
- [x] Assigned agent info

**Files:**
- `src/views/clients/ClientDetailView.vue`
- `src/stores/clients.ts` (fetchClient method)

---

### Slice 5.4: Create Client Form - Step 1 ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** First step of multi-step client form (Personal Info).

**Acceptance Criteria:**
- [x] `ClientFormView.vue` with step indicator
- [x] Step 1: First name, Last name, Middle name, Client type
- [x] Zod validation
- [x] Next button proceeds to step 2

**Files:**
- `src/views/clients/ClientFormView.vue` (new)
- `src/validations/client.ts`

---

### Slice 5.5: Create Client Form - Steps 2-3 ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Complete multi-step form.

**Acceptance Criteria:**
- [x] Step 2: Contact info (phone numbers)
- [x] Step 3: Address + Classification (agency, agent, product type)
- [x] Back button returns to previous step
- [x] Submit creates client in PocketBase

**Files:**
- `src/views/clients/ClientFormView.vue` (enhance)

---

### Slice 5.6: Edit Client Form ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Form to edit existing clients.

**Acceptance Criteria:**
- [x] Pre-filled with client data
- [x] Same multi-step form
- [x] Updates client in PocketBase

**Files:**
- `src/views/clients/ClientFormView.vue` (enhance)

---

### Slice 5.7: Delete Client ✅
**Time:** 1 hour
**Status:** COMPLETE

**Description:** Delete client with confirmation.

**Acceptance Criteria:**
- [x] Delete button with confirm modal
- [x] Success toast + redirect to list

**Files:**
- `src/views/clients/ClientsListView.vue`
- `src/views/clients/ClientDetailView.vue`

---

## Phase 6: Polish & RBAC

### Slice 6.1: Settings Page ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** User profile settings page.

**Acceptance Criteria:**
- [x] `SettingsView.vue` at `/settings`
- [x] Profile section: Name, Email
- [x] Password change form
- [x] Success/error handling

**Files:**
- `src/views/settings/SettingsView.vue`

---

### Slice 6.2: RBAC - Permission Checks ✅
**Time:** 2 hours
**Status:** COMPLETE

**Description:** Implement permission-based access control.

**Acceptance Criteria:**
- [x] `can(permission)` method in authStore
- [x] Route guards check permissions
- [x] UI elements hidden based on permissions
- [x] Staff cannot access create/edit/delete user pages

**Files:**
- `src/stores/auth.ts`
- `src/router/index.ts`
- `src/composables/usePermission.ts`

---

### Slice 6.3: Error Boundary & 404 Page ✅
**Time:** 1.5 hours
**Status:** COMPLETE

**Description:** Handle unexpected errors and 404s.

**Acceptance Criteria:**
- [x] `NotFoundView.vue` for 404 routes
- [x] Error boundary catches component errors
- [x] Friendly error message displayed

**Files:**
- `src/views/NotFoundView.vue`
- `src/App.vue` (error boundary)

---

### Slice 6.4: Final Polish & Testing ✅
**Time:** 3 hours
**Status:** COMPLETE

**Description:** Final review and polish.

**Acceptance Criteria:**
- [x] All pages have proper loading states
- [x] All forms have proper validation
- [x] All error states handled
- [x] Design consistent across pages
- [x] Mobile responsiveness verified
- [x] All routes protected appropriately

**Files:**
- Various (polish pass)

---

## Summary

| Phase | Slices | Est. Time |
|-------|--------|-----------|
| 1. Project Setup & Auth | 5 | 8 hours |
| 2. Dashboard & Layout | 3 | 6 hours |
| 3. Users CRUD | 6 | 9.5 hours |
| 4. Agents CRUD | 6 | 10 hours |
| 5. Clients CRUD | 7 | 13 hours |
| 6. Polish & RBAC | 4 | 8.5 hours |
| **Total** | **31** | **~55 hours** |

---

## Quick Reference: Slice Status

| Slice | Description | Status |
|-------|-------------|--------|
| 1.1 | Walking Skeleton | ✅ |
| 1.2 | Auth Layout & Login UI | ✅ |
| 1.3 | PocketBase Auth Integration | ✅ |
| 1.4 | Admin Layout Shell | ✅ |
| 1.5 | Auth Guards & Redirects | ✅ |
| 2.1 | Dashboard Stats Cards | ✅ |
| 2.2 | Dashboard Real Stats | ✅ |
| 2.3 | Dashboard Recent Activity | ✅ |
| 3.1 | Users List Page | ✅ |
| 3.2 | Users Search & Filter | ✅ |
| 3.3 | Create User Form | ✅ |
| 3.4 | Edit User Form | ✅ |
| 3.5 | Delete User | ✅ |
| 3.6 | Users Pagination | ✅ |
| 4.1 | Agents List Page | ✅ |
| 4.2 | Agents Filters | ✅ |
| 4.3 | Agent Detail Page | ✅ |
| 4.4 | Create Agent Form | ✅ |
| 4.5 | Edit Agent Form | ✅ |
| 4.6 | Delete Agent | ✅ |
| 5.1 | Clients List Page | ✅ |
| 5.2 | Clients Filters | ✅ |
| 5.3 | Client Detail Page | ✅ |
| 5.4 | Create Client Step 1 | ✅ |
| 5.5 | Create Client Steps 2-3 | ✅ |
| 5.6 | Edit Client Form | ✅ |
| 5.7 | Delete Client | ✅ |
| 6.1 | Settings Page | ✅ |
| 6.2 | RBAC Permission Checks | ✅ |
| 6.3 | Error Boundary & 404 | ✅ |
| 6.4 | Final Polish & Testing | ✅ |

---

*Elephant Carpaccio v3.0 - IMU Vue Admin Dashboard Implementation Slices*
