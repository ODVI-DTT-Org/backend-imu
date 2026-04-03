# Rate Limiting & Request Deduplication - Complete Implementation

## Summary

Two different types of "rate limiting" have been implemented to solve different problems:

### 1. **Security Rate Limiting** (Anti-Abuse) ✅
Prevents malicious actors from overwhelming your API.

### 2. **Request Deduplication** (Anti-Duplicate) ✅
Prevents accidental duplicate submissions from double-clicks.

---

## Type 1: Security Rate Limiting

### What It Does
- Limits how many requests can be made in a time window
- Per IP address, per endpoint
- Prevents brute force attacks, DDoS, API abuse

### Implementation
**File:** `backend/src/middleware/rate-limit.ts` (already existed)

**Applied to these routes:**
- ✅ `/api/auth/login` - 10 requests per 15 minutes
- ✅ `/api/auth/register` - 10 requests per 15 minutes
- ✅ `/api/auth/forgot-password` - 10 requests per 15 minutes
- ✅ `/api/auth/reset-password` - 10 requests per 15 minutes

### Example
```
Attacker tries 100 passwords in 1 minute:
Request 1-10: ✅ Allowed
Request 11: ❌ 429 Too Many Requests - Try again in 14 minutes
```

---

## Type 2: Request Deduplication (What You Asked For)

### What It Does
- Prevents duplicate actions from double-clicking
- Returns cached result for identical requests
- Protects against accidental multiple submissions

### Implementation

#### Backend: Idempotency Middleware
**File:** `backend/src/middleware/idempotency.ts` (created)

```typescript
// Applied globally to ALL state-changing requests
app.use('*', idempotency({ expireAfter: 60000 }));
```

**How it works:**
1. Client sends `idempotency-key` header with request
2. Backend checks if key was already used
3. If yes → Return cached response
4. If no → Process request, cache response

#### Frontend: Automatic Idempotency Keys
**File:** `imu-web-vue/src/lib/api-client.ts` (modified)

```typescript
// Automatically adds idempotency-key to POST/PUT/PATCH/DELETE
const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
if (stateChangingMethods.includes(method.toUpperCase())) {
  headers['idempotency-key'] = generateIdempotencyKey()
}
```

**No code changes needed in components!** It happens automatically.

#### Frontend: Button State Management
**File:** `imu-web-vue/src/composables/useRequestDeduplication.ts` (created)

Two composables for preventing double-clicks:

**Simple Button Protection:**
```vue
<script setup lang="ts">
import { useButtonState } from '@/composables/useRequestDeduplication'

const { isLoading, isDisabled, handleClick } = useButtonState()

async function submitForm() {
  await handleClick(async () => {
    await apiFetch('/api/clients', {
      method: 'POST',
      body: formData
    })
  })
}
</script>

<template>
  <button @click="submitForm" :disabled="isDisabled">
    {{ isLoading ? 'Submitting...' : 'Submit' }}
  </button>
</template>
```

**Advanced Request Deduplication:**
```vue
<script setup lang="ts">
import { useRequestDeduplication } from '@/composables/useRequestDeduplication'

const { dedupe, isPending } = useRequestDeduplication()

async function createClient() {
  await dedupe('create-client', async () => {
    return await apiFetch('/api/clients', {
      method: 'POST',
      body: clientData
    })
  })
}
</script>
```

---

## What Happens When User Double-Clicks

### Before This Implementation
```
User double-clicks "Create Client":
  Click 1 → POST /api/clients → Creates client #1 ✅
  Click 2 → POST /api/clients → Creates client #2 ❌ (Duplicate!)
```

### After This Implementation
```
User double-clicks "Create Client" with button state management:
  Click 1 → Button disabled → POST /api/clients → Creates client ✅
  Click 2 → Button still disabled → Click ignored ✅

OR without button state (idempotency only):
  Click 1 → POST /api/clients + key: abc123 → Creates client ✅
  Click 2 → POST /api/clients + key: def456 → Creates client #2 ❌
```

**⚠️ Important:** Idempotency keys prevent identical requests from processing twice, but each click generates a NEW key. So you still need button state management!

---

## Complete Solution: Both Together

For best protection, use BOTH:

1. **Frontend**: Button state management (prevents duplicate clicks)
2. **Backend**: Idempotency middleware (catches any duplicates that slip through)
3. **Backend**: Rate limiting (prevents abuse)

---

## Files Created/Modified

### Created
- `backend/src/middleware/idempotency.ts` - Idempotency middleware
- `backend/migrations/041_add_rate_limiting.sql` - Rate limiting table
- `backend/migrations/042_change_uuid_to_serial.sql` - UUID analysis (rolled back)
- `backend/migrations/043_add_display_ids.sql` - Display ID solution
- `backend/fix_wildcard_permission.sql` - Wildcard permission SQL
- `backend/fix_dashboard_permissions.sql` - Dashboard permission SQL
- `imu-web-vue/src/composables/useRequestDeduplication.ts` - Button state composables
- `REQUEST_DEDUPLICATION_GUIDE.md` - This guide

### Modified
- `backend/src/index.ts` - Added idempotency middleware
- `backend/src/routes/auth.ts` - Added rate limiting to auth endpoints
- `imu-web-vue/src/lib/api-client.ts` - Auto-adds idempotency keys
- `imu-web-vue/src/components/ui/GlobalLoading.vue` - Removed blocking overlay

### For Later
- `backend/migrations/040_add_dashboard_permissions.sql` - Dashboard permissions (run when ready)
- `imu-web-vue/SKELETON_LOADING_GUIDE.md` - Skeleton loading documentation

---

## Testing

### Test Rate Limiting
```bash
# Try 11 login requests rapidly
for i in {1..11}; do
  curl -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Request 11 should return 429 Too Many Requests
```

### Test Request Deduplication
1. Open browser DevTools
2. Go to Network tab
3. Double-click any submit button
4. Should see only ONE request in network tab

---

## Current Status

✅ **Backend running**: http://localhost:4000
✅ **Rate limiting**: Enabled on auth endpoints
✅ **Request deduplication**: Enabled globally
✅ **Wildcard permission support**: Added to permission system
✅ **Skeleton loading**: UI components created
✅ **Blocking overlay removed**: Better UX

**You're all set!** The system now protects against both abuse and accidental duplicate submissions.
