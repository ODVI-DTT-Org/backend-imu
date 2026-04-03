# Tele Role Implementation - E2E Testing Checklist

## Overview

This document provides a comprehensive checklist for end-to-end testing of the Tele role implementation, which enables telemarketers to create Call-only touchpoints while maintaining the existing Caravan role for Visit-only touchpoints.

---

## 1. User Role Testing

### 1.1 Tele User Role
- [ ] **Tele user can log in to web admin**
  - Log in with Tele role credentials
  - Verify access to Tele-specific menu items
  - Verify no access to Caravan/Groups/Itineraries (unless admin overrides)

- [ ] **Tele user sidebar shows correct menu items**
  - "My Clients" menu item visible
  - "My Calls" menu item visible
  - Dashboard, Settings visible
  - Caravan, Groups, Itineraries NOT visible (for non-admin Tele users)

### 1.2 Caravan User Role
- [ ] **Caravan user can log in to mobile app**
  - Log in with Caravan role credentials
  - Verify access to Clients, Itinerary, Touchpoints
  - Verify role-based restrictions

### 1.3 Admin/Manager Users
- [ ] **Admin users can create both Visit and Call touchpoints**
  - Log in as Admin
  - Verify full system access
  - Create both Visit and Call touchpoints

- [ ] **Area Manager users can create both Visit and Call touchpoints**
  - Log in as Area Manager
  - Verify full system access
  - Create both Visit and Call touchpoints

- [ ] **Assistant Area Manager users can create both Visit and Call touchpoints**
  - Log in as Assistant Area Manager
  - Verify appropriate system access
  - Create both Visit and Call touchpoints

---

## 2. Touchpoint Sequence Validation

### 2.1 Web Admin (Tele User)
- [ ] **Call Form modal enforces correct sequence**
  - Client with 0 touchpoints → Cannot create (first must be Visit)
  - Client with 1 Visit → Can create 2nd touchpoint (Call)
  - Client with 2 Call → Can create 4th touchpoint (Visit)
  - Client with 3 touchpoints → Can create 4th (Visit)
  - Client with 7 touchpoints → Cannot create more

- [ ] **Touchpoint number is auto-calculated**
  - Verify correct touchpoint number displayed in form
  - Verify correct next expected type displayed

### 2.2 Mobile App (Caravan User)
- [ ] **Touchpoint form enforces correct sequence**
  - Client with 0 touchpoints → Can create 1st (Visit)
  - Client with 1 Visit → Can create 2nd (Call) - BUT Caravan users restricted
  - Client with 2 Call → Can create 4th (Visit)
  - Client with 7 touchpoints → Cannot create more

- [ ] **Next touchpoint info is displayed correctly**
  - Shows correct next number
  - Shows correct next type
  - Shows progress indicator

---

## 3. Role-Based Access Control

### 3.1 Tele User Restrictions
- [ ] **Tele user cannot create Visit touchpoints (1, 4, 7)**
  - Try to create Visit touchpoint #1 → Should fail
  - Try to create Visit touchpoint #4 → Should fail
  - Try to create Visit touchpoint #7 → Should fail
  - Error message: "Tele users can only create Call touchpoints"

- [ ] **Tele user CAN create Call touchpoints (2, 3, 5, 6)**
  - Create Call touchpoint #2 → Should succeed
  - Create Call touchpoint #3 → Should succeed
  - Create Call touchpoint #5 → Should succeed
  - Create Call touchpoint #6 → Should succeed

### 3.2 Caravan User Restrictions
- [ ] **Caravan user cannot create Call touchpoints (2, 3, 5, 6)**
  - Try to create Call touchpoint #2 → Should fail
  - Try to create Call touchpoint #3 → Should fail
  - Try to create Call touchpoint #5 → Should fail
  - Try to create Call touchpoint #6 → Should fail
  - Error message: "Caravan users can only create Visit touchpoints"

- [ ] **Caravan user CAN create Visit touchpoints (1, 4, 7)**
  - Create Visit touchpoint #1 → Should succeed
  - Create Visit touchpoint #4 → Should succeed
  - Create Visit touchpoint #7 → Should succeed

### 3.3 Manager Permissions
- [ ] **Admin users can create any touchpoint**
  - Create Visit #1 → Success
  - Create Call #2 → Success
  - Create any number → Success

- [ ] **Area Manager users can create any touchpoint**
  - Create Visit #1 → Success
  - Create Call #2 → Success

- [ ] **Assistant Area Manager users can create any touchpoint**
  - Create Visit #1 → Success
  - Create Call #2 → Success

---

## 4. Status Field Testing

### 4.1 Web Admin
- [ ] **Status field appears in Call Form modal**
  - Status dropdown is visible
  - All 4 options available: Interested, Undecided, Not Interested, Completed
  - Default value is "Interested"

- [ ] **Status field saves correctly**
  - Select "Interested" → Saves correctly
  - Select "Undecided" → Saves correctly
  - Select "Not Interested" → Saves correctly
  - Select "Completed" → Saves correctly

- [ ] **Status field displays in Client Detail modal**
  - Touchpoint list shows status
  - Status has correct color coding
  - Status label is correct

### 4.2 Mobile App
- [ ] **Status field appears in Touchpoint form**
  - Status dropdown is visible
  - All 4 options available
  - Default value is "Interested"

- [ ] **Status field saves correctly**
  - Select each status → Verify save
  - Verify in Client detail view

---

## 5. User ID Field Testing (caravan_id → user_id migration)

### 5.1 Backend
- [ ] **Database schema has user_id column**
  - Check touchpoints table for user_id
  - Verify NO caravan_id column exists

- [ ] **Existing records migrated correctly**
  - Old caravan_id values copied to user_id
  - Data integrity maintained

### 5.2 Web Admin
- [ ] **Touchpoints display correct user info**
  - User names display correctly
  - No references to caravan_id

### 5.3 Mobile App
- [ ] **Touchpoints save with user_id**
  - Create touchpoint → Verify user_id in database
  - No caravan_id in request payload

---

## 6. Time In/Out GPS Fields Testing

### 6.1 Backend
- [ ] **Database schema has Time In/Out GPS columns**
  - time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address
  - time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address

### 6.2 Mobile App
- [ ] **Touchpoint form includes Time In/Out GPS fields**
  - Fields are present in form
  - GPS coordinates captured when available
  - Address reverse-geocoded when available

- [ ] **Time In/Out data saves correctly**
  - Create touchpoint with GPS → Verify in database
  - Verify timestamp captured
  - Verify coordinates captured

### 6.3 Web Admin
- [ ] **Touchpoint detail displays Time In/Out GPS**
  - Display timestamp
  - Display coordinates (if available)
  - Display address (if available)

---

## 7. Client Assignment Testing

### 7.1 Tele User Assignments
- [ ] **Tele users can be assigned clients**
  - Assign Tele user to clients via web admin
  - Assignments save correctly

- [ ] **Tele users see only their assigned clients**
  - "My Clients" page shows only assigned clients
  - Other clients are filtered out

- [ ] **Tele users can edit their assigned clients**
  - Edit client info → Success
  - Changes persist

### 7.2 Caravan User Assignments
- [ ] **Caravan users can be assigned clients**
  - Assign Caravan user to clients
  - Assignments save correctly

- [ ] **Caravan users see their assigned clients**
  - Mobile app shows assigned clients
  - Itinerary shows assigned clients

---

## 8. API Endpoint Testing

### 8.1 Touchpoint Endpoints
- [ ] **POST /api/touchpoints validates role**
  - Tele user creating Visit → 403 Forbidden
  - Caravan user creating Call → 403 Forbidden
  - Admin creating any → 201 Created

- [ ] **PUT /api/touchpoints/:id validates role**
  - Role validation on updates
  - Status field updates correctly

- [ ] **GET /api/touchpoints returns user_id**
  - Response includes user_id
  - No caravan_id in response

### 8.2 Client Endpoints
- [ ] **GET /api/clients filters by user**
  - Tele user sees only their clients
  - Caravan user sees only their clients

---

## 9. Error Handling Testing

### 9.1 Validation Errors
- [ ] **Invalid touchpoint sequence returns clear error**
  - Wrong type for position → Specific error message
  - Touchpoint number out of range → Specific error message

- [ ] **Role violation returns clear error**
  - Tele creating Visit → "Tele users can only create Call touchpoints"
  - Caravan creating Call → "Caravan users can only create Visit touchpoints"

### 9.2 Permission Errors
- [ ] **Unauthorized access returns 401/403**
  - Unauthenticated user → 401 Unauthorized
  - Wrong role for action → 403 Forbidden

---

## 10. Data Integrity Testing

### 10.1 Database Constraints
- [ ] **Foreign key constraints work**
  - Cannot create touchpoint for non-existent client
  - Cannot create touchpoint with non-existent user

- [ ] **Touchpoint sequence is enforced**
  - Cannot skip touchpoint numbers
  - Cannot create duplicate touchpoint numbers for same client

### 10.2 PowerSync Sync
- [ ] **Mobile touchpoints sync to backend**
  - Create touchpoint offline
  - Sync when online
  - Verify in backend database

- [ ] **Backend touchpoints sync to mobile**
  - Create touchpoint in web admin
  - Mobile app receives update
  - Verify in mobile local database

---

## 11. UI/UX Testing

### 11.1 Web Admin
- [ ] **Call Form modal UX**
  - Modal opens smoothly
  - Form is responsive
  - Validation messages are clear
  - Success/error notifications work

- [ ] **Client Detail modal UX**
  - Touchpoint list scrolls correctly
  - Status badges are visible and colored
  - User names display correctly

- [ ] **"My Clients" page UX**
  - Table loads efficiently
  - Filters work correctly
  - Pagination works

### 11.2 Mobile App
- [ ] **Touchpoint form UX**
  - Form scrolls smoothly
  - Dropdowns work correctly
  - Status field is accessible
  - GPS fields capture when available

- [ ] **Client detail UX**
  - Touchpoint list displays correctly
  - Status indicators are visible
  - Progress indicator shows correct count

---

## 12. Performance Testing

### 12.1 Load Testing
- [ ] **Multiple Tele users creating calls concurrently**
  - 10+ concurrent Call creations
  - No database locks
  - All requests succeed

### 12.2 Sync Performance
- [ ] **Large touchpoint datasets sync efficiently**
  - 1000+ touchpoints sync in reasonable time
  - No memory issues
  - No data corruption

---

## 13. Regression Testing

### 13.1 Existing Functionality
- [ ] **Caravan workflow still works**
  - Caravan users can create Visit touchpoints
  - Itinerary still shows correct clients
  - No regressions in Caravan user experience

- [ ] **Admin workflow still works**
  - Admins can manage all users
  - Admins can create any touchpoint type
  - Reports still generate correctly

---

## 14. Cross-Platform Testing

### 14.1 Web Browser Compatibility
- [ ] **Chrome**
- [ ] **Firefox**
- [ ] **Safari**
- [ ] **Edge**

### 14.2 Mobile Device Compatibility
- [ ] **iOS**
- [ ] **Android**
- [ ] **Tablet**

---

## 15. Documentation Testing

- [ ] **API documentation is accurate**
  - Tele role documented
  - Status field documented
  - Role validation documented

- [ ] **User documentation is accurate**
  - Tele user guide
  - Caravan user guide
  - Admin user guide

---

## Test Results Summary

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| User Role Testing | 9 | | | |
| Touchpoint Sequence | 6 | | | |
| Role-Based Access | 13 | | | |
| Status Field | 6 | | | |
| User ID Migration | 5 | | | |
| Time In/Out GPS | 6 | | | |
| Client Assignment | 6 | | | |
| API Endpoints | 6 | | | |
| Error Handling | 5 | | | |
| Data Integrity | 5 | | | |
| UI/UX | 9 | | | |
| Performance | 4 | | | |
| Regression | 4 | | | |
| Cross-Platform | 7 | | | |
| Documentation | 4 | | | |
| **TOTAL** | **98** | | | |

---

## Sign-Off

**Tester Name**: ______________________

**Test Date**: ______________________

**Overall Result**: ☐ Pass  ☐ Fail  ☐ Pass with Conditions

**Notes**:
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________

**Known Issues**:
1. _____________________________________________________________________
2. _____________________________________________________________________
3. _____________________________________________________________________

**Recommendations**:
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
