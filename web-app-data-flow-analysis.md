# Web App Data Flow Analysis

## Step 1: Backend API Response

### `/api/clients` Endpoint (All Clients)

**File:** `backend/src/routes/clients.ts:410-500`

```sql
SELECT c.*,
  -- Touchpoint calculation
  CASE
    WHEN c.touchpoint_number IS NULL THEN 0
    WHEN c.touchpoint_number > 1 THEN c.touchpoint_number - 1
    ELSE 0
  END as completed_touchpoints,
  c.next_touchpoint as next_touchpoint_type,
  (c.touchpoint_summary->-1->>'type') as last_touchpoint_type,
  -- ... other fields
FROM clients c
WHERE c.deleted_at IS NULL
```

**Response Structure:**
```typescript
{
  items: [{
    id: "client-id",
    first_name: "John",
    last_name: "Doe",
    // ... basic fields

    // Touchpoint fields (from mapRowToClient)
    touchpoint_summary: [],           // ✅ Array of touchpoints
    touchpoint_number: 0,            // ✅ Total touchpoints (0-7)
    next_touchpoint: "Visit",        // ✅ Next type (Visit/Call/null)

    // Touchpoint status object (ADDED in response)
    touchpoint_status: {
      completed_touchpoints: 0,       // ✅ Calculated by backend
      next_touchpoint_number: 1,      // ✅ Next number (1-7)
      next_touchpoint_type: "Visit",  // ✅ Next type
      can_create_touchpoint: true,    // ✅ Permission check
      expected_role: "caravan",       // ✅ Role that should create
      is_complete: false,             // ✅ Completion status
      last_touchpoint_type: null,
      last_touchpoint_agent_name: null,
      loan_released: false,
      loan_released_at: null,
    }
  }],
  page: 1,
  perPage: 10,
  totalItems: 100
}
```

### `/api/clients/assigned` Endpoint (Assigned Clients)

**File:** `backend/src/routes/clients.ts:520-620`

**Same response structure** with area filtering applied.

---

## Step 2: Web App Receives Response

### Client Store Mapper

**File:** `imu-web-vue/src/stores/clients.ts:46-86`

```typescript
function mapToClient(record: ClientApiResponse): Client {
  const client: Client = {
    id: record.id,
    first_name: record.first_name,
    last_name: record.last_name,
    // ... basic fields mapped ✅

    // ❌ MISSING: touchpoint_summary NOT mapped
    // ❌ MISSING: touchpoint_number NOT mapped
    // ❌ MISSING: next_touchpoint NOT mapped
    // ❌ MISSING: touchpoint_status NOT mapped
  }

  // Expand section
  if (record.expand) {
    client.expand = {
      ...record.expand,
      touchpoints: record.expand?.touchpoints || []
    }
  }

  return client
}
```

### TypeScript Type Definition

**File:** `imu-web-vue/src/lib/types.ts:128-139`

```typescript
touchpoint_status?: {
  completed_touchpoints: number;
  next_touchpoint_number: number | null;  // ✅ Type defined
  next_touchpoint_type: 'Visit' | 'Call' | null;
  can_create_touchpoint: boolean;       // ✅ Type defined
  expected_role: 'caravan' | 'tele' | null;
  is_complete: boolean;
  last_touchpoint_type: 'Visit' | 'Call' | null;
  last_touchpoint_agent_name: string | null;
  loan_released: boolean;
  loan_released_at: string | null;
};
```

---

## Step 3: Web App Uses Fields

### Tele Calls View (Creating Touchpoints)

**File:** `imu-web-vue/src/views/tele/TeleCallsView.vue:524-543`

```typescript
function handleCreateCall(client: ClientWithTouchpointInfo) {
  const touchpointStatus = client.touchpoint_status  // ❌ PROBLEM: Not mapped!

  if (!touchpointStatus?.next_touchpoint_number) {  // ❌ Will be undefined!
    toast.error('All touchpoints completed for this client')
    return
  }

  createForm.value = {
    client_id: client.id,
    touchpoint_number: touchpointStatus.next_touchpoint_number,  // ❌ undefined!
    // ...
  }
}
```

### Data Table Display (Permission Check)

**File:** `imu-web-vue/src/views/tele/TeleCallsView.vue:890-903`

```typescript
// ❌ PROBLEM: touchpoint_status not mapped, so this will fail
if (!touchpointStatus?.can_create_touchpoint) {
  return h('span', { class: 'text-neutral-400 text-sm' }, 'Wait for Visit')
}

return h(Button, {
  onClick: () => handleCreateCall(client),
  title: `Create Call TP${touchpointStatus.next_touchpoint_number}`  // ❌ undefined!
})
```

---

## Step 4: Conditions and Validations

### Backend Validation (Correct)

**File:** `backend/src/routes/clients.ts:451-478`

```typescript
const completedCount = parseInt(row.completed_touchpoints) || 0;
const nextTouchpointNumber = completedCount >= 7 ? null : completedCount + 1;
const nextTouchpointType = nextTouchpointNumber ? TOUCHPOINT_SEQUENCE[nextTouchpointNumber - 1] : null;

// Permission check
if (user.role === 'caravan') {
  canCreateTouchpoint = nextTouchpointType === 'Visit' || completedCount === 0;
  expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
} else if (user.role === 'tele') {
  canCreateTouchpoint = nextTouchpointType === 'Call';
  expectedRole = canCreateTouchpoint ? 'tele' : 'caravan';
} else {
  canCreateTouchpoint = true;
  expectedRole = nextTouchpointType === 'Visit' ? 'caravan' : 'tele';
}
```

### Web App Validation (Missing/Incorrect)

**File:** `imu-web-vue/src/views/tele/TeleCallsView.vue:890-903`

```typescript
// ❌ PROBLEM: Trying to use fields that aren't mapped
if (!touchpointStatus?.can_create_touchpoint) {  // ❌ touchpoint_status is undefined!
  return h('span', { class: 'text-neutral-400 text-sm' }, 'Wait for Visit')
}
```

---

## Analysis Results

### ✅ What's Working

1. **Backend API** - Correctly sends `touchpoint_status` with all fields
2. **Backend Logic** - Correctly calculates `next_touchpoint_number` and permissions
3. **TypeScript Types** - Correctly defines the expected structure

### ❌ What's Broken

1. **Client Mapper** - `mapToClient()` does NOT map touchpoint fields:
   ```typescript
   // ❌ MISSING in mapToClient:
   touchpoint_summary: row.touchpoint_summary || [],
   touchpoint_number: row.touchpoint_number || 0,
   next_touchpoint: row.next_touchpoint || null,
   touchpoint_status: row.touchpoint_status || undefined,
   ```

2. **Web App Usage** - Trying to use undefined fields:
   - `client.touchpoint_status` → `undefined` (not mapped)
   - `touchpointStatus?.next_touchpoint_number` → `undefined`
   - `touchpointStatus?.can_create_touchpoint` → `undefined`

### 🔧 Required Fix

**File:** `imu-web-vue/src/stores/clients.ts:46-86`

**Add to `mapToClient` function:**
```typescript
function mapToClient(record: ClientApiResponse): Client {
  const client: Client = {
    id: record.id,
    first_name: record.first_name,
    last_name: record.last_name,
    // ... existing fields

    // ✅ ADD THESE:
    touchpoint_summary: record.touchpoint_summary || [],
    touchpoint_number: record.touchpoint_number || 0,
    next_touchpoint: record.next_touchpoint || null,
    touchpoint_status: record.touchpoint_status || undefined,
  }

  // ... rest of function
}
```

---

## Summary

| Component | Status | Issue |
|-----------|--------|-------|
| **Backend API** | ✅ Working | Sends correct response |
| **Backend Logic** | ✅ Working | Correct calculations and permissions |
| **TypeScript Types** | ✅ Working | Correct type definitions |
| **Client Mapper** | ❌ Broken | Does NOT map touchpoint fields |
| **Web App Usage** | ❌ Broken | Using undefined fields |
| **Conditions/Validations** | ❌ Broken | Can't validate on undefined data |

**Root Cause:** The `mapToClient` function doesn't map the touchpoint fields from the API response to the Client object.

**Impact:** The web app is NOT actually using the backend data correctly - it's trying to access fields that don't exist because they weren't mapped!
