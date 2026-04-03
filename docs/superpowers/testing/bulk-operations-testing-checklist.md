# Bulk Operations - Manual Testing Checklist

**Date:** 2026-03-27
**Feature:** Bulk Operations (Delete, Approve, Reject)
**Status:** Ready for Testing

## Test Environment Setup

1. Start backend: `cd backend && pnpm start:dev`
2. Start frontend: `cd imu-web-vue && pnpm dev`
3. Log in as an admin user (to test all permissions)
4. Open browser DevTools Console for error logs

---

## Part 1: Bulk Delete Testing

### 1.1 UsersListView Bulk Delete

**Test Case 1.1.1: Select Multiple Users**
- [ ] Navigate to Users page
- [ ] Click checkboxes in the table to select 2-3 users
- [ ] Verify BulkActionBar appears at top with "X selected"
- [ ] Verify "Delete All" button is visible
- [ ] Verify "Clear selection" button is visible

**Test Case 1.1.2: Bulk Delete Confirmation**
- [ ] Click "Delete All" button
- [ ] Verify BulkConfirmDialog opens
- [ ] Verify dialog shows list of selected users by name
- [ ] Verify dialog has "Confirm" and "Cancel" buttons
- [ ] Verify dialog styling (red color scheme for delete)

**Test Case 1.1.3: Successful Bulk Delete**
- [ ] Click "Confirm" in dialog
- [ ] Verify toast notification appears: "Deleted X items"
- [ ] Verify users are removed from the table
- [ ] Verify BulkActionBar disappears
- [ ] Verify selection is cleared

**Test Case 1.1.4: Self-Deletion Prevention**
- [ ] Try to delete your own account (include current user ID in selection)
- [ ] Verify error message: "Cannot delete your own account"
- [ ] Verify no users are deleted

**Test Case 1.1.5: Partial Failure Handling**
- [ ] Select users that include some with dependent records
- [ ] Attempt bulk delete
- [ ] Verify toast shows partial success: "Deleted X items, Y failed"
- [ ] Verify only successful deletions are removed from table
- [ ] Verify failed items remain selected

### 1.2 CaravansListView Bulk Delete

**Test Case 1.2.1: Card Grid Selection**
- [ ] Navigate to Caravan page
- [ ] Click checkboxes on caravan cards to select 2-3 caravans
- [ ] Verify visual ring highlight appears on selected cards
- [ ] Verify BulkActionBar appears

**Test Case 1.2.2: Bulk Delete Caravans**
- [ ] Follow same confirmation and deletion flow as UsersListView
- [ ] Verify caravan-specific error messages if applicable

### 1.3 GroupsListView Bulk Delete

**Test Case 1.3.1: Groups Selection**
- [ ] Navigate to Groups page
- [ ] Select 2-3 groups using checkboxes
- [ ] Verify BulkActionBar appears

**Test Case 1.3.2: Bulk Delete Groups**
- [ ] Test bulk delete with groups that have members
- [ ] Verify foreign key constraint error: "Cannot delete group with dependent records"

### 1.4 ItinerariesListView Bulk Delete

**Test Case 1.4.1: Itineraries Selection**
- [ ] Navigate to Itineraries page
- [ ] Select 2-3 itineraries using checkboxes
- [ ] Verify BulkActionBar appears

**Test Case 1.4.2: Bulk Delete Itineraries**
- [ ] Test bulk delete with itineraries that have touchpoints
- [ ] Verify foreign key constraint error: "Cannot delete itinerary with dependent touchpoints"

---

## Part 2: Bulk Approve/Reject Testing

### 2.1 ClientApprovalsView Bulk Approve

**Test Case 2.1.1: Select Multiple Approvals**
- [ ] Navigate to Approvals - Client page
- [ ] Select 2-3 pending client edit approvals
- [ ] Verify BulkActionBar appears with "Approve" and "Reject" buttons

**Test Case 2.1.2: Bulk Approve Confirmation**
- [ ] Click "Approve All" button
- [ ] Verify BulkConfirmDialog opens (green color scheme)
- [ ] Verify dialog shows list of selected approvals
- [ ] Click "Confirm"

**Test Case 2.1.3: Bulk Approve Success**
- [ ] Verify toast notification: "Approved X items"
- [ ] Verify approvals are removed from table
- [ ] Verify client changes are applied (check client detail if applicable)

**Test Case 2.1.4: Bulk Reject with Reason**
- [ ] Select 2-3 approvals
- [ ] Click "Reject All" button
- [ ] Verify BulkConfirmDialog opens (yellow color scheme)
- [ ] Verify textarea for rejection reason appears
- [ ] Enter reason and click "Confirm"
- [ ] Verify toast notification shows rejection

### 2.2 UdiApprovalsView Bulk Approve/Reject

**Test Case 2.2.1: UDI Approvals Selection**
- [ ] Navigate to Approvals - UDI page
- [ ] Select 2-3 UDI approvals
- [ ] Verify BulkActionBar appears

**Test Case 2.2.2: Bulk Approve UDI**
- [ ] Test bulk approve flow same as ClientApprovalsView
- [ ] Verify UDI-specific approval names display correctly

---

## Part 3: "Select All" with Pagination

### 3.1 Cross-Page Selection

**Test Case 3.1.1: Select All on Current Page**
- [ ] Navigate to a list view with pagination (e.g., Users)
- [ ] Click the header checkbox to select all on current page
- [ ] Verify all rows on current page are selected
- [ ] Verify BulkActionBar shows count (e.g., "20 selected")

**Test Case 3.1.2: Select All Across Pages**
- [ ] With items selected on current page, click "Select all (500 total)" button
- [ ] Verify prompt appears: "Select all 500 items across all pages?"
- [ ] Click "Confirm"
- [ ] Verify all 500 items are selected
- [ ] Verify BulkActionBar shows "500 selected"

**Test Case 3.1.3: Deselect All**
- [ ] Click "Clear selection" button
- [ ] Verify all selections are cleared
- [ ] Verify BulkActionBar disappears

### 3.2 Selection Persistence

**Test Case 3.2.1: Change Page with Selection**
- [ ] Select some items on page 1
- [ ] Navigate to page 2
- [ ] Verify selection is cleared (expected behavior)
- [ ] Verify BulkActionBar disappears

**Test Case 3.2.2: Change Filters with Selection**
- [ ] Select some items
- [ ] Change any filter
- [ ] Verify selection is cleared
- [ ] Verify BulkActionBar disappears

---

## Part 4: Error Handling

### 4.1 Network Errors

**Test Case 4.1.1: Backend Disconnected**
- [ ] Stop the backend server
- [ ] Attempt bulk operation
- [ ] Verify error toast appears
- [ ] Verify error message is user-friendly
- [ ] Verify selection is preserved for retry

**Test Case 4.1.2: Connection Restored**
- [ ] Start backend server
- [ ] Retry bulk operation
- [ ] Verify operation succeeds

### 4.2 Permission Errors

**Test Case 4.2.1: Insufficient Permissions**
- [ ] Log in as non-admin user (e.g., caravan role)
- [ ] Navigate to Users page
- [ ] Verify no checkboxes are visible
- [ ] Verify no BulkActionBar appears
- [ ] Verify delete buttons are hidden

### 4.3 Partial Failures

**Test Case 4.3.1: Mixed Success/Failure**
- [ ] Select items where some will fail (e.g., users with dependent records)
- [ ] Execute bulk operation
- [ ] Verify toast shows: "Deleted X items, Y failed. Click for details"
- [ ] Click toast to expand error details
- [ ] Verify failed items are listed with error messages

---

## Part 5: Accessibility

### 5.1 Keyboard Navigation

**Test Case 5.1.1: Tab Navigation**
- [ ] Use Tab key to navigate to checkboxes
- [ ] Verify checkboxes receive focus
- [ ] Verify focus indicator is visible

**Test Case 5.1.2: Keyboard Selection**
- [ ] Navigate to a checkbox
- [ ] Press Space to toggle selection
- [ ] Verify selection state changes
- [ ] Verify BulkActionBar appears/disappears

**Test Case 5.1.3: Keyboard Actions**
- [ ] Select items using keyboard
- [ ] Use Tab to navigate to "Delete All" button
- [ ] Press Enter to activate
- [ ] Verify confirmation dialog opens

### 5.2 Screen Reader Support

**Test Case 5.2.1: ARIA Labels**
- [ ] Enable screen reader (e.g., NVDA, JAWS)
- [ ] Navigate to checkboxes
- [ ] Verify checkboxes are announced: "Select row X, checkbox"
- [ ] Verify header checkbox: "Select all rows, checkbox"

**Test Case 5.2.2: Selection Announcements**
- [ ] Select multiple items
- [ ] Verify BulkActionBar content is announced: "X selected"

### 5.3 Focus Management

**Test Case 5.3.1: Dialog Focus**
- [ ] Open BulkConfirmDialog
- [ ] Verify focus moves to dialog
- [ ] Verify focus is trapped within dialog
- [ ] Verify focus returns to triggering element after close

---

## Part 6: Edge Cases

### 6.1 Large Selections

**Test Case 6.1.1: Maximum Batch Size**
- [ ] Try to select more than 100 items (if possible)
- [ ] Verify validation prevents selection over 100
- [ ] Verify error message: "Cannot select more than 100 items"

### 6.2 Empty Selection

**Test Case 6.2.1: No Items Selected**
- [ ] Verify no BulkActionBar when nothing selected
- [ ] Verify action buttons are disabled in UI

### 6.3 Rapid Operations

**Test Case 6.3.1: Quick Sequential Operations**
- [ ] Select items and bulk delete
- [ ] Immediately select more items and bulk delete
- [ ] Verify no race conditions occur
- [ ] Verify operations complete in correct order

---

## Part 7: Removed Buttons Verification

### 7.1 TouchpointsListView

**Test Case 7.1.1: No Delete Button**
- [ ] Navigate to Touchpoints page
- [ ] Verify NO "New Touchpoint" button in header
- [ ] Verify NO delete buttons in actions column
- [ ] Verify only "View" button exists

### 7.2 ClientsListView

**Test Case 7.2.1: No Delete Button**
- [ ] Navigate to Clients page
- [ ] Verify NO delete buttons in actions column
- [ ] Verify only "Edit" and "Release Loan" buttons exist (if applicable)

---

## Part 8: Mobile Responsiveness

### 8.1 Bulk Actions Bar on Mobile

**Test Case 8.1.1: Mobile Layout**
- [ ] Resize browser to mobile width (< 768px)
- [ ] Select items to trigger BulkActionBar
- [ ] Verify BulkActionBar moves to bottom of screen (sticky footer)
- [ ] Verify buttons are still accessible

### 8.2 Confirmation Dialog on Mobile

**Test Case 8.2.1: Mobile Dialog**
- [ ] Trigger BulkConfirmDialog on mobile
- [ ] Verify dialog is fully visible
- [ ] Verify item list is scrollable if needed
- [ ] Verify buttons are tappable

---

## Test Results Summary

### Passed: ___ / ___
### Failed: ___ / ___
### Blocked: ___ / ___

### Notes:
- Record any issues found during testing
- Include screenshots of failures if applicable
- Note any deviations from expected behavior

---

## Sign-Off

**Tester:** _______________
**Date:** _______________
**Status:** [ ] Passed [ ] Failed with blockers [ ] Failed with non-blockers

**Comments:**
_________________________________________________
_________________________________________________
_________________________________________________
