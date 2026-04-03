# Debug Log

> **AI Agent Usage:** Check this file FIRST when debugging. Similar issues likely have documented solutions.

---

## Metadata

| Field | Value |
|-------|-------|
| **Last Updated** | 2026-04-03 |
| **Active Issues** | 0 |
| **Resolved This Month** | 12 |

---

## 1. Recent Issues (Last 30 Days)

### 2026-04-03 - Token Refresh 401 Errors After 1 Day

**Symptoms:** Users getting 401 errors when trying to refresh tokens after 1 day, even though cookie was still valid

**Error Messages:**
```
[api-client] Token refresh failed: 401
[api-client] Token refresh failed, no new token returned
XHR POST https://imu-api.cfbtools.app/api/auth/refresh [HTTP/3 401]
```

**Root Cause:** JWT refresh token expiration (1 day) mismatched with cookie expiration (30 days)

**Solution:** Increased refresh token expiration from 1 day to 30 days to match cookie expiration

**Code Changes:**
```javascript
// BEFORE (incorrect)
const refreshToken = sign(
  { sub: user.id, type: 'refresh' },
  signingKey,
  { expiresIn: '1d' } // Too short!
);

// AFTER (correct)
const refreshToken = sign(
  { sub: user.id, type: 'refresh' },
  signingKey,
  { expiresIn: '30d' } // Match cookie expiration
);
```

**Related Files:**
- Backend: `backend/src/routes/auth.ts:119-131`
- Frontend: `imu-web-vue/src/lib/api-client.ts:72`

**Prevention:** Always match JWT expiration with cookie expiration when using refresh tokens

**Reported By:** Production Users
**Fixed By:** Development Team

---

### 2026-04-03 - Municipality Assignment 500 Errors

**Symptoms:** POST /api/users/:id/municipalities returning 500 error with generic "Failed to assign municipalities" message

**Error Messages:**
```
POST https://imu-api.cfbtools.app/api/users/.../municipalities [HTTP/3 500]
[SERVER_ERROR] Failed to assign municipalities
```

**Root Cause:** Missing error handling for database errors, specifically PostgreSQL error 42P01 (relation does not exist)

**Solution:** Added specific error handling with logger integration for database errors

**Code Changes:**
```typescript
// Check for relation does not exist error
if (error.code === '42P01') {
  logger.error('users/municipalities', 'Table does not exist', {
    table: error.message,
    hint: 'Run migration 020 to create user_locations table'
  });
  throw new DatabaseError('Database table missing. Please contact administrator.')
    .addDetail('missingTable', 'user_locations');
}
```

**Related Files:**
- Implementation: `backend/src/routes/users.ts:778-795`

**Prevention:** Always add specific error handling for database operations, especially for table existence

**Reported By:** Production Users
**Fixed By:** Development Team

---

### 2026-04-03 - Error Logging "require is not defined"

**Symptoms:** Error logging system not working, getting "require is not defined" error

**Error Messages:**
```
Apr 03 13:47:06 [ ERROR: Server ]: require is not defined
```

**Root Cause:** Using CommonJS require() in ES module project

**Solution:** Changed to ES module import and integrated errorLogger with error handler

**Code Changes:**
```typescript
// BEFORE (incorrect)
const { errorLogger } = require('./services/errorLogger.js');

// AFTER (correct)
import { errorLogger } from './services/errorLogger.js';
```

**Related Files:**
- Backend: `backend/src/index.ts:9`, `backend/src/middleware/errorHandler.ts:9`

**Prevention:** Always use ES module imports in Node.js projects with "type": "module" in package.json

**Reported By:** Production Logs
**Fixed By:** Development Team

---

### 2026-04-03 - Insufficient Debug Logging for Token Issues

**Symptoms:** Unable to diagnose token refresh issues due to lack of logging

**Solution:** Added comprehensive debug logging to auth middleware and token refresh flow

**Code Changes:**
```typescript
// Auth middleware logging
const tokenPrefix = token.substring(0, 20);
console.log(`[auth] Verifying token, prefix: ${tokenPrefix}...`);

// Token verification success
console.log(`[auth] ✅ RS256 token verified for user: ${decoded.email}`);

// Token refresh logging
logger.info('auth/refresh', `Token refresh attempt`, {
  tokenPrefix: refresh_token.substring(0, 20) + '...',
  tokenLength: refresh_token.length,
});
```

**Related Files:**
- Backend: `backend/src/middleware/auth.ts:54-73`, `backend/src/routes/auth.ts:177-201`

**Prevention:** Add detailed logging for authentication and authorization flows to aid debugging

**Reported By:** Development Team
**Fixed By:** Development Team

---

### 2026-04-03 - Null Safety Issues with Provider Values

**Symptoms:** Compilation errors when accessing properties on nullable String values from Riverpod providers

**Error Messages:**
```
error - The property 'isNotEmpty' can't be unconditionally accessed because the receiver can be 'null'
error - The argument type 'String?' can't be assigned to the parameter type 'String'
```

**Root Cause:** User name and email providers return `String?` but code was accessing properties without null checks

**Solution:** Used null-aware operators throughout Profile page

**Code Changes:**
```dart
// Before (incorrect):
userName.isNotEmpty ? userName[0].toUpperCase() : 'U'

// After (correct):
(userName?.isNotEmpty ?? false) ? userName![0].toUpperCase() : 'U'
```

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart:92,104,114`

**Prevention:** Always use null-aware operators (`?.`, `??`, `??=`) when working with nullable provider values

**Reported By:** Flutter Analyzer
**Fixed By:** Development Team

---

### 2026-04-03 - Missing currentUserRoleProvider

**Symptoms:** Compilation error - undefined name `currentUserRoleProvider`

**Error Messages:**
```
error - Undefined name 'currentUserRoleProvider'
```

**Root Cause:** Profile page needed user role provider but it didn't exist

**Solution:** Created new Provider in app_providers.dart that derives role from auth state

**Code Changes:**
```dart
final currentUserRoleProvider = Provider<UserRole>((ref) {
  final authState = ref.watch(authNotifierProvider);
  return authState.user?.role ?? UserRole.caravan;
});
```

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/shared/providers/app_providers.dart:44-48`

**Prevention:** Check for provider existence before using it in new code

**Reported By:** Flutter Analyzer
**Fixed By:** Development Team

---

### 2026-04-03 - Unused Import Warnings

**Symptoms:** Lint warnings for unused imports after code refactoring

**Error Messages:**
```
warning - Unused import: 'package:lucide_icons/lucide_icons.dart'
warning - Unused import: '../../core/models/user_role.dart'
```

**Root Cause:** Removed code that used these imports but didn't clean up import statements

**Solution:** Removed unused import statements from affected files

**Related Files:**
- `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart`
- `mobile/imu_flutter/lib/shared/widgets/main_shell.dart`

**Prevention:** Run `flutter analyze` and clean up unused imports before committing

**Reported By:** Flutter Analyzer
**Fixed By:** Development Team

---

### 2026-04-02 - Permission Parser Wildcard Bug

**Symptoms:** Wildcard permissions like `users.*` not matching `users.delete`

**Error Messages:**
```
FAIL src/composables/__tests__/usePermission.spec.ts
expected false to be true // Object.is equality
  at can('users.delete').toBe(true)
```

**Root Cause:** `validatePermission()` and `parsePermission()` were splitting by `:` instead of `.`

**Solution:** Fixed permission parsing to split by `.` first, then handle `:constraint`

**Code Changes:**
```diff
--- a/imu-web-vue/src/lib/permission-parser.ts
+++ b/imu-web-vue/src/lib/permission-parser.ts
@@ -73,17 +73,22 @@
 export function validatePermission(permission: string): boolean {
   if (!permission || typeof permission !== 'string') return false;

   // Wildcard permission is valid
   if (permission === '*') return true;

-  // Basic format validation: resource.action or resource.action:constraint
-  const parts = permission.split(':');
+  // Basic format validation: resource.action or resource.action:constraint
+  const parts = permission.split('.');

   if (parts.length < 2) return false;

   const [resource, actionAndConstraint] = parts;

   // Resource should be non-empty
   if (!resource) return false;

   // Action and constraint are separated by colon
   const actionParts = actionAndConstraint.split(':');
   const action = actionParts[0];

   // Action should be non-empty
   if (!action) return false;

   // Constraint should be alphanumeric if present
   if (actionParts.length > 1) {
     const constraint = actionParts[1];
     if (!/^[a-z_]+$/.test(constraint)) return false;
   }

   return true;
 }
```

**Related Files:**
- Implementation: `imu-web-vue/src/lib/permission-parser.ts:69-114`
- Tests: `imu-web-vue/src/tests/permission-refresh.test.ts`, `imu-web-vue/src/tests/router-guards.test.ts`

**Prevention:** Always validate permission format with correct delimiters (`.` for resource/action, `:` for constraint)

**Reported By:** Test Suite
**Fixed By:** Development Team

---

### 2026-04-02 - Error Handling System Implementation

**Symptoms:** Inconsistent error handling across platforms, no error tracking, poor debugging information

**Solution:** Implemented comprehensive error handling system
- Backend: Error classes with fluent API, middleware, async database logging
- Vue: Updated API client, Toast component, useErrorHandler composable
- Flutter: Created AppError model and ErrorService
- Admin: Error logs viewer with filtering and resolution

**Related Files:**
- Backend: `backend/src/errors/`, `backend/src/middleware/errorHandler.ts`
- Vue: `imu-web-vue/src/lib/api-client.ts`, `imu-web-vue/src/composables/useToast.ts`
- Flutter: `mobile/imu_flutter/lib/models/error_model.dart`, `mobile/imu_flutter/lib/services/error_service.dart`
- Admin: `backend/src/routes/error-logs.ts`, `imu-web-vue/src/views/admin/ErrorLogsView.vue`

**Prevention:** Use error classes for all errors, include requestId in responses for debugging

---

### 2025-03-25 - PowerSync JWT Validation Failing

**Symptoms:** PowerSync sync failing with 401 errors

**Error Messages:**
```
Error: JWT verification failed
at PowerSyncClient.validateToken
```

**Root Cause:** RSA keys not loaded correctly from environment variables

**Solution:** Added logic to handle escaped newlines in env vars

**Code Changes:**
```diff
--- a/backend/src/routes/auth.js
+++ b/backend/src/routes/auth.js
@@ -25,7 +25,7 @@
 if (envPrivateKey && envPrivateKey.trim().length > 0) {
-    privateKey = envPrivateKey.trim();
+    privateKey = envPrivateKey.trim().replace(/\\n/g, '\n');
     console.log('✅ PowerSync private key loaded from environment variable');
 }
```

**Related Files:**
- Implementation: `backend/src/routes/auth.js:22-34`
- Middleware: `backend/src/middleware/auth.js:13-20`

**Prevention:** Always handle escaped newlines in environment variables

**Reported By:** Development Team
**Fixed By:** Development Team

---

### 2025-03-20 - Touchpoint Type Validation Not Working

**Symptoms:** Caravan users could create Call touchpoints (should be Visit only)

**Error Messages:** None - silent failure

**Root Cause:** Validation service not being called in touchpoint creation flow

**Solution:** Added validation call before touchpoint creation

**Code Changes:**
```diff
--- a/mobile/imu_flutter/lib/services/touchpoint_service.dart
+++ b/mobile/imu_flutter/lib/services/touchpoint_service.dart
@@ -45,6 +45,10 @@
     final number = dto.touchpointNumber;
     final type = dto.type;

+    if (!TouchpointValidationService.validateTouchpointForRole(number, type, userRole)) {
+      throw TouchpointValidationException('Invalid touchpoint type for user role');
+    }
+
     final touchpoint = Touchpoint(
       touchpointNumber: number,
```

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/services/touchpoint_service.dart:48-51`
- Validation: `mobile/imu_flutter/lib/services/touchpoint_validation_service.dart`

**Prevention:** Add validation tests for all role-based restrictions

**Reported By:** QA Team
**Fixed By:** Development Team

---

### 2025-03-15 - Vue Web App Not Refreshing Token

**Symptoms:** Users logged out unexpectedly after 24 hours

**Error Messages:** 401 errors on API calls

**Root Cause:** Refresh token logic not being triggered

**Solution:** Added proper token refresh in api-client

**Code Changes:**
```diff
--- a/imu-web-vue/src/lib/api-client.ts
+++ b/imu-web-vue/src/lib/api-client.ts
@@ -200,6 +200,20 @@
     if (response.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/refresh') {
+        const newToken = await refreshAccessToken();
+        if (newToken) {
+            headers['Authorization'] = `Bearer ${newToken}`;
+            requestInit.headers = headers;
+            response = await fetch(url, requestInit);
+        } else {
+            window.dispatchEvent(new CustomEvent('auth:logout'));
+            throw new ApiError('Session expired', 401);
+        }
     }
```

**Related Files:**
- Implementation: `imu-web-vue/src/lib/api-client.ts:200-211`

**Prevention:** Always test token refresh flow

**Reported By:** Production Users
**Fixed By:** Development Team

---

## 2. Recurring Patterns

### Pattern: PowerSync Sync Conflicts

**When it occurs:** Multiple users edit same client simultaneously

**Quick Diagnosis:**
- [ ] Check PowerSync dashboard for conflict logs
- [ ] Check client's `updated_at` timestamps
- [ ] Check which user has the latest data

**Standard Solution:**
```typescript
// Last-write-wins is current strategy
// Future: implement conflict resolution UI
```

**Related Issues:**
- 2025-02-15: Client data overwritten
- 2025-02-20: Duplicate touchpoints created

---

## 3. Environment-Specific Issues

### Development Environment

#### Issue: PowerSync local port conflicts

**Description:** PowerSync dev server port 8080 sometimes in use

**Workaround:** Kill process using port 8080 or change port in cli.yaml

**Permanent Fix:** Use unique ports per developer

**Related Files:** `mobile/imu_flutter/powersync/cli.yaml`

---

### Production Environment

#### Issue: DigitalOcean App Platform env var escaping

**Description:** Newlines in private keys get escaped as `\n` instead of actual newlines

**Workaround:** Use `.replace(/\\n/g, '\n')` when loading from env

**Permanent Fix:** Implemented in auth.js and middleware

**Related Files:**
- `backend/src/routes/auth.js:27`
- `backend/src/middleware/auth.js:18`

---

## 4. Debugging Commands

### Database Debugging

```bash
# Check PowerSync database
psql $DATABASE_URL -c "SELECT 1"

# View recent sync activity
SELECT * FROM powersync._sync_operations ORDER BY created_at DESC LIMIT 10;

# Check client data
SELECT id, first_name, last_name, updated_at FROM clients ORDER BY updated_at DESC LIMIT 10;
```

---

### API Debugging

```bash
# Test endpoint with auth
curl -H "Authorization: Bearer $TOKEN" https://imu-api.cfbtools.app/api/clients

# Check response headers
curl -I https://imu-api.cfbtools.app/api/health

# Test PowerSync JWT
curl -H "Authorization: Bearer $POWERSYNC_TOKEN" https://69cb46b4f69619e9d4830ea1.powersync.journeyapps.com/api
```

---

### Flutter Debugging

```bash
# Run with verbose logging
flutter run --verbose

# Check Hive boxes
# In Flutter DevTools, check Hive instances

# Clear all data
flutter run --clear-cache
```

---

### Vue Web Debugging

```bash
# Clear cache and rebuild
cd imu-web-vue
rm -rf node_modules/.vite && pnpm dev

# Check API calls
# Open browser DevTools > Network tab

# Check cookies
# Open browser DevTools > Application > Cookies
```

---

## 5. Known Open Issues

None currently.

---

## 6. Common Error Messages

### Error: "PowerSync private key not found"

**Meaning:** Private key file or environment variable not set

**Common Causes:**
1. Environment variable not set
2. File doesn't exist
3. Wrong file path

**Quick Fix:** Check `POWERSYNC_PRIVATE_KEY` env var or file path

**Example:**
```
Error: ENOENT: no such file or directory, open './powersync-private-key.pem'
```

---

### Error: "JWT verification failed"

**Meaning:** Token signature verification failed

**Common Causes:**
1. Private/public key mismatch
2. Wrong algorithm (HS256 vs RS256)
3. Expired token

**Quick Fix:** Regenerate key pair and update env vars

---

## 7. Performance Issues

### Issue: Slow client list loading

**Symptoms:** Client list takes 5+ seconds to load

**Metrics:**
- Before: ~5 seconds for 1000 clients
- After: ~1 second for 1000 clients
- Improvement: 80% faster

**Solution:** Implemented pagination in API

**Code:**
```diff
--- a/backend/src/routes/clients.js
+++ b/backend/src/routes/clients.js
@@ -20,7 +20,9 @@
-clients.get('/', async (c) => {
-  const result = await pool.query('SELECT * FROM clients');
+clients.get('/', async (c) => {
+  const page = parseInt(c.req.query('page') || '1');
+  const limit = parseInt(c.req.query('limit') || '50');
+  const result = await pool.query('SELECT * FROM clients LIMIT $1 OFFSET $2', [limit, (page - 1) * limit]);
```

---

## Quick Reference for Common Issues

| Symptom | Quick Fix | Section |
|---------|-----------|---------|
| Null safety errors | Use `?.` and `??` operators | 1 |
| Undefined provider | Create provider in app_providers.dart | 1 |
| Unused import warnings | Run `flutter analyze` and clean up | 1 |
| PowerSync 401 errors | Check JWT key format | 1 |
| Token refresh not working | Check api-client.ts | 1 |
| Touchpoint validation failing | Check user role | 1 |
| Map not showing | Check MAPBOX_ACCESS_TOKEN | 2 |
| Slow client list | Use pagination | 7 |
