# IMU Full Fix Design Specification

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Critical, High, Medium, and Low priority fixes across Flutter Mobile, Vue Web Admin, and PocketBase

---

## Executive Summary

This specification addresses 30+ identified issues in the IMU project, organized by severity and implemented in a single coordinated effort. The fixes span security vulnerabilities, database schema completion, sync system unification, authentication improvements, error handling standardization, and AWS S3 file upload integration.

---

## 1. Architecture Overview

### 1.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         IMU System                               │
├─────────────────────────────────────────────────────────────────┤
│  Flutter Mobile App          │  Vue Web Admin                   │
│  ┌─────────────────────┐     │  ┌─────────────────────┐         │
│  │ Auth Service        │     │  │ Auth Store          │         │
│  │ - PIN/Biometric     │     │  │ - Session Timeout   │         │
│  │ - Session Mgmt      │     │  │ - Password Reset    │         │
│  │ - Token Persistence │     │  └─────────────────────┘         │
│  └─────────────────────┘     │                                   │
│  ┌─────────────────────┐     │  ┌─────────────────────┐         │
│  │ Sync Service        │     │  │ API Services        │         │
│  │ - Unified Queue     │     │  │ - Error Handling    │         │
│  │ - 7-day Retention   │     │  │ - Attendance/Targets│         │
│  │ - Conflict UI       │     │  └─────────────────────┘         │
│  └─────────────────────┘     │                                   │
│  ┌─────────────────────┐     │                                   │
│  │ File Upload Service │     │                                   │
│  │ - AWS S3 Integration│     │                                   │
│  │ - Offline Queue     │     │                                   │
│  └─────────────────────┘     │                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PocketBase + AWS S3                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Collections     │  │ File Storage    │  │ Relations       │  │
│  │ - clients       │  │ - S3 Bucket     │  │ - Proper FK     │  │
│  │ - touchpoints   │  │ - URLs in PB    │  │ - Indexes       │  │
│  │ - addresses     │  │                 │  │                 │  │
│  │ - phone_numbers │  │                 │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Environment Variables

Add to `.env.dev` and `.env.prod`:

```env
# AWS Configuration (add credentials later)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=your-bucket-name
```

---

## 2. PocketBase Schema

### 2.1 Touchpoints Collection (Complete Schema)

**Migration:** `touchpoints_full_schema.js`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | relation | Yes | → clients |
| caravan_id | relation | Yes | → caravans |
| touchpoint_number | number | Yes | 1-7 |
| type | select | Yes | "VISIT", "CALL" |
| date | date | Yes | Visit/call date |
| address | text | No | Location address |
| time_arrival | text | No | HH:mm format |
| time_departure | text | No | HH:mm format |
| odometer_start | text | No | Odometer reading |
| odometer_end | text | No | Odometer reading |
| reason | text | Yes | 25+ predefined reasons |
| next_visit_date | date | No | Scheduled follow-up |
| notes | editor | No | Rich text notes |
| photo_path | url | No | S3 URL |
| audio_path | url | No | S3 URL |
| latitude | number | No | GPS coordinate |
| longitude | number | No | GPS coordinate |

### 2.2 Addresses Collection (New)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | relation | Yes | → clients |
| type | select | No | "home", "work", "mailing" |
| street | text | No | Street address |
| barangay | text | No | Barangay |
| city | text | No | City/municipality |
| province | text | No | Province |
| postal_code | text | No | ZIP code |
| latitude | number | No | GPS coordinate |
| longitude | number | No | GPS coordinate |
| is_primary | bool | No | Default: false |

### 2.3 Phone Numbers Collection (New)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | relation | Yes | → clients |
| type | select | No | "mobile", "landline" |
| number | text | Yes | Phone number |
| label | text | No | "Personal", "Work", etc. |
| is_primary | bool | No | Default: false |

### 2.4 Clients Collection Updates

Add missing fields:

| Field | Type | Description |
|-------|------|-------------|
| agency_name | text | Agency/company name |
| department | text | Department |
| position | text | Job position |
| employment_status | text | Employment status |
| payroll_date | text | Payroll schedule |
| tenure | number | Years of service |
| birth_date | date | Date of birth |
| pan | text | PAN number |
| facebook_link | url | Facebook profile |
| remarks | editor | Additional notes |

### 2.5 Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_touchpoints_client ON touchpoints(client_id);
CREATE INDEX idx_touchpoints_caravan ON touchpoints(caravan_id);
CREATE INDEX idx_touchpoints_date ON touchpoints(date);
CREATE INDEX idx_addresses_client ON addresses(client_id);
CREATE INDEX idx_phones_client ON phone_numbers(client_id);
CREATE INDEX idx_clients_type ON clients(client_type);
CREATE INDEX idx_clients_caravan ON clients(caravan_id);
```

---

## 3. AWS S3 File Upload Service

### 3.1 Service Interface

```dart
// lib/services/aws/file_upload_service.dart
abstract class FileUploadService {
  final String bucketName;
  final String region;

  Future<String> uploadPhoto(File photo, String touchpointId);
  Future<String> uploadAudio(File audio, String touchpointId);
  Future<String> uploadAvatar(File photo, String userId);
  Future<void> deleteFile(String url);
  Future<List<String>> uploadBatch(List<File> files, String folder);
}
```

### 3.2 S3 Bucket Structure

```
s3://{bucket}/
├── photos/
│   ├── touchpoints/{touchpoint_id}/{timestamp}.jpg
│   └── avatars/{user_id}/{timestamp}.jpg
└── audio/
    └── touchpoints/{touchpoint_id}/{timestamp}.m4a
```

### 3.3 Upload Flow

1. User captures photo/audio locally
2. File saved to local storage (Hive)
3. Background sync service uploads to S3
4. S3 URL saved to PocketBase record
5. Local file cleaned up after successful sync (optional)

### 3.4 Configuration

```dart
// lib/services/aws/s3_service.dart
class S3Config {
  static String get accessKey =>
    const String.fromEnvironment('AWS_ACCESS_KEY_ID', defaultValue: '');
  static String get secretKey =>
    const String.fromEnvironment('AWS_SECRET_ACCESS_KEY', defaultValue: '');
  static String get region =>
    const String.fromEnvironment('AWS_REGION', defaultValue: 'ap-southeast-1');
  static String get bucket =>
    const String.fromEnvironment('AWS_S3_BUCKET', defaultValue: '');
}
```

---

## 4. Critical Security Fixes

### 4.1 Certificate Pinning Implementation

**File:** `lib/services/certificate_pinning_service.dart`

```dart
class CertificatePinningService {
  static const List<String> _pinnedHashes = [
    // Add production certificate SHA-256 hashes
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  ];

  Future<bool> validateCertificate(X509Certificate cert);
  SecurityContext createSecurityContext();
}
```

### 4.2 Secure PIN Salt Generation

**File:** `lib/services/auth/secure_storage_service.dart`

Replace timestamp-based salt with cryptographic random:

```dart
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

String _generateSalt() {
  final random = Random.secure();
  final bytes = Uint8List(32);
  for (int i = 0; i < 32; i++) {
    bytes[i] = random.nextInt(256);
  }
  return base64.encode(bytes);
}
```

### 4.3 Debug Log Removal for Production

Create conditional logging:

```dart
// lib/core/utils/logger.dart
void logDebug(String message) {
  assert(() {
    debugPrint(message);
    return true;
  }());
}

// Usage: logDebug('Token: $token'); // Only logs in debug mode
```

Replace all `debugPrint` with `logDebug` throughout codebase.

---

## 5. Unified Sync Service

### 5.1 Current Problem

Two conflicting sync systems:
- `SyncService` uses `pending_sync` Hive box
- `SyncQueueService` uses `sync_queue` Hive box

### 5.2 Solution: UnifiedSyncService

```dart
// lib/services/sync/unified_sync_service.dart
class UnifiedSyncService {
  final Box<SyncOperation> _queueBox;
  final ConnectivityService _connectivity;
  final ConflictResolver _conflictResolver;
  final RetentionManager _retentionManager;

  // Single source of truth for pending operations
  Future<void> queueOperation(SyncOperation op);
  Future<void> processQueue();
  Future<void> resolveConflicts();
  Future<void> cleanupOldData(); // 7-day retention
}
```

### 5.3 Data Retention Policy

```dart
// lib/services/sync/retention_manager.dart
class RetentionManager {
  static const Duration retentionPeriod = Duration(days: 7);

  Future<void> cleanupSyncedData() async {
    final cutoff = DateTime.now().subtract(retentionPeriod);
    // Delete records where:
    // - synced = true AND
    // - syncedAt < cutoff
  }
}
```

### 5.4 Conflict Resolution

Three strategies with user choice:

1. **Local Wins** - Keep local version
2. **Server Wins** - Accept server version
3. **Merge** - Combine changes (when possible)

UI dialog for user decision when conflict detected.

---

## 6. Authentication Improvements

### 6.1 Flutter Session Updates

| Setting | Current | New |
|---------|---------|-----|
| Inactivity timeout | 15 min | 15 min (unchanged) |
| Session timeout | 8 hours | 4 hours |
| Token refresh | Manual | Auto-refresh 5 min before expiry |

### 6.2 Vue Session Management (New)

```typescript
// stores/session.ts
interface SessionState {
  lastActivity: Date;
  timeoutMinutes: number;  // Default 30
  warningShown: boolean;
}

// Auto-logout flow:
// 1. Track activity on API calls and user interactions
// 2. Warning popup at 25 minutes
// 3. Auto-logout at 30 minutes
// 4. Redirect to login with message
```

### 6.3 Vue Password Reset (Complete)

```typescript
// Flow:
// 1. ForgotPasswordView.vue - User enters email
// 2. API sends reset email via PocketBase
// 3. User clicks link in email
// 4. ResetPasswordView.vue - User enters new password
// 5. Redirect to login
```

---

## 7. Error Handling Standardization

### 7.1 Flutter ApiException

```dart
class ApiException implements Exception {
  final String message;
  final String? errorCode;
  final int? statusCode;
  final Map<String, dynamic>? details;

  static const Map<String, String> userMessages = {
    'INVALID_CREDENTIALS': 'Invalid email or password',
    'NETWORK_ERROR': 'Please check your internet connection',
    'SESSION_EXPIRED': 'Your session has expired. Please log in again.',
    'SYNC_CONFLICT': 'This data was modified elsewhere. Please review.',
    'FILE_TOO_LARGE': 'File is too large. Maximum size is 10MB.',
    'UPLOAD_FAILED': 'Failed to upload file. Please try again.',
  };

  String get userMessage => userMessages[errorCode] ?? message;
}
```

### 7.2 Vue Error Composable

```typescript
// composables/useErrorHandler.ts
export function useErrorHandler() {
  const toast = useToast();

  const handleError = (error: unknown, fallbackMessage: string) => {
    const message = extractUserMessage(error, fallbackMessage);
    toast.error(message);
    logError(error); // For debugging, not shown to user
  };

  return { handleError };
}
```

### 7.3 User-Facing Messages Only

All error messages displayed to users must use mapped, friendly messages. Raw API errors are logged but never shown directly.

---

## 8. API Consistency

### 8.1 Collection Name Standardization

| Flutter | Vue/PocketBase | Action |
|---------|----------------|--------|
| `itinerary` | `itineraries` | Rename Flutter to `itineraries` |
| `clients` | `clients` | ✓ Aligned |
| `caravans` | `caravans` | ✓ Aligned |

### 8.2 Field Naming Convention

- **PocketBase/Vue:** snake_case (e.g., `first_name`)
- **Flutter:** camelCase in models, snake_case in JSON serialization

All models must implement `fromJson` and `toJson` with proper key conversion.

---

## 9. Vue Admin New Features

### 9.1 Attendance Tracking

```typescript
// stores/attendance.ts
interface AttendanceRecord {
  id: string;
  caravan_id: string;
  date: date;
  check_in: datetime;
  check_out: datetime;
  location: geojson;
  status: 'present' | 'absent' | 'late';
}
```

### 9.2 Targets Management

```typescript
// stores/targets.ts
interface Target {
  id: string;
  caravan_id: string;
  period: 'daily' | 'weekly' | 'monthly';
  visits_target: number;
  calls_target: number;
  actual_visits: number;
  actual_calls: number;
}
```

### 9.3 File Upload Component

```vue
<!-- components/shared/FileUpload.vue -->
<template>
  <div class="file-upload">
    <input type="file" @change="handleUpload" />
    <div v-if="uploading">Uploading...</div>
    <img v-if="previewUrl" :src="previewUrl" />
  </div>
</template>
```

---

## 10. Implementation Priority Order

### Phase 1: Critical Security (Est. 2-3 hours)
1. Implement certificate pinning
2. Fix PIN salt generation
3. Add conditional debug logging

### Phase 2: Schema Completion (Est. 3-4 hours)
1. Create touchpoints full schema migration
2. Create addresses collection migration
3. Create phone_numbers collection migration
4. Update clients collection migration
5. Add database indexes

### Phase 3: AWS S3 Integration (Est. 4-5 hours)
1. Create S3 service
2. Create file upload service
3. Integrate with touchpoint photo upload
4. Integrate with audio upload
5. Add offline upload queue

### Phase 4: Sync System Unification (Est. 3-4 hours)
1. Create UnifiedSyncService
2. Migrate data from old queues
3. Implement retention manager
4. Add conflict resolution UI

### Phase 5: Auth Improvements (Est. 2-3 hours)
1. Update session timeout
2. Add Vue session management
3. Complete password reset flow
4. Add token auto-refresh

### Phase 6: Error Handling (Est. 2-3 hours)
1. Standardize Flutter error handling
2. Create Vue error composable
3. Map all error codes
4. Remove raw error messages

### Phase 7: Vue Features (Est. 3-4 hours)
1. Attendance store and views
2. Targets store and views
3. File upload component
4. Image viewer component

---

## 11. Testing Requirements

### 11.1 Unit Tests
- S3 service upload/delete operations
- Sync queue operations
- Conflict resolution logic
- Error message mapping

### 11.2 Integration Tests
- Full sync flow with mock server
- File upload with S3 mock
- Auth flow end-to-end

### 11.3 Manual Testing Checklist
- [ ] Photo capture and upload
- [ ] Audio recording and upload
- [ ] Offline sync recovery
- [ ] Conflict resolution UI
- [ ] Session timeout behavior
- [ ] Password reset flow

---

## 12. Rollback Plan

Each phase can be rolled back independently:

1. **Security fixes** - Revert individual files
2. **Schema changes** - Create down migrations
3. **S3 integration** - Disable via environment variable
4. **Sync unification** - Keep old services, switch flag
5. **Auth changes** - Revert to previous timeout values
6. **Error handling** - Feature flag for new handler

---

## 13. Success Criteria

- [ ] All debug logs removed from production builds
- [ ] Certificate pinning validates production certificates
- [ ] All PocketBase collections have complete schemas
- [ ] File uploads work with AWS S3
- [ ] Sync queue unified with 7-day retention
- [ ] Vue admin has session timeout
- [ ] Password reset fully functional
- [ ] Error messages are user-friendly
- [ ] All tests passing
- [ ] No regression in existing functionality

---

## Appendix A: Files to Create

### Flutter Mobile (~25 files)

```
mobile/imu_flutter/lib/
├── services/
│   ├── aws/
│   │   ├── s3_service.dart              ← NEW
│   │   └── file_upload_service.dart     ← NEW
│   ├── sync/
│   │   ├── unified_sync_service.dart    ← NEW
│   │   ├── retention_manager.dart       ← NEW
│   │   └── conflict_resolver.dart       ← ENHANCE
│   ├── auth/
│   │   ├── secure_storage_service.dart  ← FIX
│   │   └── certificate_pinning_service.dart ← IMPLEMENT
│   └── api/
│       └── api_exception.dart           ← ENHANCE
├── core/
│   └── utils/
│       └── logger.dart                  ← NEW
└── features/
    └── touchpoints/
        └── widgets/
            └── conflict_dialog.dart     ← NEW
```

### Vue Web Admin (~15 files)

```
imu-web-vue/src/
├── composables/
│   └── useErrorHandler.ts               ← NEW
├── stores/
│   ├── session.ts                       ← NEW
│   ├── attendance.ts                    ← NEW
│   └── targets.ts                       ← NEW
├── views/
│   ├── attendance/
│   │   └── AttendanceListView.vue       ← NEW
│   ├── targets/
│   │   └── TargetsListView.vue          ← NEW
│   └── auth/
│       ├── ForgotPasswordView.vue       ← COMPLETE
│       └── ResetPasswordView.vue        ← NEW
└── components/
    └── shared/
        ├── FileUpload.vue               ← NEW
        ├── ImageViewer.vue              ← NEW
        └── SessionTimeout.vue           ← NEW
```

### PocketBase Migrations (~5 files)

```
imu-web-vue/pb_migrations/
├── 1773XXXXXX_touchpoints_full_schema.js  ← COMPLETE
├── 1773XXXXXX_create_addresses.js         ← NEW
├── 1773XXXXXX_create_phone_numbers.js     ← NEW
├── 1773XXXXXX_update_clients_fields.js    ← NEW
└── 1773XXXXXX_add_indexes.js              ← NEW
```

---

## Appendix B: Files to Modify

### Flutter (~30 files)
- All files containing `debugPrint` → use `logDebug`
- `secure_storage_service.dart` → fix salt generation
- `certificate_pinning_service.dart` → implement
- `sync_service.dart` → deprecate, migrate to unified
- `sync_queue_service.dart` → deprecate, migrate to unified
- All API services → standardize error handling

### Vue (~20 files)
- `auth.ts` → add session management
- `clients.ts` → update for new fields
- All stores → use error handler composable
- Login view → add session timeout warning

---

*End of Design Specification*
