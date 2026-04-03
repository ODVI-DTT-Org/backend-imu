# Bulk Operations Design

**Date:** 2026-03-27
**Status:** Approved
**Author:** Claude Code

## Overview

Add multi-select bulk operations to list views in the IMU admin dashboard. Users can select multiple items via checkboxes and perform bulk actions (delete, approve, reject) with detailed confirmation dialogs.

**Entities affected:**
- **Touchpoints, Clients**: Remove delete button completely
- **Users, Caravans, Groups, Itineraries**: Add bulk delete
- **Client Approvals, UDI Approvals**: Add bulk approve/reject with reason

**Key features:**
- Checkbox column in tables for multi-selection
- Fixed bulk action bar at top showing count + action buttons
- Detailed confirmation dialog showing item names
- Continue-on-error with detailed failure reporting
- Same permissions as individual actions

## Architecture

### Component Structure
```
components/
  bulk/
    BulkActionBar.vue        # Fixed top bar with count + actions
    BulkConfirmDialog.vue    # Detailed confirmation with item list
    CheckboxColumn.vue       # Reusable checkbox column for tables
```

### Store Extensions
Add bulk action methods to existing stores:
- `bulkDelete(ids: string[])` - for users, caravans, groups, itineraries
- `bulkApprove(ids: string[])` - for approvals
- `bulkReject(ids: string[], reason?: string)` - for approvals

Return format (export from shared types file):
```typescript
// In src/lib/types.ts
export interface BulkResponse {
  success: string[]      // IDs of successfully processed items
  failed: Array<{
    id: string
    error: string        // User-friendly error message
    code?: string        // Error code for debugging
  }>
}
```

**Local State Update Strategy:**
After bulk operations, update local state to remove only successfully processed items:
```typescript
async function bulkDelete(ids: string[]) {
  const response = await api.post('/users/bulk-delete', { ids })

  // Remove only successfully deleted items from local state
  users.value = users.value.filter(u => !response.success.includes(u.id))
  totalItems.value -= response.success.length

  return response
}
```

### Backend API Changes
Add bulk endpoints:
- `POST /api/users/bulk-delete`
- `POST /api/caravans/bulk-delete`
- `POST /api/groups/bulk-delete`
- `POST /api/itineraries/bulk-delete`
- `POST /api/approvals/bulk-approve`
- `POST /api/approvals/bulk-reject`

**Security Considerations:**
- **CSRF Protection**: All bulk endpoints must verify CSRF token (JWT cookies require additional protection for state-changing operations)
- **Rate Limiting**: Limit bulk operations to 10 per minute per user to prevent abuse
- **Max Batch Size**: Limit to 100 items per bulk operation to prevent server overload
- **Self-Deletion Prevention**: For user bulk delete, check if current user's ID is in the list and reject the request
- **Race Conditions**: Handle 404 errors as "already deleted" (success) - don't include in failed array

**Client Edit Handling for Bulk Approvals:**
Bulk approval of client edit requests must apply changes to the client table:
```typescript
for (const approval of approvalsToApprove) {
  if (approval.type === 'client' && approval.reason === 'Client Edit Request') {
    const changes = JSON.parse(approval.notes)
    await applyClientChanges(approval.client_id, changes)
  }
}
```
This requires transaction per batch to ensure atomicity.

## Components

### BulkActionBar.vue
**Props:**
```typescript
{
  selectedCount: number
  availableActions: Array<{
    label: string
    action: () => void
    variant: 'primary' | 'danger' | 'secondary'
    requiresReason?: boolean  // For reject action
  }>
}
```

**Emits:**
```typescript
{
  clearSelection: () => void
}
```

**Features:**
- Fixed position at top of table
- Shows "X selected" text
- Renders action buttons dynamically
- "Clear selection" button on right
- Hidden when selectedCount === 0

### BulkConfirmDialog.vue
**Props:**
```typescript
{
  isOpen: boolean
  action: 'delete' | 'approve' | 'reject'
  itemCount: number
  items: Array<{id: string, name: string}>
  requiresReason?: boolean  // For reject
}
```

**Emits:**
```typescript
{
  confirm: (reason?: string) => void
  close: () => void
}
```

**Features:**
- Scrollable list of item names (max height 300px)
- Warning message based on action type
- Textarea for reject reason (when applicable)
- "Confirm" and "Cancel" buttons
- Color scheme: red (delete), yellow (reject), green (approve)

### TanStack Table Checkbox Implementation
```typescript
// Add row selection state
const rowSelection = ref<Record<string, boolean>>({})
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter(key => rowSelection.value[key])
)

// Add checkbox column definition
const checkboxColumn = columnHelper.display({
  id: 'select',
  header: ({ table }) => h('input', {
    type: 'checkbox',
    checked: table.getIsAllRowsSelected(),
    onChange: table.getToggleAllRowsSelectedHandler(),
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': 'Select all rows'
  }),
  cell: ({ row }) => h('input', {
    type: 'checkbox',
    checked: row.getIsSelected(),
    onChange: row.getToggleSelectedHandler(),
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': `Select row ${row.index}`
  })
})

// Add to columns array (first column)
const columns = [
  checkboxColumn,
  ...otherColumns
]

// Enable row selection in table options
const tableOptions = {
  state: {
    rowSelection,
  },
  enableRowSelection: true,
  onRowSelectionChange: updater => {
    const newValue = typeof updater === 'function' ? updater(rowSelection.value) : updater
    rowSelection.value = newValue
  }
}
```

### Integration Pattern
Each ListView adds:
```vue
<template>
  <BulkActionBar
    v-if="selectedIds.length > 0"
    :selected-count="selectedIds.length"
    :available-actions="bulkActions"
    @clear-selection="clearSelection"
  />

  <DataTable :columns="columns" :data="data">
    <!-- Checkbox column added to columns -->
  </DataTable>
</template>
```

## Data Flow

### Multi-Select Flow
1. User clicks checkbox in table row
2. Row ID added to `selectedIds` ref in ListView component
3. BulkActionBar appears (v-if="selectedIds.length > 0")
4. User clicks action button (e.g., "Delete All")
5. BulkConfirmDialog opens with selected item details

**"Select All" with Pagination Behavior:**
When user clicks "Select All" checkbox in table header:
- Select only visible items on current page (e.g., "20 items selected (of 500 total)")
- Show prompt: "Select all 500 items across all pages?"
- If user confirms, fetch all IDs from backend and select them
- Limit to maximum 1000 items for performance

**Implementation:**
```typescript
function handleSelectAll() {
  if (selectedIds.length === data.length) {
    // Deselect all
    selectedIds.value = []
  } else if (pagination.totalItems <= 100) {
    // Select all if under 100 items
    fetchAllIds().then(ids => {
      selectedIds.value = ids
    })
  } else {
    // Select current page only, show prompt
    selectedIds.value = data.map(item => item.id)
    showSelectAllPrompt(pagination.totalItems)
  }
}
```

### Bulk Delete Flow
```
Frontend:
1. User confirms in BulkConfirmDialog
2. ListView calls store.bulkDelete(selectedIds)
3. Store calls API: POST /api/{entity}/bulk-delete { ids: [...] }
4. Store processes response
5. Toast notification: "Deleted X items, Y failed"
6. Refresh data, clear selection

Backend:
1. Validate permissions
2. For deletes: Process each item independently (no transaction wrapper - deletes are idempotent)
3. For approve/reject: Process in batches of 10 with transaction per batch
4. Loop through IDs:
   - Try to process each item
   - Catch and log errors (don't throw)
   - Track success/failed IDs
5. Return { success: [...], failed: [{id, error}] }

**Transaction Strategy:**
- **Delete operations**: No transaction wrapper (each delete is independent)
- **Approve/Reject operations**: Process in batches of 10 with transaction per batch
- **Rationale**: Deletes are idempotent, but approvals have complex side effects (client edits) that need transaction safety
```

### Bulk Approve/Reject Flow
```
Frontend:
1. User selects approvals → clicks "Approve" or "Reject"
2. For reject: BulkConfirmDialog shows textarea for reason
3. ListView calls store.bulkApprove(ids) or store.bulkReject(ids, reason)
4. Store processes response
5. Toast notification with results
6. Refresh data, clear selection
```

## Error Handling

### API Response Format
```typescript
interface BulkResponse {
  success: string[]      // IDs of successfully processed items
  failed: Array<{
    id: string
    error: string        // User-friendly error message
    code?: string        // Error code for debugging
  }>
}
```

### Frontend Error Display
Toast notifications:
- Success: "Deleted 15 items"
- Partial: "Deleted 12 items, 3 failed. Click for details"
- Failed: "Delete failed: 0 items deleted, 5 failed"

**Error Details UX:**
When user clicks "Click for details" on partial failure toast:
1. Show expandable section in toast with failed items:
   - User "John Doe": Not found
   - User "Jane Smith": Permission denied
   - User "Bob Wilson": Database error
2. Each error item shows item name and user-friendly error message
3. Error messages are actionable (tell user what went wrong)

**Implementation:**
```typescript
// Toast component with expandable error details
<BulkErrorToast
  :success-count="response.success.length"
  :failed-count="response.failed.length"
  :failed-items="response.failed"
  @expand="showErrorDetails"
/>
```

### Backend Error Handling
```typescript
for (const id of ids) {
  try {
    await deleteItem(id);
    success.push(id);
  } catch (error) {
    failed.push({
      id,
      error: getUserFriendlyMessage(error),
      code: error.code
    });
    // Continue processing - don't throw
  }
}
```

## Permissions

### Permission Model
- Bulk operations use **same permissions** as individual actions
- No separate bulk permissions required
- Authorization checked per-item during processing

### Examples
```
Individual:  users:delete    → Bulk: users:delete (same)
Individual:  approvals:approve → Bulk: approvals:approve (same)
Individual:  approvals:reject → Bulk: approvals:reject (same)
```

### Backend Authorization
```typescript
// Check permission before bulk operation
if (!can(req.user, 'users:delete')) {
  return json({ error: 'Forbidden' }, 403);
}

// Per-item check during processing (optional, for extra safety)
for (const id of ids) {
  if (!canAccessItem(req.user, id)) {
    failed.push({ id, error: 'Permission denied' });
    continue;
  }
  // Process item...
}
```

### Frontend Guard
```typescript
const bulkActions = computed(() => {
  const actions = [];
  if (can('users:delete')) {
    actions.push({ label: 'Delete All', action: handleBulkDelete, variant: 'danger' });
  }
  return actions;
});
```

## Implementation Plan

### Phase 1: Foundation (Shared Components)
1. Create `BulkActionBar.vue` component
2. Create `BulkConfirmDialog.vue` component
3. Create checkbox column utility for TanStack tables

### Phase 2: Backend API
4. Add bulk delete endpoint for Users
5. Add bulk delete endpoint for Caravans
6. Add bulk delete endpoint for Groups
7. Add bulk delete endpoint for Itineraries
8. Add bulk approve/reject endpoints for Approvals
9. Add audit logging for all bulk operations

### Phase 3: Store Updates
10. Add bulk methods to users store
11. Add bulk methods to caravans store
12. Add bulk methods to groups store
13. Add bulk methods to itineraries store
14. Add bulk methods to approvals store

### Phase 4: UI Integration
15. Remove delete buttons from TouchpointsListView, ClientsListView
16. Add bulk operations to UsersListView
17. Add bulk operations to CaravansListView
18. Add bulk operations to GroupsListView
19. Add bulk operations to ItinerariesListView
20. Add bulk operations to ClientApprovalsView
21. Add bulk operations to UdiApprovalsView

### Phase 5: Testing
22. Test bulk operations with various scenarios
23. Test error handling and partial failures
24. Test permissions and authorization

## Testing Strategy

### Unit Tests
- Test bulk API endpoints with various scenarios
- Test store bulk methods
- Test component rendering and interactions

### Integration Tests
- Test bulk delete with permission checks
- Test bulk approve/reject with audit logging
- Test error handling and partial failures

### Manual Testing
- Test UI interactions (select, deselect, clear)
- Test confirmation dialogs
- Test error messages and notifications
- Test permission-based UI hiding

## Audit Logging

Bulk operations should be logged as **single audit entries** (not one per item):

```typescript
// Audit bulk operations as single entries
await auditLog({
  userId: currentUser.sub,
  action: 'bulk_delete',
  entity: 'user',
  metadata: {
    totalCount: ids.length,
    successCount: response.success.length,
    failedCount: response.failed.length,
    failedIds: response.failed.map(f => f.id),
    userAgent: req.header('user-agent'),
    ipAddress: req.ip
  }
})
```

**Audit Entry Format:**
- **action**: `bulk_delete`, `bulk_approve`, `bulk_reject`
- **entity**: Target entity type (user, caravan, group, etc.)
- **metadata**: Summary with counts and failed IDs only
- **oldValues**: Not applicable for bulk operations
- **newValues**: Not applicable for bulk operations

**Rationale:** Logging individual items would create excessive audit log entries and make the logs difficult to query. The summary provides sufficient traceability while keeping logs manageable.

## Accessibility

Bulk operations must be accessible:
- Checkboxes have proper ARIA labels ("Select row X", "Select all rows")
- Keyboard navigation: Tab to checkbox, Space to toggle
- Screen reader announcements for selection changes
- BulkActionBar content is announced when it appears
- Error details are readable by screen readers

## Responsive Design

Bulk operations on mobile/tablet:
- Checkbox column remains visible
- BulkActionBar moves to bottom on mobile (sticky footer)
- Confirmation dialog adapts to small screens
- "Select All" prompt is mobile-friendly

## Loading States

During bulk operations:
- Disable all action buttons in BulkActionBar
- Show loading spinner on action button being performed
- Optional: Show progress indicator for long operations ("Processing 15/50 items...")
- Prevent page navigation during bulk operation
