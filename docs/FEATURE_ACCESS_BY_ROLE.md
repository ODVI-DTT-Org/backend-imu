# Role-Based Feature Access Documentation

> **Purpose**: Document what each role sees in both Mobile App (Flutter) and Web App (Vue)
> **Last Updated**: 2026-04-03
> **Version**: 1.1 (Updated RBAC Alignment)

---

## Overview

This document shows the complete feature access matrix for all 5 roles across both platforms:

- **Mobile App (Flutter)**: Field agent operations
- **Web App (Vue Admin Dashboard)**: Administrative operations

### Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| **Admin** | 100 | Full system access |
| **Area Manager** | 50 | Regional oversight |
| **Assistant Area Manager** | 40 | Area management support |
| **Caravan** | 20 | Field agents (Visit touchpoints only) |
| **Tele** | 15 | Telemarketers (Call touchpoints only) |

---

## FINAL RBAC ALIGNMENT (Updated 2026-04-03)

### ✅ Admin: Full Access (14 Navigation Items)
- **All 14 navigation items** visible
- ✅ Dashboard, Caravan, Groups, Itineraries, Clients, Touchpoints
- ✅ Reports, Approvals (Client & UDI), Audit Trail, Location Assignments, Users
- ✅ My Calls (oversight), Settings
- ✅ Only role with **Approvals** access
- ✅ Only role with **Error Logs** access

### ✅ Area Manager: 9 Navigation Items
- **Visible**: Dashboard, Caravan, Groups, Itineraries, Clients, Touchpoints, Reports, My Calls, Settings
- ❌ **NOT Visible**: Approvals (Client/UDI), Audit Trail, Location Assignments, Users
- ✅ Can create both Visit and Call touchpoints
- ✅ Can manage users (create, edit, assign roles/areas)
- ✅ **Added**: My Calls access (for oversight)

### ✅ Assistant Area Manager: 9 Navigation Items (Same as Area Manager)
- **Visible**: Dashboard, Caravan, Groups, Itineraries, Clients, Touchpoints, Reports, My Calls, Settings
- ❌ **NOT Visible**: Approvals (Client/UDI), Audit Trail, Location Assignments, Users
- ✅ Limited area access
- ✅ Can create both Visit and Call touchpoints
- ✅ **Added**: My Calls access (for oversight)

### ❌ Caravan: NO Web Access (Mobile App Only)
- ❌ **NO Vue Web App navigation** access
- ❌ Redirected to mobile app or denied access
- ✅ **Full Mobile App** access (all features)
- ✅ Can create/edit clients
- ✅ Can create **Visit touchpoints only** (1, 4, 7)
- ❌ Cannot create Call touchpoints

### ✅ Tele: 3 Navigation Items (Web Admin Only)
- **Visible**: Clients, Touchpoints, My Calls
- ❌ **NOT Visible**: Dashboard, Caravan, Groups, Itineraries, Reports
- ❌ **NOT Visible**: Approvals, Audit Trail, Location Assignments, Users
- ✅ Read-only **Clients** access
- ✅ Can create **Call touchpoints only** (2, 3, 5, 6)
- ❌ Cannot create Visit touchpoints

---

## Web App (Vue Admin Dashboard) - Complete Navigation Menu (14 Items)

| # | Menu Item | Admin | Area Manager | Asst. Area Manager | Caravan | Tele |
|---|-----------|-------|--------------|-------------------|---------|------|
| 1 | **Dashboard** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 2 | **Caravan** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 3 | **Groups** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 4 | **Itineraries** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 5 | **Clients** | ✅ | ✅ | ✅ | ❌ | ✅ |
| 6 | **Touchpoints** | ✅ | ✅ | ✅ | ❌ | ✅ |
| 7 | **Reports** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 8 | **Approvals - Client** | ✅ | ❌ | ❌ | ❌ | ❌ |
| 9 | **Approvals - UDI** | ✅ | ❌ | ❌ | ❌ | ❌ |
| 10 | **Audit Trail** | ✅ | ❌ | ❌ | ❌ | ❌ |
| 11 | **Location Assignments** | ✅ | ❌ | ❌ | ❌ | ❌ |
| 12 | **Users** | ✅ | ❌ | ❌ | ❌ | ❌ |
| 13 | **My Calls** | ✅ | ✅ | ✅ | ❌ | ✅ |
| 14 | **Settings** | ✅ | ✅ | ✅ | ❌ | ✅ |

**Legend:**
- ✅ = Visible in navigation menu
- ❌ = Hidden (no access)
- **Caravan**: Redirected to mobile app (no web access)
- **Tele**: Web admin dashboard only (no mobile app access)

---

## Mobile App (Flutter) - Feature Access by Role

### Home Screen (6-Icon Grid)

| Feature | Admin | Area Manager | Asst. Area Manager | Caravan | Tele |
|---------|-------|--------------|-------------------|---------|------|
| **Clients** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Agencies** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Groups** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **My Day** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Targets** | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Attendance** | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Reports** | ✅ | ✅ | ✅ | ❌ | ❌ |

### Bottom Navigation (4 Tabs)

| Tab | Admin | Area Manager | Asst. Area Manager | Caravan | Tele |
|-----|-------|--------------|-------------------|---------|------|
| **Home** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **My Day** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Itinerary** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Clients** | ✅ | ✅ | ✅ | ✅ | ❌ |

### Caravan Role: Mobile App Full Access

**Caravan users have FULL ACCESS to all mobile app features:**
- ✅ Clients (create, edit, delete, map view)
- ✅ My Day (tasks, progress, time in/out)
- ✅ Itinerary (day tabs, visit cards)
- ✅ Touchpoints (Visit only: 1, 4, 7)
- ✅ Targets (view own targets)
- ✅ Attendance (mark attendance)
- ✅ Settings (account, appearance, sync)
- ✅ Loan Calculator
- ✅ Profile Management
- ✅ Missed Visits
- ❌ NO Call Log (Tele feature)

**Caravan Restrictions:**
- ❌ Cannot create Call touchpoints (numbers 2, 3, 5, 6)
- ❌ NO Web Admin Dashboard access

### Tele Role: Web Admin Only (No Mobile App)

**Tele users have RESTRICTED access to web admin dashboard:**
- ✅ Clients (read-only)
- ✅ Touchpoints (Call only: 2, 3, 5, 6)
- ✅ My Calls (manage call touchpoints)
- ❌ NO Dashboard
- ❌ NO Caravan, Groups, Itineraries access
- ❌ NO Reports, Approvals, Audit Trail, Location Assignments, Users
- ❌ NO Mobile App access

**Tele Restrictions:**
- ❌ Cannot create Visit touchpoints (numbers 1, 4, 7)
- ❌ Cannot edit/delete clients
- ❌ NO Mobile App access

---

## Permission Matrix Summary

### Navigation Menu Permissions

| Menu Item | Resource | Action | Admin | Area Mgr | Asst. Area Mgr | Caravan | Tele |
|-----------|---------|--------|-------|----------|----------------|---------|------|
| Dashboard | dashboard | read | ✅ | ✅ | ✅ | ❌ | ❌ |
| Caravan | users | read | ✅ | ✅ | ✅ | ❌ | ❌ |
| Groups | groups | read | ✅ | ✅ | ✅ | ❌ | ❌ |
| Itineraries | itineraries | read | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clients | clients | read | ✅ | ✅ | ✅ | ❌ | ✅ |
| Touchpoints | touchpoints | read | ✅ | ✅ | ✅ | ❌ | ✅ |
| Reports | reports | read | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approvals - Client | approvals | read | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approvals - UDI | approvals | read | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit Trail | audit_logs | read | ✅ | ❌ | ❌ | ❌ | ❌ |
| Location Assignments | locations | assign | ✅ | ❌ | ❌ | ❌ | ❌ |
| Users | users | read | ✅ | ❌ | ❌ | ❌ | ❌ |
| My Calls | touchpoints | read | ✅ | ✅ | ✅ | ❌ | ✅ |
| Settings | settings | manage | ✅ | ✅ | ✅ | ❌ | ✅ |

---

## Implementation Changes Made

### 1. Vue Web App Sidebar (Updated)
**File:** `imu-web-vue/src/components/shared/Sidebar.vue`

**Changes:**
- Dashboard: Added Assistant Area Manager
- Itineraries: Removed Caravan (mobile only)
- Touchpoints: Removed Caravan (mobile only)
- Approvals (Client & UDI): Admin only
- Audit Trail: Admin only
- Location Assignments: Admin only
- Users: Admin only
- My Calls: Added Area Manager and Assistant Area Manager
- Settings: Added all roles (except Caravan for web)

### 2. Backend Migration (Updated)
**File:** `backend/src/migrations/040_add_missing_rbac_resources.sql`

**Changes:**
- Dashboard permissions: Admin + Area Manager + Assistant Area Manager
- Approvals permissions: Admin only (6 permissions)
- Error Logs permissions: Admin only (3 permissions)

---

## Testing Checklist

### Admin Role (14 items)
- [ ] Can access all 14 navigation items
- [ ] Can access Approvals (Client & UDI)
- [ ] Can access Error Logs
- [ ] Can access Audit Trail, Location Assignments, Users
- [ ] Can see My Calls (oversight)

### Area Manager Role (9 items)
- [ ] Can access Dashboard
- [ ] Can see My Calls
- [ ] CANNOT access Approvals
- [ ] CANNOT access Error Logs
- [ ] CANNOT access Audit Trail
- [ ] CANNOT access Location Assignments
- [ ] CANNOT access Users

### Assistant Area Manager Role (9 items)
- [ ] Can access Dashboard
- [ ] Can see My Calls
- [ ] CANNOT access Approvals
- [ ] CANNOT access Error Logs
- [ ] CANNOT access Audit Trail
- [ ] CANNOT access Location Assignments
- [ ] CANNOT access Users

### Caravan Role (Mobile Only)
- [ ] CANNOT access Web Admin Dashboard
- [ ] Redirected to mobile app or denied access
- [ ] Full Mobile App access
- [ ] Can only create Visit touchpoints (1, 4, 7)

### Tele Role (3 items - Web Only)
- [ ] Can access Clients (read-only)
- [ ] Can access Touchpoints (Call only)
- [ ] Can access My Calls
- [ ] CANNOT access Dashboard
- [ ] CANNOT access Mobile App
- [ ] Can only create Call touchpoints (2, 3, 5, 6)

---

**Related Files:**
- Vue Sidebar: `imu-web-vue/src/components/shared/Sidebar.vue`
- Migration: `backend/src/migrations/040_add_missing_rbac_resources.sql`
- Documentation: `RBAC_RESOURCE_ALIGNMENT.md`
- Feature Access: `FEATURE_ACCESS_BY_ROLE.md` (this file)

## Test Execution Log (2026-04-03)

### Migration 040 Results ✅
**Status:** COMPLETED
**Database:** QA (DigitalOcean)
**Timestamp:** 2026-04-03

| Resource | Permissions Created | Role Assignments | Status |
|----------|---------------------|------------------|--------|
| Dashboard | 2 (read, read_performance) | Admin, Area Manager, Assistant Area Manager | ✅ |
| Approvals | 6 (read, create, approve, reject, update, delete) | Admin only | ✅ |
| Error Logs | 3 (read, resolve, delete) | Admin only | ✅ |

### Web App Testing Results

**Test Environment:**
- Web App: http://localhost:4002 ✅ Running
- Backend: http://localhost:4000 (to be started)
- Database: QA (DigitalOcean) ✅ Connected

| Role | Test User | Expected Items | Actual Items | Status | Notes |
|------|-----------|----------------|--------------|--------|-------|
| Admin | admin@imu.test | 14 | - | ⏳ Pending | Awaiting test |
| Area Manager | area.manager@imu.test | 9 | - | ⏳ Pending | Awaiting test |
| Assistant Area Manager | asst.area.manager@imu.test | 9 | - | ⏳ Pending | Awaiting test |
| Caravan | caravan@imu.test | 0 (redirect) | - | ⏳ Pending | Awaiting test |
| Tele | tele@imu.test | 3 | - | ⏳ Pending | Awaiting test |

### Detailed Navigation Test Results

#### Admin Role - 14 Items Expected
| # | Menu Item | Expected | Actual | Status | Tester | Date |
|---|-----------|----------|--------|--------|--------|------|
| 1 | Dashboard | ✅ | - | ⏳ | - | - |
| 2 | Caravan | ✅ | - | ⏳ | - | - |
| 3 | Groups | ✅ | - | ⏳ | - | - |
| 4 | Itineraries | ✅ | - | ⏳ | - | - |
| 5 | Clients | ✅ | - | ⏳ | - | - |
| 6 | Touchpoints | ✅ | - | ⏳ | - | - |
| 7 | Reports | ✅ | - | ⏳ | - | - |
| 8 | Approvals - Client | ✅ | - | ⏳ | - | - |
| 9 | Approvals - UDI | ✅ | - | ⏳ | - | - |
| 10 | Audit Trail | ✅ | - | ⏳ | - | - |
| 11 | Location Assignments | ✅ | - | ⏳ | - | - |
| 12 | Users | ✅ | - | ⏳ | - | - |
| 13 | My Calls | ✅ | - | ⏳ | - | - |
| 14 | Settings | ✅ | - | ⏳ | - | - |

#### Area Manager Role - 9 Items Expected
| # | Menu Item | Expected | Actual | Status | Notes |
|---|-----------|----------|--------|--------|-------|
| 1 | Dashboard | ✅ | - | ⏳ | |
| 2 | Caravan | ✅ | - | ⏳ | |
| 3 | Groups | ✅ | - | ⏳ | |
| 4 | Itineraries | ✅ | - | ⏳ | |
| 5 | Clients | ✅ | - | ⏳ | |
| 6 | Touchpoints | ✅ | - | ⏳ | |
| 7 | Reports | ✅ | - | ⏳ | |
| 13 | My Calls | ✅ | - | ⏳ | **NEW** |
| 14 | Settings | ✅ | - | ⏳ | |
| 8 | Approvals - Client | ❌ | - | ⏳ | Should NOT see |
| 9 | Approvals - UDI | ❌ | - | ⏳ | Should NOT see |
| 10 | Audit Trail | ❌ | - | ⏳ | Should NOT see |
| 11 | Location Assignments | ❌ | - | ⏳ | Should NOT see |
| 12 | Users | ❌ | - | ⏳ | Should NOT see |

#### Tele Role - 3 Items Expected
| # | Menu Item | Expected | Actual | Status | Notes |
|---|-----------|----------|--------|--------|-------|
| 5 | Clients | ✅ | - | ⏳ | Read-only |
| 6 | Touchpoints | ✅ | - | ⏳ | Call only |
| 13 | My Calls | ✅ | - | ⏳ | |
| 1 | Dashboard | ❌ | - | ⏳ | Should NOT see |
| 2 | Caravan | ❌ | - | ⏳ | Should NOT see |
| 3 | Groups | ❌ | - | ⏳ | Should NOT see |
| 4 | Itineraries | ❌ | - | ⏳ | Should NOT see |
| 7 | Reports | ❌ | - | ⏳ | Should NOT see |

---

## Testing Instructions

### Prerequisites
1. ✅ Backend migration 040 completed
2. ✅ Web app running on http://localhost:4002
3. ⏳ Backend running on http://localhost:4000
4. ⏳ Test user accounts available

### Test Procedure for Each Role

1. **Navigate to:** http://localhost:4002/login
2. **Login with:** test credentials for the role
3. **Observe:** Which navigation items appear in the sidebar
4. **Verify:** Count matches expected number
5. **Document:** Record actual vs expected in the tables above
6. **Test Access:** Try to access restricted pages (should get permission denied)

### Quick Reference Test Cases

```
TEST 1: Admin Role
  Email: admin@imu.test
  Expected: 14 navigation items
  Critical: Can see Approvals, Error Logs, Users

TEST 2: Area Manager Role
  Email: area.manager@imu.test
  Expected: 9 navigation items
  Critical: Can see Dashboard, My Calls
  Critical: CANNOT see Approvals, Users, Audit Trail

TEST 3: Assistant Area Manager Role
  Email: asst.area.manager@imu.test
  Expected: 9 navigation items (same as Area Manager)
  Critical: Can see Dashboard, My Calls
  Critical: CANNOT see Approvals, Users, Audit Trail

TEST 4: Caravan Role
  Email: caravan@imu.test
  Expected: 0 navigation items (redirected or denied)
  Critical: Should be denied access to web admin

TEST 5: Tele Role
  Email: tele@imu.test
  Expected: 3 navigation items (Clients, Touchpoints, My Calls)
  Critical: CANNOT see Dashboard, Reports, Caravan
```

---

**Last Updated**: 2026-04-03
**Status**: ✅ Migration Complete | ⏳ Awaiting Testing Results
**Migration**: 040_add_missing_rbac_resources.sql - DEPLOYED TO QA
