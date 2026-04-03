# Bulk Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select bulk operations to IMU admin dashboard for delete, approve, and reject actions across multiple entities.

**Architecture:** Shared Vue components for bulk UI + backend bulk endpoints + store bulk methods. Each ListView integrates checkboxes and BulkActionBar. Continue-on-error with detailed failure reporting.

**Tech Stack:** Vue 3 Composition API, TypeScript, TanStack Table, Hono backend, PostgreSQL

---

## File Structure

### New Files (Create)
```
imu-web-vue/src/
  components/bulk/
    BulkActionBar.vue           # Fixed action bar with count + buttons
    BulkConfirmDialog.vue       # Confirmation dialog with item list
    BulkErrorToast.vue          # Expandable toast for error details
  lib/
    types.ts                    # Add BulkResponse interface (modify)
```

### Modified Files
```
imu-web-vue/src/
  stores/
    users.ts                    # Add bulkDelete method
    caravans.ts                 # Add bulkDelete method
    groups.ts                   # Add bulkDelete method
    itineraries.ts              # Add bulkDelete method
    approvals.ts                # Add bulkApprove, bulkReject methods
  views/
    users/UsersListView.vue     # Add bulk ops, remove delete button
    caravan/CaravansListView.vue # Add bulk ops, remove delete button
    groups/GroupsListView.vue   # Add bulk ops, remove delete button
    itineraries/ItinerariesListView.vue # Add bulk ops, remove delete button
    approvals/ClientApprovalsView.vue # Add bulk approve/reject
    approvals/UdiApprovalsView.vue # Add bulk approve/reject
    clients/ClientsListView.vue # Remove delete button
    touchpoints/TouchpointsListView.vue # Remove delete button

backend/src/
  routes/
    users.ts                    # Add bulk delete endpoint
    caravans.ts                 # Add bulk delete endpoint
    groups.ts                   # Add bulk delete endpoint
    itineraries.ts              # Add bulk delete endpoint
    approvals.ts                # Add bulk approve/reject endpoints
```

---

## Phase 1: Foundation - Shared Components

### Task 1: Add BulkResponse Type to types.ts

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts` (after line 300, before export)

- [ ] **Step 1: Add BulkResponse interface**

```typescript
// Add after existing interfaces, before final export
export interface BulkResponse {
  success: string[]      // IDs of successfully processed items
  failed: Array<{
    id: string
    error: string        // User-friendly error message
    code?: string        // Error code for debugging
  }>
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(bulk): add BulkResponse interface to types"
```

---

### Task 2: Create BulkActionBar Component

**Files:**
- Create: `imu-web-vue/src/components/bulk/BulkActionBar.vue`

- [ ] **Step 1: Create BulkActionBar.vue component with mobile responsive design**

```vue
<script setup lang="ts">
import Button from '@/components/ui/Button.vue'

interface BulkAction {
  label: string
  action: () => void
  variant: 'primary' | 'danger' | 'secondary'
  requiresReason?: boolean
  loading?: boolean  // Individual action loading state
}

interface Props {
  selectedCount: number
  availableActions: BulkAction[]
  loading?: boolean  // Global loading state
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  clearSelection: []
}>()

function handleClearSelection() {
  emit('clearSelection')
}
</script>

<template>
  <div class="
    bg-primary-50 border-b border-primary-200 px-4 md:px-6 py-3
    flex items-center justify-between gap-3
    md:static
    fixed bottom-0 left-0 right-0 z-40 md:z-auto
    shadow-lg md:shadow-none
  ">
    <div class="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
      <span class="text-sm font-medium text-primary-900 truncate">
        {{ selectedCount }} selected
      </span>
      <div class="h-4 w-px bg-primary-300 flex-shrink-0" />
      <div class="flex items-center gap-2 flex-wrap">
        <Button
          v-for="action in availableActions"
          :key="action.label"
          :variant="action.variant"
          size="sm"
          :loading="loading || action.loading"
          :disabled="loading || action.loading"
          @click="action.action"
          class="text-xs md:text-sm"
        >
          {{ action.label }}
        </Button>
      </div>
    </div>
    <button
      @click="handleClearSelection"
      class="text-sm text-primary-600 hover:text-primary-700 font-medium flex-shrink-0"
      :disabled="loading"
    >
      Clear
    </button>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/bulk/BulkActionBar.vue
git commit -m "feat(bulk): create BulkActionBar component with mobile responsive design"
```

---

### Task 3: Create BulkConfirmDialog Component

**Files:**
- Create: `imu-web-vue/src/components/bulk/BulkConfirmDialog.vue`

- [ ] **Step 1: Create BulkConfirmDialog.vue component**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'

interface BulkConfirmItem {
  id: string
  name: string
}

interface Props {
  isOpen: boolean
  action: 'delete' | 'approve' | 'reject'
  itemCount: number
  items: BulkConfirmItem[]
  requiresReason?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  requiresReason: false,
  loading: false
})

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  confirm: [reason?: string]
  close: []
}>()

const reason = ref('')

const actionConfig = computed(() => {
  const configs = {
    delete: {
      title: 'Delete Items',
      message: `Are you sure you want to delete ${props.itemCount} items? This action cannot be undone.`,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      confirmText: 'Delete',
      confirmVariant: 'danger' as const
    },
    approve: {
      title: 'Approve Items',
      message: `Are you sure you want to approve ${props.itemCount} items?`,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      confirmText: 'Approve',
      confirmVariant: 'primary' as const
    },
    reject: {
      title: 'Reject Items',
      message: `Are you sure you want to reject ${props.itemCount} items?`,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      confirmText: 'Reject',
      confirmVariant: 'danger' as const
    }
  }
  return configs[props.action]
})

function handleConfirm() {
  if (props.requiresReason && !reason.value.trim()) {
    return
  }
  emit('confirm', props.requiresReason ? reason.value : undefined)
}

function handleCancel() {
  emit('close')
  emit('update:isOpen', false)
  reason.value = ''
}

function close() {
  emit('update:isOpen', false)
  reason.value = ''
}
</script>

<template>
  <Modal
    :model-value="isOpen"
    @update:model-value="close"
    :title="actionConfig.title"
    size="md"
  >
    <p :class="['text-neutral-600 mb-4', actionConfig.color]">
      {{ actionConfig.message }}
    </p>

    <!-- Items List -->
    <div :class="[
      'border rounded-lg p-3 mb-4 max-h-[300px] overflow-y-auto',
      actionConfig.borderColor
    ]">
      <div class="space-y-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="text-sm text-neutral-700"
        >
          {{ item.name }}
        </div>
      </div>
    </div>

    <!-- Reason Textarea for Reject -->
    <div v-if="requiresReason" class="mb-4">
      <label class="block text-sm font-medium text-neutral-700 mb-2">
        Reason for rejection <span class="text-red-500">*</span>
      </label>
      <textarea
        v-model="reason"
        rows="3"
        class="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="Please provide a reason for rejection..."
      />
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <Button
          variant="secondary"
          size="sm"
          @click="handleCancel"
          :disabled="loading"
        >
          Cancel
        </Button>
        <Button
          :variant="actionConfig.confirmVariant"
          size="sm"
          :loading="loading"
          @click="handleConfirm"
        >
          {{ actionConfig.confirmText }}
        </Button>
      </div>
    </template>
  </Modal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/bulk/BulkConfirmDialog.vue
git commit -m "feat(bulk): create BulkConfirmDialog component"
```

---

### Task 4: Skip BulkErrorToast Component (Using Standard Toast Instead)

**Note:** We'll use standard toast notifications (`toast.error()`, `toast.success()`) instead of a custom expandable toast component. This keeps the implementation simpler and follows existing patterns in the codebase.

**Reason:** The standard toast notifications are sufficient for reporting bulk operation results. Custom expandable error details can be added in a future enhancement if needed.

**Skip this task** - Proceed to Task 5.

---

## Phase 2: Backend Bulk Endpoints

### Task 5: Add Bulk Delete Endpoint to Users Route

**Files:**
- Modify: `backend/src/routes/users.ts` (add before `export default users`)

- [ ] **Step 1: Add validation schema for bulk delete**

```typescript
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
})
```

- [ ] **Step 2: Add bulk delete endpoint**

```typescript
// Bulk delete users
users.post('/bulk-delete', authMiddleware, auditMiddleware('user', 'bulk_delete'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { ids } = bulkDeleteSchema.parse(body)

    // Prevent self-deletion
    if (ids.includes(user.sub)) {
      return c.json({ message: 'Cannot delete your own account' }, 400)
    }

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    // Process each delete independently (no transaction)
    for (const id of ids) {
      try {
        const result = await pool.query(
          'DELETE FROM users WHERE id = $1 RETURNING id',
          [id]
        )

        if (result.rowCount === 0) {
          // 404 treated as success (already deleted)
          success.push(id)
        } else {
          success.push(id)
        }
      } catch (error: any) {
        // Check if foreign key constraint
        if (error.code === '23503') {
          failed.push({ id, error: 'Cannot delete user with dependent records' })
        } else {
          failed.push({ id, error: 'Failed to delete user' })
        }
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk delete users error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/users.ts
git commit -m "feat(bulk): add bulk delete endpoint for users"
```

---

### Task 6: Add Bulk Delete Endpoint to Caravans Route

**Files:**
- Modify: `backend/src/routes/caravans.ts` (add before `export default caravans`)

- [ ] **Step 1: Add validation schema for bulk delete**

```typescript
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
})
```

- [ ] **Step 2: Add bulk delete endpoint**

```typescript
// Bulk delete caravans
caravans.post('/bulk-delete', authMiddleware, auditMiddleware('caravan', 'bulk_delete'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { ids } = bulkDeleteSchema.parse(body)

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const id of ids) {
      try {
        const result = await pool.query(
          'DELETE FROM caravans WHERE id = $1 RETURNING id',
          [id]
        )

        if (result.rowCount === 0) {
          success.push(id) // Already deleted
        } else {
          success.push(id)
        }
      } catch (error: any) {
        if (error.code === '23503') {
          failed.push({ id, error: 'Cannot delete caravan with assigned clients' })
        } else {
          failed.push({ id, error: 'Failed to delete caravan' })
        }
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk delete caravans error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/caravans.ts
git commit -m "feat(bulk): add bulk delete endpoint for caravans"
```

---

### Task 7: Add Bulk Delete Endpoint to Groups Route

**Files:**
- Modify: `backend/src/routes/groups.ts` (add before `export default groups`)

- [ ] **Step 1: Add validation schema and bulk delete endpoint**

```typescript
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
})

// Bulk delete groups
groups.post('/bulk-delete', authMiddleware, auditMiddleware('group', 'bulk_delete'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { ids } = bulkDeleteSchema.parse(body)

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const id of ids) {
      try {
        const result = await pool.query(
          'DELETE FROM groups WHERE id = $1 RETURNING id',
          [id]
        )

        if (result.rowCount === 0) {
          success.push(id)
        } else {
          success.push(id)
        }
      } catch (error: any) {
        if (error.code === '23503') {
          failed.push({ id, error: 'Cannot delete group with members' })
        } else {
          failed.push({ id, error: 'Failed to delete group' })
        }
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk delete groups error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/groups.ts
git commit -m "feat(bulk): add bulk delete endpoint for groups"
```

---

### Task 8: Add Bulk Delete Endpoint to Itineraries Route

**Files:**
- Modify: `backend/src/routes/itineraries.ts` (add before `export default itineraries`)

- [ ] **Step 1: Add validation schema and bulk delete endpoint**

```typescript
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
})

// Bulk delete itineraries
itineraries.post('/bulk-delete', authMiddleware, auditMiddleware('itinerary', 'bulk_delete'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { ids } = bulkDeleteSchema.parse(body)

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const id of ids) {
      try {
        const result = await pool.query(
          'DELETE FROM itineraries WHERE id = $1 RETURNING id',
          [id]
        )

        if (result.rowCount === 0) {
          success.push(id)
        } else {
          success.push(id)
        }
      } catch (error: any) {
        if (error.code === '23503') {
          failed.push({ id, error: 'Cannot delete itinerary with touchpoints' })
        } else {
          failed.push({ id, error: 'Failed to delete itinerary' })
        }
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk delete itineraries error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/itineraries.ts
git commit -m "feat(bulk): add bulk delete endpoint for itineraries"
```

---

### Task 9: Add Bulk Approve/Reject Endpoints to Approvals Route

**Files:**
- Modify: `backend/src/routes/approvals.ts` (add before `export default approvals`)

- [ ] **Step 1: Add validation schemas**

```typescript
const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().optional()
})
```

- [ ] **Step 2: Add bulk approve endpoint**

```typescript
// Bulk approve approvals
approvals.post('/bulk-approve', authMiddleware, auditMiddleware('approval', 'bulk_approve'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  const client = await pool.connect()

  try {
    const body = await c.req.json()
    const { ids } = bulkActionSchema.parse(body)

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    // Process in batches of 10 with transaction per batch
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10)

      await client.query('BEGIN')

      try {
        for (const id of batch) {
          try {
            // Get approval details
            const approvalResult = await client.query(
              'SELECT id, type, client_id, notes, status FROM approvals WHERE id = $1',
              [id]
            )

            if (approvalResult.rowCount === 0) {
              success.push(id) // Already processed
              continue
            }

            const approval = approvalResult.rows[0]

            if (approval.status !== 'pending') {
              failed.push({ id, error: 'Approval already processed' })
              continue
            }

            // Handle client edit requests
            if (approval.type === 'client' && approval.notes) {
              try {
                const changes = JSON.parse(approval.notes)

                // Build dynamic update query
                const updateFields = Object.keys(changes).filter(
                  key => changes[key] !== undefined && changes[key] !== null
                )

                if (updateFields.length > 0) {
                  const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ')
                  const values = [approval.client_id, ...updateFields.map(field => changes[field])]

                  await client.query(
                    `UPDATE clients SET ${setClause}, updated = NOW() WHERE id = $1`,
                    values
                  )
                }
              } catch (parseError) {
                failed.push({ id, error: 'Invalid changes data' })
                continue
              }
            }

            // Update approval status
            await client.query(
              "UPDATE approvals SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2",
              [user.sub, id]
            )

            success.push(id)
          } catch (error: any) {
            console.error(`Error approving approval ${id}:`, error)
            failed.push({ id, error: 'Failed to process approval' })
          }
        }

        await client.query('COMMIT')
      } catch (batchError) {
        await client.query('ROLLBACK')
        throw batchError
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    await client.query('ROLLBACK')
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk approve error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  } finally {
    client.release()
  }
})
```

- [ ] **Step 3: Add bulk reject endpoint**

```typescript
// Bulk reject approvals
approvals.post('/bulk-reject', authMiddleware, auditMiddleware('approval', 'bulk_reject'), async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { ids, reason } = bulkActionSchema.parse(body)

    if (!reason || reason.trim().length === 0) {
      return c.json({ message: 'Reason is required for rejection' }, 400)
    }

    const success: string[] = []
    const failed: Array<{ id: string; error: string }> = []

    for (const id of ids) {
      try {
        const result = await pool.query(
          `UPDATE approvals
           SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
           WHERE id = $3 AND status = 'pending'
           RETURNING id`,
          [user.sub, reason, id]
        )

        if (result.rowCount === 0) {
          failed.push({ id, error: 'Approval already processed or not found' })
        } else {
          success.push(id)
        }
      } catch (error: any) {
        console.error(`Error rejecting approval ${id}:`, error)
        failed.push({ id, error: 'Failed to reject approval' })
      }
    }

    return c.json({ success, failed })
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({ message: 'Invalid request body', errors: error.errors }, 400)
    }
    console.error('Bulk reject error:', error)
    return c.json({ message: 'Internal server error' }, 500)
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/approvals.ts
git commit -m "feat(bulk): add bulk approve/reject endpoints for approvals"
```

---

## Phase 3: Store Bulk Methods

### Task 10: Add Bulk Delete Method to Users Store

**Files:**
- Modify: `imu-web-vue/src/stores/users.ts` (add after deleteUser method)

- [ ] **Step 1: Add bulkDelete method**

```typescript
async function bulkDelete(ids: string[]) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/users/bulk-delete', { ids })

    // Remove only successfully deleted items from local state
    users.value = users.value.filter(u => !response.success.includes(u.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk delete users'
    console.error('Bulk delete users error:', err)
    throw err
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 2: Add to return statement**

```typescript
return {
  // ... existing exports
  bulkDelete
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/users.ts
git commit -m "feat(bulk): add bulkDelete method to users store"
```

---

### Task 11: Add Bulk Delete Method to Caravans Store

**Files:**
- Modify: `imu-web-vue/src/stores/caravans.ts` (add after deleteCaravan method)

- [ ] **Step 1: Add bulkDelete method**

```typescript
async function bulkDelete(ids: string[]) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/caravans/bulk-delete', { ids })

    caravans.value = caravans.value.filter(c => !response.success.includes(c.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk delete caravans'
    console.error('Bulk delete caravans error:', err)
    throw err
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 2: Add to return statement**

```typescript
return {
  // ... existing exports
  bulkDelete
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/caravans.ts
git commit -m "feat(bulk): add bulkDelete method to caravans store"
```

---

### Task 12: Add Bulk Delete Method to Groups Store

**Files:**
- Modify: `imu-web-vue/src/stores/groups.ts` (add after deleteGroup method)

- [ ] **Step 1: Add bulkDelete method**

```typescript
async function bulkDelete(ids: string[]) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/groups/bulk-delete', { ids })

    groups.value = groups.value.filter(g => !response.success.includes(g.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk delete groups'
    console.error('Bulk delete groups error:', err)
    throw err
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 2: Add to return statement**

```typescript
return {
  // ... existing exports
  bulkDelete
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/groups.ts
git commit -m "feat(bulk): add bulkDelete method to groups store"
```

---

### Task 13: Add Bulk Delete Method to Itineraries Store

**Files:**
- Modify: `imu-web-vue/src/stores/itineraries.ts` (add after deleteItinerary method)

- [ ] **Step 1: Add bulkDelete method**

```typescript
async function bulkDelete(ids: string[]) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/itineraries/bulk-delete', { ids })

    itineraries.value = itineraries.value.filter(i => !response.success.includes(i.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk delete itineraries'
    console.error('Bulk delete itineraries error:', err)
    throw err
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 2: Add to return statement**

```typescript
return {
  // ... existing exports
  bulkDelete
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/itineraries.ts
git commit -m "feat(bulk): add bulkDelete method to itineraries store"
```

---

### Task 14: Add Bulk Approve/Reject Methods to Approvals Store

**Files:**
- Modify: `imu-web-vue/src/stores/approvals.ts` (add after existing action methods)

- [ ] **Step 1: Add bulk approve/reject methods**

```typescript
async function bulkApprove(ids: string[]) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/approvals/bulk-approve', { ids })

    // Remove successfully approved items from local state
    approvals.value = approvals.value.filter(a => !response.success.includes(a.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk approve'
    console.error('Bulk approve error:', err)
    throw err
  } finally {
    loading.value = false
  }
}

async function bulkReject(ids: string[], reason: string) {
  loading.value = true
  error.value = null

  try {
    const response = await api.post<BulkResponse>('/approvals/bulk-reject', { ids, reason })

    // Remove successfully rejected items from local state
    approvals.value = approvals.value.filter(a => !response.success.includes(a.id))
    totalItems.value -= response.success.length

    return response
  } catch (err: any) {
    error.value = err.message || 'Failed to bulk reject'
    console.error('Bulk reject error:', err)
    throw err
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 2: Add to return statement**

```typescript
return {
  // ... existing exports
  bulkApprove,
  bulkReject
}
```

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/stores/approvals.ts
git commit -m "feat(bulk): add bulkApprove and bulkReject methods to approvals store"
```

---

## Phase 4: UI Integration

### Task 15: Remove Delete Button from TouchpointsListView

**Files:**
- Modify: `imu-web-vue/src/views/touchpoints/TouchpointsListView.vue`

- [ ] **Step 1: Remove delete button from template**

Find and remove the "New Touchpoint" button section (around line 219-230) and any delete buttons in the actions column.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/touchpoints/TouchpointsListView.vue
git commit -m "refactor(bulk): remove delete button from TouchpointsListView"
```

---

### Task 16: Remove Delete Button from ClientsListView

**Files:**
- Modify: `imu-web-vue/src/views/clients/ClientsListView.vue`

- [ ] **Step 1: Find and remove delete buttons in columns definition**

Look for delete button in the actions column definition and remove it.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/clients/ClientsListView.vue
git commit -m "refactor(bulk): remove delete button from ClientsListView"
```

---

### Task 17: Add Bulk Operations to UsersListView

**Files:**
- Modify: `imu-web-vue/src/views/users/UsersListView.vue`

- [ ] **Step 1: Add imports for bulk components**

```typescript
import { ref, onMounted, h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createColumnHelper } from '@tanstack/vue-table'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useUsersStore } from '@/stores/users'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'
import { useToast } from '@/composables/useToast'
import BulkActionBar from '@/components/bulk/BulkActionBar.vue'
import BulkConfirmDialog from '@/components/bulk/BulkConfirmDialog.vue'
import Button from '@/components/ui/Button.vue'
import Pagination from '@/components/shared/Pagination.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import FilterDropdown from '@/components/shared/FilterDropdown.vue'
import type { BulkResponse } from '@/lib/types'
import type { User } from '@/lib/types'
```

- [ ] **Step 2: Add state for bulk operations**

```typescript
// After existing state
const route = useRoute()
const router = useRouter()
const usersStore = useUsersStore()
const authStore = useAuthStore()
const toast = useToast()
const { can } = usePermission()

// Existing state...
const search = ref((route.query.search as string) || '')
const roleFilter = ref((route.query.role as string) || 'all')
const currentPage = ref(Number(route.query.page) || 1)

// NEW: Bulk operations state
const rowSelection = ref<Record<string, boolean>>({})
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter(key => rowSelection.value[key])
)

// Bulk dialogs
const showBulkDeleteDialog = ref(false)
const bulkDeleteLoading = ref(false)

// Computed for selected users
const selectedUsers = computed(() => {
  return usersStore.users.filter(u => selectedIds.value.includes(u.id))
})

// Helper function to fetch data (replace existing fetchData calls)
async function fetchData() {
  await usersStore.fetchUsers({
    search: search.value,
    role: roleFilter.value === 'all' ? undefined : roleFilter.value,
    page: currentPage.value,
    perPage: 20
  })
}
```

- [ ] **Step 3: Add checkbox column to columns definition**

Add at the beginning of the columns array:

```typescript
// Column helper for TanStack Table
const columnHelper = createColumnHelper<User>()

// Checkbox column for bulk selection
const checkboxColumn = columnHelper.display({
  id: 'select',
  header: ({ table }) => h('input', {
    type: 'checkbox',
    checked: table.getIsAllRowsSelected(),
    onChange: (e: Event) => {
      const target = e.target as HTMLInputElement
      table.getToggleAllRowsSelectedHandler()(target)
    },
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': 'Select all rows'
  }),
  cell: ({ row }) => h('input', {
    type: 'checkbox',
    checked: row.getIsSelected(),
    onChange: (e: Event) => {
      const target = e.target as HTMLInputElement
      row.getToggleSelectedHandler()(target)
    },
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': `Select row ${row.index}`
  })
})

// Update columns array - checkbox column first
const columns = [
  checkboxColumn,
  // ... existing columns (name, email, role, actions, etc.)
]
```

- [ ] **Step 4: Add table options for row selection**

```typescript
// Table options for row selection
const tableOptions = {
  state: {
    rowSelection,
  },
  enableRowSelection: true,
  onRowSelectionChange: (updater: any) => {
    const newValue = typeof updater === 'function' ? updater(rowSelection.value) : updater
    rowSelection.value = newValue
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
}
```

- [ ] **Step 5: Add "Select All" with pagination handler**

```typescript
// Function to handle "Select All" with pagination
function handleSelectAll() {
  if (selectedIds.value.length === usersStore.users.length) {
    // Deselect all
    rowSelection.value = {}
  } else if (usersStore.pagination.totalItems <= 100) {
    // Select all if under 100 items
    fetchAllIds().then(ids => {
      const newSelection: Record<string, boolean> = {}
      ids.forEach(id => { newSelection[id] = true })
      rowSelection.value = newSelection
    })
  } else {
    // Select current page only
    const newSelection: Record<string, boolean> = {}
    usersStore.users.forEach(u => { newSelection[u.id] = true })
    rowSelection.value = newSelection

    // Show prompt for selecting all across pages
    const selectAll = confirm(
      `Only ${usersStore.users.length} items on this page selected. ` +
      `Select all ${usersStore.pagination.totalItems} items across all pages?`
    )
    if (selectAll) {
      fetchAllIds().then(ids => {
        const allSelection: Record<string, boolean> = {}
        ids.forEach(id => { allSelection[id] = true })
        rowSelection.value = allSelection
      })
    }
  }
}

// Function to fetch all IDs (for select all across pages)
async function fetchAllIds(): Promise<string[]> {
  const allIds: string[] = []
  const perPage = 100
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `/api/users?page=${page}&perPage=${perPage}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      }
    )
    const data = await response.json()
    allIds.push(...data.items.map((u: User) => u.id))
    hasMore = data.items.length === perPage
    page++
  }

  return allIds
}
```

- [ ] **Step 6: Add bulk action handlers**

```typescript
const bulkActions = computed(() => {
  const actions = []
  if (can('users:delete')) {
    actions.push({
      label: 'Delete All',
      action: () => { showBulkDeleteDialog.value = true },
      variant: 'danger' as const
    })
  }
  return actions
})

async function handleBulkDelete() {
  bulkDeleteLoading.value = true
  try {
    const response = await usersStore.bulkDelete(selectedIds.value)

    if (response.failed.length > 0) {
      toast.error(`Deleted ${response.success.length} users, ${response.failed.length} failed`)
    } else {
      toast.success(`Deleted ${response.success.length} users`)
    }

    clearSelection()
    await fetchData()
  } catch (err) {
    toast.error('Failed to delete users')
  } finally {
    bulkDeleteLoading.value = false
    showBulkDeleteDialog.value = false
  }
}

function clearSelection() {
  rowSelection.value = {}
}
```

- [ ] **Step 7: Update template to include bulk components**

Add after the filters section, before the table:

```vue
<template>
  <AdminLayout>
    <template #title>
      <h1 class="text-lg font-semibold text-neutral-900">Users</h1>
    </template>

    <!-- Existing filters -->
    <div class="flex gap-3 mb-6">
      <SearchInput v-model="search" placeholder="Search users..." />
      <FilterDropdown v-model="roleFilter" :options="roleOptions" label="Role" />
    </div>

    <!-- NEW: Bulk action bar -->
    <BulkActionBar
      v-if="selectedIds.length > 0"
      :selected-count="selectedIds.length"
      :available-actions="bulkActions"
      @clear-selection="clearSelection"
    />

    <!-- NEW: Bulk delete confirmation dialog -->
    <BulkConfirmDialog
      v-model:is-open="showBulkDeleteDialog"
      action="delete"
      :item-count="selectedIds.length"
      :items="selectedUsers.map(u => ({ id: u.id, name: `${u.first_name} ${u.last_name}` }))"
      :loading="bulkDeleteLoading"
      @confirm="handleBulkDelete"
      @close="showBulkDeleteDialog = false"
    />

    <!-- Existing table - update with table options -->
    <DataTable
      :columns="columns"
      :data="usersStore.users"
      :options="tableOptions"
    />

    <!-- Existing pagination -->
    <Pagination
      :current-page="currentPage"
      :total-pages="usersStore.pagination.totalPages"
      @update:page="handlePageChange"
    />
  </AdminLayout>
</template>
```

- [ ] **Step 8: Commit**

```bash
git add imu-web-vue/src/views/users/UsersListView.vue
git commit -m "feat(bulk): add bulk delete operations to UsersListView"
```

---

### Task 18: Add Bulk Operations to CaravansListView

**Files:**
- Modify: `imu-web-vue/src/views/caravan/CaravansListView.vue`

- [ ] **Step 1: Follow same pattern as UsersListView**

Add imports, state, checkbox column, bulk actions, handlers, and template components following the exact same pattern as UsersListView but for caravans.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/caravan/CaravansListView.vue
git commit -m "feat(bulk): add bulk delete operations to CaravansListView"
```

---

### Task 19: Add Bulk Operations to GroupsListView

**Files:**
- Modify: `imu-web-vue/src/views/groups/GroupsListView.vue`

- [ ] **Step 1: Follow same pattern as UsersListView**

Add imports, state, checkbox column, bulk actions, handlers, and template components following the exact same pattern as UsersListView but for groups.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/groups/GroupsListView.vue
git commit -m "feat(bulk): add bulk delete operations to GroupsListView"
```

---

### Task 20: Add Bulk Operations to ItinerariesListView

**Files:**
- Modify: `imu-web-vue/src/views/itineraries/ItinerariesListView.vue`

- [ ] **Step 1: Follow same pattern as UsersListView**

Add imports, state, checkbox column, bulk actions, handlers, and template components following the exact same pattern as UsersListView but for itineraries.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/itineraries/ItinerariesListView.vue
git commit -m "feat(bulk): add bulk delete operations to ItinerariesListView"
```

---

### Task 21: Add Bulk Operations to ClientApprovalsView

**Files:**
- Modify: `imu-web-vue/src/views/approvals/ClientApprovalsView.vue`

- [ ] **Step 1: Add imports and state**

```typescript
import { ref, onMounted, h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createColumnHelper } from '@tanstack/vue-table'
import { useApprovalsStore } from '@/stores/approvals'
import { useToast } from '@/composables/useToast'
import { usePermission } from '@/composables/usePermission'
import BulkActionBar from '@/components/bulk/BulkActionBar.vue'
import BulkConfirmDialog from '@/components/bulk/BulkConfirmDialog.vue'
import Button from '@/components/ui/Button.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import FilterDropdown from '@/components/shared/FilterDropdown.vue'
import Pagination from '@/components/shared/Pagination.vue'
import type { BulkResponse } from '@/lib/types'
import type { Approval } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const approvalsStore = useApprovalsStore()
const toast = useToast()
const { can } = usePermission()

// NEW: Bulk operations state
const rowSelection = ref<Record<string, boolean>>({})
const selectedIds = computed(() =>
  Object.keys(rowSelection.value).filter(key => rowSelection.value[key])
)

const showBulkApproveDialog = ref(false)
const showBulkRejectDialog = ref(false)
const bulkActionLoading = ref(false)
const rejectReason = ref('')

// Computed for selected approvals
const selectedApprovals = computed(() => {
  return approvalsStore.approvals.filter(a => selectedIds.value.includes(a.id))
})

// Helper function to get approval name
function getApprovalName(approval: Approval): string {
  if (approval.type === 'client') {
    const client = approval.expand?.client_id
    return client ? `${client.first_name} ${client.last_name}` : 'Unknown Client'
  }
  return `UDI ${approval.udi_number || 'N/A'}`
}

// Helper function to fetch data
async function fetchData() {
  await approvalsStore.fetchApprovals({
    page: currentPage.value,
    perPage: 15,
    type: 'client',
    status: activeStatus.value === 'all' ? undefined : activeStatus.value
  })
}
```

- [ ] **Step 2: Add checkbox column to columns definition**

```typescript
// Add at beginning of columns array
const checkboxColumn = columnHelper.display({
  id: 'select',
  header: ({ table }) => h('input', {
    type: 'checkbox',
    checked: table.getIsAllRowsSelected(),
    onChange: (e: Event) => {
      const target = e.target as HTMLInputElement
      table.getToggleAllRowsSelectedHandler()(target)
    },
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': 'Select all rows'
  }),
  cell: ({ row }) => h('input', {
    type: 'checkbox',
    checked: row.getIsSelected(),
    onChange: (e: Event) => {
      const target = e.target as HTMLInputElement
      row.getToggleSelectedHandler()(target)
    },
    class: 'w-4 h-4 rounded border-gray-300',
    'aria-label': `Select row ${row.index}`
  })
})

// Update columns array
const columns = [
  checkboxColumn,
  // ... existing columns
]
```

- [ ] **Step 3: Add table options for row selection**

```typescript
const tableOptions = {
  state: {
    rowSelection,
  },
  enableRowSelection: true,
  onRowSelectionChange: (updater: any) => {
    const newValue = typeof updater === 'function' ? updater(rowSelection.value) : updater
    rowSelection.value = newValue
  },
}
```

- [ ] **Step 4: Add bulk actions and handlers**

```typescript
const bulkActions = computed(() => {
  const actions = []
  if (can('approvals:approve')) {
    actions.push({
      label: 'Approve All',
      action: () => { showBulkApproveDialog.value = true },
      variant: 'primary' as const
    })
  }
  if (can('approvals:reject')) {
    actions.push({
      label: 'Reject All',
      action: () => { showBulkRejectDialog.value = true },
      variant: 'danger' as const
    })
  }
  return actions
})

async function handleBulkApprove() {
  bulkActionLoading.value = true
  try {
    const response = await approvalsStore.bulkApprove(selectedIds.value)

    if (response.failed.length > 0) {
      toast.error(`Approved ${response.success.length}, ${response.failed.length} failed`)
    } else {
      toast.success(`Approved ${response.success.length} items`)
    }

    clearSelection()
    await fetchData()
  } catch (err) {
    toast.error('Failed to process approvals')
  } finally {
    bulkActionLoading.value = false
    showBulkApproveDialog.value = false
  }
}

async function handleBulkReject(reason: string) {
  bulkActionLoading.value = true
  try {
    const response = await approvalsStore.bulkReject(selectedIds.value, reason)

    if (response.failed.length > 0) {
      toast.error(`Rejected ${response.success.length}, ${response.failed.length} failed`)
    } else {
      toast.success(`Rejected ${response.success.length} items`)
    }

    clearSelection()
    await fetchData()
  } catch (err) {
    toast.error('Failed to process rejections')
  } finally {
    bulkActionLoading.value = false
    showBulkRejectDialog.value = false
    rejectReason.value = ''
  }
}

function clearSelection() {
  rowSelection.value = {}
}
```

- [ ] **Step 5: Add bulk components to template**

```vue
<!-- Add after filters, before table -->
<BulkActionBar
  v-if="selectedIds.length > 0"
  :selected-count="selectedIds.length"
  :available-actions="bulkActions"
  @clear-selection="clearSelection"
/>

<BulkConfirmDialog
  v-model:is-open="showBulkApproveDialog"
  action="approve"
  :item-count="selectedIds.length"
  :items="selectedApprovals.map(a => ({ id: a.id, name: getApprovalName(a) }))"
  :loading="bulkActionLoading"
  @confirm="handleBulkApprove"
  @close="showBulkApproveDialog = false"
/>

<BulkConfirmDialog
  v-model:is-open="showBulkRejectDialog"
  action="reject"
  :item-count="selectedIds.length"
  :items="selectedApprovals.map(a => ({ id: a.id, name: getApprovalName(a) }))"
  :loading="bulkActionLoading"
  requires-reason
  @confirm="handleBulkReject"
  @close="showBulkRejectDialog = false"
/>
```

- [ ] **Step 6: Commit**

```bash
git add imu-web-vue/src/views/approvals/ClientApprovalsView.vue
git commit -m "feat(bulk): add bulk approve/reject to ClientApprovalsView"
```

---

### Task 22: Add Bulk Operations to UdiApprovalsView

**Files:**
- Modify: `imu-web-vue/src/views/approvals/UdiApprovalsView.vue`

- [ ] **Step 1: Follow same pattern as ClientApprovalsView**

Add imports, state, checkbox column, bulk actions, handlers, and template components following the exact same pattern as ClientApprovalsView.

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/approvals/UdiApprovalsView.vue
git commit -m "feat(bulk): add bulk approve/reject to UdiApprovalsView"
```

---

## Phase 5: Testing and Verification

### Task 23: Manual Testing Checklist

- [ ] **Test UsersListView bulk delete**
  - Select multiple users via checkboxes
  - Verify BulkActionBar appears with correct count
  - Click "Delete All" and confirm dialog shows correct users
  - Confirm delete and verify toast notification
  - Verify users are removed from list
  - Test with self-deletion (should fail)

- [ ] **Test CaravansListView bulk delete**
  - Select multiple caravans
  - Verify bulk delete works
  - Test with caravans that have assigned clients (should fail gracefully)

- [ ] **Test GroupsListView bulk delete**
  - Select multiple groups
  - Verify bulk delete works
  - Test with groups that have members (should fail gracefully)

- [ ] **Test ItinerariesListView bulk delete**
  - Select multiple itineraries
  - Verify bulk delete works
  - Test with itineraries that have touchpoints (should fail gracefully)

- [ ] **Test ClientApprovalsView bulk approve/reject**
  - Select multiple approvals
  - Test bulk approve
  - Test bulk reject with reason
  - Verify client edit requests are handled correctly

- [ ] **Test UdiApprovalsView bulk approve/reject**
  - Select multiple UDI approvals
  - Test bulk approve/reject

- [ ] **Test error handling**
  - Test with network disconnected
  - Test with invalid permissions
  - Verify partial failures are reported correctly

- [ ] **Test "Select All" behavior**
  - Test on paginated view
  - Verify prompt appears for large datasets
  - Verify current page selection works

- [ ] **Test accessibility**
  - Tab to checkboxes and use Space to toggle
  - Verify ARIA labels are present
  - Test with screen reader (if available)

- [ ] **Commit test results**

```bash
git add .
git commit -m "test(bulk): complete manual testing of bulk operations"
```

---

## Completion Checklist

- [ ] All bulk components created (BulkActionBar, BulkConfirmDialog, BulkErrorToast)
- [ ] All bulk endpoints added to backend (users, caravans, groups, itineraries, approvals)
- [ ] All store bulk methods implemented
- [ ] All ListViews updated with bulk operations
- [ ] Delete buttons removed from TouchpointsListView and ClientsListView
- [ ] All changes committed to git
- [ ] Manual testing completed successfully

---

## Notes for Implementation

- **TanStack Table Integration**: The checkbox column must be the first column in the columns array
- **State Management**: Use `rowSelection` ref with TanStack Table's built-in row selection
- **Local State Updates**: Only remove successfully processed items from local state
- **Error Handling**: Always use continue-on-error pattern for bulk operations
- **Transaction Strategy**: No transactions for deletes, batch transactions for approvals
- **Permissions**: Use same permissions as individual actions
- **Accessibility**: All checkboxes must have proper ARIA labels
- **Mobile**: BulkActionBar moves to bottom on mobile (sticky footer)

---

## Troubleshooting

**Issue**: TanStack Table row selection not working
- **Solution**: Ensure `enableRowSelection: true` is in table options and `rowSelection` state is properly connected

**Issue**: BulkActionBar not appearing
- **Solution**: Verify `selectedIds` computed is returning array of IDs, not objects

**Issue**: Local state not updating after bulk operation
- **Solution**: Ensure you're filtering by `response.success` array, not `selectedIds`

**Issue**: Foreign key constraints causing failures
- **Solution**: These are expected failures - they should be caught and reported in `failed` array
