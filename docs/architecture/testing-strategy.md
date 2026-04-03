# Testing Strategy

> **IMU Testing Approach** - Unit, integration, and E2E testing strategy

---

## Testing Philosophy

**Test Pyramid:**
```
        E2E (5%)
       ┌─────┐
      │      │
     │────────│
    │  Integration (25%)  │
   │──────────────────────│
  │                          │
 │     Unit Tests (70%)       │
│──────────────────────────────│
```

**Principles:**
1. **Unit First:** Test business logic in isolation
2. **Integration Second:** Test component interactions
3. **E2E Last:** Test critical user journeys
4. **Automated:** All tests run in CI/CD
5. **Fast:** Unit tests < 100ms, integration < 5s

---

## Technology Stack

### Backend (Hono)
- **Framework:** Vitest 4.1
- **Assertions:** Vitest built-in
- **Mocking:** Vitest mocking
- **Coverage:** Vitest coverage (c8)

### Mobile (Flutter)
- **Framework:** Flutter Test
- **Mocking:** Mocktail 1.0
- **Integration:** Flutter integration test
- **Widget Tests:** Flutter widget test

### Web Admin (Vue)
- **Framework:** Vitest 4.1 ✅
- **Component Testing:** Vue Test Utils
- **Environment:** happy-dom, jsdom
- **Coverage:** v8 (built-in)

---

## Backend Testing

### Unit Tests

**Location:** `backend/src/**/*.test.ts`

**What to Test:**
- Route handlers (request/response)
- Middleware (auth, validation)
- Services (business logic)
- Utilities (helpers, formatters)
- Schema validation (Zod schemas)

**Example:**
```typescript
// backend/src/routes/auth.test.ts
import { describe, it, expect } from 'vitest'
import { authRoutes } from './auth'

describe('POST /auth/login', () => {
  it('should return token for valid credentials', async () => {
    const response = await authRoutes.request('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.access_token).toBeDefined()
  })

  it('should return 401 for invalid credentials', async () => {
    const response = await authRoutes.request('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrong'
      })
    })

    expect(response.status).toBe(401)
  })
})
```

**Run:**
```bash
cd backend
pnpm test              # Run all tests
pnpm test:ui           # Run with UI
pnpm test --coverage   # Generate coverage
```

### Integration Tests

**Location:** `backend/tests/integration/`

**What to Test:**
- Database operations
- External API calls
- Authentication flow
- PowerSync integration

**Example:**
```typescript
// backend/tests/integration/clients.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../db'

describe('Client CRUD', () => {
  beforeAll(async () => {
    await db.migrate.latest()
  })

  afterAll(async () => {
    await db.migrate.rollback()
    await db.destroy()
  })

  it('should create client', async () => {
    const client = await db('clients').insert({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com'
    }).returning('*')

    expect(client).toHaveProperty('id')
    expect(client.firstName).toBe('Test')
  })
})
```

---

## Mobile Testing

### Unit Tests

**Location:** `mobile/imu_flutter/test/unit/`

**What to Test:**
- Business logic (services, providers)
- Data models (serialization)
- Utilities (helpers, formatters)
- Validation functions

**Example:**
```dart
// mobile/imu_flutter/test/unit/services/touchpoint_validation_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/services/touchpoint_validation_service.dart';

void main() {
  group('TouchpointValidationService', () {
    test('should validate visit touchpoints for caravan', () {
      final isValid = TouchpointValidationService.validateTouchpointForRole(
        touchpointNumber: 1,
        type: TouchpointType.visit,
        userRole: UserRole.caravan,
      );

      expect(isValid, isTrue);
    });

    test('should reject call touchpoints for caravan', () {
      final isValid = TouchpointValidationService.validateTouchpointForRole(
        touchpointNumber: 2,
        type: TouchpointType.call,
        userRole: UserRole.caravan,
      );

      expect(isValid, isFalse);
    });
  });
}
```

**Run:**
```bash
cd mobile/imu_flutter
flutter test                    # Run all tests
flutter test test/unit/         # Run unit tests only
flutter test --coverage         # Generate coverage
```

### Widget Tests

**Location:** `mobile/imu_flutter/test/widget/`

**What to Test:**
- Individual widgets
- User interactions
- State changes
- Navigation

**Example:**
```dart
// mobile/imu_flutter/test/widget/auth/pin_entry_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/features/auth/presentation/pages/pin_entry_page.dart';

void main() {
  testWidgets('PIN entry validates 6 digits', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: PinEntryPage(),
      ),
    );

    // Enter 4 digits (should show error)
    await tester.enterText(
      find.byType(TextFormField).first,
      '1234',
    );
    await tester.tap(find.text('Submit'));

    await tester.pump();

    expect(find.text('PIN must be 6 digits'), findsOneWidget);
  });
}
```

### Integration Tests

**Location:** `mobile/imu_flutter/integration_test/`

**What to Test:**
- Critical user journeys
- End-to-end flows
- Database operations
- Network interactions

**Example:**
```dart
// mobile/imu_flutter/integration_test/app_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:imu_flutter/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Login flow', (tester) async {
    app.main();
    await tester.pumpAndSettle();

    // Enter email
    await tester.enterText(
      find.byKey(Key('email_field')),
      'test@example.com',
    );

    // Enter password
    await tester.enterText(
      find.byKey(Key('password_field')),
      'password123',
    );

    // Tap login
    await tester.tap(find.text('Login'));
    await tester.pumpAndSettle();

    // Verify PIN setup page appears
    expect(find.text('Create PIN'), findsOneWidget);
  });
}
```

**Run:**
```bash
cd mobile/imu_flutter
flutter test integration_test/     # Run integration tests
```

---

## Web Admin Testing

### Unit Tests ✅ Implemented

**Location:** `imu-web-vue/src/tests/`, `imu-web-vue/src/composables/__tests__/`

**Implemented Test Suites:**
- **permission-refresh.test.ts** (22 tests) - Permission refresh, auto-refresh on 403, periodic refresh, cookie validation
- **router-guards.test.ts** (22 tests) - Authentication guards, permission guards, role-based route protection
- **usePermission.spec.ts** (10 tests) - Permission checking composable
- **example.test.ts** (3 tests) - Vitest setup verification

**What to Test:**
- Composables logic
- Store actions
- Utilities
- Validators
- Router guards
- Permission system

**Example:**
```typescript
// imu-web-vue/src/tests/permission-refresh.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { refreshPermissions, refreshToken } from '@/lib/auth-api'

describe('Permission Refresh Functionality', () => {
  it('should call refreshToken and return response', async () => {
    const mockResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
    }

    vi.mocked(api.post).mockResolvedValue(mockResponse)

    const result = await refreshPermissions()

    expect(result).toEqual(mockResponse)
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/refresh')
  })
})
```

**Run:**
```bash
cd imu-web-vue

# Run all tests
pnpm test

# Run with UI
pnpm test:ui

# Run with coverage
pnpm test:coverage

# Run specific file
pnpm test permission-refresh.test.ts
```

### Component Tests (Planned)

**What to Test:**
- Component rendering
- User interactions
- Props and emits
- Reactive state

**Example:**
```typescript
// imu-web-vue/src/components/shared/Button.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from './Button.vue'

describe('Button', () => {
  it('should emit click event', async () => {
    const wrapper = mount(Button, {
      slots: { default: 'Click me' }
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeTruthy()
  })
})
```

---

## E2E Testing

### Critical User Journeys

**1. Field Agent Flow**
1. Login with email/password
2. Set up PIN
3. View assigned clients
4. Navigate to client
5. Create touchpoint
6. Sync data

**2. Admin Flow**
1. Login to web admin
2. Import clients from CSV
3. Assign clients to field agents
4. View dashboard analytics
5. Generate reports

**3. Sync Flow**
1. Create touchpoint offline
2. Connect to network
3. Verify sync completion
4. Check data consistency

---

## Test Coverage Goals

| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| **Backend Routes** | 80% | ~75% | ✅ Good |
| **Backend Services** | 90% | ~85% | ✅ Good |
| **Backend Integration** | 70% | 60% | 🟡 In Progress |
| **Mobile Services** | 80% | TBD | 📋 Planned |
| **Mobile Widgets** | 70% | TBD | 📋 Planned |
| **Web Composables** | 80% | ~65% | ✅ Good |
| **Web Router Guards** | 90% | 100% | ✅ Excellent |
| **Web Permission System** | 90% | 95% | ✅ Excellent |

**Summary:**
- **Frontend:** 57 tests passing (permission refresh, router guards, usePermission)
- **Backend:** 68 tests passing (unit tests), integration tests implemented
- **Overall:** Critical RBAC functionality fully tested

---

## Testing Commands

### Backend
```bash
cd backend

# Run all tests
pnpm test

# Run in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage

# Run specific file
pnpm test auth.test.ts

# Run UI
pnpm test:ui
```

### Mobile
```bash
cd mobile/imu_flutter

# Run all tests
flutter test

# Run unit tests only
flutter test test/unit/

# Run integration tests
flutter test integration_test/

# Run with coverage
flutter test --coverage

# Run on specific device
flutter test -d <device_id>

# Run with verbose output
flutter test --verbose
```

### Web
```bash
cd imu-web-vue

# Run all tests
pnpm test

# Run with UI
pnpm test:ui

# Run with coverage
pnpm test:coverage

# Run specific file
pnpm test permission-refresh.test.ts

# Run in watch mode
pnpm test --watch
```

---

## Continuous Integration

### GitHub Actions (Planned)

**Backend:**
```yaml
name: Backend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test
      - run: pnpm test --coverage
```

**Mobile:**
```yaml
name: Mobile Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter test
      - run: flutter test --coverage
```

---

## Mock Data

### Test Fixtures

**Location:** `backend/tests/fixtures/`

**Example:**
```typescript
// backend/tests/fixtures/clients.ts
export const mockClient = {
  id: 'uuid',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  clientType: 'EXISTING',
  status: 'interested',
}

export const mockClients = [mockClient]
```

---

## Testing Best Practices

### DO's
- Test business logic, not implementation
- Use descriptive test names
- One assertion per test (when possible)
- Mock external dependencies
- Test edge cases and error conditions
- Keep tests fast and independent
- Use AAA pattern (Arrange, Act, Assert)

### DON'Ts
- Don't test third-party libraries
- Don't test private methods
- Don't write fragile tests (timing-dependent)
- Don't duplicate production code in tests
- Don't skip tests ("TODO: add test")
- Don't commit untested code

---

## Debugging Tests

### Backend
```bash
# Run with console output
pnpm test --reporter=verbose

# Debug specific test
pnpm test --testNamePattern="should return token"

# Run with Node inspector
node --inspect-brk node_modules/.bin/vitest run
```

### Mobile
```bash
# Run with verbose output
flutter test --verbose

# Debug specific test
flutter test --name="should validate visit"

# Run with observatory
flutter test --observatory
```

---

## Test Documentation

### Test Documentation Template

```typescript
/**
 * Test suite for [Feature Name]
 *
 * Purpose: [What this tests]
 * Dependencies: [External dependencies]
 * Setup: [Test setup requirements]
 *
 * @see [Related documentation]
 */
```

---

**Last Updated:** 2026-04-02
**Testing Framework Version:** Vitest 4.1, Flutter Test
**RBAC Testing:** Implemented (57 frontend tests, integration tests)
