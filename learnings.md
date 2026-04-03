# Project Learnings

> **AI Agent Usage:** Import with `@learnings.md` before starting tasks to avoid repeating past mistakes.

---

## Metadata

| Field | Value |
|-------|-------|
| **Last Updated** | 2026-04-03 |
| **Contributors** | IMU Development Team |
| **Project Phase** | Active Development |
| **Document Version** | 1.5 |

---

## 1. Architecture Decisions

| ID | Decision | Rationale | Impact | Date | Made By |
|----|----------|-----------|--------|------|---------|
| D001 | Flutter over React Native | Native performance, single codebase for iOS/Android | Mobile tech stack | 2024-01-15 | Team |
| D002 | Email+Password → PIN auth | Better UX for field agents | Authentication flow | 2024-01-20 | Team |
| D003 | Mapbox display, Google Maps navigation | Cost-effective, familiar UX | Maps integration | 2024-02-01 | Team |
| D004 | Offline-first with assigned area only | Reduced storage, faster sync | Data strategy | 2024-02-15 | Team |
| D005 | PowerSync for offline sync | Robust sync with conflict resolution | Backend architecture | 2024-03-01 | Team |
| D006 | JWT with RS256 for auth | More secure than HS256 | Security | 2024-03-15 | Team |
| D007 | Comprehensive error handling system | Standardized error responses across all platforms | Error handling | 2026-04-02 | Team |
| D008 | Vitest testing framework for Vue | Comprehensive frontend testing with happy-dom | Testing | 2026-04-02 | Team |
| D009 | Conditional logging based on debug mode | Reduces log noise in production, preserves critical errors | Production performance | 2026-04-02 | Team |
| D010 | Automatic token refresh with mutex | Prevents session expiration, handles race conditions | User experience | 2026-04-02 | Team |
| D011 | UUID-based agency ID generation | Collision-free IDs, improves security over timestamps | Security | 2026-04-02 | Team |
| D012 | Profile page with 5-tab navigation | Centralized user info access, logout in dedicated location | UX | 2026-04-03 | Team |
| D013 | Sync status overlay positioning | Non-intrusive sync visibility across all pages | UX | 2026-04-03 | Team |
| D014 | 30-day refresh token expiration | Matches cookie expiration, prevents 401 errors after 1 day | Security/UX | 2026-04-03 | Team |

---

## 2. Patterns Discovered

### Working Patterns

#### Pattern: Comprehensive Error Handling System

**Description:** Standardized error handling with request IDs, error codes, and async database logging

**When to use:** All error handling across backend, Vue, and Flutter

**Example:**
```typescript
// Backend
class AppError extends Error {
  code: ErrorCode
  statusCode: number
  suggestions: string[]
  addDetail(key: string, value: any): this
}

// Vue
toast.error(message, { code, requestId })

// Flutter
ErrorService.showError(context, appError)
```

**Why it works:** Consistent error format across platforms, detailed backend logging, simple frontend display

**References:**
- Backend: `backend/src/errors/index.ts`
- Vue: `imu-web-vue/src/composables/useToast.ts`
- Flutter: `mobile/imu_flutter/lib/services/error_service.dart`

---

#### Pattern: Riverpod StateNotifier with AsyncState

**Description:** Wrapper for async operations with loading/error/data states

**When to use:** Any async data fetching in Flutter

**Example:**
```dart
class AsyncState<T> {
  final T? data;
  final Object? error;
  final bool isLoading;
}

final clientsProvider = StateNotifierProvider<ClientsNotifier, AsyncState<List<Client>>>((ref) {
  return ClientsNotifier(ref.read(hiveServiceProvider));
});
```

**Why it works:** Consistent handling of async states across the app

**References:**
- Implementation: `mobile/imu_flutter/lib/shared/providers/`

---

#### Pattern: Touchpoint Sequence Validation

**Description:** Touchpoints follow fixed 7-step pattern (1,4,7=Visit, 2,3,5,6=Call)

**When to use:** Creating or validating touchpoints

**Example:**
```dart
bool isValidTouchpointNumber(int number, TouchpointType type) {
  final visitNumbers = [1, 4, 7];
  final callNumbers = [2, 3, 5, 6];

  if (type == TouchpointType.visit) {
    return visitNumbers.contains(number);
  } else {
    return callNumbers.contains(number);
  }
}
```

**Why it works:** Enforces business rules consistently

**References:**
- Implementation: `mobile/imu_flutter/lib/services/touchpoint_validation_service.dart`

---

#### Pattern: Conditional Logging Based on Debug Mode

**Description:** Production-safe logging that suppresses debug/info logs in production builds

**When to use:** All logging statements in production applications

**Example:**
```dart
void logDebug(String message) {
  if (AppConfig.debugMode) {
    debugPrint('[DEBUG] $message');
  }
}

void logInfo(String message) {
  if (AppConfig.debugMode) {
    debugPrint('[INFO] $message');
  }
}

void logWarning(String message, [Object? error]) {
  debugPrint('[WARN] $message'); // Always log warnings
  if (error != null) {
    debugPrint('  Warning: $error');
  }
}

void logError(String message, [Object? error]) {
  debugPrint('[ERROR] $message'); // Always log errors
  if (error != null) {
    debugPrint('  Error: $error');
  }
}
```

**Why it works:** Reduces log noise in production while preserving critical error/warning messages

**References:**
- Implementation: `mobile/imu_flutter/lib/core/utils/logger.dart`

---

#### Pattern: Token Refresh with Mutex Lock

**Description:** Prevents concurrent token refresh attempts using a lock and completer pattern

**When to use:** Token refresh in authentication services with concurrent API calls

**Example:**
```dart
class JwtAuthService {
  bool _isRefreshing = false;
  Completer<void>? _refreshCompleter;

  Future<void> refreshTokens() async {
    // Prevent concurrent refresh attempts
    if (_isRefreshing) {
      await _refreshCompleter?.future;
      return;
    }

    // Set refresh lock
    _isRefreshing = true;
    _refreshCompleter = Completer<void>();

    try {
      // Perform refresh...
    } finally {
      // Always release the lock
      _isRefreshing = false;
      _refreshCompleter?.complete();
      _refreshCompleter = null;
    }
  }

  Future<void> ensureValidToken() async {
    if (_isRefreshing) {
      await _refreshCompleter?.future;
      return;
    }

    if (shouldAttemptRefresh) {
      await refreshTokens();
    }
  }
}
```

**Why it works:** Prevents race conditions when multiple API calls try to refresh simultaneously

**References:**
- Implementation: `mobile/imu_flutter/lib/services/auth/jwt_auth_service.dart`

---

#### Pattern: Title Case for API Enum Values

**Description:** Use title case for enum values in API communication (e.g., 'Visit', 'Call')

**When to use:** Defining enum values that will be serialized to JSON for APIs

**Example:**
```dart
enum TouchpointType {
  visit('Visit'),  // Title case for API
  call('Call');    // Title case for API

  final String _apiValue;
  const TouchpointType(this._apiValue);

  static TouchpointType fromApi(String value) {
    // Handle both title case and uppercase for backward compatibility
    final normalizedValue = value.toLowerCase();
    return TouchpointType.values.firstWhere(
      (e) => e.name.toLowerCase() == normalizedValue ||
              e._apiValue.toLowerCase() == normalizedValue,
      orElse: () => TouchpointType.visit,
    );
  }
}
```

**Why it works:** Matches database constraint `CHECK (touchpoint_type IN ('Visit', 'Call'))`

**Related Files:** `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`

**Impact:** Backend constraint expects title case, not uppercase

---

#### Pattern: Consistent Role Naming (caravan vs field_agent)

**Description:** Use 'caravan' consistently for field agent role throughout the codebase

**When to use:** All references to field agent role in code, API, and documentation

**Example:**
```dart
enum UserRole {
  caravan('caravan'),  // Not 'field_agent'
  tele('tele'),
  // ...
}

static String _normalizeLegacyRole(String role) {
  final legacyMap = <String, String>{
    'field_agent': 'caravan',  // Handle legacy names
    'staff': 'caravan',
  };
  return legacyMap[role.toLowerCase()] ?? role.toLowerCase();
}
```

**Why it works:** Consistent naming prevents confusion and aligns with business terminology

**Related Files:** `mobile/imu_flutter/lib/core/models/user_role.dart`

---

#### Pattern: Stack Layout for Overlay Positioning

**Description:** Use Flutter Stack widget with Positioned for overlay UI elements

**When to use:** Positioning status indicators, notifications, or floating UI elements

**Example:**
```dart
class MainShell extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Main content
          Column(
            children: [
              Expanded(child: child),
              const BottomNavBar(),
            ],
          ),
          // Sync status overlay (top-right)
          const Positioned(
            top: 16,
            right: 16,
            child: _SyncStatusOverlay(),
          ),
        ],
      ),
    );
  }
}
```

**Why it works:** Clean overlay positioning without affecting main layout, maintains z-index layering

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/shared/widgets/main_shell.dart:18-37`

---

#### Pattern: Null-Safe Provider Handling

**Description:** Always handle nullable values from Riverpod providers with null-aware operators

**When to use:** Displaying data from providers that return nullable types

**Example:**
```dart
// In widget build method
final userName = ref.watch(currentUserNameProvider); // Returns String?
final userEmail = ref.watch(currentUserEmailProvider); // Returns String?

// Correct null-safe handling
Text(
  (userName?.isNotEmpty ?? false) ? userName! : 'User Name',
)

// Avatar initial extraction
Text(
  (userName?.isNotEmpty ?? false) ? userName![0].toUpperCase() : 'U',
)
```

**Why it works:** Prevents runtime crashes when provider data is null or empty, provides graceful fallbacks

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart:92,104,114`

---

#### Pattern: Color-Coded Role Badges

**Description:** Use consistent color mapping for user roles in UI badges and indicators

**When to use:** Displaying user roles in profiles, lists, or any UI element

**Example:**
```dart
Color _getRoleColor(UserRole role) {
  switch (role) {
    case UserRole.admin:
      return const Color(0xFFEF4444); // Red - highest privilege
    case UserRole.areaManager:
    case UserRole.assistantAreaManager:
      return const Color(0xFF3B82F6); // Blue - management
    case UserRole.caravan:
      return const Color(0xFF22C55E); // Green - field agents
    case UserRole.tele:
      return const Color(0xFFF59E0B); // Orange - telemarketers
  }
}

// Usage in UI
Container(
  decoration: BoxDecoration(
    color: _getRoleColor(userRole).withOpacity(0.1),
    borderRadius: BorderRadius.circular(20),
    border: Border.all(
      color: _getRoleColor(userRole).withOpacity(0.3),
      width: 1,
    ),
  ),
  child: Text(
    'Role: ${_formatRole(userRole)}',
    style: TextStyle(
      color: _getRoleColor(userRole),
    ),
  ),
)
```

**Why it works:** Visual consistency, quick role recognition, professional appearance with opacity variants

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart:12-24,124-142`

---

#### Pattern: Logout Confirmation Dialog

**Description:** Always show confirmation dialog before logout to prevent accidental logouts

**When to use:** Logout actions in any app

**Example:**
```dart
void _handleLogout(BuildContext context, WidgetRef ref) {
  HapticUtils.mediumImpact();
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Log Out'),
      content: const Text('Are you sure you want to log out?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () async {
            await ref.read(authNotifierProvider.notifier).logout();
            if (context.mounted) {
              context.go('/login');
            }
          },
          child: const Text('Log Out'),
        ),
      ],
    ),
  );
}
```

**Why it works:** Prevents accidental logouts, provides clear confirmation, uses haptic feedback for tactile response

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart:41-65`

---

#### Pattern: ES Module Imports in Node.js Projects

**Description:** Always use ES module imports instead of CommonJS require() in Node.js/TypeScript projects

**When to use:** All imports in Node.js projects with "type": "module" in package.json

**Example:**
```typescript
// DON'T do this (broken in ES modules)
const { errorLogger } = require('./services/errorLogger.js');

// DO this instead
import { errorLogger } from './services/errorLogger.js';
```

**Why it works:** ES modules are the modern standard, provide better tree-shaking, and are required by Hono framework

**Related Files:**
- Backend: `backend/src/index.ts:9`, `backend/src/middleware/errorHandler.ts:9`

**Fix Date:** 2026-04-03

---

#### Pattern: Match Token and Cookie Expiration

**Description:** Ensure JWT refresh token expiration matches cookie expiration to prevent 401 errors

**When to use:** Setting up authentication with refresh tokens and cookies

**Example:**
```javascript
// Backend - Token creation
const refreshToken = sign(
  { sub: user.id, type: 'refresh' },
  signingKey,
  {
    algorithm: 'RS256',
    expiresIn: '30d', // Match cookie expiration
  }
);

// Frontend - Cookie setting
setCookie('refresh_token', refreshToken, 30); // Same 30 days
```

**Why it works:** Prevents users from getting 401 errors when trying to refresh tokens after JWT expires but cookie is still valid

**Related Files:**
- Backend: `backend/src/routes/auth.ts:119-131`
- Frontend: `imu-web-vue/src/lib/api-client.ts:72`

**Fix Date:** 2026-04-03

---

### Anti-Patterns to Avoid

#### Anti-Pattern: Storing JWT in localStorage

**Description:** Don't store authentication tokens in localStorage

**Why it fails:** Security vulnerability (XSS can access localStorage)

**Alternative:** Use secure cookies (implemented in imu-web-vue)

**Example:**
```typescript
// DON'T do this
localStorage.setItem('token', token);

// DO this instead
setCookie('access_token', token, 7);
```

---

#### Anti-Pattern: Wrong delimiter for permission parsing

**Description:** Don't split permissions by the wrong delimiter

**Why it fails:** Breaks wildcard permission matching

**Pattern/Issue:** Permission format is `resource.action` or `resource.action:constraint`, but code was splitting by `:` instead of `.`

**Code Example:**
```typescript
// DON'T do this (broken)
const parts = permission.split(':'); // Wrong delimiter!

// DO this instead
const parts = permission.split('.'); // Split resource.action
const actionParts = parts[1].split(':'); // Then split action:constraint
```

**Related Files:** `imu-web-vue/src/lib/permission-parser.ts:76-113`

**Impact:** This bug prevented wildcard permissions like `users.*` from matching `users.delete`

**Fix Date:** 2026-04-02

---

## 3. Integration Gotchas

### Integration: PowerSync JWT Authentication

**Issue:** PowerSync requires RS256 JWT with specific claims

**Symptoms:** 401 errors when syncing, "invalid token" messages

**Root Cause:** Missing or incorrect JWT claims for PowerSync

**Solution:**
```javascript
const token = jwt.sign({
  user_id: user.id,
}, privateKey, {
  algorithm: 'RS256',
  keyid: 'imu-production-key-20260401',
  expiresIn: '24h',
});
```

**Related Files:**
- Backend: `backend/src/routes/auth.js:159-171`
- PowerSync config: `mobile/imu_flutter/powersync/`

**Prevention:** Always include required PowerSync claims when generating tokens

---

### Integration: Mapbox Access Token

**Issue:** Mapbox requires valid access token for maps to display

**Symptoms:** Blank map screens, "Invalid Token" errors

**Root Cause:** Missing or expired Mapbox access token

**Solution:** Add `MAPBOX_ACCESS_TOKEN` to `.env` file

**Related Files:**
- Flutter: `mobile/imu_flutter/lib/services/map_service.dart`
- Env file: `mobile/imu_flutter/.env`

**Prevention:** Document required env vars in setup guide

---

### Integration: Endpoint Documentation vs Implementation Mismatch

**Issue:** API audit incorrectly identified endpoints as missing when they actually existed

**Symptoms:** Planning to implement already-implemented features, wasted development effort

**Root Cause:** Audit was based on frontend code analysis without verifying backend source code

**Solution:** Always verify backend source code before marking endpoints as missing

**Code Example:**
```typescript
// DON'T do this (audit based on assumptions)
// "Missing: POST /auth/register" - marked as missing without checking

// DO this instead (verify source code first)
// Check backend/src/routes/auth.ts
// Found: auth.post('/register', ...) at line 296-320
// Status: ALREADY IMPLEMENTED
```

**Related Files:**
- Audit correction: `ENDPOINT_ALIGNMENT_AUDIT.md`
- Implementation plan: `docs/superpowers/plans/2026-04-03-endpoint-alignment-fixes.md`
- Verified endpoints:
  - `backend/src/routes/auth.ts:296-320` - POST /auth/register
  - `backend/src/routes/my-day.ts:450-529` - POST /my-day/visits
  - `backend/src/routes/attendance.ts:176-224` - GET /attendance/history
  - `backend/src/routes/psgc.ts:504-566` - POST /psgc/user/:userId/assignments
  - `backend/src/routes/psgc.ts:569-594` - DELETE /psgc/user/:userId/assignments/:psgcId

**Impact:**
- Initial audit: 7 endpoints marked as missing
- After verification: Only 2 actually missing
- Saved development time by not re-implementing existing code
- Prevented potential conflicts from duplicate implementations

**Fix Date:** 2026-04-03

**Prevention:** Always grep backend source code for endpoint routes before marking as missing

---

### Integration: Token Refresh vs Cookie Expiration Mismatch

**Issue:** JWT refresh token expiration (1 day) mismatched with cookie expiration (30 days)

**Symptoms:** Users getting 401 errors when trying to refresh tokens after 1 day, even though cookie was still valid

**Root Cause:** Refresh token set to expire in 1 day, but cookie set to expire in 30 days

**Solution:**
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

**Impact:**
- Users can now refresh tokens for 30 days instead of 1 day
- Eliminates confusing 401 errors when cookie is still valid
- Improves user experience by reducing forced logins

**Fix Date:** 2026-04-03

**Prevention:** Always match JWT expiration with cookie expiration when using refresh tokens

---

## 4. Environment-Specific Issues

### Development Environment

#### Issue: PowerSync local development requires dev server

**Description:** PowerSync CLI must run locally for development

**Solution:** Run `powersync serve` in separate terminal

**Related Files:** `mobile/imu_flutter/powersync/cli.yaml`

---

### Production Environment

#### Issue: DigitalOcean App Platform requires env vars for keys

**Description:** Can't use file-based keys on DigitalOcean

**Solution:** Use environment variables with escaped newlines

**Related Files:**
- Backend: `backend/src/routes/auth.js:22-34`
- Middleware: `backend/src/middleware/auth.js:13-20`

---

## 5. Team Conventions

### Convention: Touchpoint Status Field

**Description:** Touchpoints have a status field (Interested, Undecided, Not Interested, Completed)

**Why we adopted it:** Track client interest level through the sales process

**Usage:**
```dart
enum TouchpointStatus {
  interested,
  undecided,
  notInterested,
  completed,
}
```

**When to break this convention:** Only for archived touchpoints

---

### Convention: Monorepo Repository Structure

**Description:** IMU uses a monorepo structure with separate git repositories for each component

**Why we adopted it:** Separate repositories allow independent deployment and versioning

**Structure:**
```
IMU/ (parent directory - NOT a git repository)
├── backend/ (git repo: backend-imu)
├── imu-web-vue/ (git repo: frontend-web-imu)
└── mobile/ (git repo: frontend-mobile-imu)
```

**Critical Rule:** ALWAYS work from within the specific repository directory, never from the parent IMU/ directory

**Verification Commands:**
```bash
# Check which repository you're in
git remote -v

# Or read the repository marker
cat .REPOSITORY-MARKER.md
```

**Related Issue (2026-04-02):** Made changes in root IMU folder instead of individual sub-repositories. Had to manually copy files to correct repositories.

**Prevention Files Created:**
- `.repo-context.md` - Root directory monorepo documentation
- `.REPOSITORY-MARKER.md` - Repository identifier in each subdirectory
- `AGENTS.md` Section 0.5 - Monorepo structure awareness for AI agents

---

## 6. Performance Learnings

### Optimization: Hive box lazy loading

**Problem:** Opening all Hive boxes at startup slowed app launch

**Solution:** Open boxes on-demand when first accessed

**Impact:**
- Before: ~3 second app launch
- After: ~1 second app launch
- Improvement: 66% faster

**Code:**
```dart
Future<Box<Client>> getClientsBox() async {
  if (!Hive.isBoxOpen('clients')) {
    await Hive.openBox<Client>('clients');
  }
  return Hive.box<Client>('clients');
}
```

---

## 7. RBAC Implementation Learnings

### Pattern: Permission Caching with Refresh

**Description:** Cache permissions locally with TTL, refresh on token refresh

**When to use:** All permission checks in mobile apps

**Example:**
```dart
// Fetch permissions from backend on login
final permissions = await remotePermissionService.fetchPermissions(accessToken);

// Cache locally with 1-hour expiry
await _storage.write(key: 'user_permissions', value: jsonEncode(permissions));

// Refresh permissions when tokens refresh
await permissionService.fetchPermissions(newAccessToken);
```

**Why it works:** Reduces API calls, provides offline capability, ensures permissions stay current

**Related Files:**
- Mobile: `lib/services/permissions/remote_permission_service.dart`
- Mobile: `lib/services/auth/jwt_auth_service.dart` (lines 260-264)

---

### Pattern: Role-Based Touchpoint Filtering

**Description:** Filter touchpoint numbers by user role to enforce business rules

**When to use:** Touchpoint creation, display, and validation

**Example:**
```dart
List<int> getValidTouchpointNumbers(UserRole role) {
  if (role.isManager) {
    return [1, 2, 3, 4, 5, 6, 7]; // All touchpoints
  }
  if (role == UserRole.caravan) {
    return [1, 4, 7]; // Visit touchpoints only
  }
  if (role == UserRole.tele) {
    return [2, 3, 5, 6]; // Call touchpoints only
  }
  return [1, 2, 3, 4, 5, 6, 7];
}
```

**Why it works:** Enforces business rules at UI level, prevents invalid touchpoint creation

**Related Files:**
- Mobile: `lib/shared/utils/permission_helpers.dart`
- Backend: `src/middleware/permissions.ts` (validateTouchpointType)

---

### Integration Gotcha: Mobile-Backend Permission Format Mismatch

**Problem:** Mobile expected `{permissions: [...]}` but backend returned grouped format

**Symptoms:** Permission fetch failing, empty permissions array

**Root Cause:** Different response formats between mobile expectation and backend implementation

**Solution:** Created `/auth/permissions` endpoint that returns mobile-expected format

**Code:**
```typescript
// Backend: src/routes/auth.ts
auth.get('/permissions', authMiddleware, async (c) => {
  const user = c.get('user');
  const result = await pool.query(
    `SELECT resource, action, constraint_name, role_slug
     FROM user_permissions_view
     WHERE user_id = $1`,
    [user.sub]
  );
  return c.json({
    success: true,
    permissions: result.rows, // Flat array format
  });
});
```

**Related Files:**
- Backend: `src/routes/auth.ts` (lines 500-527)
- Mobile: `lib/services/permissions/remote_permission_service.dart`

**Prevention:** Always verify response format matches mobile expectations when creating endpoints

---

### Pattern: Permission Widget for UI Integration

**Description:** Wrap UI components with permission-aware widgets that show/hide based on permissions

**When to use:** All UI elements that require permissions

**Example:**
```dart
PermissionWidget(
  resource: 'reports',
  action: 'read',
  child: ReportsButton(),
  fallback: SizedBox.shrink(), // Hide completely
)
```

**Why it works:** Declarative permission checking, consistent UX, easy to maintain

**Related Files:**
- Mobile: `lib/shared/widgets/permission_widgets.dart`

---

### Pattern: Generic Permission Denied Dialog

**Description:** Use generic permission denied message for all permission failures

**When to use:** All permission denied scenarios

**Example:**
```dart
class PermissionDeniedDialog extends StatelessWidget {
  static void show(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const PermissionDeniedDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Access Denied'),
      content: const Text(
        "You don't have permission to perform this action",
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OK'),
        ),
      ],
    );
  }
}
```

**Why it works:** Consistent UX, no information leakage about system structure

**Related Files:**
- Mobile: `lib/shared/widgets/permission_dialog.dart`

---

### Best Practice: Permission Check on Both Frontend and Backend

**Pattern:** Always validate permissions on both frontend (UX) and backend (security)

**Why:** Frontend checks provide good UX, backend checks ensure security

**Example:**
```dart
// Frontend: PermissionWidget
PermissionWidget(
  resource: 'clients',
  action: 'delete',
  child: DeleteButton(),
  fallback: SizedBox.shrink(),
)

// Backend: requirePermission middleware
permissions.delete('/clients/:id', requirePermission('clients', 'delete'), async (c) => {
  // Delete logic here
});
```

**Related Files:**
- Mobile: `lib/shared/widgets/permission_widgets.dart`
- Backend: `src/middleware/permissions.ts` (requirePermission)

---

### Integration Gotcha: Session Service Singleton Disposal

**Problem:** Tests tried to dispose singleton SessionService, causing subsequent tests to fail

**Symptoms:** "SessionService was used after being disposed" errors

**Root Cause:** SessionService is a singleton, but tests were treating it as disposable

**Solution:** Don't dispose singleton in tests, just reset state

**Code:**
```dart
setUp(() {
  sessionService = SessionService();
  sessionService.endSession(); // Reset state instead of dispose
});

tearDown(() {
  sessionService.endSession(); // Reset state instead of dispose
});
```

**Related Files:**
- Mobile: `test/unit/auth/session_service_test.dart`

**Prevention:** Never dispose singletons in tests, reset state instead

---

## 8. Security Learnings

### Security Issue: Password visibility toggle

**Risk:** Users couldn't see what they were typing in password fields

**Discovery:** User feedback during testing

**Fix:** Added eye icon to toggle password visibility

**Prevention:** Always include visibility toggle for password fields

---

## 8. Migration Notes

### Migration: Hive to PowerSync

**From:** Hive-only local storage
**To:** PowerSync for sync, Hive for cache

**Breaking Changes:**
- Data models now use PowerSync schema
- Sync logic requires PowerSync setup
- Conflict resolution needed

**Migration Steps:**
1. Set up PowerSync instance
2. Define schema in schema.ts
3. Migrate existing Hive data to PowerSync
4. Update sync logic
5. Test thoroughly

**Rollback Plan:** Keep Hive backup until PowerSync is stable

**Date Completed:** 2024-03-15
