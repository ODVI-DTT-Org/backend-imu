# RBAC Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the RBAC implementation by aligning permission cookies between backend and frontend, adding permission-based route guards, backend route protection, frontend API permission checking, permission refresh functionality, standardized error handling, and component usage patterns.

**Architecture:**
- **Cookie Alignment:** Ensure permission cookie format is consistent between backend and frontend with proper validation
- **Backend:** Add `requirePermission` middleware to all API routes with resource-action based permissions
- **Frontend Router:** Add permission-based navigation guards that check user permissions before route access
- **Frontend API:** Add 403 error handling with user-friendly messages and automatic permission refresh
- **Components:** Add permission refresh endpoint and implement v-permission directive in views
- **Error Handling:** Standardize permission denied errors with toast notifications and redirect logic

**Tech Stack:** Hono (backend), Vue 3 + Vue Router (frontend), TypeScript, Pinia stores, Hono middleware, Zod validation

---

## File Structure

```
backend/
├── src/
│   ├── middleware/
│   │   └── permissions.ts (modify - verify cookie helpers)
│   └── routes/
│       ├── auth.ts (modify - verify cookie setting)
│       ├── clients.ts (modify - add middleware)
│       ├── users.ts (modify - add middleware)
│       ├── caravans.ts (modify - add middleware)
│       ├── groups.ts (modify - add middleware)
│       ├── itineraries.ts (modify - add middleware)
│       ├── touchpoints.ts (modify - add middleware)
│       ├── agencies.ts (modify - add middleware)
│       ├── approvals.ts (modify - add middleware)
│       └── dashboard.ts (modify - add middleware)
imu-web-vue/
├── src/
│   ├── lib/
│   │   ├── api-client.ts (modify - add 403 handling)
│   │   ├── auth-api.ts (modify - add refresh permissions)
│   │   └── permission-parser.ts (modify - add validation)
│   ├── router/
│   │   └── index.ts (modify - add permission guards)
│   ├── composables/
│   │   ├── usePermission.ts (modify - add refresh function)
│   │   └── useToast.ts (modify - add permission error type)
│   ├── stores/
│   │   └── auth.ts (modify - improve cookie loading)
│   └── views/
│       ├── users/ (modify - add v-permission)
│       ├── clients/ (modify - add v-permission)
│       └── caravan/ (modify - add v-permission)
```

---

## Task 0: Cookie Alignment - Verify Permission Cookie Flow

**Files:**
- Modify: `backend/src/routes/auth.ts:1-50`
- Modify: `backend/src/middleware/permissions.ts:400-500`
- Modify: `imu-web-vue/src/stores/auth.ts:26-40`
- Modify: `imu-web-vue/src/lib/permission-parser.ts:1-50`

- [ ] **Step 1: Verify backend cookie setting on login**

Check that `backend/src/routes/auth.ts` login endpoint sets permission cookie:

```typescript
// In POST /login endpoint, after successful authentication
const permissions = await getUserPermissionsAsString(user.id, user.role);
const cookie = setPermissionsCookie(
  permissions.map((p) => {
    const [resource, actionPart] = p.split('.');
    const [action, constraint] = actionPart.split(':');
    return { resource, action, constraint_name: constraint, role_slug: user.role };
  }),
  { sub: user.id, role: user.role }
);
c.cookie(cookie.name, cookie.value, cookie.options);
```

- [ ] **Step 2: Verify backend cookie format**

Check `backend/src/middleware/permissions.ts` `setPermissionsCookie` function returns:

```typescript
{
  name: 'imu_permissions',
  value: base64(JSON.stringify({
    permissions: string[],  // Array of permission strings
    userRole: string,        // User role
    userId: string           // User ID
  })),
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60  // 8 hours
  }
}
```

- [ ] **Step 3: Verify frontend cookie parsing**

Check `imu-web-vue/src/lib/permission-parser.ts` `parsePermissions` function:

```typescript
export function parsePermissions(cookieValue: string): string[] {
  if (!cookieValue) return [];
  try {
    const decoded = atob(cookieValue);
    const data = JSON.parse(decoded);
    if (Array.isArray(data)) return data;
    if (data.permissions && Array.isArray(data.permissions)) return data.permissions;
    return [];
  } catch (error) {
    console.error('Failed to parse permissions cookie:', error);
    return [];
  }
}
```

- [ ] **Step 4: Add cookie validation helper**

Add to `imu-web-vue/src/lib/permission-parser.ts`:

```typescript
export interface PermissionCookiePayload {
  permissions: string[];
  userRole: string;
  userId: string;
}

export function validatePermissionCookie(payload: unknown): payload is PermissionCookiePayload {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  return (
    Array.isArray(data.permissions) &&
    typeof data.userRole === 'string' &&
    typeof data.userId === 'string'
  );
}
```

- [ ] **Step 5: Update auth store to use validated parsing**

Modify `imu-web-vue/src/stores/auth.ts` `loadPermissionsFromCookie`:

```typescript
async function loadPermissionsFromCookie(): Promise<void> {
  if (permissionsLoaded.value) return;

  try {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const permissionCookie = cookies.find((c) => c.startsWith('imu_permissions='));

    if (permissionCookie) {
      const cookieValue = permissionCookie.split('=')[1];
      const decoded = atob(cookieValue);
      const payload = JSON.parse(decoded) as unknown;

      if (validatePermissionCookie(payload)) {
        permissions.value = payload.permissions;
        permissionsLoaded.value = true;
        permissionsError.value = null;

        // Verify user ID matches
        if (user.value && payload.userId !== user.value.id) {
          console.warn('Permission cookie user ID mismatch, clearing');
          clearPermissionsState();
          return;
        }
      } else {
        console.error('Invalid permission cookie format');
        permissions.value = getFallbackPermissions(user.value?.role || '');
        permissionsLoaded.value = true;
      }
    } else {
      permissions.value = getFallbackPermissions(user.value?.role || '');
      permissionsLoaded.value = true;
    }
  } catch (error) {
    console.error('Failed to load permissions from cookie:', error);
    permissions.value = getFallbackPermissions(user.value?.role || '');
    permissionsLoaded.value = true;
    permissionsError.value = 'Failed to load permissions';
  }
}
```

- [ ] **Step 6: Add import for validation function**

Add to top of `imu-web-vue/src/stores/auth.ts`:

```typescript
import { parsePermissions, validatePermissionCookie } from '@/lib/permission-parser'
```

- [ ] **Step 7: Test cookie flow end-to-end**

Run backend: `cd backend && pnpm dev`
Run frontend: `cd imu-web-vue && pnpm dev`

1. Open browser DevTools > Application > Cookies
2. Login as admin user
3. Check that `imu_permissions` cookie is set
4. Verify cookie format: base64 encoded JSON
5. Decode cookie value and verify structure
6. Logout and verify cookie is cleared

Expected:
- Cookie set on login with correct format
- Cookie accessible in frontend
- Parsing succeeds without errors
- Cookie cleared on logout

- [ ] **Step 8: Add cookie refresh on token refresh**

Modify `backend/src/routes/auth.ts` refresh endpoint to update permission cookie:

```typescript
// In POST /refresh endpoint
if (refreshTokenValid) {
  const user = { sub: result.userId, email: result.email, role: result.role, ... };

  // Refresh permissions cookie
  const permissions = await getUserPermissionsAsString(user.sub, user.role);
  const cookie = setPermissionsCookie(
    permissions.map((p) => {
      const [resource, actionPart] = p.split('.');
      const [action, constraint] = actionPart.split(':');
      return { resource, action, constraint_name: constraint, role_slug: user.role };
    }),
    user
  );
  c.cookie(cookie.name, cookie.value, cookie.options);

  return c.json({ access_token, refresh_token: newRefreshToken, user: result });
}
```

- [ ] **Step 9: Verify cookie on token refresh**

1. Login with a user
2. Wait for token to approach expiry (or modify token expiry time)
3. Trigger API call that causes token refresh
4. Check that permission cookie is updated

Expected: Permission cookie refreshed along with tokens

- [ ] **Step 10: Add cookie clearing on logout**

Verify `backend/src/routes/auth.ts` logout endpoint clears cookie:

```typescript
// In POST /logout endpoint
const cookie = clearPermissionsCookie();
c.cookie(cookie.name, cookie.value, cookie.options);
```

- [ ] **Step 11: Test and commit**

```bash
cd backend && pnpm test
cd imu-web-vue && pnpm test
git add backend/src/routes/auth.ts backend/src/middleware/permissions.ts imu-web-vue/src/stores/auth.ts imu-web-vue/src/lib/permission-parser.ts
git commit -m "feat(rbac): align permission cookie format between backend and frontend"
```

---

## Task 1: Backend - Add Permission Middleware to Clients Routes

**Files:**
- Modify: `backend/src/routes/clients.ts:1-50`

- [ ] **Step 1: Import permission middleware**

Add at top of file after existing imports:

```typescript
import { requirePermission } from '../middleware/permissions.js';
```

- [ ] **Step 2: Add permission middleware to GET /clients/:id**

Replace line 419 manual permission check with middleware at route definition:

```typescript
clients.get('/:id', authMiddleware, auditMiddleware, requirePermission('clients', 'read'), async (c) => {
  // ... existing route handler
});
```

- [ ] **Step 3: Add permission middleware to POST /clients**

```typescript
clients.post('/', authMiddleware, auditMiddleware, requirePermission('clients', 'create'), async (c) => {
  // ... existing route handler
});
```

- [ ] **Step 4: Add permission middleware to PUT /clients/:id**

```typescript
clients.put('/:id', authMiddleware, auditMiddleware, requirePermission('clients', 'update'), async (c) => {
  // ... existing route handler
});
```

- [ ] **Step 5: Add permission middleware to DELETE /clients/:id**

```typescript
clients.delete('/:id', authMiddleware, auditMiddleware, requirePermission('clients', 'delete'), async (c) => {
  // ... existing route handler
});
```

- [ ] **Step 6: Remove manual permission checks**

Delete lines 419-422 and 540-543 (manual permission checks)

- [ ] **Step 7: Test the changes**

Run: `cd backend && pnpm test`

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/clients.ts
git commit -m "feat(rbac): add permission middleware to clients routes"
```

---

## Task 2: Backend - Add Permission Middleware to Users Routes

**Files:**
- Modify: `backend/src/routes/users.ts:1-50`

- [ ] **Step 1: Import permission middleware**

```typescript
import { requirePermission } from '../middleware/permissions.js';
```

- [ ] **Step 2: Add middleware to all user routes**

```typescript
users.get('/', authMiddleware, auditMiddleware, requirePermission('users', 'read'), async (c) => {
  // ... existing
});

users.post('/', authMiddleware, auditMiddleware, requirePermission('users', 'create'), async (c) => {
  // ... existing
});

users.get('/:id', authMiddleware, auditMiddleware, requirePermission('users', 'read'), async (c) => {
  // ... existing
});

users.put('/:id', authMiddleware, auditMiddleware, requirePermission('users', 'update'), async (c) => {
  // ... existing
});

users.delete('/:id', authMiddleware, auditMiddleware, requirePermission('users', 'delete'), async (c) => {
  // ... existing
});
```

- [ ] **Step 3: Test and commit**

```bash
cd backend && pnpm test
git add backend/src/routes/users.ts
git commit -m "feat(rbac): add permission middleware to users routes"
```

---

## Task 3: Backend - Add Permission Middleware to Caravans Routes

**Files:**
- Modify: `backend/src/routes/caravans.ts:1-50`

- [ ] **Step 1: Import and add middleware**

```typescript
import { requirePermission } from '../middleware/permissions.js';

caravans.get('/', authMiddleware, auditMiddleware, requirePermission('caravans', 'read'), async (c) => {
  // ... existing
});

caravans.post('/', authMiddleware, auditMiddleware, requirePermission('caravans', 'create'), async (c) => {
  // ... existing
});

caravans.get('/:id', authMiddleware, auditMiddleware, requirePermission('caravans', 'read'), async (c) => {
  // ... existing
});

caravans.put('/:id', authMiddleware, auditMiddleware, requirePermission('caravans', 'update'), async (c) => {
  // ... existing
});

caravans.delete('/:id', authMiddleware, auditMiddleware, requirePermission('caravans', 'delete'), async (c) => {
  // ... existing
});
```

- [ ] **Step 2: Test and commit**

```bash
cd backend && pnpm test
git add backend/src/routes/caravans.ts
git commit -m "feat(rbac): add permission middleware to caravans routes"
```

---

## Task 4: Backend - Add Permission Middleware to Groups, Itineraries, Touchpoints

**Files:**
- Modify: `backend/src/routes/groups.ts:1-30`
- Modify: `backend/src/routes/itineraries.ts:1-30`
- Modify: `backend/src/routes/touchpoints.ts:1-30`

- [ ] **Step 1: Add to groups routes**

```typescript
import { requirePermission } from '../middleware/permissions.js';

groups.get('/', authMiddleware, requirePermission('groups', 'read'), async (c) => {});
groups.post('/', authMiddleware, requirePermission('groups', 'create'), async (c) => {});
groups.get('/:id', authMiddleware, requirePermission('groups', 'read'), async (c) => {});
groups.put('/:id', authMiddleware, requirePermission('groups', 'update'), async (c) => {});
groups.delete('/:id', authMiddleware, requirePermission('groups', 'delete'), async (c) => {});
```

- [ ] **Step 2: Add to itineraries routes**

```typescript
import { requirePermission } from '../middleware/permissions.js';

itineraries.get('/', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {});
itineraries.post('/', authMiddleware, requirePermission('itineraries', 'create'), async (c) => {});
itineraries.get('/:id', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {});
itineraries.put('/:id', authMiddleware, requirePermission('itineraries', 'update'), async (c) => {});
```

- [ ] **Step 3: Add to touchpoints routes with constraints**

```typescript
import { requirePermission } from '../middleware/permissions.js';

touchpoints.get('/', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {});
touchpoints.post('/', authMiddleware, requirePermission('touchpoints', 'create'), async (c) => {
  // Handler validates visit vs call based on constraint
});
touchpoints.get('/:id', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {});
touchpoints.put('/:id', authMiddleware, requirePermission('touchpoints', 'update'), async (c) => {});
```

- [ ] **Step 4: Test and commit**

```bash
cd backend && pnpm test
git add backend/src/routes/groups.ts backend/src/routes/itineraries.ts backend/src/routes/touchpoints.ts
git commit -m "feat(rbac): add permission middleware to groups, itineraries, touchpoints"
```

---

## Task 5: Backend - Add Permission Middleware to Remaining Routes

**Files:**
- Modify: `backend/src/routes/agencies.ts:1-30`
- Modify: `backend/src/routes/approvals.ts:1-30`
- Modify: `backend/src/routes/dashboard.ts:1-30`

- [ ] **Step 1: Add to agencies routes**

```typescript
import { requirePermission } from '../middleware/permissions.js';

agencies.get('/', authMiddleware, requirePermission('agencies', 'read'), async (c) => {});
agencies.post('/', authMiddleware, requirePermission('agencies', 'create'), async (c) => {});
```

- [ ] **Step 2: Add to approvals routes**

```typescript
import { requirePermission } from '../middleware/permissions.js';

approvals.get('/client', authMiddleware, requirePermission('approvals', 'read'), async (c) => {});
approvals.put('/client/:id', authMiddleware, requirePermission('approvals', 'update'), async (c) => {});
approvals.get('/udi', authMiddleware, requirePermission('approvals', 'read'), async (c) => {});
approvals.put('/udi/:id', authMiddleware, requirePermission('approvals', 'update'), async (c) => {});
```

- [ ] **Step 3: Add to dashboard routes**

```typescript
import { requirePermission } from '../middleware/permissions.js';

dashboard.get('/', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {});
dashboard.get('/stats', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {});
```

- [ ] **Step 4: Test and commit**

```bash
cd backend && pnpm test
git add backend/src/routes/agencies.ts backend/src/routes/approvals.ts backend/src/routes/dashboard.ts
git commit -m "feat(rbac): add permission middleware to agencies, approvals, dashboard"
```

---

## Task 6: Frontend - Add Permission Refresh API Function

**Files:**
- Create: `imu-web-vue/src/lib/auth-api.ts` (new functions)
- Modify: `imu-web-vue/src/stores/auth.ts:140-147` (add refresh method)

- [ ] **Step 1: Add refresh permissions function to auth-api.ts**

```typescript
// Add to existing exports in src/lib/auth-api.ts
export async function refreshPermissions(): Promise<{ permissions: string[]; userRole: string } | null> {
  try {
    const response = await api.get<{ permissions: string[]; userRole: string }>('/permissions/me');
    return response;
  } catch (error) {
    console.error('Failed to refresh permissions:', error);
    return null;
  }
}
```

- [ ] **Step 2: Add refresh method to auth store**

```typescript
// Add to auth store actions
async function refreshUserPermissions() {
  if (!user.value) return;

  try {
    const result = await refreshPermissions();
    if (result) {
      permissions.value = result.permissions;
      permissionsLoaded.value = true;
      permissionsError.value = null;
    }
  } catch (error) {
    permissionsError.value = 'Failed to refresh permissions';
  }
}

// Add to return object
return {
  // ... existing
  refreshUserPermissions,
}
```

- [ ] **Step 3: Test API call manually**

Run: `cd imu-web-vue && pnpm dev`

Visit: http://localhost:4002/login (login and check network tab for /permissions/me call)

Expected: Should see successful API response

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/lib/auth-api.ts imu-web-vue/src/stores/auth.ts
git commit -m "feat(rbac): add permission refresh functionality"
```

---

## Task 7: Frontend - Add 403 Error Handling to API Client

**Files:**
- Modify: `imu-web-vue/src/lib/api-client.ts:199-235`

- [ ] **Step 1: Add 403 error handling before 401 check**

```typescript
// Add this before the 401 check (around line 199)
if (response.status === 403) {
  const errorMessage = (data as ApiResponse)?.message || 'You do not have permission to perform this action'
  globalLoading.markError(requestId, errorMessage)

  // Emit custom event for permission denied
  window.dispatchEvent(new CustomEvent('permission:denied', {
    detail: { message: errorMessage, status: 403, data }
  }))

  throw new ApiError(errorMessage, 403, data)
}
```

- [ ] **Step 2: Add PermissionDeniedError type**

```typescript
// Add after ApiError class (around line 109)
export class PermissionDeniedError extends ApiError {
  constructor(message: string, data?: unknown) {
    super(message, 403, data)
    this.name = 'PermissionDeniedError'
  }
}
```

- [ ] **Step 3: Update error throwing to use PermissionDeniedError**

```typescript
// In the 403 handler, change:
throw new ApiError(errorMessage, 403, data)
// To:
throw new PermissionDeniedError(errorMessage, data)
```

- [ ] **Step 4: Test 403 handling**

Run: `cd imu-web-vue && pnpm dev`

1. Login as a user with limited permissions
2. Try to access a restricted resource
3. Check browser console for custom event

Expected: Should see 'permission:denied' event in console

- [ ] **Step 5: Commit**

```bash
git add imu-web-vue/src/lib/api-client.ts
git commit -m "feat(rbac): add 403 error handling with PermissionDeniedError"
```

---

## Task 8: Frontend - Add Permission Denied Toast Handler

**Files:**
- Modify: `imu-web-vue/src/composables/useToast.ts:1-50`
- Create: `imu-web-vue/src/composables/usePermissionErrorHandler.ts`

- [ ] **Step 1: Create permission error handler composable**

Create new file `src/composables/usePermissionErrorHandler.ts`:

```typescript
import { onMounted, onUnmounted } from 'vue'
import { useToast } from './useToast'

export function usePermissionErrorHandler() {
  const toast = useToast()

  function handlePermissionDenied(event: CustomEvent) {
    const { message } = event.detail
    toast.error(message || 'You do not have permission to perform this action')
  }

  onMounted(() => {
    window.addEventListener('permission:denied', handlePermissionDenied as EventListener)
  })

  onUnmounted(() => {
    window.removeEventListener('permission:denied', handlePermissionDenied as EventListener)
  })
}
```

- [ ] **Step 2: Add handler to App.vue**

Modify `src/App.vue`:

```typescript
<script setup lang="ts">
import { usePermissionErrorHandler } from '@/composables/usePermissionErrorHandler'

usePermissionErrorHandler()
</script>
```

- [ ] **Step 3: Test toast notification**

Run: `cd imu-web-vue && pnpm dev`

1. Login as limited user
2. Trigger a 403 error
3. Check for toast notification

Expected: Should see red toast with permission message

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/composables/usePermissionErrorHandler.ts imu-web-vue/src/App.vue
git commit -m "feat(rbac): add permission denied toast notifications"
```

---

## Task 9: Frontend - Add Permission Guards to Router

**Files:**
- Modify: `imu-web-vue/src/router/index.ts:266-287`

- [ ] **Step 1: Add permission checking to beforeEach guard**

Replace existing auth guard (lines 266-287) with:

```typescript
// Auth and permission guard
router.beforeEach(async (to, _from, next) => {
  const isAuthenticated = hasValidTokens()
  const requiresAuth = to.meta.requiresAuth
  const guestOnly = to.meta.guestOnly
  const requiredPermission = to.meta.permission as string | undefined

  // Update page title
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} | IMU Admin` : 'IMU Admin'

  // Redirect authenticated users away from login page
  if (guestOnly && isAuthenticated) {
    return next('/dashboard')
  }

  // Redirect unauthenticated users to login
  if (requiresAuth && !isAuthenticated) {
    return next('/login')
  }

  // Check permissions if required
  if (requiresAuth && isAuthenticated && requiredPermission) {
    const { can } = usePermission()

    if (!can(requiredPermission)) {
      // Redirect to dashboard with no access
      return next('/dashboard?error=no_permission')
    }
  }

  next()
})
```

- [ ] **Step 2: Add permission meta to route definitions**

Add `permission` meta to routes that need it:

```typescript
{
  path: '/users',
  name: 'users',
  component: () => import('@/views/users/UsersListView.vue'),
  meta: { title: 'Users', requiresAuth: true, permission: 'users.read' }
},
{
  path: '/users/new',
  name: 'users-new',
  component: () => import('@/views/users/UserFormView.vue'),
  meta: { title: 'Create User', requiresAuth: true, permission: 'users.create' }
},
// ... add to all routes
```

- [ ] **Step 3: Test permission guards**

Run: `cd imu-web-vue && pnpm dev`

1. Login as caravan user (no users.read permission)
2. Try to navigate to /users
3. Should be redirected to /dashboard?error=no_permission

Expected: Redirect happens, no access to restricted route

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/router/index.ts
git commit -m "feat(rbac): add permission-based route guards"
```

---

## Task 10: Frontend - Use v-permission Directive in Views

**Files:**
- Modify: `imu-web-vue/src/views/users/UsersListView.vue:1-50`
- Modify: `imu-web-vue/src/views/clients/ClientsListView.vue:1-50`
- Modify: `imu-web-vue/src/views/caravan/CaravansListView.vue:1-50`

- [ ] **Step 1: Add v-permission to UsersListView buttons**

Find the "Add User" button and add directive:

```vue
<template>
  <div>
    <!-- ... existing header ... -->
    <Button
      v-permission="'users.create'"
      variant="primary"
      @click="showCreateDialog = true"
    >
      Add User
    </Button>

    <!-- Action buttons in table -->
    <Button
      v-permission="'users.update'"
      size="sm"
      @click="editUser(user)"
    >
      Edit
    </Button>

    <Button
      v-permission="'users.delete'"
      variant="danger"
      size="sm"
      @click="deleteUser(user)"
    >
      Delete
    </Button>
  </div>
</template>
```

- [ ] **Step 2: Add v-permission to ClientsListView buttons**

```vue
<template>
  <Button
    v-permission="'clients.create'"
    variant="primary"
    @click="showCreateDialog = true"
  >
    Add Client
  </Button>

  <Button
    v-permission="'clients.update'"
    size="sm"
    @click="editClient(client)"
  >
    Edit
  </Button>

  <Button
    v-permission="'clients.delete'"
    variant="danger"
    size="sm"
    @click="deleteClient(client)"
  >
    Delete
  </Button>
</template>
```

- [ ] **Step 3: Add v-permission to CaravansListView buttons**

```vue
<template>
  <Button
    v-permission="'caravans.create'"
    variant="primary"
    @click="showCreateDialog = true"
  >
    Add Caravan
  </Button>

  <Button
    v-permission="'caravans.update'"
    size="sm"
    @click="editCaravan(caravan)"
  >
    Edit
  </Button>

  <Button
    v-permission="'caravans.delete'"
    variant="danger"
    size="sm"
    @click="deleteCaravan(caravan)"
  >
    Delete
  </Button>
</template>
```

- [ ] **Step 4: Test directive behavior**

Run: `cd imu-web-vue && pnpm dev`

1. Login as admin
2. Check that all buttons are enabled
3. Login as caravan user
4. Check that restricted buttons are disabled with tooltip

Expected: Buttons disable correctly based on permissions

- [ ] **Step 5: Commit**

```bash
git add imu-web-vue/src/views/users/UsersListView.vue imu-web-vue/src/views/clients/ClientsListView.vue imu-web-vue/src/views/caravan/CaravansListView.vue
git commit -m "feat(rbac): add v-permission directive to list views"
```

---

## Task 11: Frontend - Add Auto-Refresh on Permission Changes

**Files:**
- Modify: `imu-web-vue/src/stores/auth.ts:26-36`
- Modify: `imu-web-vue/src/lib/api-client.ts:190-220`

- [ ] **Step 1: Add permission refresh on 403 errors**

Update api-client 403 handler:

```typescript
if (response.status === 403) {
  const errorMessage = (data as ApiResponse)?.message || 'You do not have permission to perform this action'

  // Try to refresh permissions from server
  try {
    const { refreshUserPermissions } = await import('@/stores/auth')
    const authStore = await import('@/stores/auth').then(m => m.useAuthStore())
    await authStore.refreshUserPermissions()
  } catch (error) {
    console.error('Failed to refresh permissions after 403:', error)
  }

  globalLoading.markError(requestId, errorMessage)

  window.dispatchEvent(new CustomEvent('permission:denied', {
    detail: { message: errorMessage, status: 403, data }
  }))

  throw new PermissionDeniedError(errorMessage, data)
}
```

- [ ] **Step 2: Add periodic permission refresh**

Add to auth store initialization:

```typescript
// Refresh permissions every 5 minutes
let refreshInterval: ReturnType<typeof setInterval> | null = null

function startPermissionRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)

  refreshInterval = setInterval(async () => {
    if (user.value && isAuthenticatedGetter.value) {
      await refreshUserPermissions()
    }
  }, 5 * 60 * 1000) // 5 minutes
}

function stopPermissionRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

// Call in initializeAuth after setting user
async function initializeAuth() {
  if (hasValidTokens()) {
    try {
      const response = await getCurrentUser()
      user.value = mapAuthUserToUser(response.user)
      await loadPermissionsFromCookie()
      startPermissionRefresh() // Start periodic refresh
    } catch {
      clearTokens()
      user.value = null
      stopPermissionRefresh()
    }
  }
}

// Call in logout
async function logout() {
  await apiLogout()
  user.value = null
  stopPermissionRefresh()
}
```

- [ ] **Step 3: Test auto-refresh**

Run: `cd imu-web-vue && pnpm dev`

1. Login as user
2. Wait 5 minutes
3. Check browser network tab for /permissions/me call
4. Change user permissions in backend
5. Trigger any API call
6. Check if permissions refresh automatically

Expected: Permissions refresh automatically and UI updates

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/stores/auth.ts imu-web-vue/src/lib/api-client.ts
git commit -m "feat(rbac): add automatic permission refresh on 403 and periodic refresh"
```

---

## Task 12: Documentation - Update RBAC Documentation

**Files:**
- Modify: `imu-web-vue/docs/RBAC_FRONTEND_INTEGRATION.md:1-100`
- Modify: `backend/docs/architecture/roles-permissions.md:1-100`

- [ ] **Step 1: Add error handling section to frontend docs**

Add to `docs/RBAC_FRONTEND_INTEGRATION.md`:

```markdown
## Error Handling

### Permission Denied Errors (403)

When a user attempts an action without permission:

1. **API Response**: Backend returns 403 with error message
2. **Frontend Handling**:
   - `PermissionDeniedError` thrown by api-client
   - `permission:denied` event emitted
   - Toast notification displayed via `usePermissionErrorHandler`
   - Permissions automatically refreshed from server

### Handling Permission Errors in Components

```typescript
import { tryCatch } from '@/lib/api-client'

async function deleteItem(id: string) {
  const result = await tryCatch(
    () => api.delete(`/items/${id}`),
    (error) => {
      if (error instanceof PermissionDeniedError) {
        // Already handled by global handler
        return
      }
      // Handle other errors
    }
  )
}
```

### Auto-Refresh Behavior

- Permissions refresh every 5 minutes automatically
- Permissions refresh immediately after any 403 error
- Manual refresh available via `authStore.refreshUserPermissions()`
```

- [ ] **Step 2: Add route guard section to docs**

```markdown
## Route Guards

### Adding Permission Guards to Routes

Add `permission` meta to route definitions:

```typescript
{
  path: '/users',
  name: 'users',
  component: () => import('@/views/users/UsersListView.vue'),
  meta: {
    title: 'Users',
    requiresAuth: true,
    permission: 'users.read'  // Required permission
  }
}
```

### Guard Behavior

- Users without required permission redirected to `/dashboard?error=no_permission`
- Permission checked after authentication
- Uses `usePermission().can()` for validation
```

- [ ] **Step 3: Add backend documentation**

Add to `backend/docs/architecture/roles-permissions.md`:

```markdown
## Route Protection

All API routes protected with `requirePermission` middleware:

### Usage

```typescript
import { requirePermission } from '../middleware/permissions.js';

router.get('/resource',
  authMiddleware,
  requirePermission('resource', 'read'),
  async (c) => {
    // Handler code
  }
);
```

### Permission Format

- `resource`: The resource being accessed (e.g., 'users', 'clients')
- `action`: The action being performed (e.g., 'read', 'create', 'update', 'delete')
- `constraint`: Optional constraint for touchpoints ('visit' or 'call')

### Response Codes

- **200**: Success - user has permission
- **401**: Unauthorized - no token provided
- **403**: Forbidden - token valid but insufficient permissions
```

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/docs/RBAC_FRONTEND_INTEGRATION.md backend/docs/architecture/roles-permissions.md
git commit -m "docs(rbac): add error handling and route guard documentation"
```

---

## Task 13: Testing - Add Integration Tests

**Files:**
- Create: `backend/src/tests/rbac-integration.test.ts`
- Create: `imu-web-vue/src/composables/__tests__/usePermissionErrorHandler.spec.ts`

- [ ] **Step 1: Create backend RBAC integration test**

Create `backend/src/tests/rbac-integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '../db/index.js'
import { setupTestUser, cleanupTestUser } from './helpers.js'

describe('RBAC Integration Tests', () => {
  let adminToken: string
  let caravanToken: string
  let testUserId: string

  beforeAll(async () => {
    // Create test users
    const admin = await setupTestUser('admin')
    const caravan = await setupTestUser('caravan')
    adminToken = admin.token
    caravanToken = caravan.token
    testUserId = caravan.id
  })

  afterAll(async () => {
    await cleanupTestUser(testUserId)
  })

  it('should allow admin to access users', async () => {
    const response = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(response.status).toBe(200)
  })

  it('should deny caravan user access to users', async () => {
    const response = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${caravanToken}` }
    })
    expect(response.status).toBe(403)
  })

  it('should allow caravan to create clients', async () => {
    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${caravanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: 'Test',
        last_name: 'Client'
      })
    })
    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Create frontend error handler test**

Create `imu-web-vue/src/composables/__tests__/usePermissionErrorHandler.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { usePermissionErrorHandler } from '../usePermissionErrorHandler'
import { useToast } from '../useToast'

vi.mock('../useToast')

describe('usePermissionErrorHandler', () => {
  it('should show toast on permission denied event', () => {
    const mockToast = { error: vi.fn() }
    vi.mocked(useToast).mockReturnValue(mockToast)

    usePermissionErrorHandler()

    // Dispatch event
    window.dispatchEvent(new CustomEvent('permission:denied', {
      detail: { message: 'Test error' }
    }))

    expect(mockToast.error).toHaveBeenCalledWith('Test error')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd backend && pnpm test
cd imu-web-vue && pnpm test
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/tests/rbac-integration.test.ts imu-web-vue/src/composables/__tests__/usePermissionErrorHandler.spec.ts
git commit -m "test(rbac): add integration tests for permission system"
```

---

## Task 14: Verification - End-to-End Testing

**Files:**
- Create: `docs/RBAC_VERIFICATION_CHECKLIST.md`

- [ ] **Step 1: Create verification checklist**

Create `docs/RBAC_VERIFICATION_CHECKLIST.md`:

```markdown
# RBAC Implementation Verification Checklist

## Backend Route Protection

- [ ] Clients routes protected with requirePermission
- [ ] Users routes protected with requirePermission
- [ ] Caravans routes protected with requirePermission
- [ ] Groups routes protected with requirePermission
- [ ] Itineraries routes protected with requirePermission
- [ ] Touchpoints routes protected with requirePermission
- [ ] Agencies routes protected with requirePermission
- [ ] Approvals routes protected with requirePermission
- [ ] Dashboard routes protected with requirePermission

## Frontend Route Guards

- [ ] Router checks permissions before navigation
- [ ] Users without permission redirected to dashboard
- [ ] Query parameter added on redirect (?error=no_permission)
- [ ] All protected routes have permission meta

## Frontend API Client

- [ ] 403 errors handled with PermissionDeniedError
- [ ] permission:denied event emitted on 403
- [ ] Permissions refresh automatically on 403
- [ ] Periodic refresh every 5 minutes

## Error Handling

- [ ] Toast notifications shown for 403 errors
- [ ] Error messages user-friendly
- [ ] No console errors on permission denied

## Directive Usage

- [ ] v-permission disables buttons correctly
- [ ] Tooltips show "no permission" message
- [ ] Buttons visually distinct when disabled

## Integration Tests

- [ ] Backend tests pass
- [ ] Frontend tests pass
- [ ] Manual testing completed

## Documentation

- [ ] Error handling documented
- [ ] Route guards documented
- [ ] Permission refresh documented
- [ ] Examples provided for all patterns
```

- [ ] **Step 2: Run manual verification**

1. Start backend: `cd backend && pnpm dev`
2. Start frontend: `cd imu-web-vue && pnpm dev`
3. Test as admin user
4. Test as caravan user
5. Test as tele user
6. Verify all checklist items

- [ ] **Step 3: Final build test**

```bash
cd imu-web-vue && pnpm build
cd backend && pnpm build
```

Expected: Both builds succeed

- [ ] **Step 4: Final commit**

```bash
git add docs/RBAC_VERIFICATION_CHECKLIST.md
git commit -m "docs(rbac): add verification checklist for complete implementation"
```

---

## Summary

This plan implements:

1. **Cookie Alignment**: Verify and align permission cookie format between backend and frontend with proper validation
2. **Backend Route Protection**: All API routes use `requirePermission` middleware
3. **Frontend Route Guards**: Permission-based navigation guards in Vue Router
4. **Error Handling**: Standardized 403 handling with toasts and auto-refresh
5. **Permission Refresh**: Automatic refresh on 403 and periodic 5-minute refresh
6. **Directive Usage**: v-permission directive used in views for UI control
7. **Testing**: Integration tests for both backend and frontend
8. **Documentation**: Complete documentation of all patterns and behaviors

**Total Tasks**: 15
**Estimated Time**: 5-7 hours
**Risk Level**: Medium (modifies authentication and authorization flows)

**Rollback Plan**: Each task is committed independently. Rollback by reverting commits if issues arise.
