# Project Learnings

> **AI Agent Usage:** Import with `@learnings.md` before starting tasks to avoid repeating past mistakes.

---

## Metadata

| Field | Value |
|-------|-------|
| **Last Updated** | 2026-04-07 |
| **Contributors** | IMU Development Team |
| **Project Phase** | Active Development |
| **Document Version** | 2.8 |

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
| D012 | Profile page with ShellRoute integration | Consistent UI with bottom navigation and sync overlay | UX consistency | 2026-04-04 | Team |
| D013 | Sync status overlay positioning | Non-intrusive sync visibility across all pages | UX | 2026-04-03 | Team |
| D014 | 30-day refresh token expiration | Matches cookie expiration, prevents 401 errors after 1 day | Security/UX | 2026-04-03 | Team |
| D015 | Reusable ClientSelectorModal widget | Single source of truth for adding clients to itinerary | Code reusability | 2026-04-04 | Team |
| D016 | Province-municipality combined filtering | Granular territory assignments using "province-municipality" format | Territory management | 2026-04-04 | Team |
| D017 | System-wide error logging | Centralized error reporting from mobile, web, and backend to single PostgreSQL database | Error tracking | 2026-04-04 | Team |
| D018 | Automatic GPS capture on touchpoint submission | Captures latitude, longitude, and address when submitting touchpoints | Data accuracy | 2026-04-04 | Team |
| D019 | Toast positioning top-right with compact size | Non-intrusive notifications that don't go off-screen | UX | 2026-04-04 | Team |
| D020 | Optional notes in Release Loan dialog | Provides context for loan release approvals without blocking workflow | Feature enhancement | 2026-04-04 | Team |
| D021 | Province/municipality column split | Separate province and municipality columns replace municipality_id for granular territory assignments | Database schema | 2026-04-04 | Team |
| D022 | Enhanced RBAC permissions | Added dashboard, approvals, error_logs permissions for better access control | Security/UX | 2026-04-04 | Team |
| D023 | Tele role client update permission | Tele users can now update assigned client information | Feature enhancement | 2026-04-04 | Team |
| D024 | Background jobs table | Added table for async job processing (PSGC matching, report generation) | Backend architecture | 2026-04-04 | Team |
| D025 | Error logging integration to sync services | Integrated ErrorLoggingHelper into BackgroundSyncService and PowerSyncConnector for centralized error tracking | Error tracking | 2026-04-05 | Team |
| D026 | Simplified PowerSync sync configuration | Removed complex territory filtering from sync rules to fix validation errors and 500 sync failures | PowerSync sync | 2026-04-05 | Team |
| D027 | DigitalOcean PostgreSQL SSL compatibility | Added `uselibpqcompat=true` flag to database connection URI to fix self-signed certificate errors causing 500 sync failures | Database connectivity | 2026-04-05 | Team |
| D028 | Enhanced error logs UI/UX for bug reporting | Comprehensive error details with platform identification, mobile device info, copy-to-clipboard functionality | Admin productivity | 2026-04-05 | Team |
| D029 | Database schema alignment verification | Systematic verification of table schemas to ensure all migrations are applied correctly | Data integrity | 2026-04-05 | Team |
| D030 | Dashboard with materialized views | Used materialized views for action_items and CTEs for target/team performance to achieve < 200ms query performance | Performance | 2026-04-07 | Team |
| D031 | Target progress tracking system | Created targets table with period-based goals (daily/weekly/monthly/quarterly) and computed progress from actuals | Business intelligence | 2026-04-07 | Team |
| D032 | Cron-based action items refresh | Automated hourly refresh of action_items materialized view to keep dashboard data current without performance impact | Automation | 2026-04-07 | Team |
| D030 | Server-side touchpoint status filtering and sorting | Moved filtering/sorting from frontend to backend for proper pagination and performance | Backend API, Tele UX | 2026-04-05 | Team |
| D033 | Touchpoint badge progress fix | Created TouchpointCountService with PowerSync batch queries and provider-level caching for accurate touchpoint counts in UI | Performance, UX | 2026-04-07 | Team |
| D034 | Riverpod provider chaining pattern | Use FutureProvider.autoDispose with ref.watch() for derived data that updates when source provider changes | State management | 2026-04-07 | Team |
| D035 | PowerSync batch query optimization | Use SQL GROUP BY with IN clause instead of individual queries for aggregated data fetching | Performance | 2026-04-07 | Team |
| D036 | Widget backward compatibility pattern | Add optional parameters with ?? fallback to existing behavior for safe widget enhancements | Code maintainability | 2026-04-07 | Team |
| D037 | Provider cache invalidation on mutations | Use ref.invalidate() to refresh provider data after mutations to keep UI in sync | State management | 2026-04-07 | Team |

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

#### Pattern: Preventing Race Conditions in Async Initialization

**Description:** Ensure loading state is set BEFORE async operations to prevent router race conditions

**When to use:** All async initialization methods that set loading state

**Example:**
```dart
// WRONG: Nested mounted check can prevent loading state from being set
Future<void> checkAuthStatus() async {
  if (!mounted) return;
  if (!mounted) {  // ← Redundant check in nested block
    state = state.copyWith(isLoading: true);
  }
  // If widget disposes during async gap, isLoading: true might never be set
  await _authService.initialize();
}

// CORRECT: Always set loading state immediately after first check
Future<void> checkAuthStatus() async {
  if (!mounted) return;
  // Remove nested block, ALWAYS set isLoading: true
  state = state.copyWith(isLoading: true);
  await _authService.initialize();
}
```

**Why it works:**
- Prevents race condition where router might check state before loading is set
- Ensures consistent state initialization across async operations
- Router correctly waits for `isLoading: false` before making routing decisions
- No window where loading state is undefined during async operations

**Common Pitfalls:**
- **Nested mounted checks:** Second check in nested block can prevent state from being set
- **Early returns:** Returning before setting loading state creates undefined state window
- **Async gaps:** Widget can dispose during await, but that's handled by mounted checks before state updates

**Pattern for State Notifier Initialization:**
```dart
// Provider initialization
final authNotifierProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final authService = ref.watch(authServiceProvider);
  final notifier = AuthNotifier(authService);

  // Call async initialization without await
  // But ensure method sets isLoading: true BEFORE async operations
  notifier.checkAuthStatus();

  return notifier;
});

// In StateNotifier
Future<void> checkAuthStatus() async {
  if (!mounted) return;
  // CRITICAL: Set loading state FIRST, before any async operations
  state = state.copyWith(isLoading: true);

  try {
    await _authService.initialize();  // Load tokens from secure storage
    state = state.copyWith(
      isAuthenticated: _authService.isAuthenticated,
      user: _authService.currentUser,
      isLoading: false,
    );
  } catch (e) {
    state = state.copyWith(isLoading: false, error: e.toString());
  }
}
```

**References:**
- Implementation: `mobile/imu_flutter/lib/services/auth/auth_service.dart:159-191`
- Provider: `mobile/imu_flutter/lib/shared/providers/app_providers.dart:88-112`
- Router: `mobile/imu_flutter/lib/core/router/app_router.dart:97-126`

**Impact:** Fixes session persistence bug where users had to re-enter credentials on app restart despite valid JWT tokens being stored in secure storage

**Fix Date:** 2026-04-06

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

#### Pattern: Router Initialization Wait for Auth State

**Description:** Router must wait for async authentication initialization before making redirect decisions

**When to use:** All go_router configurations with async authentication state initialization

**Example:**
```dart
// WRONG - Router checks auth before initialization completes
final authStateProvider = Provider<bool>((ref) {
  final authState = ref.watch(authNotifierProvider);
  return authState.isAuthenticated; // Returns false before init completes!
});

final routerProvider = Provider<GoRouter>((ref) {
  final isAuthenticated = ref.watch(authStateProvider);

  return GoRouter(
    redirect: (context, state) {
      // BUG: This runs before checkAuthStatus() completes
      if (!isAuthenticated) {
        return '/login'; // Always redirects to login!
      }
    },
  );
});

// CORRECT - Router waits for initialization to complete
final authStateProvider = Provider<AuthState>((ref) {
  final authState = ref.watch(authNotifierProvider);
  return authState; // Return full state including isLoading
});

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);
  final isAuth = authState.isAuthenticated;
  final isLoading = authState.isLoading;

  return GoRouter(
    redirect: (context, state) {
      // Wait for initialization to complete
      if (isLoading) {
        return null; // Don't redirect yet
      }

      // Now it's safe to check auth status
      if (!isAuth) {
        return '/login';
      }
    },
  );
});
```

**Why it works:** Prevents race condition where router redirects to login before `checkAuthStatus()` loads tokens from storage

**The Bug:**
1. App starts → router created → authNotifierProvider created
2. checkAuthStatus() starts (async) to load tokens from storage
3. Router checks auth status BEFORE init completes
4. Router sees `isAuthenticated: false` (initial state)
5. Router redirects to `/login`
6. User sees login page even though valid token exists in storage

**The Fix:**
- Return full `AuthState` from provider (not just boolean)
- Check `isLoading` in router redirect logic
- If `isLoading: true`, return `null` to wait for completion
- Only redirect if `isLoading: false` AND `isAuthenticated: false`

**Related Files:**
- Mobile: `mobile/imu_flutter/lib/core/router/app_router.dart:34-40, 88-119`
- Mobile: `mobile/imu_flutter/lib/services/auth/auth_service.dart:102-136` (AuthState definition)
- Mobile: `mobile/imu_flutter/lib/services/auth/auth_service.dart:149-166` (checkAuthStatus method)

**Impact:**
- ✅ Token persistence now works correctly
- ✅ App opens directly to home/sync-loading after restart if valid token exists
- ✅ No more unnecessary login prompts for authenticated users

**Fix Date:** 2026-04-06

---

#### Pattern: System-Wide Error Logging

**Description:** Centralized error reporting from all platforms (mobile, web, backend) to single PostgreSQL database with deduplication and offline queue

**When to use:** All error reporting across mobile, web, and backend platforms

**Example:**
```typescript
// Backend - POST /api/errors endpoint
errors.post('/', async (c) => {
  const report = await c.req.json();

  // Generate fingerprint for deduplication
  const fingerprint = await generateFingerprint(report.code, report.message, report.stackTrace);

  // Check for duplicate within 1 minute
  const duplicate = await pool.query(
    'SELECT id FROM error_logs WHERE fingerprint = $1 AND last_fingerprint_seen_at > NOW() - INTERVAL \'1 minute\'',
    [fingerprint]
  );

  if (duplicate.rows.length > 0) {
    return c.json({ success: true, logged: false, errorId: duplicate.rows[0].id, reason: 'duplicate' });
  }

  // Insert error with platform-specific context
  await pool.query('INSERT INTO error_logs (...) VALUES (...)');

  return c.json({ success: true, logged: true, errorId: result.rows[0].id });
});

// Flutter Mobile - ErrorReporter service
await ErrorReporterService().reportError(ErrorReport(
  code: 'NETWORK_ERROR',
  message: 'Failed to fetch clients',
  platform: ErrorPlatform.mobile,
  appVersion: '1.0.0',
  osVersion: 'iOS 15.0',
  deviceInfo: {'model': 'iPhone 13'},
  stackTrace: stackTrace.toString(),
));

// Vue Web - Enhanced error handler
import { reportError } from '@/lib/error-handler';

try {
  await apiCall();
} catch (error) {
  reportError(error, {
    pageUrl: window.location.href,
    componentStack: error.componentStack,
    userId: authStore.user?.id,
  });
}
```

**Why it works:**
- **Centralized tracking:** All errors stored in single database for admin review
- **Deduplication:** SHA-256 fingerprint prevents duplicate reports within 1 minute
- **Rate limiting:** 100 errors per minute per IP prevents abuse
- **Offline queue:** Mobile app queues errors locally when offline, syncs when online
- **Platform context:** Captures device info (mobile), page URL (web), request details (backend)
- **Fire-and-forget:** Async, non-blocking error reporting doesn't affect app performance
- **Performance monitoring:** Logs slow operations (>1s) for optimization

**Database Schema:**
```sql
error_logs (
  id UUID PRIMARY KEY,
  request_id UUID UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  user_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  stack_trace TEXT,
  component_stack TEXT,
  fingerprint VARCHAR(64),
  last_fingerprint_seen_at TIMESTAMPTZ,
  occurrences_count INTEGER DEFAULT 1,
  app_version VARCHAR(20),
  os_version VARCHAR(50),
  suggestions TEXT[] DEFAULT '{}',
  documentation_url TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Mobile Queue Management:**
- Max 1000 errors with FIFO eviction
- SHA-256 fingerprint generation for deduplication
- Hive-based offline storage
- Auto-sync when online ( batches of 10)
- 1-minute deduplication window

**References:**
- Backend: `backend/src/routes/errors.ts`, `backend/src/types/error.types.ts`
- Mobile: `mobile/imu_flutter/lib/models/error_report_model.dart`, `mobile/imu_flutter/lib/services/error_reporter_service.dart`
- Vue: `imu-web-vue/src/lib/error-handler.ts`
- Database Migration: `backend/src/migrations/039_add_error_logging_platform_fields.sql`

**Migration Notes:**
- Migration 039 added platform-specific fields (app_version, os_version, component_stack, fingerprint)
- Fingerprint-based deduplication with 1-minute window
- Occurrences count tracking for high-frequency errors
- Indexes on fingerprint, app_version, and timestamp+platform for performance

---

#### Pattern: Error Logging Integration for Sync Services

**Description:** Integrate ErrorLoggingHelper into critical sync and authentication services for centralized error tracking

**When to use:** All sync and authentication services that handle critical operations

**Example:**
```dart
// Critical errors - blocks workflow, direct API call
try {
  await _connectPowerSync();
} catch (e, stackTrace) {
  await ErrorLoggingHelper.logCriticalError(
    operation: 'PowerSync connection',
    error: e,
    stackTrace: stackTrace,
    context: {
      'isAuthenticated': _authService.isAuthenticated,
      'isOnline': _connectivityService.isOnline,
    },
  );
  throw;
}

// Non-critical errors - user can continue, PowerSync queue
try {
  await _updatePendingCount();
} catch (e, stackTrace) {
  await ErrorLoggingHelper.logNonCriticalError(
    operation: 'pending count update',
    error: e,
    stackTrace: stackTrace,
  );
}
```

**Why it works:** Centralized error tracking helps identify and diagnose sync issues in production

**Services with Error Logging:**
- ✅ jwt_auth_service.dart - Login and token refresh failures
- ✅ background_sync_service.dart - Sync failures, connection errors, timeouts
- ✅ powersync_connector.dart - Credential fetch failures, upload failures
- ✅ client_api_service.dart - Client operation failures
- ✅ itinerary_api_service.dart - Itinerary operation failures
- ✅ touchpoint_api_service.dart - Touchpoint operation failures

**Related Files:**
- BackgroundSyncService: `mobile/imu_flutter/lib/services/api/background_sync_service.dart`
- PowerSyncConnector: `mobile/imu_flutter/lib/services/sync/powersync_connector.dart`
- ErrorLoggingHelper: `mobile/imu_flutter/lib/services/error_logging_helper.dart`

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

#### Pattern: Filter Value Validation Before API Requests

**Description:** Always validate filter values before sending to backend API. 'All' selections should not be sent as literal values.

**When to use:** All API requests with optional filter parameters

**Example:**
```typescript
// Computed property that defaults to 'all'
const statusFilter = computed(() =>
  filters.value.status && filters.value.status.length > 0
    ? filters.value.status[0]
    : 'all'  // Default when nothing selected
)

// WRONG: Sends 'all' to backend
function fetchItems() {
  store.fetchItems({
    status: statusFilter.value,  // ← Sends 'all' to backend!
  })
}

// CORRECT: Checks for 'all' before sending
function fetchItems() {
  store.fetchItems({
    status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
  })
}
```

**Why it works:** Backend interprets `status=all` as literal search for status='all', not "no filter". Sending undefined omits the parameter entirely.

**Two Valid Patterns:**

1. **Ternary check for 'all' values:**
```typescript
status: statusFilter.value !== 'all' ? statusFilter.value : undefined
```

2. **Array length checks (for multi-select filters):**
```typescript
if (filters.value.role && filters.value.role.length > 0) {
  params.role = filters.value.role[0]
}
```

**Related Files:**
- Fixed: `imu-web-vue/src/views/itineraries/ItinerariesListView.vue:180`
- Fixed: `imu-web-vue/src/views/caravan/CaravansListView.vue:140,167,213,226-249,309-312,370-380`
- Already Correct: `imu-web-vue/src/views/users/UsersListView.vue:176-182`
- Already Correct: `imu-web-vue/src/views/clients/ClientsListView.vue:188-194`
- Already Correct: `imu-web-vue/src/views/groups/GroupsListView.vue:184-186`

**Impact:** Prevents empty API results when users haven't selected any filters

**Fix Date:** 2026-04-03

---

#### Pattern: Database Schema Alignment Verification

**Description:** Systematic verification of table schemas to ensure all migrations are applied correctly across similar tables

**When to use:** After database migrations, especially for tables that should have similar structures

**Example:**
```sql
-- Verify schema alignment between related tables
SELECT
  t1.table_name as table1,
  string_agg(c1.column_name, ', ' ORDER BY c1.ordinal_position) as columns1,
  t2.table_name as table2,
  string_agg(c2.column_name, ', ' ORDER BY c2.ordinal_position) as columns2
FROM information_schema.tables t1
JOIN information_schema.columns c1 ON t1.table_name = c1.table_name
JOIN information_schema.tables t2 ON t1.table_name < t2.table_name
JOIN information_schema.columns c2 ON t2.table_name = c2.table_name AND c1.column_name = c2.column_name
WHERE t1.table_schema = 'public'
  AND c1.column_name IN ('province', 'municipality', 'municipality_id')
  AND t2.table_name IN ('user_locations', 'group_municipalities')
GROUP BY t1.table_name, t2.table_name;
```

**Why it works:** Catches schema inconsistencies between related tables that should have similar structures

**Common Issues:**
- Migrations created but not applied
- Some tables updated, others missed
- Column renaming not propagated to all tables

**Verification Checklist:**
- [ ] Check all tables with similar naming (user_*, group_*)
- [ ] Verify foreign key column references match
- [ ] Confirm indexes exist on new columns
- [ ] Test INSERT/UPDATE statements with new columns

**Related Files:**
- Schema alignment fix: `backend/src/migrations/045_add_province_municipality_to_group_municipalities.sql`
- Schema alignment fix: `backend/src/migrations/046_remove_municipality_id_from_group_municipalities.sql`

**Impact:** Prevents data inconsistencies, ensures queries work correctly across all tables

**Fix Date:** 2026-04-05

---

#### Pattern: Error Logging with Platform Identification

**Description:** Always include platform field when logging errors to enable filtering and debugging by platform type

**When to use:** All error logging from mobile, web, and backend platforms

**Example:**
```typescript
// Backend - INSERT with platform field
const insertQuery = `
  INSERT INTO error_logs (
    ..., app_version, os_version, platform, device_info, ...
  ) VALUES (
    ..., $19, $20, $21, $22, $23, $24, ...
  )
`;

// Values array
insertValues = [
  ...,
  report.appVersion || null,
  report.osVersion || null,
  report.platform || null,  // CRITICAL: Always include
  report.deviceInfo ? JSON.stringify(report.deviceInfo) : null,
  ...,
];
```

**Why it works:** Enables platform-specific filtering, debugging, and analysis of error patterns

**Platform Values:**
- `mobile` - Flutter mobile app errors
- `web` - Vue web admin errors
- `backend` - Hono backend errors

**Frontend Usage:**
```vue
<!-- Platform badges with icons -->
<span :class="getPlatformBadgeClass(error.platform)">
  {{ getPlatformIcon(error.platform) }} {{ error.platform || 'Unknown' }}
</span>
```

**Related Files:**
- Backend: `backend/src/routes/errors.ts:237-289`
- Frontend: `imu-web-vue/src/views/admin/ErrorLogsView.vue`

**Impact:** Without platform field, error logs batch processor can't find mobile errors, cron jobs fail, filtering doesn't work

**Fix Date:** 2026-04-05

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

#### Pattern: ShellRoute Integration for Consistent UI

**Description:** Add main navigation routes to ShellRoute to provide consistent bottom navigation and sync status overlay

**When to use:** Any route that should have bottom navigation and consistent app-wide UI elements

**Example:**
```dart
// Main app shell with bottom navigation (5 tabs)
ShellRoute(
  builder: (context, state, child) => MainShell(child: child),
  routes: [
    GoRoute(path: '/home', builder: (context, state) => const HomePage()),
    GoRoute(path: '/my-day', builder: (context, state) => const MyDayPage()),
    GoRoute(path: '/itinerary', builder: (context, state) => const ItineraryPage()),
    GoRoute(path: '/clients', builder: (context, state) => const ClientsPage()),
    GoRoute(path: '/profile', builder: (context, state) => const ProfilePage()), // ✅ Added to shell
  ],
),
// Routes NOT in shell don't have bottom nav
GoRoute(path: '/clients/:id', builder: (context, state) => ClientDetailPage(clientId: ...)),
```

**Why it works:** Provides consistent UI across all main screens (bottom nav, sync status overlay), reduces code duplication

**Related Files:**
- Router: `mobile/imu_flutter/lib/core/router/app_router.dart:183-203`
- MainShell: `mobile/imu_flutter/lib/shared/widgets/main_shell.dart`

**Fix Date:** 2026-04-04

---

#### Pattern: Reusable Client Selector Modal

**Description:** Extract client selection modal into reusable widget for adding clients to itinerary

**When to use:** Any screen that needs to add clients to itinerary or My Day

**Example:**
```dart
// Show the modal
ClientSelectorModal.show(
  context,
  selectedDate: DateTime.now(),
  onClientAdded: () {
    // Refresh after client added
    ref.invalidate(todayItineraryProvider);
  },
  title: 'Add to My Day',
  showAssignedFilter: true,
);
```

**Why it works:** Single source of truth for client selection, consistent UX, easier to maintain

**Features:**
- Search by client name/email
- Filter toggle: "Assigned" vs "All Clients"
- Role-based filtering (Admin sees all, others see assigned areas)
- Add to Today or Add with Date options

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/shared/widgets/client_selector_modal.dart`
- Used by: `my_day_page.dart`, `itinerary_page.dart`

**Fix Date:** 2026-04-04

---

#### Pattern: Province-Municipality Combined Filtering

**Description:** Use separate province and municipality columns for granular territory assignments

**When to use:** Filtering clients by user's assigned areas

**Example:**
```dart
// UserLocation model with separate province and municipality
class UserLocation {
  final String province;       // "CEBU"
  final String municipality;   // "CEBU CITY"
}

// Database schema uses separate columns
// user_locations table:
//   - province TEXT
//   - municipality TEXT
//   - UNIQUE(user_id, province, municipality)

// Filter clients by assigned municipalities
final clientProvince = client.province;
final clientMunicipality = client.municipality;
final isAssigned = assignedLocations.any((loc) =>
  loc.province == clientProvince &&
  loc.municipality == clientMunicipality
);
```

**Why it works:**
- Allows granular territory assignments (distinguish between "CEBU-CEBU CITY" and "CEBU-MANDAUE")
- Separate columns enable efficient database queries with proper indexes
- Unique constraint on (user_id, province, municipality) prevents duplicate assignments
- Better database normalization compared to concatenated municipality_id

**Data Source:**
- Backend table: `user_locations` (columns: `province`, `municipality`)
- Backend table: `group_municipalities` (columns: `province`, `municipality`)
- Mobile model: `UserLocation` (separate province and municipality fields)

**Migration Notes:**
- Migration 042: Added province column to user_locations
- Migration 043: Added municipality column to user_locations
- Migration 044: Removed municipality_id column (format: "PROVINCE-MUNICIPALITY")
- Migration 045-046: Same changes applied to group_municipalities table

**Role-Based Rules:**
- **Admin / Assistant Area Manager:** No filtering (see all clients)
- **Area Manager / Caravan / Tele:** Filter by assigned province-municipality combinations

**Related Files:**
- Area Filter Service: `mobile/imu_flutter/lib/services/area/area_filter_service.dart:10-62`
- Client Selector Modal: `mobile/imu_flutter/lib/shared/widgets/client_selector_modal.dart:150-195`
- Migrations: `backend/src/migrations/042_add_province_to_user_locations.sql` through `046_remove_municipality_id_from_group_municipalities.sql`

**Fix Date:** 2026-04-04 (Updated for schema v1.2)

---

#### Pattern: Automatic GPS Capture on Touchpoint Submission

**Description:** Automatically capture GPS coordinates and address when submitting touchpoints

**When to use:** Touchpoint submission to verify agent location

**Example:**
```dart
// Capture GPS location automatically
final geoService = GeolocationService();
final position = await geoService.getCurrentPosition();
String? gpsAddress;

if (position != null) {
  // Get address from coordinates (reverse geocoding)
  gpsAddress = await geoService.getAddressFromCoordinates(
    position.latitude,
    position.longitude,
  );
}

// Include in API payload
final payload = {
  ...,
  if (position != null) 'gps_lat': position.latitude,
  if (position != null) 'gps_lng': position.longitude,
  if (gpsAddress != null) 'gps_address': gpsAddress,
};
```

**Why it works:** Provides verifiable location data for touchpoints, improves accountability and audit trail

**Related Files:**
- Touchpoint Form: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart:768-820`
- Geolocation Service: `mobile/imu_flutter/lib/services/location/geolocation_service.dart`

**Fix Date:** 2026-04-04

---

#### Pattern: Compact Toast Positioning Top-Right

**Description:** Position toast notifications at top-right corner with compact size

**When to use:** Non-intrusive notifications that don't interfere with UI

**Example:**
```dart
// Toast overlay - top-right positioning
Stack(
  children: [
    widget.child,
    if (_toastMessage != null)
      Positioned(
        top: 8,
        right: 8,
        left: null,  // Don't stretch full width
        bottom: null,
        child: SafeArea(
          bottom: false,
          child: _ToastNotification(...),
        ),
      ),
  ],
)

// Toast widget - compact size
Row(
  mainAxisSize: MainAxisSize.min,  // Don't take full width
  children: [
    Icon(...),
    Flexible(  // Instead of Expanded
      child: Text(message),
    ),
    Icon(...),
  ],
)
```

**Why it works:** Toast doesn't go off-screen, compact size is less intrusive, works on all screen sizes

**Related Files:**
- Toast Overlay: `mobile/imu_flutter/lib/app.dart:190-214`
- Toast Notification: `mobile/imu_flutter/lib/app.dart:257-313`

**Fix Date:** 2026-04-04

---

#### Pattern: Hide TimeOfDay from Conflicting Imports

**Description:** Hide TimeOfDay from conflicting imports to resolve ambiguity

**When to use:** Multiple libraries define the same type name

**Example:**
```dart
// DON'T do this (ambiguous)
import 'package:flutter/material.dart';
import '../../../clients/data/models/client_model.dart'; // Has TimeOfDay

// DO this instead
import 'package:flutter/material.dart';
import '../../../clients/data/models/client_model.dart' hide TimeOfDay;
```

**Why it works:** Explicitly hides the conflicting type, prevents "is not defined" errors

**Related Files:**
- Touchpoint Form: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart:10`

**Impact:** Resolves TimeOfDay ambiguity between Flutter and client_model.dart

**Fix Date:** 2026-04-04

---

#### Pattern: Explicit Map Typing for Nullable Values

**Description:** Explicitly type map literals as Map<String, Object?> when values can be null

**When to use:** Adding maps to lists with nullable value types

**Example:**
```dart
// DON'T do this (type mismatch)
List<Map<String, Object?>> _addresses = [];
_addresses.add({
  'id': '1',
  'street': '',  // Error: Map<String, Object> not assignable to Map<String, Object?>
});

// DO this instead
List<Map<String, Object?>> _addresses = [];
_addresses.add(<String, Object?>{
  'id': '1',
  'street': '',  // OK: Explicitly typed
});
```

**Why it works:** Prevents type mismatch errors when map literals contain nullable values

**Related Files:**
- Edit Client Page: `mobile/imu_flutter/lib/features/clients/presentation/pages/edit_client_page.dart:198-216`

**Impact:** Fixes "type _Map<String, Object?> is not a subtype of Map<String, Object>" error

**Fix Date:** 2026-04-04

---

#### Pattern: PostgreSQL Date Type vs Timestamp

**Description:** Use CURRENT_DATE for DATE columns, not NOW()

**When to use:** Inserting date values into PostgreSQL DATE columns

**Example:**
```typescript
// DON'T do this (type error)
INSERT INTO touchpoints (..., date, ...) VALUES (..., NOW(), ...)
//                                                         ^^^^^^ date column expects DATE, not TIMESTAMPTZ

// DO this instead
INSERT INTO touchpoints (..., date, ...) VALUES (..., CURRENT_DATE, ...)
//                                                         ^^^^^^^^^^^^ correct: CURRENT_DATE returns DATE type
```

**Why it works:** Prevents 500 errors when inserting into DATE columns

**Related Files:**
- Backend Approvals: `backend/src/routes/approvals.ts:844`

**Impact:** Fixes "Failed to release loan" 500 error

**Fix Date:** 2026-04-04

---

#### Pattern: Server-Side Touchpoint Status Filtering and Sorting

**Description:** Move filtering and sorting logic from frontend to backend for proper pagination and performance

**When to use:** All list views that need to filter/sort by calculated fields that aren't in the database

**Example:**
```typescript
// Backend - Calculate group score in SQL query
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

// Determine if current user can create the next touchpoint
let canCreateCondition = '';
if (user.role === 'tele') {
  // Tele: Can only create Call types (2, 3, 5, 6)
  canCreateCondition = `next_touchpoint_type = 'Call'`;
} else if (user.role === 'caravan') {
  // Caravan: Can only create Visit types (1, 4, 7)
  canCreateCondition = `next_touchpoint_type = 'Visit'`;
} else {
  // Admin/Manager: Can create any touchpoint
  canCreateCondition = `next_touchpoint_type IS NOT NULL`;
}

// Sort by group score, then by completed count
orderByClause = `ORDER BY
  CASE
    WHEN (${canCreateCondition}) AND tp.completed_count < 7 AND NOT c.loan_released THEN 1
    WHEN tp.completed_count >= 7 OR c.loan_released THEN 2
    WHEN tp.completed_count > 0 THEN 3
    ELSE 4
  END ASC,
  tp.completed_count DESC,
  c.created_at DESC`;

// Frontend - Pass query parameters
const params = {
  page: currentPage.value,
  perPage: perPage.value,
  sort_by: 'touchpoint_status', // Use server-side sorting
  touchpoint_status: 'callable' // Filter by callable clients
};
await callsStore.fetchAssignedClients(params);
```

**Why it works:**
- Backend filters BEFORE pagination, so paginated results are correct
- Frontend doesn't need to fetch large datasets for filtering
- Better performance with millions of records
- Consistent pagination across all pages

**Touchpoint Status Groups:**
- **Group 1 (Callable):** User can create next touchpoint based on role
  - Tele: Next is Call (2, 3, 5, 6)
  - Caravan: Next is Visit (1, 4, 7)
  - Admin/Manager: Any next touchpoint
- **Group 2 (Completed):** 7/7 touchpoints or loan released
- **Group 3 (Has Progress):** 1-6 touchpoints but cannot create next
- **Group 4 (No Progress):** 0 touchpoints

**Related Files:**
- Backend: `backend/src/routes/clients.ts:120-353`
- Frontend: `imu-web-vue/src/views/tele/TeleCallsView.vue:207-253`
- Store: `imu-web-vue/src/stores/calls.ts:222-299`

**Impact:** Fixes pagination issue where callable clients were hidden on first page

**Fix Date:** 2026-04-05

---

#### Pattern: Materialized Views for Dashboard Performance

**Description:** Use materialized views for expensive dashboard queries to pre-compute results and achieve sub-200ms response times

**When to use:** Dashboard queries that aggregate large datasets or complex joins

**Example:**
```typescript
// Backend - Create materialized view for action items
CREATE MATERIALIZED VIEW action_items AS
SELECT
  c.id AS client_id,
  c.first_name,
  c.last_name,
  c.municipality,
  c.is_starred,
  COALESCE(
    LEAD(t.date, 1) OVER (PARTITION BY t.client_id ORDER BY t.date DESC),
    CURRENT_DATE + INTERVAL '30 days'
  ) AS scheduled_date,
  EXTRACT(DAY FROM (
    COALESCE(
      LEAD(t.date, 1) OVER (PARTITION BY t.client_id ORDER BY t.date DESC),
      CURRENT_DATE + INTERVAL '30 days'
    ) - CURRENT_DATE
  )) AS days_overdue
FROM clients c
LEFT JOIN touchpoints t ON c.id = t.client_id
WHERE c.is_active = true
  AND (t.status = 'Interested' OR t.status IS NULL)
  AND (t.date IS NULL OR t.date > CURRENT_DATE - INTERVAL '7 days')
ORDER BY c.created_at DESC;

// Refresh schedule: Every hour via cron job
```

**Why it works:**
- Pre-computes complex joins and aggregations
- Reduces query time from seconds to milliseconds
- Scheduled refreshes keep data current without performance impact
- Supports concurrent reads without blocking writes

**Performance Targets:**
- Target Progress: < 100ms (CTE query)
- Team Performance: < 150ms (CTE query)
- Action Items: < 200ms (materialized view)
- Dashboard Summary: < 100ms (CTE query)

**Related Files:**
- Backend: `backend/src/migrations/052_create_action_items_view.sql`
- Backend: `backend/src/services/cronScheduler.ts` (hourly refresh)
- Backend: `backend/src/scripts/verify-dashboard-performance.ts` (performance testing)

---

#### Pattern: Vue 3 Composition API with TypeScript Type Safety

**Description:** Use Vue 3 Composition API with strict TypeScript typing for type-safe component development

**When to use:** All Vue component development for type safety and better IDE support

**Example:**
```typescript
// Define types with strict typing
interface TargetProgressCard {
  label: string
  target: number
  actual: number
  progress: number
  color: string
}

// Use 'as const' for literal type assertions
const priority = 'all' as const
type Priority = 'all' | 'high' | 'medium' | 'low'

// Computed properties with proper typing
const targetProgressCards = computed<TargetProgressCard[]>(() => {
  return dashboardStore.targetProgressCards
})

// Function names must match template references
function handleClickItem(item: ActionItem): void {
  emit('itemClick', item)
}
```

**Why it works:**
- TypeScript catches type errors at compile time
- Better IDE autocomplete and refactoring
- Prevents runtime type errors
- Self-documenting code with type definitions

**Common TypeScript Errors Fixed:**
1. Priority type mismatch → Use `'as const` assertion
2. Function name mismatch → Template calls `handleClickItem`, not `handleItemClick`
3. Undefined variable → Calculate progress from actuals/target: `progress = (actual / target) * 100`

**Related Files:**
- Components: `src/components/dashboard/TargetProgressHero.vue`, `TargetProgressCard.vue`, `TeamPerformanceCard.vue`, `ActionItemsDrawer.vue`
- Store: `src/stores/dashboard.ts`

---

#### Pattern: Riverpod Provider Chaining for Derived Data

**Description:** Use `FutureProvider.autoDispose` with `ref.watch()` to create providers that derive data from other providers

**When to use:** Need computed/derived data that automatically updates when source provider changes

**Example:**
```dart
// Provider that watches another provider and derives data from it
final clientTouchpointCountsProvider = FutureProvider.autoDispose<Map<String, int>>((ref) async {
  // Watch the source provider
  final clientsAsync = ref.watch(assignedClientsProvider);

  // Extract client IDs from the source provider's data
  final clientIds = clientsAsync.when(
    data: (response) => response.items
        .map((client) => client.id!)
        .where((id) => id.isNotEmpty)  // Filter out empty IDs
        .toList(),
    loading: () => <String>[],
    error: (_, __) => <String>[],
  );

  // Early return if no data
  if (clientIds.isEmpty) return {};

  // Watch another provider (service) and use it to fetch data
  final service = ref.watch(touchpointCountServiceProvider);
  return await service.fetchCounts(clientIds);
});
```

**Why it works:**
- Provider automatically recomputes when source provider data changes
- `autoDispose` prevents memory leaks by disposing when no longer watched
- `cacheTime` prevents unnecessary refetches (default 5 minutes)
- Clean separation of concerns (data fetching vs. data derivation)

**Common Pitfalls:**
- **Not filtering empty IDs:** Can cause invalid SQL queries with empty strings
- **Missing early returns:** Provider may attempt fetch operations with empty data
- **Not using when():** Cannot properly handle loading/error states of source provider

**Related Files:**
- Provider: `mobile/imu_flutter/lib/shared/providers/app_providers.dart:261-275`
- Service: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_count_service.dart`

**Impact:** Enables efficient, reactive data flow between providers with automatic updates and cache management

**Fix Date:** 2026-04-07

---

#### Pattern: PowerSync Batch Query Optimization

**Description:** Use SQL GROUP BY with IN clause instead of individual queries for aggregated data fetching

**When to use:** Fetching aggregated data (COUNT, SUM, AVG) for multiple entities

**Example:**
```dart
// WRONG: Individual queries (N+1 problem)
for (final clientId in clientIds) {
  final result = await db.get(
    'SELECT COUNT(*) as count FROM touchpoints WHERE client_id = ?',
    [clientId],
  );
}

// CORRECT: Batch query with GROUP BY
final placeholders = List.filled(clientIds.length, '?').join(',');
final results = await db.getAll(
  'SELECT client_id, COUNT(*) as count FROM touchpoints WHERE client_id IN ($placeholders) GROUP BY client_id',
  clientIds,
);

// Convert to Map for easy lookup
final counts = {
  for (var row in results) row['client_id'] as String: row['count'] as int
};
```

**Why it works:**
- Single database query instead of N queries
- Uses SQL aggregation for efficient computation
- Reduces round-trips to database
- Better performance with PowerSync's SQLite backend

**Performance Improvement:**
- **Before:** 100 clients = 100 separate queries (~500ms)
- **After:** 100 clients = 1 batch query (~50ms)
- **Improvement:** 10x faster

**Common Pitfalls:**
- **Forgetting GROUP BY:** Returns duplicate rows instead of aggregated counts
- **Not handling empty results:** Need to return empty Map when no clients
- **Type casting:** PowerSync returns dynamic types, need explicit casting

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_count_service.dart:22-45`
- Provider: `mobile/imu_flutter/lib/shared/providers/app_providers.dart:261-275`

**Impact:** Significantly improves performance of touchpoint count display in client lists

**Fix Date:** 2026-04-07

---

#### Pattern: Widget Enhancement with Backward Compatibility

**Description:** Add optional parameters with `??` fallback to existing behavior for safe widget enhancements

**When to use:** Enhancing widgets without breaking existing consumers

**Example:**
```dart
// BEFORE: Widget only used client.completedTouchpoints
class TouchpointProgressBadge extends StatelessWidget {
  final Client client;

  @override
  Widget build(BuildContext context) {
    final count = client.completedTouchpoints;
    return Text('$count/7');
  }
}

// AFTER: Widget accepts optional external count with fallback
class TouchpointProgressBadge extends StatelessWidget {
  final Client client;
  final int? touchpointCount;  // NEW optional parameter

  // Use external count if provided, otherwise fall back to existing behavior
  int get _displayedCount => touchpointCount ?? client.completedTouchpoints;

  @override
  Widget build(BuildContext context) {
    final count = _displayedCount;
    return Text('$count/7');
  }
}
```

**Why it works:**
- Existing consumers continue to work without modification
- New consumers can provide external data for better accuracy
- No breaking changes to widget API
- Gradual migration path (enhance some consumers, leave others as-is)

**Common Pitfalls:**
- **Not using ??:** Using `??` ensures fallback to original behavior
- **Not making it optional:** Parameter must be nullable (int? not int)
- **Forgetting existing behavior:** Must preserve original logic in fallback

**Related Files:**
- Widget: `mobile/imu_flutter/lib/shared/widgets/client/touchpoint_progress_badge.dart:20-27`
- Consumer 1: `mobile/imu_flutter/lib/shared/widgets/client/client_list_tile.dart`
- Consumer 2: `mobile/imu_flutter/lib/shared/widgets/client_selector_modal.dart:215`

**Impact:** Allows gradual enhancement of widgets with provider-sourced data while maintaining backward compatibility

**Fix Date:** 2026-04-07

---

#### Pattern: Passing Provider Data Through Widget Tree

**Description:** Watch provider at parent widget, pass async value as parameter to child methods

**When to use:** Provider data needed in child widgets or methods

**Example:**
```dart
// Parent widget: Watch provider and pass to child methods
class ClientsPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch the provider at parent level
    final touchpointCountsAsync = ref.watch(clientTouchpointCountsProvider);

    return touchpointCountsAsync.when(
      data: (counts) {
        // Pass the data (not AsyncValue) to child method
        return _buildClientCard(client, counts);
      },
      loading: () => CircularProgressIndicator(),
      error: (_, __) => ErrorText('Failed to load touchpoint counts'),
    );
  }

  // Child method signature accepts the data type (not AsyncValue)
  Widget _buildClientCard(Client client, Map<String, int> touchpointCounts) {
    final count = touchpointCounts[client.id] ?? 0;
    return ClientListTile(
      client: client,
      touchpointCount: count,  // Pass pre-extracted value
    );
  }
}
```

**Why it works:**
- Clean separation: Parent handles async state, children handle display
- Type-safe: Children receive concrete types, not AsyncValue wrapper
- Testable: Children can be tested with mock data without provider setup
- Performance: Async state handled once at parent, not re-computed for each child

**Common Pitfalls:**
- **Passing AsyncValue to children:** Children must handle loading/error states repeatedly
- **Watching provider in children:** Causes multiple provider watches (inefficient)
- **Not handling null data:** Need to provide default values when data missing

**Related Files:**
- Parent 1: `mobile/imu_flutter/lib/shared/widgets/client_selector_modal.dart:177-217`
- Parent 2: `mobile/imu_flutter/lib/features/clients/presentation/pages/clients_page.dart:156-197`
- Child Widget: `mobile/imu_flutter/lib/shared/widgets/client/client_list_tile.dart`

**Impact:** Enables efficient provider data propagation through widget tree with clean separation of concerns

**Fix Date:** 2026-04-07

---

#### Pattern: Provider Cache Invalidation After Mutations

**Description:** Use `ref.invalidate()` to refresh provider data after mutations to keep UI in sync

**When to use:** Provider data becomes stale after create/update/delete operations

**Example:**
```dart
// Create a touchpoint (mutation)
await ref.read(createMyDayVisitProvider(clientId).notifier).createVisit(visitData);

// Invalidate the touchpoint counts provider to refresh data
ref.invalidate(clientTouchpointCountsProvider);

// Now the UI will automatically rebuild with updated touchpoint counts
```

**Why it works:**
- Forces provider to re-fetch data from source
- All widgets watching the provider automatically rebuild
- Ensures UI reflects latest data after mutations
- Works with `cacheTime` to prevent excessive refetches

**When to Invalidate:**
- After creating touchpoints (increases count)
- After deleting touchpoints (decreases count)
- After bulk operations (affects multiple counts)
- After sync operations (data may have changed)

**Common Pitfalls:**
- **Not invalidating after mutations:** UI shows stale data
- **Invalidating too frequently:** Causes unnecessary refetches
- **Forgetting cacheTime:** Provider may refetch immediately (inefficient)

**Related Files:**
- Invalidation 1: `mobile/imu_flutter/lib/shared/widgets/client_selector_modal.dart:272`
- Invalidation 2: `mobile/imu_flutter/lib/features/clients/presentation/pages/clients_page.dart:239`
- Provider: `mobile/imu_flutter/lib/shared/providers/app_providers.dart:261-275`

**Impact:** Ensures UI always displays accurate touchpoint counts after user actions

**Fix Date:** 2026-04-07

---

#### Pattern: Touchpoint Badge Display Format

**Description:** Touchpoint progress badges display "X/7 • type" format with lowercase next touchpoint type

**When to use:** Displaying touchpoint progress in UI components

**Example:**
```dart
final next = TouchpointPattern.types[count];  // null if count >= 7
final label = next != null
    ? '$count/7 • ${next.name.toLowerCase()}'  // "3/7 • visit"
    : '$count/7';  // "7/7" (completed)

// TouchpointPattern.types array:
// [Visit, Call, Call, Visit, Call, Call, Visit]
// Index 0 = 1st touchpoint (Visit)
// Index 1 = 2nd touchpoint (Call)
// ...
// Index 6 = 7th touchpoint (Visit)
```

**Why it works:**
- Shows progress (X/7) and what comes next (visit/call)
- Lowercase type for visual consistency
- Bullet separator (•) for clean appearance
- No next type when all 7 completed

**Display Format:**
- 0 touchpoints: "0/7 • visit" (next is 1st: visit)
- 1 touchpoint: "1/7 • call" (next is 2nd: call)
- 2 touchpoints: "2/7 • call" (next is 3rd: call)
- 3 touchpoints: "3/7 • visit" (next is 4th: visit)
- 6 touchpoints: "6/7 • visit" (next is 7th: visit)
- 7 touchpoints: "7/7" (completed, no next)

**Related Files:**
- Implementation: `mobile/imu_flutter/lib/shared/widgets/client/touchpoint_progress_badge.dart:51-58`
- Pattern: `mobile/imu_flutter/lib/core/models/touchpoint_pattern.dart`

**Impact:** Consistent, informative touchpoint progress display across all UI components

**Fix Date:** 2026-04-07

---

#### Pattern: TouchpointReason Enum Values

**Description:** TouchpointReason enum uses `interested` value, not `qualifiedLead`

**When to use:** Setting touchpoint status/reason in code and tests

**Example:**
```dart
// CORRECT:
final status = TouchpointStatus.interested;

// WRONG - doesn't exist:
// final status = TouchpointStatus.qualifiedLead;

// Valid TouchpointStatus values:
// - TouchpointStatus.interested
// - TouchpointStatus.undecided
// - TouchpointStatus.notInterested
// - TouchpointStatus.completed
```

**Why it matters:**
- `qualifiedLead` was likely renamed to `interested`
- Using wrong value causes compilation errors
- Tests must use correct enum values
- Affects both mobile and backend code

**Common Pitfalls:**
- **Using legacy names:** `qualifiedLead` doesn't exist
- **Case sensitivity:** Must be lowercase `interested`
- **Wrong enum:** `TouchpointReason` vs `TouchpointStatus` (different enums)

**Related Files:**
- Enum: `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`
- Tests: `mobile/imu_flutter/test/widget/widgets/touchpoint_progress_badge_test.dart`

**Impact:** Prevents compilation errors in touchpoint-related code

**Fix Date:** 2026-04-07

---

#### Pattern: Lucide Icons Import and Usage

**Description:** Lucide icons require `LucideIcons.iconName` prefix, NOT Flutter's `Icons.iconName`

**When to use:** Using Lucide icon library in Flutter widgets

**Example:**
```dart
// Import statement
import 'package:lucide_icons/lucide_icons.dart' show LucideIcons;

// CORRECT: Use LucideIcons prefix
Icon(LucideIcons.phone)
Icon(LucideIcons.calendar)
Icon(LucideIcons.mapPin)

// WRONG: Flutter's Icons class
// Icon(Icons.phone)  // This is Flutter's Material Icons
// Icon(Icons.calendar)  // This is Flutter's Material Icons
```

**Why it matters:**
- Lucide icons are separate from Flutter's built-in Material Icons
- Must use `LucideIcons` prefix to access Lucide icon set
- `show LucideIcons` in import prevents naming conflicts

**Common Pitfalls:**
- **Forgetting LucideIcons prefix:** Results in undefined reference error
- **Using Icons.iconName:** Wrong icon library (Material Icons instead)
- **Missing import:** Must import lucide_icons package

**Related Files:**
- Import: `mobile/imu_flutter/lib/shared/widgets/client/client_list_tile.dart:10`
- Package: `package:lucide_icons/lucide_icons.dart`

**Impact:** Correct icon rendering in UI components

**Fix Date:** 2026-04-07

---

#### Pattern: Import Aliasing for Conflicting Types

**Description:** Use `hide TypeName` when multiple imports define the same type name

**When to use:** Multiple libraries define conflicting type names (e.g., TimeOfDay)

**Example:**
```dart
// CONFLICT: Both Flutter and client_model define TimeOfDay
import 'package:flutter/material.dart';  // Has TimeOfDay
import '../../../clients/data/models/client_model.dart';  // Also has TimeOfDay

// SOLUTION: Hide TimeOfDay from client_model import
import 'package:flutter/material.dart';
import '../../../clients/data/models/client_model.dart' hide TimeOfDay;

// Now TimeOfDay refers to Flutter's version
TimeOfDay now = TimeOfDay.now();
```

**Why it works:**
- Explicitly hides conflicting type from import
- Prevents "ambiguous import" errors
- Clear which version you're using (Flutter's in this case)
- No need to fully qualify type names

**Common Conflicts:**
- **TimeOfDay:** Flutter vs. client_model
- **User:** Multiple packages may define User model
- **Client:** Multiple packages may define Client model

**Alternatives:**
```dart
// Alternative 1: Use prefix (more verbose)
import 'package:flutter/material.dart' as material;
material.TimeOfDay now = material.TimeOfDay.now();

// Alternative 2: Hide from Flutter instead
import 'package:flutter/material.dart' hide TimeOfDay;
import '../../../clients/data/models/client_model.dart';
// Now TimeOfDay refers to client_model's version
```

**Related Files:**
- Import: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart:10`
- Conflict: Flutter's TimeOfDay vs. client_model's TimeOfDay

**Impact:** Prevents compilation errors from conflicting type names

**Fix Date:** 2026-04-07

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

### Integration: DigitalOcean PostgreSQL SSL Certificate Issues

**Issue:** PowerSync service cannot connect to DigitalOcean PostgreSQL due to self-signed certificate in certificate chain

**Symptoms:**
```
SyncResponseException: 500 Internal Server Error
Database connection failed: self-signed certificate in certificate chain
```

**Root Cause:** DigitalOcean PostgreSQL uses self-signed certificates in the certificate chain. Node.js/pg and PowerSync service reject these connections by default.

**Solution:** Add `uselibpqcompat=true` flag to database connection URI

**Code Example:**
```yaml
# WRONG - SSL certificate validation fails:
uri: postgresql://user:pass@host:25060/db?sslmode=require

# CORRECT - Works with DigitalOcean PostgreSQL:
uri: postgresql://user:pass@host:25060/db?uselibpqcompat=true&sslmode=require
```

**Node.js Connection Test:**
```javascript
const { Client } = require('pg');

// WRONG - Self-signed certificate error:
const client = new Client({
  connectionString: 'postgresql://user:pass@host:25060/db?sslmode=require'
});
await client.connect();
// ERROR: self-signed certificate in certificate chain

// CORRECT - Connection succeeds:
const client = new Client({
  connectionString: 'postgresql://user:pass@host:25060/db?uselibpqcompat=true&sslmode=require'
});
await client.connect();
// SUCCESS: ✅ Database connection successful
```

**Why it works:** The `uselibpqcompat=true` flag enables libpq compatibility mode for SSL handling, which allows connections to databases with self-signed certificates in the certificate chain.

**Related Files:**
- PowerSync Service Config: `backend/powersync/service.yaml:27-28`
- Backend Database Pool: Already using `uselibpqcompat=true` (from previous fix)

**Impact:** Critical for DigitalOcean PostgreSQL connections. Without this flag, all database connections fail with SSL certificate errors.

**Fix Date:** 2026-04-05

**Prevention:** Always test database connections with SSL settings before deploying. Use `uselibpqcompat=true` for DigitalOcean PostgreSQL databases.

---

### Integration: Error Logging Platform Field Not Populated

**Issue:** Error logs platform column exists in database but backend code doesn't populate it

**Symptoms:**
- All error_logs have platform=NULL despite schema supporting it
- Platform filtering not working in admin UI
- Error logs batch processor not finding mobile errors (queries `WHERE platform = 'mobile'`)
- Cron jobs failing to process mobile error logs

**Error Messages:**
```
Apr 05 12:25:00  [ Database Error (error_logs) ]: column "platform" does not exist
Apr 05 12:25:00  [ ERROR: error-logs ]: Failed to process mobile error logs
```

**Root Cause:** Database migration 048 added platform column to error_logs table, but the INSERT statement in errors.ts was not updated to include it

**Code Example:**
```typescript
// WRONG - Platform column missing from INSERT:
const insertQuery = `
  INSERT INTO error_logs (
    ..., app_version, os_version, suggestions, ...
  ) VALUES (
    ..., $19, $20, $21, ...
  )
`;

// CORRECT - Include platform and device_info:
const insertQuery = `
  INSERT INTO error_logs (
    ..., app_version, os_version, platform, device_info, suggestions, ...
  ) VALUES (
    ..., $19, $20, $21, $22, $23, $24, ...
  )
`;

const insertValues = [
  ...,
  report.appVersion || null,
  report.osVersion || null,
  report.platform || null,  // CRITICAL: Always include
  report.deviceInfo ? JSON.stringify(report.deviceInfo) : null,
  report.suggestions || [],
  ...
];
```

**Verification Query:**
```sql
-- Check if platform is being populated
SELECT platform, COUNT(*)
FROM error_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY platform;

-- Expected result:
-- platform | count
-- ----------+-------
-- mobile    | 15
-- web       | 5
-- backend   | 2
```

**Why it works:** Including platform in INSERT statement enables:
- Platform filtering in admin UI
- Mobile error batch processing
- Cron job cleanup of old mobile errors
- Platform-specific error analysis

**Related Files:**
- Backend: `backend/src/routes/errors.ts:237-289`
- Migration: `backend/src/migrations/048_add_missing_error_logs_columns.sql`
- Batch Processor: `backend/src/services/errorLogsBatchProcessor.ts:26-27`
- Frontend: `imu-web-vue/src/views/admin/ErrorLogsView.vue`

**Impact:** Without platform field, error logs system cannot distinguish between mobile/web/backend errors, breaking filtering and batch processing

**Fix Date:** 2026-04-05

**Prevention:**
- Always update INSERT/UPDATE statements when adding columns via migrations
- Verify database schema matches code expectations
- Test cron jobs and batch processors after schema changes

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

### Integration: DigitalOcean Environment Variable Format

**Issue:** Environment variables with multiline strings (RSA keys, certificates) fail when deployed to DigitalOcean App Platform

**Symptoms:**
- JWT signing fails with "secretOrPrivateKey must be an asymmetric key when using RS256"
- Certificate verification fails
- Keys appear as single-line strings instead of proper PEM format

**Root Cause:** DigitalOcean stores environment variables with escaped newlines (`\n`) instead of actual newlines. When loaded directly, RSA keys become single-line strings instead of proper PEM format with line breaks.

**Solution:**
```typescript
// ❌ WRONG - Direct loading fails
const privateKey = process.env.POWERSYNC_PRIVATE_KEY;

// ✅ CORRECT - Handle escaped newlines
const privateKeyInput = process.env.POWERSYNC_PRIVATE_KEY;
const privateKey = privateKeyInput?.trim().replace(/\\n/g, '\n');
```

**When to apply:**
- Any environment variable containing multiline strings (RSA keys, certificates, PEM files)
- All deployments to DigitalOcean App Platform
- Keys loaded from environment variables for JWT signing, SSL/TLS

**Code Example:**
```typescript
// Load PowerSync RSA keys from environment variable for JWT signing
const privateKeyInput = process.env.POWERSYNC_PRIVATE_KEY;
const publicKeyInput = process.env.POWERSYNC_PUBLIC_KEY;

// Handle escaped newlines in environment variables (DigitalOcean format)
const privateKey = privateKeyInput?.trim().replace(/\\n/g, '\n');
const publicKey = (publicKeyInput || privateKeyInput)?.trim().replace(/\\n/g, '\n');
```

**Related Files:**
- Backend: `backend/src/routes/auth.ts:34-35`
- Backend: `backend/src/utils/init-logger.ts:664-666, 712` (fixed during debugging)
- Deployment: DigitalOcean App Platform environment variables

**Impact:** Without this fix, JWT signing and SSL certificate verification fail in production deployments

**Prevention:** Always use `.replace(/\\n/g, '\n')` when loading multiline environment variables on DigitalOcean

**Fix Date:** 2026-04-05

---

### Integration: PowerSync Sync Configuration Validation

**Issue:** Complex sync configurations fail validation with "Unknown function" errors

**Symptoms:**
```
SyncResponseException: 500 Internal Server Error
[error] 1:1 Unknown function, Unknown function, Syntax error at line 15 col 3
```

**Root Cause:** PowerSync edition 3 has strict SQL validation. Complex queries with EXISTS clauses, territory filtering, and too many columns cause validation failures.

**Solution:**
Keep sync configuration simple and match the deployed structure:
- Use simple WHERE clauses with `auth.user_id()`
- Avoid complex EXISTS subqueries for territory filtering
- Select only necessary columns
- Limit to 5-7 streams maximum

**Code Example:**
```yaml
# WRONG - Complex query (fails validation):
clients:
  auto_subscribe: true
  query: |
    SELECT c.id, c.first_name, c.last_name, c.middle_name, c.email, c.phone,
      c.birth_date, c.pan, c.client_type, c.product_type, c.market_type, c.pension_type,
      c.psgc_id, c.region, c.province, c.municipality, c.barangay,
      c.agency_name, c.department, c.position, c.employment_status, c.payroll_date,
      c.tenure, c.facebook_link, c.remarks, c.agency_id, c.user_id,
      c.is_starred, c.loan_released, c.loan_released_at, c.udi,
      c.created_at, c.updated_at
    FROM clients c
    WHERE EXISTS (
      SELECT 1 FROM user_locations ul
      WHERE ul.user_id = auth.user_id()
        AND c.province = ul.province
        AND c.municipality = ul.municipality
        AND ul.deleted_at IS NULL
    )

# CORRECT - Simple query (passes validation):
clients:
  auto_subscribe: true
  query: |
    SELECT c.id, c.first_name, c.last_name, c.middle_name, c.email, c.phone,
      c.client_type, c.product_type, c.market_type, c.pension_type,
      c.municipality, c.is_starred, c.created_at, c.updated_at
    FROM clients c
```

**Validation Command:**
```bash
powersync deploy sync-config --instance-id <id> --project-id <id> --directory powersync
```

**Related Files:**
- Sync Config: `backend/powersync/sync-config.yaml`
- Deployed Config: Use `powersync fetch config` to see working version

**Impact:** Sync configuration must be simple and validated before deployment

**Fix Date:** 2026-04-05

**Prevention:** Always validate sync configuration before deploying. Use `powersync deploy sync-config` to check for validation errors.

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

### Pattern: Enhanced RBAC Permissions

**Description:** Comprehensive permission system covering dashboard, approvals, and error_logs

**When to use:** All administrative and oversight features

**Example:**
```sql
-- Dashboard permissions (Admin + Area Manager + Assistant Area Manager)
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('dashboard', 'read', NULL, 'View dashboard statistics and metrics'),
    ('dashboard', 'read_performance', NULL, 'View performance metrics and analytics');

-- Approvals permissions (Admin only)
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('approvals', 'read', NULL, 'View all approval requests'),
    ('approvals', 'create', NULL, 'Create approval requests'),
    ('approvals', 'approve', NULL, 'Approve requests'),
    ('approvals', 'reject', NULL, 'Reject requests'),
    ('approvals', 'update', NULL, 'Update approval details'),
    ('approvals', 'delete', NULL, 'Delete approval requests');

-- Error logs permissions (Admin only)
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('error_logs', 'read', NULL, 'View all error logs'),
    ('error_logs', 'resolve', NULL, 'Resolve error logs'),
    ('error_logs', 'delete', NULL, 'Delete error logs');
```

**Why it works:**
- **Dashboard:** Provides oversight capabilities for managers without giving full system access
- **Approvals:** Centralized approval workflow for client and UDI changes
- **Error Logs:** Admin-only access to sensitive error information for security

**Role Assignments:**
- **Admin:** All permissions (dashboard, approvals, error_logs)
- **Area Manager:** Dashboard only (read and read_performance)
- **Assistant Area Manager:** Dashboard only (read and read_performance)
- **Caravan:** None (field agents don't need admin features)
- **Tele:** None (telemarketers don't need admin features)

**Related Files:**
- Migration: `backend/src/migrations/040_add_missing_rbac_resources.sql`
- Backend: `backend/src/routes/dashboard.ts`, `backend/src/routes/approvals.ts`, `backend/src/routes/error-logs.ts`
- Frontend: `imu-web-vue/src/views/dashboard/`, `imu-web-vue/src/views/approvals/`, `imu-web-vue/src/views/admin/ErrorLogsView.vue`

**Fix Date:** 2026-04-04

---

### Pattern: Tele Role Client Update Permission

**Description:** Tele (telemarketer) role can update assigned client information

**When to use:** Tele users need to correct client information during calls

**Example:**
```sql
-- Grant clients.update:own to Tele role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource = 'clients'
    AND p.action = 'update'
    AND p.constraint_name = 'own'
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

**Why it works:**
- Allows telemarketers to correct client information (phone numbers, addresses, etc.)
- Restricted to "own" constraint - can only update clients they can see
- Improves data quality without requiring manager approval for minor corrections
- Maintains security by not giving delete or create permissions

**Permission Matrix:**
| Resource | Action | Constraint | Tele Role |
|----------|--------|------------|-----------|
| clients | read | own | ✅ Yes |
| clients | update | own | ✅ Yes |
| clients | create | - | ❌ No |
| clients | delete | - | ❌ No |
| touchpoints | create | call | ✅ Yes |
| touchpoints | create | visit | ❌ No |

**Related Files:**
- Migration: `backend/src/migrations/045_add_tele_client_update_permission.sql`
- Backend: `backend/src/routes/clients.ts` (PUT endpoint with approval workflow)
- Mobile: `mobile/imu_flutter/lib/services/permissions/permission_service.dart`

**Fix Date:** 2026-04-04

---

### Pattern: Background Jobs for Async Processing

**Description:** Use background_jobs table for long-running operations like PSGC matching and report generation

**When to use:** Operations that take more than a few seconds to complete

**Example:**
```sql
-- Create background job
INSERT INTO background_jobs (type, status, params, created_by)
VALUES ('psgc_matching', 'pending', '{"client_id": "123"}', current_user_id);

-- Process job asynchronously
UPDATE background_jobs
SET status = 'processing', started_at = NOW()
WHERE id = job_id;

-- Update progress
UPDATE background_jobs
SET progress = 50, total_items = 100
WHERE id = job_id;

-- Complete job
UPDATE background_jobs
SET status = 'completed', completed_at = NOW(), result = '{"matched": 25}'
WHERE id = job_id;
```

**Why it works:**
- **Non-blocking:** API returns immediately with job ID
- **Progress tracking:** Clients can poll for updates
- **Error handling:** Failed jobs are logged with error messages
- **Retry capability:** Failed jobs can be retried by resetting status to 'pending'

**Job Types:**
- `psgc_matching` - Match clients to PSGC geographic codes
- `report_generation` - Generate performance reports
- `user_location_assignments` - Bulk assign municipalities to users

**Status Flow:**
```
pending → processing → completed
                    ↘ failed
```

**Related Files:**
- Migration: `backend/src/migrations/034_create_background_jobs.sql`
- Backend: `backend/src/services/backgroundJob.ts`
- Backend: `backend/src/routes/jobs.ts` (job status endpoints)

**Note:** As of 2026-04-04, background job infrastructure exists but main endpoints use synchronous operations. Consider migrating long-running operations to use background jobs.

**Fix Date:** 2026-04-04

---

## 8. Security Learnings

### Security Incident: JWT Secret Exposure (CRITICAL)

**Date:** 2026-04-05

**Description:** JWT secrets were committed to git repository and pushed to GitHub (THREE separate incidents)

**Incidents:**

**Incident 1: First JWT Secret Exposure**
- **Commit:** `02723bb` - "fix: address critical issues from code review"
- **Exposed Secret:** `SanecRywniauN2CAehidOnMN/KNhWW9VuGFs6cHm1qo=`
- **Time Exposed:** ~5 hours (03:27 UTC to ~08:30 UTC)
- **Discovery:** During security review before push
- **Action Taken:** Reset branch to commit `d32e7df`, force pushed to remove from GitHub

**Incident 2: Second JWT Secret Exposure**
- **Commit:** `7effc16` - "security: Rotate JWT secret due to exposure in commit 02723bb"
- **Backend Commit:** `0ab818a` - "security: Rotate JWT secret due to exposure in commit 02723bb"
- **Exposed Secret:** `8SCTDMHUXt0Ciz61Ifv+cg3Smv/T6qnVQCHKZSyPe9Q=`
- **Time Exposed:** ~2 hours (~17:54 UTC to ~20:00 UTC)
- **Discovery:** During post-push verification
- **Action Taken:** Removed from git tracking, updated .gitignore files
- **Files Affected:** `.env.qa`, `.env.dev`, `.env.prod`

**Incident 3: Third JWT Secret (Current)**
- **Secret:** `mZ1lRqLTKK/c8Ss//BwF4rzmBACMnEpkmvdmPCpy5DA=`
- **Status:** NOT committed to git (kept locally only)
- **Action:** Update DigitalOcean environment variables directly
- **Deployment:** Via CI/CD or manual dashboard update

**Impact:**
- Three JWT secrets were exposed on GitHub (two are still public)
- Anyone with these secrets can forge JWT tokens and impersonate ANY user
- All existing JWT tokens signed with these secrets must be invalidated
- Backend JWT secret must be rotated and deployed via CI/CD only

**Root Causes:**
1. **.env files tracked by git** - `.env.dev`, `.env.prod`, `.env.qa` were committed to repository
2. **.env.qa missing from .gitignore** - Backend .gitignore didn't include `.env.qa`
3. **No pre-commit hook** - No automated check for secrets before commit
4. **Manual error** - JWT secrets were accidentally added to .env files during development
5. **Insufficient review** - Commits were pushed without security verification
6. **Rotation mistake** - During rotation, new secrets were committed instead of being deployed via CI/CD

**Files Affected:**
- `backend/.env` - Backend development environment (updated locally, not committed)
- `backend/.env.qa` - Backend QA environment (removed from git tracking)
- `mobile/imu_flutter/.env.dev` - Development environment file (removed from git tracking)
- `mobile/imu_flutter/.env.prod` - Production environment file (removed from git tracking)
- `mobile/imu_flutter/.env.qa` - QA environment file (updated locally, not committed)

**Remediation Steps Taken:**
1. Generated third JWT secret: `mZ1lRqLTKK/c8Ss//BwF4rzmBACMnEpkmvdmPCpy5DA=`
2. Updated all environment files locally with new secret
3. Added `.env.qa` to backend `.gitignore`
4. Added explicit `.env.dev`, `.env.prod`, `.env.qa` entries to mobile `.gitignore`
5. Removed `.env` files from git tracking using `git rm --cached`
6. Committed `.gitignore` updates as `4ee1b8b` (backend) and `782874d` (mobile)
7. Pushed `.gitignore` fixes to prevent future tracking

**Prevention Measures:**
1. **NEVER commit .env files with real secrets** - Use placeholder values only
2. **ALWAYS use .env.example files** - Template files with placeholder values
3. **Add ALL .env variants to .gitignore** - Explicit entries for `.env`, `.env.dev`, `.env.prod`, `.env.qa`
4. **Use pre-commit hooks** - Run git-secrets or similar to detect secrets before commit
5. **Deploy secrets via CI/CD** - Use DigitalOcean App Platform environment variables
6. **Enable GitHub secret scanning** - Automatic detection of exposed secrets
7. **Security review before push** - Always verify no secrets in commits
8. **Secret rotation via deployment** - Never commit rotated secrets, use CI/CD instead
4. **Environment-specific secrets** - Load secrets from CI/CD or local environment only
5. **Security review before push** - Always verify no secrets in commits

**Required Actions:**
1. **Rotate JWT secret on backend IMMEDIATELY** - Generate new secret
2. **Update all environment files** - Backend, mobile .env files
3. **Revoke all existing JWT tokens** - Force user re-authentication
4. **Review GitHub repository access** - Check for unauthorized access
5. **Scan for other exposed secrets** - Use git-secrets or similar tools

**Related Files:**
- Mobile: `mobile/imu_flutter/.env.dev`, `mobile/imu_flutter/.env.prod`
- Git History: Commits `02723bb`, `7effc16`, `cf64ed2`

**Documentation:** Added to learnings.md 2026-04-05

**Status:** ⚠️ CRITICAL - JWT secrets still compromised, must rotate backend secret

---

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

---

### Migration: Remove municipality_id Column

**From:** Combined `municipality_id` column (format: "PROVINCE-MUNICIPALITY")
**To:** Separate `province` and `municipality` columns

**Breaking Changes:**
- `municipality_id` column removed from `user_locations` table
- Backend API endpoints changed to return separate fields
- Mobile app updated to use separate columns
- PowerSync sync rules updated

**Migration Steps:**
1. Migration 042: Added `province` column
2. Migration 043: Added `municipality` column with backfill
3. Migration 044: Removed `municipality_id` column
4. Updated backend endpoints to use separate fields
5. Updated mobile app models and providers
6. Updated PowerSync sync rules
7. Deployed updated sync configuration

**Data Flow Changes:**
```
Before: Database → municipality_id → API → Mobile
After:  Database → province + municipality → API → Mobile
```

**Compatibility:**
- Mobile app maintains computed `municipalityId` getter for internal use
- Backend constructs `municipality_id` on-the-fly when needed for legacy clients
- No data loss during migration

**Related Files:**
- Migration: `backend/src/migrations/044_remove_municipality_id_from_user_locations.sql`
- Backend: `backend/src/routes/users.ts:654-722`
- Mobile: `mobile/imu_flutter/lib/services/area/area_filter_service.dart:10-62`
- PowerSync: `backend/powersync/sync-config.yaml:43-50`
- Docs: `mobile/imu_flutter/powersync/CHANGES_SUMMARY.md`

**Date Completed:** 2026-04-03

