# IMU Login Recreation - Implementation Plan

> **Document Version:** 1.0.0
> **Created:** 2026-03-28
> **Status:** Ready for Implementation
> **Related Design:** [Login Recreation Design Document](./2026-03-28-login-recreation-design.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Implementation Strategy](#2-implementation-strategy)
3. [Phase 1: State Machine Foundation](#3-phase-1-state-machine-foundation)
4. [Phase 2: Credential Authentication](#4-phase-2-credential-authentication)
5. [Phase 3: PIN Authentication](#5-phase-3-pin-authentication)
6. [Phase 4: Session Management](#6-phase-4-session-management)
7. [Phase 5: Token Refresh & Expiry](#7-phase-5-token-refresh--expiry)
8. [Phase 6: Offline Authentication](#8-phase-6-offline-authentication)
9. [Phase 7: Biometric Authentication](#9-phase-7-biometric-authentication-optional)
10. [Phase 8: Testing & Polish](#10-phase-8-testing--polish)
11. [Migration Strategy](#11-migration-strategy)
12. [Phase 9: Cleanup & Removal](#12-phase-9-cleanup--removal)
13. [Success Criteria](#13-success-criteria)

---

## 1. Overview

### 1.1 Objective

Recreate the IMU login system from scratch using a **State Machine Architecture** to eliminate recurring authentication issues:
- Infinite loading on "Signing in..."
- Stuck in PIN entry loops
- Token confusion and expiry issues
- Offline sync problems
- Session timeout surprises

### 1.2 Architecture

**State Machine Pattern** with explicit states and validated transitions:

```
NOT_AUTHENTICATED → LOGGING_IN → CHECK_PIN_SETUP → PIN_SETUP/PIN_ENTRY → AUTHENTICATED
                     ↓                            ↓                    ↓
                   ERROR                   TOKEN_EXPIRED        SESSION_LOCKED
                                                          ↓
                                                    OFFLINE_AUTH
```

### 1.3 Timeline

**Total Duration:** 8 weeks
**Team Size:** 1-2 developers
**Parallel Work:** Possible across phases 4-7

---

## 2. Implementation Strategy

### 2.1 Development Approach

- **Vertical Slicing:** Each phase delivers working functionality
- **Test-Driven:** Unit tests before implementation
- **Feature Flags:** Gradual rollout capability
- **Migration Path:** Parallel implementation with rollback

### 2.2 File Structure

```
lib/features/auth/
├── domain/
│   ├── entities/
│   │   ├── auth_state.dart
│   │   ├── auth_user.dart
│   │   ├── token_data.dart
│   │   └── security_event.dart
│   ├── repositories/
│   │   ├── auth_repository.dart
│   │   └── auth_repository_impl.dart
│   └── services/
│       ├── auth_coordinator.dart
│       ├── token_manager.dart
│       ├── pin_service.dart
│       ├── session_service.dart
│       ├── grace_period_service.dart
│       ├── biometric_service.dart
│       ├── network_service.dart
│       └── security_event_logger.dart
├── presentation/
│   ├── providers/
│   ├── pages/
│   └── widgets/
└── data/
    ├── datasources/
    └── models/
```

### 2.3 Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Credentials)
    ↓
Phase 3 (PIN)
    ↓
Phase 4 (Session)
    ↓
Phase 5 (Tokens)
    ↓
Phase 6 (Offline)
    ↓
Phase 7 (Biometric - optional)
    ↓
Phase 8 (Testing)
```

---

## 3. Phase 1: State Machine Foundation

**Duration:** Week 1
**Goal:** Build state machine core and basic infrastructure

### 3.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 1.1 | `domain/entities/auth_state.dart` | Define AuthState enum and base class | 2h |
| 1.2 | `domain/entities/auth_state.dart` | Create all concrete state classes | 3h |
| 1.3 | `domain/services/auth_coordinator.dart` | Implement AuthCoordinator singleton | 4h |
| 1.4 | `domain/services/auth_coordinator.dart` | Add state transition validation | 3h |
| 1.5 | `domain/services/auth_coordinator.dart` | Implement guard clause system | 2h |
| 1.6 | `domain/services/auth_coordinator.dart` | Set up state change event stream | 1h |
| 1.7 | `presentation/providers/auth_coordinator_provider.dart` | Create Riverpod provider | 1h |
| 1.8 | `presentation/pages/*` | Create skeleton UI pages | 2h |
| 1.9 | `core/router/app_router.dart` | Configure routing with state-based redirects | 3h |
| 1.10 | `test/unit/auth_coordinator_test.dart` | Write unit tests | 4h |

**Total Time:** 25 hours (~3 days)

### 3.2 Implementation Details

#### Task 1.1-1.2: AuthState Definition

```dart
enum AuthStateType {
  notAuthenticated,
  loggingIn,
  checkPinSetup,
  pinSetup,
  authenticated,
  pinEntry,
  tokenExpired,
  sessionLocked,
  offlineAuth,
  error,
}

abstract class AuthState {
  final AuthStateType type;
  final DateTime? enteredAt;
  final Duration? timeout;
  final Map<String, dynamic> metadata;

  Future<void> onEnter() async {}
  Future<void> onExit() async {}
  void onTimeout() {}
}
```

#### Task 1.3-1.4: AuthCoordinator

```dart
class AuthCoordinator extends ChangeNotifier {
  static final AuthCoordinator _instance = AuthCoordinator._internal();
  factory AuthCoordinator() => _instance;

  AuthState _currentState = NotAuthenticatedState();
  AuthState get currentState => _currentState;

  Future<void> transitionTo(AuthState newState) async {
    // Validate transition
    if (!_isValidTransition(_currentState.type, newState.type)) {
      throw InvalidTransitionException(...);
    }

    // Exit current, enter new
    await _currentState.onExit();
    _currentState = newState;
    await _currentState.onEnter();

    // Notify
    notifyListeners();
  }
}
```

### 3.3 Acceptance Criteria

- [ ] All state types defined with properties
- [ ] State transitions validated before execution
- [ ] Invalid transitions throw exceptions
- [ ] State changes emit events
- [ ] State history tracked
- [ ] Routing configured for state-based navigation
- [ ] Unit tests pass (all states and transitions)

### 3.4 Testing Requirements

```dart
// Unit tests required:
- Valid state transitions succeed
- Invalid state transitions throw
- State history is tracked
- State change events fire
- Timeout timers work correctly
```

---

## 4. Phase 2: Credential Authentication

**Duration:** Week 2
**Goal:** Implement password login flow

### 4.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 2.1 | `presentation/pages/login_page.dart` | Implement LoginPage UI | 4h |
| 2.2 | `data/datasources/auth_remote_datasource.dart` | Create API client methods | 3h |
| 2.3 | `domain/repositories/auth_repository_impl.dart` | Implement login() method | 2h |
| 2.4 | `domain/services/token_manager.dart` | Create TokenManager class | 3h |
| 2.5 | `domain/services/token_manager.dart` | Implement secure token storage | 2h |
| 2.6 | `domain/entities/auth_state.dart` | Create LoggingInState with timeout | 1h |
| 2.7 | `presentation/widgets/loading_overlay.dart` | Create loading overlay widget | 2h |
| 2.8 | `presentation/pages/login_page.dart` | Wire up login flow | 3h |
| 2.9 | `test/unit/token_manager_test.dart` | Write unit tests | 2h |
| 2.10 | `test/widget/login_page_test.dart` | Write widget tests | 2h |

**Total Time:** 24 hours (~3 days)

### 4.2 Implementation Details

#### Task 2.1: LoginPage UI

```dart
class LoginPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authCoordinatorProvider);

    return Scaffold(
      body: Form(
        child: Column(
          children: [
            TextFormField(key: Key('email_field'), ...),
            TextFormField(key: Key('password_field'), ...),
            ElevatedButton(
              key: Key('login_button'),
              onPressed: () => _handleLogin(ref),
              child: Text('LOGIN'),
            ),
          ],
        ),
      ),
    );
  }

  void _handleLogin(WidgetRef ref) {
    final coordinator = ref.read(authCoordinatorProvider);
    coordinator.transitionTo(LoggingInState(
      email: _emailController.text,
    ));
  }
}
```

#### Task 2.4-2.5: TokenManager

```dart
class TokenManager {
  final SecureStorage _storage;

  Future<void> storeTokens(TokenData tokens) async {
    // Access token: Memory only (volatile)
    _accessToken = tokens.accessToken;

    // Refresh token: Secure storage
    await _storage.write(key: 'refresh_token', value: tokens.refreshToken);
  }

  Future<String?> getAccessToken() async => _accessToken;
  Future<String?> getRefreshToken() async =>
    await _storage.read(key: 'refresh_token');
}
```

### 4.3 Acceptance Criteria

- [ ] LoginPage validates email format
- [ ] LoginPage validates password not empty
- [ ] Login button disabled when form invalid
- [ ] Loading overlay shows on login
- [ ] Loading overlay has 30s timeout
- [ ] Valid credentials transition to CHECK_PIN_SETUP
- [ ] Invalid credentials show error message
- [ ] Tokens stored securely
- [ ] API failures handled gracefully

### 4.4 Testing Requirements

```dart
// Widget tests required:
- Email validation works
- Password validation works
- Login button calls coordinator
- Loading overlay shows
- Error message displays on failure
```

---

## 5. Phase 3: PIN Authentication

**Duration:** Week 2-3
**Goal:** Implement PIN setup and verification

### 5.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 3.1 | `domain/services/pin_service.dart` | Create PinService class | 2h |
| 3.2 | `domain/services/pin_service.dart` | Implement salt generation | 1h |
| 3.3 | `domain/services/pin_service.dart` | Implement SHA-256 hashing | 2h |
| 3.4 | `domain/services/pin_service.dart` | Implement constant-time comparison | 1h |
| 3.5 | `domain/services/pin_service.dart` | Add 3-attempt limit logic | 2h |
| 3.6 | `presentation/widgets/pin_keyboard.dart` | Create reusable PIN keypad | 3h |
| 3.7 | `presentation/pages/pin_setup_page.dart` | Implement PIN setup UI | 4h |
| 3.8 | `presentation/pages/pin_entry_page.dart` | Implement PIN entry UI | 3h |
| 3.9 | `domain/entities/auth_state.dart` | Create PinSetupState, PinEntryState | 1h |
| 3.10 | `test/unit/pin_service_test.dart` | Write unit tests | 3h |
| 3.11 | `test/widget/pin_pages_test.dart` | Write widget tests | 3h |

**Total Time:** 25 hours (~3 days)

### 5.2 Implementation Details

#### Task 3.1-3.4: PinService

```dart
class PinService {
  static const int maxAttempts = 3;

  String _generateSalt() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return base64.encode(bytes);
  }

  String _hashPin(String pin, String salt) {
    final bytes = utf8.encode(pin + salt);
    return sha256.convert(bytes).toString();
  }

  Future<void> savePin(String pin) async {
    final salt = _generateSalt();
    final hash = _hashPin(pin, salt);
    await _storage.write(key: 'pin_hash', value: hash);
    await _storage.write(key: 'pin_salt', value: salt);
  }

  Future<bool> verifyPin(String inputPin) async {
    final storedHash = await _storage.read('pin_hash');
    final salt = await _storage.read('pin_salt');

    final inputHash = _hashPin(inputPin, salt);
    return _constantTimeStringEquals(inputHash, storedHash);
  }

  bool _constantTimeStringEquals(String a, String b) {
    // Prevent timing attacks
    if (a.length != b.length) return false;

    int result = 0;
    for (int i = 0; i < a.length; i++) {
      result |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return result == 0;
  }
}
```

#### Task 3.6: PIN Keypad Widget

```dart
class PinKeypad extends StatelessWidget {
  final Function(String) onDigit;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var row in [['1','2','3'], ['4','5','6'], ['7','8','9'], ['', '0', 'back']])
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: row.map((key) {
                if (key.isEmpty) return SizedBox(width: 80, height: 64);
                if (key == 'back') return IconButton(onPressed: onBackspace, ...);
                return TextButton(
                  onPressed: () => onDigit(key),
                  child: Text(key, style: TextStyle(fontSize: 24)),
                );
              }).toList(),
            ),
          ),
      ],
    );
  }
}
```

### 5.3 Acceptance Criteria

- [ ] PIN can be created with 6 digits
- [ ] PIN confirmation works
- [ ] Mismatch shows error and allows retry
- [ ] PIN stored as salted hash
- [ ] PIN never stored in plain text
- [ ] PIN verification uses constant-time comparison
- [ ] 3 failed attempts force password login
- [ ] Failed attempts counter tracked in memory
- [ ] PIN keypad works correctly

### 5.4 Testing Requirements

```dart
// Unit tests required:
- PIN hashing produces different hashes for same PIN (due to salt)
- PIN verification succeeds with correct PIN
- PIN verification fails with incorrect PIN
- Failed attempts increment correctly
- 3 failed attempts trigger lockout

// Widget tests required:
- PIN setup page accepts 6 digits
- PIN confirmation flow works
- PIN entry page verifies PIN
- Backspace works correctly
- 3 failed attempts show force password message
```

---

## 6. Phase 4: Session Management

**Duration:** Week 3
**Goal:** Implement inactivity lock and session timeout

### 6.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 4.1 | `domain/services/session_service.dart` | Create SessionService class | 2h |
| 4.2 | `domain/services/session_service.dart` | Implement activity tracking | 2h |
| 4.3 | `domain/services/session_service.dart` | Add 15-min inactivity timer | 2h |
| 4.4 | `domain/services/session_service.dart` | Add 8-hour session timer | 2h |
| 4.5 | `domain/entities/auth_state.dart` | Create SessionLockedState | 1h |
| 4.6 | `shared/mixins/activity_tracker.dart` | Create activity tracker mixin | 2h |
| 4.7 | `presentation/pages/session_locked_page.dart` | Implement lock screen UI | 2h |
| 4.8 | `domain/services/session_service.dart` | Implement unlock logic | 2h |
| 4.9 | `test/unit/session_service_test.dart` | Write unit tests | 3h |

**Total Time:** 18 hours (~2 days)

### 6.2 Implementation Details

#### Task 4.1-4.4: SessionService

```dart
class SessionService extends ChangeNotifier {
  static const inactivityTimeout = Duration(minutes: 15);
  static const sessionTimeout = Duration(hours: 8);

  Timer? _inactivityTimer;
  Timer? _sessionTimer;
  DateTime? _lastActivity;
  DateTime? _sessionStart;

  void startSession() {
    _sessionStart = DateTime.now();
    _lastActivity = DateTime.now();
    _startInactivityTimer();
    _startSessionTimer();
  }

  void recordActivity() {
    _lastActivity = DateTime.now();
    _resetInactivityTimer();
  }

  void _startInactivityTimer() {
    _inactivityTimer?.cancel();
    _inactivityTimer = Timer(inactivityTimeout, () {
      AuthCoordinator().transitionTo(SessionLockedState());
    });
  }

  void _startSessionTimer() {
    _sessionTimer?.cancel();
    _sessionTimer = Timer(sessionTimeout, () {
      AuthCoordinator().transitionTo(TokenExpiredState());
    });
  }
}
```

#### Task 4.6: Activity Tracker Mixin

```dart
mixin ActivityTracker<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    _trackActivity();
  }

  void _trackActivity() {
    SessionService().recordActivity();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _trackActivity();
  }

  @override
  void onTapDown(_) {
    _trackActivity();
    super.onTapDown(_);
  }
}
```

### 6.3 Acceptance Criteria

- [ ] Session starts on authentication
- [ ] Activity tracked on all user interactions
- [ ] Session locks after 15 minutes inactivity
- [ ] Session expires after 8 hours total
- [ ] PIN unlocks session (if within 8 hours)
- [ ] Password required after session expiry
- [ ] Activity mixin works on all pages

### 6.4 Testing Requirements

```dart
// Unit tests required:
- Session starts correctly
- Activity tracking updates last activity time
- Inactivity timer fires after 15 minutes
- Session timer fires after 8 hours
- Unlock works within session duration
- Unlock fails after session expiry
```

---

## 7. Phase 5: Token Refresh & Expiry

**Duration:** Week 4
**Goal:** Implement background token refresh and expiry handling

### 7.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 5.1 | `domain/services/token_manager.dart` | Add token expiry checking | 2h |
| 5.2 | `domain/services/token_manager.dart` | Implement refresh scheduler | 3h |
| 5.3 | `domain/services/token_manager.dart` | Add refresh 5 min before expiry | 2h |
| 5.4 | `domain/entities/auth_state.dart` | Create TokenExpiredState | 1h |
| 5.5 | `domain/services/auth_coordinator.dart` | Handle refresh failures | 2h |
| 5.6 | `services/api/api_interceptor.dart` | Add 401 response handling | 2h |
| 5.7 | `presentation/pages/token_expired_page.dart` | Implement expiry UI | 2h |
| 5.8 | `test/unit/token_refresh_test.dart` | Write unit tests | 3h |

**Total Time:** 17 hours (~2 days)

### 7.2 Implementation Details

#### Task 5.1-5.3: Token Refresh

```dart
class TokenManager {
  Timer? _refreshTimer;

  void startRefreshScheduler() {
    _refreshTimer = Timer.periodic(Duration(minutes: 5), (timer) async {
      if (willExpireSoon()) {
        await _refreshTokens();
      }
    });
  }

  bool willExpireSoon() {
    if (_expiryTime == null) return false;
    return DateTime.now().add(Duration(minutes: 5)).isAfter(_expiryTime!);
  }

  Future<void> _refreshTokens() async {
    try {
      final refreshToken = await getRefreshToken();
      if (refreshToken == null) {
        throw Exception('No refresh token available');
      }

      final newTokens = await _authRepository.refreshToken(refreshToken);
      await storeTokens(newTokens);
    } catch (e) {
      // Refresh failed - force password login
      AuthCoordinator().transitionTo(TokenExpiredState());
    }
  }
}
```

#### Task 5.6: API Interceptor

```dart
class ApiInterceptor extends Interceptor {
  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await TokenManager().getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onResponse(Response response, ResponseInterceptorHandler handler) async {
    if (response.statusCode == 401) {
      // Token expired - force password login
      AuthCoordinator().transitionTo(TokenExpiredState());
    }
    handler.next(response);
  }
}
```

### 7.3 Acceptance Criteria

- [ ] Tokens refresh automatically 5 min before expiry
- [ ] Refresh failures trigger password login
- [ ] Token expiry detected from API 401 responses
- [ ] TokenExpiredState shows clear message
- [ ] No authentication loops on refresh
- [ ] Refresh scheduler stops on logout

### 7.4 Testing Requirements

```dart
// Unit tests required:
- Token refresh triggers before expiry
- Refresh failure triggers TokenExpiredState
- API 401 triggers TokenExpiredState
- Refresh scheduler stops on logout
```

---

## 8. Phase 6: Offline Authentication

**Duration:** Week 5
**Goal:** Implement offline mode with grace period

### 8.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 6.1 | `domain/services/network_service.dart` | Create network state detection | 2h |
| 6.2 | `domain/services/grace_period_service.dart` | Create GracePeriodService | 3h |
| 6.3 | `domain/services/grace_period_service.dart` | Calculate grace period remaining | 2h |
| 6.4 | `domain/entities/auth_state.dart` | Create OfflineAuthState | 1h |
| 6.5 | `domain/services/auth_coordinator.dart` | Handle offline transitions | 3h |
| 6.6 | `domain/services/offline_queue_service.dart` | Create operation queue | 3h |
| 6.7 | `presentation/widgets/offline_banner.dart` | Create offline banner widget | 2h |
| 6.8 | `domain/services/sync_service.dart` | Implement sync on connection | 3h |
| 6.9 | `test/unit/offline_auth_test.dart` | Write unit tests | 3h |

**Total Time:** 22 hours (~3 days)

### 8.2 Implementation Details

#### Task 6.1-6.2: Grace Period Service

```dart
class GracePeriodService {
  static const gracePeriod = Duration(hours: 48);

  Future<bool> isWithinGracePeriod() async {
    final lastOnlineLogin = await _getLastOnlineLoginTime();
    if (lastOnlineLogin == null) return false;

    final timeSinceOnline = DateTime.now().difference(lastOnlineLogin);
    return timeSinceOnline <= gracePeriod;
  }

  Future<Duration> getGracePeriodRemaining() async {
    final lastOnlineLogin = await _getLastOnlineLoginTime();
    if (lastOnlineLogin == null) return Duration.zero;

    final timeSinceOnline = DateTime.now().difference(lastOnlineLogin);
    final remaining = gracePeriod - timeSinceOnline;
    return remaining.isNegative ? Duration.zero : remaining;
  }

  Future<DateTime?> _getLastOnlineLoginTime() async {
    return await SecureStorage().read('last_online_login_time');
  }
}
```

#### Task 6.5: Offline Transitions

```dart
// In AuthCoordinator
Future<void> handleNetworkChange(bool isOnline) async {
  if (isOnline) {
    // Coming back online
    if (_currentState is OfflineAuthState) {
      // Sync and transition to authenticated
      await _syncService.syncQueuedOperations();
      transitionTo(AuthenticatedState(userId: _currentUserId));
    }
  } else {
    // Going offline
    if (_currentState is AuthenticatedState) {
      if (await _gracePeriodService.isWithinGracePeriod()) {
        transitionTo(OfflineAuthState(userId: _currentUserId));
      }
      // Else: Stay in authenticated state (token valid)
    }
  }
}
```

### 8.3 Acceptance Criteria

- [ ] Network state changes detected
- [ ] Grace period calculated from last online login
- [ ] OfflineAuthState allows full access
- [ ] Grace period countdown displayed
- [ ] Operations queued for sync
- [ ] Sync completes when connection restored
- [ ] Grace period expiry blocks access

### 8.4 Testing Requirements

```dart
// Unit tests required:
- Grace period calculated correctly
- OfflineAuthState accessible within grace period
- OfflineAuthState blocked after grace period
- Operations queue correctly
- Sync works on connection restore
```

---

## 9. Phase 7: Biometric Authentication

**Duration:** Week 6
**Goal:** Add biometric authentication as nice-to-have

### 9.1 Tasks

| Task | File | Description | Time |
|------|------|-------------|------|
| 7.1 | `domain/services/biometric_service.dart` | Create BiometricService | 2h |
| 7.2 | `domain/services/biometric_service.dart` | Check availability | 1h |
| 7.3 | `domain/services/biometric_service.dart` | Implement authentication | 2h |
| 7.4 | `presentation/pages/pin_entry_page.dart` | Add biometric prompt | 2h |
| 7.5 | `presentation/pages/settings_page.dart` | Add biometric toggle | 1h |
| 7.6 | `domain/services/biometric_service.dart` | Invalidate on security events | 1h |
| 7.7 | `test/unit/biometric_service_test.dart` | Write unit tests | 2h |

**Total Time:** 11 hours (~1.5 days)

### 9.2 Implementation Details

```dart
class BiometricService {
  final LocalAuthentication _localAuth = LocalAuthentication();

  Future<bool> isAvailable() async {
    return await _localAuth.canCheckBiometrics;
  }

  Future<bool> authenticate() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'Unlock IMU',
        options: const AuthenticationOptions(
          stickyTransaction: true,
          biometricOnly: false,
        ),
      );
    } catch (e) {
      return false;
    }
  }
}

// In PinEntryPage
@override
Widget build(BuildContext context) {
  useEffect(() {
    // Offer biometric if available
    if (biometricEnabled) {
      _offerBiometric();
    }
    return null;
  });

  Future<void> _offerBiometric() async {
    final success = await BiometricService().authenticate();
    if (success) {
      // Skip PIN entry
      _handlePinVerified();
    }
  }
}
```

### 9.3 Acceptance Criteria

- [ ] Biometric availability checked
- [ ] Biometric prompt shows on PIN entry
- [ ] Biometric success skips PIN entry
- [ ] Biometric failure falls back to PIN
- [ ] Settings toggle works
- [ ] Biometric invalidated on security events

### 9.4 Testing Requirements

```dart
// Unit tests required:
- Biometric availability check works
- Authentication succeeds with valid biometric
- Authentication fails with invalid biometric
- Fallback to PIN works
```

---

## 10. Phase 8: Testing & Polish

**Duration:** Week 7
**Goal:** Comprehensive testing and UX refinement

### 10.1 Tasks

| Task | Description | Time |
|------|-------------|------|
| 8.1 | Write unit tests for all states | 4h |
| 8.2 | Write unit tests for all transitions | 3h |
| 8.3 | Write integration tests for login flow | 4h |
| 8.4 | Write integration tests for PIN flow | 3h |
| 8.5 | Write integration tests for offline flow | 3h |
| 8.6 | Write widget tests for all auth pages | 4h |
| 8.7 | Add error logging and monitoring | 2h |
| 8.8 | Polish loading states and transitions | 3h |
| 8.9 | Add haptic feedback | 2h |
| 8.10 | Test on real devices (iOS & Android) | 4h |
| 8.11 | Performance testing | 3h |
| 8.12 | Security audit | 4h |

**Total Time:** 39 hours (~5 days)

### 10.2 Test Coverage Goals

```
Target Coverage: 80%+

Files to Test:
- domain/services/auth_coordinator.dart
- domain/services/token_manager.dart
- domain/services/pin_service.dart
- domain/services/session_service.dart
- domain/services/grace_period_service.dart
- domain/repositories/auth_repository_impl.dart
- presentation/pages/login_page.dart
- presentation/pages/pin_setup_page.dart
- presentation/pages/pin_entry_page.dart
```

### 10.3 Performance Targets

| Metric | Target |
|--------|--------|
| Login Time | < 5 seconds |
| PIN Verification | < 3 seconds |
| State Transition | < 100ms |
| Token Refresh | < 1 second |
| Offline Queue Sync | < 30 seconds |

### 10.4 Security Checklist

- [ ] Passwords never stored locally
- [ ] PIN stored as salted hash
- [ ] Access token in memory only
- [ ] Refresh token encrypted at rest
- [ ] Constant-time PIN comparison
- [ ] 3 failed PIN attempts enforced
- [ ] Session timeout works
- [ ] Inactivity lock works
- [ ] Grace period enforced
- [ ] All auth attempts logged
- [ ] No timing vulnerabilities
- [ ] No sensitive data in logs

---

## 11. Migration Strategy

### 11.1 Feature Flag Approach

```dart
// In app_config.dart
class AppConfig {
  static const bool useNewAuthSystem = false; // Feature flag
}

// In router
final router = GoRouter(
  redirect: (context, state) {
    if (AppConfig.useNewAuthSystem) {
      // Use new state machine routing
      return _newAuthRedirect(state);
    } else {
      // Use old routing
      return _oldAuthRedirect(state);
    }
  },
);
```

### 11.2 Rollout Phases

```
Week 1-2: Implementation (feature flag = false)
Week 3: Internal testing (feature flag = true for internal users)
Week 4: 10% production rollout
Week 5: 50% production rollout
Week 6: 100% rollout
Week 7: Remove old code
```

### 11.3 Data Migration

```dart
class DataMigrationService {
  Future<void> migrateAuthData() async {
    // Preserve existing data
    final oldPinHash = await _oldStorage.read('user_pin_hash');
    final oldRefreshToken = await _oldStorage.read('refresh_token');

    // Validate
    if (oldPinHash != null && oldRefreshToken != null) {
      // Migrate to new format
      await _newStorage.write('pin_hash', value: oldPinHash);
      await _newStorage.write('refresh_token', value: oldRefreshToken);

      // Backup (don't delete yet)
      await _backupStorage.write('backup_pin_hash', value: oldPinHash);
    }
  }
}
```

---

## 12. Phase 9: Cleanup & Removal

**Duration:** Week 8
**Goal:** Remove old authentication implementation

**Prerequisites:**
- New authentication system fully implemented
- 100% rollout completed
- No issues reported for 1 week
- All tests passing

### 12.1 Tasks

| Task | File(s) | Description | Time |
|------|---------|-------------|------|
| 9.1 | `lib/features/auth/` | Identify all old auth files | 1h |
| 9.2 | `lib/features/auth/presentation/pages/` | Remove old login_page.dart (deprecated) | 0.5h |
| 9.3 | `lib/features/auth/presentation/pages/` | Remove old pin_setup_page.dart (deprecated) | 0.5h |
| 9.4 | `lib/features/auth/presentation/pages/` | Remove old pin_entry_page.dart (deprecated) | 0.5h |
| 9.5 | `lib/services/auth/` | Remove old auth_service.dart (deprecated) | 1h |
| 9.6 | `lib/services/auth/` | Remove old offline_auth_service.dart (deprecated) | 1h |
| 9.7 | `lib/services/auth/` | Remove old jwt_auth_service.dart (deprecated) | 1h |
| 9.8 | `lib/services/auth/` | Remove old secure_storage_service.dart (deprecated) | 1h |
| 9.9 | `lib/shared/providers/` | Remove old auth_notifier_provider.dart (deprecated) | 1h |
| 9.10 | `lib/shared/providers/` | Remove old pin_state_provider.dart (deprecated) | 0.5h |
| 9.11 | `lib/core/router/app_router.dart` | Remove old routing logic | 2h |
| 9.12 | `lib/core/router/app_router.dart` | Remove feature flag | 1h |
| 9.13 | `lib/features/auth/` | Consolidate new auth files to main location | 2h |
| 9.14 | `test/` | Remove old test files | 1h |
| 9.15 | `pubspec.yaml` | Remove unused dependencies | 1h |
| 9.16 | Documentation | Update all references to new auth system | 3h |
| 9.17 | Final verification | Test app after cleanup | 2h |

**Total Time:** 20 hours (~2.5 days)

### 12.2 Files to Remove

**Old Authentication Pages:**
```
lib/features/auth/presentation/pages/
├── login_page.dart (OLD)              ✗ Remove
├── pin_setup_page.dart (OLD)          ✗ Remove
├── pin_entry_page.dart (OLD)          ✗ Remove
└── forgot_password_page.dart (OLD)    ✗ Remove
```

**Old Services:**
```
lib/services/auth/
├── auth_service.dart (OLD)            ✗ Remove
├── offline_auth_service.dart (OLD)    ✗ Remove
├── jwt_auth_service.dart (OLD)        ✗ Remove
└── secure_storage_service.dart (OLD)  ✗ Remove
```

**Old Providers:**
```
lib/shared/providers/
├── app_providers.dart (OLD auth)     ⚠ Update
├── auth_state_provider.dart (OLD)     ✗ Remove
└── pin_state_provider.dart (OLD)      ✗ Remove
```

**Old Test Files:**
```
test/
├── unit/auth_service_test.dart (OLD)  ✗ Remove
├── unit/pin_service_test.dart (OLD)   ✗ Remove
└── widget/login_page_test.dart (OLD)   ✗ Remove
```

### 12.3 Cleanup Procedure

#### Step 1: Feature Flag Removal

```dart
// REMOVE from lib/core/config/app_config.dart
class AppConfig {
  static const bool useNewAuthSystem = false; // ❌ REMOVE THIS
}

// UPDATE lib/core/router/app_router.dart
final router = GoRouter(
  redirect: (context, state) {
    // REMOVE old routing logic
    // if (AppConfig.useNewAuthSystem) {
    //   return _newAuthRedirect(state);
    // } else {
    //   return _oldAuthRedirect(state);
    // }

    // KEEP only new routing
    return _authRedirect(state);
  },
);
```

#### Step 2: File Removal Order

```
1. Backup current code (git commit)
2. Remove old test files first (safe, no production impact)
3. Remove old service files (no direct UI dependencies)
4. Remove old provider files
5. Remove old page files (last, after updating all imports)
6. Update pubspec.yaml
7. Update documentation
8. Final verification
```

#### Step 3: Import Updates

```dart
// BEFORE (multiple imports, confusing)
import 'package:imu_flutter/services/auth/auth_service.dart';
import 'package:imu_flutter/services/auth/offline_auth_service.dart';
import 'package:imu_flutter/services/auth/jwt_auth_service.dart';

// AFTER (single, clear import)
import 'package:imu_flutter/features/auth/domain/services/auth_coordinator.dart';
```

#### Step 4: Consolidation (Optional)

After removing old files, consolidate new auth files:

```
FROM: lib/features/auth/
└── [domain, presentation, data]

TO: lib/features/auth/
├── auth/           # Core auth logic
├── presentation/   # UI components
├── domain/         # Entities and repositories
└── services/       # External services
```

### 12.4 Verification Checklist

Before declaring cleanup complete:

- [ ] All old files removed
- [ ] No compilation errors
- [ ] All imports updated
- [ ] Feature flag removed
- [ ] Old routing logic removed
- [ ] All tests passing
- [ ] App runs without old code
- [ ] Login flow works
- [ ] PIN setup works
- [ ] PIN entry works
- [ ] Session management works
- [ ] Offline mode works
- [ ] Documentation updated
- [ ] No references to old services in codebase

### 12.5 Rollback Plan

If issues arise after cleanup:

```
1. IMMEDIATE ROLLBACK (within 1 hour)
   - Revert git commit
   - Feature flag back to false
   - Investigate issue

2. FIX AND FORWARD (if minor issue)
   - Fix issue in new code
   - Re-test thoroughly
   - Re-attempt cleanup

3. INVESTIGATE (if major issue)
   - Keep feature flag false
   - Full investigation
   - Fix before attempting cleanup again
```

### 12.6 Documentation Updates

Update these files after cleanup:

```
CLAUDE.md
├── Remove references to old auth services
├── Update file structure section
└── Update development commands

README.md
├── Update architecture description
└── Remove old auth flow documentation

docs/deep-analysis-on-project.md
├── Update authentication section
└── Update file structure

pubspec.yaml
├── Remove unused dependencies
└── Update descriptions
```

### 12.7 Post-Cleanup Tasks

| Task | Description | Time |
|------|-------------|------|
| Code review | Review all changes | 2h |
| Regression testing | Full app testing | 4h |
| Performance testing | Ensure no performance regression | 2h |
| Security audit | Verify security maintained | 3h |
| Documentation | Final documentation update | 2h |

**Total Additional Time:** 13 hours

### 12.8 Success Criteria

Cleanup is complete when:

- [ ] Zero references to old auth services in codebase
- [ ] Zero compilation errors or warnings
- [ ] All tests passing (80%+ coverage maintained)
- [ ] App size reduced (old code removed)
- [ ] No performance regression
- [ ] No security regression
- [ ] Documentation accurate and up-to-date
- [ ] Team trained on new auth system
- [ ] No user-facing issues reported

---

## 13. Success Criteria

### 12.1 Functional Requirements

- [ ] Users can login with email/password
- [ ] First-time users setup 6-digit PIN
- [ ] Returning users login with PIN
- [ ] PIN requires 6 digits
- [ ] 3 failed PIN attempts force password login
- [ ] Session locks after 15 minutes inactivity
- [ ] Session expires after 8 hours
- [ ] PIN unlocks session (if valid)
- [ ] Tokens refresh automatically
- [ ] Token expiry triggers password login
- [ ] Offline mode works with valid token
- [ ] Offline mode works with expired token + grace period
- [ ] Grace period: 24-48 hours from last online login
- [ ] Operations queue for sync when offline
- [ ] Sync completes when connection restored
- [ ] Biometric authentication works (if enabled)

### 12.2 Non-Functional Requirements

- [ ] Login completes in < 5 seconds
- [ ] PIN verification completes in < 3 seconds
- [ ] No infinite loading states
- [ ] No authentication loops
- [ ] All states have exit conditions
- [ ] All temporary states have timeouts
- [ ] 80%+ test coverage
- [ ] Security audit passed
- [ ] Performance tests passed
- [ ] Works on iOS and Android

### 12.3 Quality Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Login Success Rate | > 95% | TBD |
| Authentication Loops | 0 | TBD |
| Average Login Time | < 5s | TBD |
| Token Refresh Success Rate | > 99% | TBD |
| Offline Mode Success Rate | > 90% | TBD |
| Test Coverage | > 80% | TBD |

---

## Appendix

### A. Dependencies

```yaml
dependencies:
  flutter_riverpod: ^2.0.0
  go_router: ^14.0.0
  flutter_secure_storage: ^9.0.0
  local_auth: ^2.0.0
  crypto: ^3.0.0
  connectivity_plus: ^5.0.0
  dio: ^5.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  mockito: ^5.0.0
  build_runner: ^2.4.0
```

### B. Environment Variables

```bash
# .env
POSTGRES_API_URL=http://localhost:3000/api
JWT_SECRET=your-jwt-secret-key-min-32-characters
JWT_EXPIRY_HOURS=24
GRACE_PERIOD_HOURS=48
INACTIVITY_TIMEOUT_MINUTES=15
SESSION_TIMEOUT_HOURS=8
```

### C. API Endpoints

```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
```

---

**Document Status:** Ready for Implementation
**Next Steps:** Review and approve → Begin Phase 1
