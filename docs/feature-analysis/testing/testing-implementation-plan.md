# IMU API Integration Testing Plan

## Overview

This document outlines the testing strategy for verifying all API endpoints between:
- **Backend** (Hono on port 3000) ↔ **PostgreSQL** (port 5433)
- **Backend** ↔ **Vue Web Admin** (port 4002)
- **Backend** ↔ **Flutter Mobile App** (via PowerSync)

---

## Prerequisites

Before testing, ensure all services are running:

```bash
# Terminal 1: PostgreSQL (Docker)
docker-compose up -d

# Terminal 2: Backend
cd backend
pnpm install
pnpm dev
# Should show: Server running on http://localhost:3000

# Terminal 3: Vue Web Admin
cd imu-web-vue
pnpm install
pnpm dev
# Should show: Local: http://localhost:4002

# Terminal 4: Flutter Mobile (optional - for mobile testing)
cd mobile/imu_flutter
flutter run
```

---

## Phase 1: Backend API Unit Tests

### 1.1 Health Check

```bash
# Test backend is running
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 1.2 Authentication Endpoints

| Test | Method | Endpoint | Body | Expected |
|------|--------|----------|------|----------|
| Register user | POST | `/api/auth/register` | `{email, password, first_name, last_name, role}` | 201, user object |
| Login success | POST | `/api/auth/login` | `{email, password}` | 200, JWT tokens |
| Login fail | POST | `/api/auth/login` | `{email: "wrong", password: "wrong"}` | 401 |
| Get profile | GET | `/api/auth/me` | Headers: `Authorization: Bearer <token>` | 200, user object |
| Refresh token | POST | `/api/auth/refresh` | Headers: `Authorization: Bearer <refresh_token>` | 200, new tokens |

```bash
# Test login and save token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.access_token')

echo "Token: $TOKEN"

# Test get profile with token
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 1.3 Clients Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List clients | GET | `/api/clients` | 200, paginated list |
| List with search | GET | `/api/clients?search=john` | 200, filtered list |
| List with type filter | GET | `/api/clients?client_type=POTENTIAL` | 200, filtered list |
| Get single client | GET | `/api/clients/:id` | 200, client object |
| Create client | POST | `/api/clients` | 201, created client |
| Update client | PUT | `/api/clients/:id` | 200, updated client |
| Delete client | DELETE | `/api/clients/:id` | 200, success message |
| Unauthorized access | GET | `/api/clients` (no token) | 401 |

```bash
# Create a client
CLIENT=$(curl -s -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Juan",
    "last_name": "Dela Cruz",
    "client_type": "POTENTIAL",
    "email": "juan@example.com",
    "phone": "+63 912 345 6789"
  }')

CLIENT_ID=$(echo $CLIENT | jq -r '.id')
echo "Created client ID: $CLIENT_ID"

# List clients
curl -s "http://localhost:3000/api/clients" \
  -H "Authorization: Bearer $TOKEN" | jq '.items | length'

# Update client
curl -s -X PUT "http://localhost:3000/api/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"client_type": "EXISTING"}' | jq '.client_type'
```

### 1.4 Users Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List users | GET | `/api/users` | 200, paginated list |
| Get user | GET | `/api/users/:id` | 200, user object |
| Create user | POST | `/api/users` | 201, created user |
| Update user | PUT | `/api/users/:id` | 200, updated user |
| Delete user | DELETE | `/api/users/:id` | 200, success message |

### 1.5 Caravans Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List caravans | GET | `/api/caravans` | 200, paginated list |
| Get caravan | GET | `/api/caravans/:id` | 200, caravan object |
| Create caravan | POST | `/api/caravans` | 201, created caravan |
| Update caravan | PUT | `/api/caravans/:id` | 200, updated caravan |
| Delete caravan | DELETE | `/api/caravans/:id` | 200, success message |

### 1.6 Agencies Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List agencies | GET | `/api/agencies` | 200, paginated list |
| Get agency | GET | `/api/agencies/:id` | 200, agency object |
| Create agency | POST | `/api/agencies` | 201, created agency |
| Update agency | PUT | `/api/agencies/:id` | 200, updated agency |
| Delete agency | DELETE | `/api/agencies/:id` | 200, success message |

### 1.7 Touchpoints Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List touchpoints | GET | `/api/touchpoints` | 200, paginated list |
| Get touchpoint | GET | `/api/touchpoints/:id` | 200, touchpoint object |
| Create touchpoint | POST | `/api/touchpoints` | 201, created touchpoint |
| Update touchpoint | PUT | `/api/touchpoints/:id` | 200, updated touchpoint |
| Delete touchpoint | DELETE | `/api/touchpoints/:id` | 200, success message |

### 1.8 Itineraries Endpoints

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| List itineraries | GET | `/api/itineraries` | 200, paginated list |
| Get itinerary | GET | `/api/itineraries/:id` | 200, itinerary object |
| Create itinerary | POST | `/api/itineraries` | 201, created itinerary |
| Update itinerary | PUT | `/api/itineraries/:id` | 200, updated itinerary |
| Delete itinerary | DELETE | `/api/itineraries/:id` | 200, success message |

### 1.9 Dashboard Endpoint

| Test | Method | Endpoint | Expected |
|------|--------|----------|----------|
| Get stats | GET | `/api/dashboard` | 200, statistics object |
| Get performance | GET | `/api/dashboard/performance` | 200, performance metrics |

---

## Phase 2: Vue Web Admin Integration Tests

### 2.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Login Flow                                       │
├─────────────────────────────────────────────────────────────┤
│  1. Open http://localhost:4002                               │
│  2. Should redirect to /login (unauthenticated)              │
│  3. Enter credentials: test@example.com / test123            │
│  4. Click Login                                               │
│  5. Should redirect to /dashboard                            │
│  6. Verify user name appears in header                       │
│  7. Verify token stored in localStorage                      │
│  8. Refresh page - should stay logged in                     │
│  9. Click Logout                                             │
│  10. Should redirect to /login                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Client Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: CRUD Clients                                     │
├─────────────────────────────────────────────────────────────┤
│  1. Login as admin                                           │
│  2. Navigate to /clients                                     │
│  3. Verify client list loads from API                        │
│  4. Click "New Client" button                                │
│  5. Fill form:                                               │
│     - First Name: Test                                       │
│     - Last Name: Client                                      │
│     - Email: test@client.com                                 │
│     - Type: POTENTIAL                                        │
│  6. Click Save                                               │
│  7. Verify success toast appears                             │
│  8. Verify client appears in list                            │
│  9. Click on client to view details                          │
│  10. Click Edit                                              │
│  11. Change Type to EXISTING                                 │
│  12. Save changes                                            │
│  13. Verify changes persisted                                │
│  14. Delete client                                           │
│  15. Verify client removed from list                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Dashboard Data

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Dashboard Statistics                             │
├─────────────────────────────────────────────────────────────┤
│  1. Login as admin                                           │
│  2. Navigate to /dashboard                                   │
│  3. Verify stats cards show numbers:                         │
│     - Total Agents                                           │
│     - Total Clients                                          │
│     - Today's Visits                                         │
│     - Pending Tasks                                          │
│  4. Verify recent activity list loads                        │
│  5. Create a new client                                      │
│  6. Return to dashboard                                      │
│  7. Verify Total Clients increased by 1                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Error States                                     │
├─────────────────────────────────────────────────────────────┤
│  1. Stop the backend server                                  │
│  2. Try to login                                             │
│  3. Verify error message appears                             │
│  4. Restart backend                                          │
│  5. Login successfully                                       │
│  6. Navigate to clients                                      │
│  7. Open browser DevTools → Network                          │
│  8. Simulate offline (Network → Offline)                     │
│  9. Try to create client                                     │
│  10. Verify error toast appears                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Flutter Mobile App Tests

### 3.1 PowerSync Connection Test

```dart
// Test file: integration_test/sync_test.dart

testWidgets('PowerSync connects to backend', (tester) async {
  // 1. Launch app
  await app.main();
  await tester.pumpAndSettle();

  // 2. Login
  await tester.enterText(find.byKey(Key('email')), 'test@example.com');
  await tester.enterText(find.byKey(Key('password')), 'test123');
  await tester.tap(find.byKey(Key('login_button')));
  await tester.pumpAndSettle();

  // 3. Verify sync status indicator shows "Synced"
  expect(find.text('Synced'), findsOneWidget);
});
```

### 3.2 Offline Data Test

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Offline Client Creation                          │
├─────────────────────────────────────────────────────────────┤
│  1. Launch app with internet connection                      │
│  2. Login successfully                                       │
│  3. Enable airplane mode (simulate offline)                  │
│  4. Navigate to Clients                                      │
│  5. Tap + to create new client                               │
│  6. Fill in client details                                   │
│  7. Save client                                              │
│  8. Verify client appears in list (from local SQLite)        │
│  9. Verify "Pending sync" indicator shows                    │
│  10. Disable airplane mode                                   │
│  11. Wait 5-10 seconds for sync                              │
│  12. Verify "Synced" indicator appears                       │
│  13. Check web admin - verify client appears there           │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Sync Conflict Test

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Conflict Resolution (Last-Write-Wins)           │
├─────────────────────────────────────────────────────────────┤
│  1. Create client "John Doe" on mobile                       │
│  2. Sync to ensure data is on server                         │
│  3. Enable airplane mode on mobile                           │
│  4. On web admin, rename client to "John Smith"              │
│  5. On mobile (still offline), rename to "Johnny Doe"        │
│  6. Disable airplane mode on mobile                          │
│  7. Wait for sync                                            │
│  8. Check both web and mobile                                │
│  9. Verify the last change wins (based on timestamp)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Cross-Platform Sync Tests

### 4.1 Web → Mobile Sync

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Data created on web appears on mobile            │
├─────────────────────────────────────────────────────────────┤
│  1. Have both web admin and mobile app open                  │
│  2. On web admin, create new client:                         │
│     - Name: Cross Platform Test                              │
│     - Email: cross@platform.test                             │
│  3. On mobile, pull to refresh or wait for sync              │
│  4. Verify client appears in mobile app                      │
│  5. Details should match exactly                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile → Web Sync

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Data created on mobile appears on web            │
├─────────────────────────────────────────────────────────────┤
│  1. Have both web admin and mobile app open                  │
│  2. On mobile, create new client:                            │
│     - Name: Mobile Created                                   │
│     - Type: POTENTIAL                                        │
│  3. Wait for sync (5-10 seconds)                             │
│  4. On web admin, refresh clients page                       │
│  5. Verify client appears in web admin                       │
│  6. Details should match exactly                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Real-Time-ish Update Test

```
┌─────────────────────────────────────────────────────────────┐
│  Test Case: Near real-time updates (when online)             │
├─────────────────────────────────────────────────────────────┤
│  1. Open web admin clients page                              │
│  2. Open mobile app clients page                             │
│  3. On web, update a client's status                         │
│  4. On mobile, within 10 seconds:                            │
│     - Pull to refresh OR                                     │
│     - Navigate away and back                                 │
│  5. Verify updated status appears on mobile                  │
│                                                              │
│  Note: PowerSync polls every few seconds, not true real-time │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Automated Test Scripts

### 5.1 Backend API Test Script

Create `backend/test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api"
PASS=0
FAIL=0

test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected="$4"
  local data="$5"
  local auth="$6"

  if [ -n "$data" ]; then
    if [ -n "$auth" ]; then
      response=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "$data")
    else
      response=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "$data")
    fi
  else
    if [ -n "$auth" ]; then
      response=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$endpoint" \
        -H "Authorization: Bearer $TOKEN")
    else
      response=$(curl -s -o /dev/null -w "%{http_code}" -X $method "$BASE_URL$endpoint")
    fi
  fi

  if [ "$response" == "$expected" ]; then
    echo "✅ PASS: $name ($response)"
    ((PASS++))
  else
    echo "❌ FAIL: $name (expected $expected, got $response)"
    ((FAIL++))
  fi
}

echo "===== IMU Backend API Tests ====="
echo ""

# Health check
test_endpoint "Health check" "GET" "/health" "200"

# Auth
test_endpoint "Login" "POST" "/auth/login" "200" '{"email":"test@example.com","password":"test123"}'
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' | jq -r '.access_token')

test_endpoint "Get profile" "GET" "/auth/me" "200" "" "auth"
test_endpoint "Invalid login" "POST" "/auth/login" "401" '{"email":"wrong","password":"wrong"}'

# Clients (authenticated)
test_endpoint "List clients" "GET" "/clients" "200" "" "auth"
test_endpoint "Create client" "POST" "/clients" "201" '{"first_name":"Test","last_name":"User","client_type":"POTENTIAL"}' "auth"

# Dashboard
test_endpoint "Dashboard stats" "GET" "/dashboard" "200" "" "auth"

echo ""
echo "===== Results ====="
echo "Passed: $PASS"
echo "Failed: $FAIL"
```

### 5.2 Database Verification Script

Create `backend/verify-db.sh`:

```bash
#!/bin/bash

# Verify data exists in PostgreSQL
echo "Checking database records..."

docker exec -i imu-postgres psql -U postgres -d imu -c "
SELECT
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM clients) as clients,
  (SELECT COUNT(*) FROM agencies) as agencies,
  (SELECT COUNT(*) FROM touchpoints) as touchpoints,
  (SELECT COUNT(*) FROM itineraries) as itineraries;
"
```

---

## Phase 6: Test Checklist

### Backend Checklist

- [ ] Health endpoint returns 200
- [ ] User can register
- [ ] User can login and receive JWT
- [ ] Invalid credentials rejected with 401
- [ ] Protected endpoints reject requests without token
- [ ] Token refresh works
- [ ] All CRUD operations work for clients
- [ ] All CRUD operations work for users
- [ ] All CRUD operations work for caravans
- [ ] All CRUD operations work for agencies
- [ ] All CRUD operations work for touchpoints
- [ ] All CRUD operations work for itineraries
- [ ] Dashboard returns correct statistics
- [ ] Pagination works correctly
- [ ] Search/filter works correctly

### Vue Web Admin Checklist

- [ ] Login page renders
- [ ] Login redirects to dashboard on success
- [ ] Login shows error on failure
- [ ] Dashboard loads statistics
- [ ] Clients list loads
- [ ] Client create works
- [ ] Client edit works
- [ ] Client delete works
- [ ] Caravans list loads
- [ ] Caravan CRUD works
- [ ] Users list loads (admin only)
- [ ] User CRUD works (admin only)
- [ ] Itineraries list loads
- [ ] Itinerary CRUD works
- [ ] Settings page loads user data
- [ ] Profile update works
- [ ] Logout clears session and redirects
- [ ] Auth guard redirects unauthenticated users
- [ ] Error toasts appear on API failures

### Flutter Mobile Checklist

- [ ] App launches successfully
- [ ] Login screen appears
- [ ] Login succeeds with valid credentials
- [ ] Login fails with invalid credentials
- [ ] PowerSync connects to backend
- [ ] Sync status indicator shows
- [ ] Clients load from local SQLite
- [ ] Client create works offline
- [ ] Client create syncs when online
- [ ] Client edit works
- [ ] Client delete works
- [ ] Touchpoint create works
- [ ] Itinerary create works
- [ ] Offline indicator shows when disconnected
- [ ] Data syncs after reconnecting

### Cross-Platform Sync Checklist

- [ ] Client created on web appears on mobile
- [ ] Client created on mobile appears on web
- [ ] Updates on web sync to mobile
- [ ] Updates on mobile sync to web
- [ ] Deletes on web sync to mobile
- [ ] Deletes on mobile sync to web
- [ ] Conflict resolution works (last-write-wins)

---

## Running All Tests

```bash
# 1. Start all services
docker-compose up -d
cd backend && pnpm dev &
cd imu-web-vue && pnpm dev &

# 2. Run backend API tests
cd backend
chmod +x test-api.sh
./test-api.sh

# 3. Verify database
chmod +x verify-db.sh
./verify-db.sh

# 4. Manual web testing
# Open http://localhost:4002 and follow Phase 2 tests

# 5. Manual mobile testing
# Run Flutter app and follow Phase 3 tests

# 6. Cross-platform testing
# Follow Phase 4 tests with both web and mobile open
```

---

## Test Data Seeds

For consistent testing, create seed data:

```sql
-- backend/seed-test-data.sql

-- Test users
INSERT INTO users (id, email, password_hash, first_name, last_name, role)
VALUES
  ('test-admin-001', 'admin@test.com', '$2a$10$...', 'Admin', 'User', 'admin'),
  ('test-staff-001', 'staff@test.com', '$2a$10$...', 'Staff', 'User', 'staff'),
  ('test-agent-001', 'agent@test.com', '$2a$10$...', 'Agent', 'User', 'field_agent')
ON CONFLICT (id) DO NOTHING;

-- Test agencies
INSERT INTO agencies (id, name, code)
VALUES
  ('test-agency-001', 'PNP Retirement Service', 'PNP-RS'),
  ('test-agency-002', 'Bureau of Fire Protection', 'BFP')
ON CONFLICT (id) DO NOTHING;

-- Test clients
INSERT INTO clients (id, first_name, last_name, client_type, agency_id, caravan_id)
VALUES
  ('test-client-001', 'Juan', 'Dela Cruz', 'EXISTING', 'test-agency-001', 'test-agent-001'),
  ('test-client-002', 'Maria', 'Santos', 'POTENTIAL', 'test-agency-001', 'test-agent-001')
ON CONFLICT (id) DO NOTHING;
```

---

## Next Steps After Testing Passes

1. **Fix any failing tests** - Debug and fix issues found
2. **Performance testing** - Test with larger datasets
3. **Security audit** - Verify JWT implementation, SQL injection prevention
4. **Add CI/CD** - Automate tests in GitHub Actions
5. **Deploy to staging** - Test in production-like environment
