# RBAC Deployment Guide

> **Purpose:** Guide for deploying the IMU RBAC system to production environments.
>
> **Last Updated:** 2026-04-02
> **Version:** 1.0

---

## Overview

The IMU RBAC (Role-Based Access Control) system spans three components:
1. **Backend API** (Hono/Node.js) - Permission validation and endpoints
2. **Mobile App** (Flutter) - Permission checking and UI integration
3. **Database** (PostgreSQL) - Permission storage and views

---

## Pre-Deployment Checklist

### Backend (Hono API)
- [ ] RBAC tables installed (migration 033)
- [ ] Permission middleware configured
- [ ] `/auth/permissions` endpoint accessible
- [ ] JWT signing configured (RS256)
- [ ] Permission caching enabled (5-minute TTL)

### Mobile App (Flutter)
- [ ] Permission widgets integrated
- [ ] Remote permission service configured
- [ ] Permission caching enabled (1-hour TTL)
- [ ] Touchpoint validation implemented
- [ ] Role-based navigation configured

### Database (PostgreSQL)
- [ ] `roles` table populated with 5 system roles
- [ ] `permissions` table populated with all permissions
- [ ] `role_permissions` table configured with role-permission mappings
- [ ] `user_roles` table has user-role assignments
- [ ] `user_permissions_view` materialized view refreshed

---

## 1. Database Setup

### 1.1 Run RBAC Migration

```bash
cd backend
# Run migration 033 (if not already run)
npm run migrate:up
```

**Expected Output:**
```
Running migration 033_add_rbac_system.sql
✅ Created roles table
✅ Created permissions table
✅ Created role_permissions table
✅ Created user_roles table
✅ Created user_permissions_view
✅ Inserted 5 system roles
✅ Inserted system permissions
✅ Configured role-permission mappings
```

### 1.2 Verify Database Setup

```sql
-- Check roles
SELECT * FROM roles;

-- Expected: 5 rows (admin, area_manager, assistant_area_manager, caravan, tele)

-- Check permissions
SELECT COUNT(*) FROM permissions;

-- Expected: 50+ permissions

-- Check user_permissions_view
REFRESH MATERIALIZED VIEW user_permissions_view;
SELECT * FROM user_permissions_view LIMIT 10;

-- Expected: Permission data for users
```

### 1.3 Create Test Users (if needed)

```sql
-- Create admin user
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES ('admin@imu.com', '$2a$10$...', 'Admin', 'User', 'admin');

-- Create caravan user
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES ('caravan@imu.com', '$2a$10$...', 'Caravan', 'User', 'caravan');

-- Create tele user
INSERT INTO users (email, password_hash, first_name, last_name, role)
VALUES ('tele@imu.com', '$2a$10$...', 'Tele', 'User', 'tele');
```

---

## 2. Backend Configuration

### 2.1 Environment Variables

Create `.env` file in backend directory:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/imu

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRY_HOURS=24

# PowerSync (for JWT signing)
POWERSYNC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
POWERSYNC_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
POWERSYNC_KEY_ID=imu-production-key-20260401
POWERSYNC_URL=https://xxx.powersync.journeyapps.com

# Server
PORT=4000
NODE_ENV=production
```

### 2.2 Verify RBAC Installation

```bash
cd backend
npm run test:rbac
```

**Expected Output:**
```
✅ RBAC tables exist
✅ System roles configured
✅ System permissions configured
✅ Role-permission mappings configured
✅ Permission middleware working
✅ User permissions view accessible
```

### 2.3 Test Backend Endpoints

```bash
# Test login and get access token
TOKEN=$(curl -X POST https://your-api.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imu.com","password":"password"}' \
  | jq -r '.access_token')

# Test /auth/permissions endpoint
curl -X GET https://your-api.com/auth/permissions \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

**Expected Response:**
```json
{
  "success": true,
  "permissions": [
    {
      "resource": "clients",
      "action": "create",
      "constraint_name": null,
      "role_slug": "admin"
    },
    ...
  ]
}
```

---

## 3. Mobile App Configuration

### 3.1 Environment Configuration

Create `.env.prod` in mobile directory:

```bash
# API Configuration
API_BASE_URL=https://your-api.com
POWERSYNC_URL=https://xxx.powersync.journeyapps.com

# Mapbox
MAPBOX_ACCESS_TOKEN=your-mapbox-token

# App Configuration
APP_ENV=production
DEBUG_MODE=false
```

### 3.2 Build Configuration

Verify `lib/core/config/app_config.dart`:

```dart
class AppConfig {
  static const String postgresApiUrl = 'https://your-api.com';
  static const String powersyncUrl = 'https://xxx.powersync.journeyapps.com';
  static const String mapboxAccessToken = 'your-mapbox-token';

  static bool get isDebugMode => false;
  static bool get isProduction => true;
}
```

### 3.3 Build for Production

```bash
cd mobile/imu_flutter

# Build Android APK
flutter build apk --release

# Build Android App Bundle
flutter build appbundle --release

# Build iOS (on macOS)
flutter build ios --release
```

---

## 4. Permission System Verification

### 4.1 Backend Verification

```bash
# Test permission checking
curl -X POST https://your-api.com/permissions/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      {"resource": "clients", "action": "create"},
      {"resource": "reports", "action": "read"}
    ]
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "has_permission": true,
  "permissions": [
    {"resource": "clients", "action": "create", "granted": true},
    {"resource": "reports", "action": "read", "granted": true}
  ]
}
```

### 4.2 Mobile App Verification

**Manual Testing Steps:**

1. **Admin User:**
   - Login as admin
   - Verify all menu items visible
   - Verify Reports tab visible
   - Verify Developer Options accessible
   - Verify can create all touchpoint types

2. **Caravan User:**
   - Login as caravan user
   - Verify Reports tab hidden
   - Verify Developer Options hidden
   - Verify can only create Visit touchpoints (1, 4, 7)
   - Verify Call touchpoints restricted

3. **Tele User:**
   - Login as tele user
   - Verify Reports tab hidden
   - Verify Developer Options hidden
   - Verify can only create Call touchpoints (2, 3, 5, 6)
   - Verify Visit touchpoints restricted

---

## 5. Performance Tuning

### 5.1 Backend Optimization

**Permission Caching:**
- Default TTL: 5 minutes
- Configure in `src/middleware/permissions.ts`:

```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

**Database Indexes:**
```sql
-- Ensure these indexes exist
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON user_permissions_view(user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
  ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON user_roles(user_id);
```

### 5.2 Mobile Optimization

**Permission Caching:**
- Default TTL: 1 hour
- Configure in `lib/services/permissions/remote_permission_service.dart`:

```dart
static const _cacheExpiry = Duration(hours: 1);
```

**Permission Refresh:**
- Permissions refresh on token refresh
- Configure in `lib/services/auth/jwt_auth_service.dart`:

```dart
// Refresh permissions when tokens refresh
await permissionService.fetchPermissions(_accessToken!);
```

---

## 6. Monitoring & Logging

### 6.1 Backend Metrics

Monitor these metrics:
- Permission check latency (should be < 100ms with cache)
- Cache hit rate (should be > 90%)
- Permission fetch errors (should be 0)
- `/auth/permissions` endpoint response time (should be < 2s)

### 6.2 Mobile Metrics

Monitor these metrics:
- Permission check latency (cached should be < 10ms)
- Permission fetch success rate (should be > 99%)
- Permission denied dialog count (monitor for abuse)
- Touchpoint creation rejection rate (by role)

### 6.3 Logging

**Backend Logs:**
```
[INFO] Permission check: user_id=123, resource=clients, action=create, granted=true
[INFO] Permission cache miss: user_id=123, fetching from database
[WARN] Permission denied: user_id=123, resource=reports, action=read
```

**Mobile Logs:**
```
[DEBUG] Fetching permissions from backend...
[DEBUG] Fetched 47 permissions from backend
[DEBUG] Cached 47 permissions
[DEBUG] Permissions refreshed successfully
```

---

## 7. Security Considerations

### 7.1 JWT Security

- ✅ Use RS256 for JWT signing (more secure than HS256)
- ✅ Rotate keys periodically (recommended: every 90 days)
- ✅ Keep private keys secure (use environment variables)
- ✅ Validate tokens on every request

### 7.2 Permission Security

- ✅ Always validate permissions on backend (never trust frontend)
- ✅ Use permission middleware on all protected routes
- ✅ Log all permission denials for security auditing
- ✅ Implement permission caching to reduce database load

### 7.3 Role-Based Security

- ✅ Use principle of least privilege
- ✅ Default deny: deny by default, allow explicitly
- ✅ Regular audits of role-permission mappings
- ✅ Document permission changes for compliance

---

## 8. Troubleshooting

### 8.1 Common Issues

**Issue: Permissions not loading**
```
Solution:
1. Check /auth/permissions endpoint is accessible
2. Verify JWT token is valid
3. Check database connection
4. Review backend logs for errors
```

**Issue: Wrong permissions showing**
```
Solution:
1. Refresh materialized view: REFRESH MATERIALIZED VIEW user_permissions_view;
2. Clear permission cache in backend
3. Logout and login again in mobile app
4. Verify user role is correct
```

**Issue: Touchpoint creation not restricted**
```
Solution:
1. Verify touchpoint validation is enabled
2. Check permission_helpers.dart is configured
3. Verify role is set correctly on user
4. Test with different user roles
```

**Issue: Permission denied dialog not showing**
```
Solution:
1. Verify PermissionWidget is correctly configured
2. Check resource and action names match backend
3. Test with different user roles
4. Check console for errors
```

### 8.2 Debug Mode

**Backend Debug Mode:**
```bash
cd backend
DEBUG=imu:* npm run dev
```

**Mobile Debug Mode:**
```bash
cd mobile/imu_flutter
flutter run --debug
flutter logs
```

---

## 9. Rollback Plan

If RBAC deployment causes issues:

### 9.1 Backend Rollback
```bash
cd backend
git revert <commit-hash>
npm run migrate:down 033
npm run migrate:down 032
npm run migrate:down 031
```

### 9.2 Mobile Rollback
```bash
cd mobile/imu_flutter
git revert <commit-hash>
flutter build apk --release
```

### 9.2 Database Rollback
```sql
-- Drop RBAC tables
DROP MATERIALIZED VIEW IF EXISTS user_permissions_view;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
```

---

## 10. Post-Deployment Verification

### 10.1 Automated Tests

```bash
# Backend tests
cd backend
npm run test:permissions
npm run test:integration

# Mobile tests
cd mobile/imu_flutter
flutter test test/unit/utils/permission_helpers_test.dart
flutter test test/widget/permission_dialog_test.dart
```

### 10.2 Manual Testing

Use `docs/RBAC_TESTING_CHECKLIST.md` for comprehensive manual testing:

```bash
cd mobile/imu_flutter
open docs/RBAC_TESTING_CHECKLIST.md
```

### 10.3 Smoke Tests

1. **Login Test:**
   - [ ] Login as each role type (5 tests)
   - [ ] Verify permissions loaded
   - [ ] Verify correct menu items shown

2. **Permission Test:**
   - [ ] Create client as Caravan
   - [ ] Try to delete client as Tele (should fail)
   - [ ] Create Visit touchpoint as Caravan
   - [ ] Try to create Call touchpoint as Caravan (should fail)

3. **Navigation Test:**
   - [ ] Navigate to Reports as Admin (should work)
   - [ ] Navigate to Reports as Caravan (should fail)

---

## 11. Deployment Checklist Summary

### Pre-Deployment
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] JWT keys configured
- [ ] Backup plan tested

### Deployment
- [ ] Backend deployed and tested
- [ ] Mobile app built and tested
- [ ] Database verified
- [ ] Permissions verified
- [ ] Monitoring configured

### Post-Deployment
- [ ] Smoke tests passed
- [ ] Manual tests passed
- [ ] Monitoring active
- [ ] Logs reviewed
- [ ] Users notified

---

## 12. Support & Maintenance

### Documentation Links
- **RBAC Design:** `docs/architecture/roles-permissions.md`
- **Testing Guide:** `mobile/imu_flutter/docs/RBAC_TESTING_CHECKLIST.md`
- **API Documentation:** `docs/architecture/api-contracts.md`
- **Learnings:** `learnings.md` (Section 7: RBAC Implementation Learnings)

### Support Contacts
- **Backend Lead:** [Contact info]
- **Mobile Lead:** [Contact info]
- **Database Admin:** [Contact info]

### Maintenance Schedule
- **Weekly:** Review permission denials in logs
- **Monthly:** Audit role-permission mappings
- **Quarterly:** Review and update permission policies
- **Annually:** Security audit of RBAC system

---

**End of RBAC Deployment Guide**
