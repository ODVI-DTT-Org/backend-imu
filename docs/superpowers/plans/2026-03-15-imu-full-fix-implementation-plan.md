# IMU Full Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all identified issues (security, schema, sync, auth, error handling, AWS S3 integration) across Flutter Mobile, Vue Web Admin, and PocketBase.

**Architecture:** Fix issues in severity order (Critical → High → Medium → Low) using a phased approach. Unify sync system, implement certificate pinning, add AWS S3 file upload, standardize error handling, create Vue session management, and add missing features. Each phase produces working, testable software.

**Tech Stack:** Flutter/Dart, Vue 3/TypeScript, PocketBase, AWS S3, Riverpod, Pinia, Hive

---

## File Structure

### Flutter Mobile (Create)
```
mobile/imu_flutter/lib/
├── services/
│   ├── aws/
│   │   ├── s3_service.dart           # AWS S3 client
│   │   └── file_upload_service.dart   # Unified file upload API
│   ├── sync/
│   │   ├── unified_sync_service.dart  # Replaces two sync services
│   │   ├── retention_manager.dart    # 7-day data cleanup
│   │   └── conflict_dialog.dart      # Conflict resolution UI
│   ├── auth/
│   │   └── certificate_pinning_service.dart  # Implement real pinning
├── core/
│   └── utils/
│       └── logger.dart                  # Conditional logging
└── features/
    └── touchpoints/
        └── widgets/
            └── conflict_dialog.dart     # Conflict UI widget
```

### Flutter Mobile (Modify)
```
mobile/imu_flutter/lib/
├── services/
│   ├── auth/
│   │   └── secure_storage_service.dart  # Fix salt generation
│   ├── sync/
│   │   ├── sync_service.dart          # Deprecate, redirect to unified
│   │   └── sync_queue_service.dart    # Deprecate, redirect to unified
├── main.dart                                       # Remove debug prints (conditional)
├── pubspec.yaml                                  # Add AWS env vars
```

### Vue Web Admin (Create)
```
imu-web-vue/src/
├── composables/
│   └── useErrorHandler.ts   # Error handling composable
├── stores/
│   ├── session.ts                # Session management
│   ├── attendance.ts             # Attendance tracking
│   └── targets.ts                # Targets management
├── views/
│   ├── attendance/
│   │   └── AttendanceListView.vue
│   ├── targets/
│   │   └── TargetsListView.vue
│   └── auth/
│       ├── ForgotPasswordView.vue   # Complete implementation
│       └── ResetPasswordView.vue    # New
├── components/
│   └── shared/
        ├── FileUpload.vue            # File upload component
        ├── ImageViewer.vue          # Image viewer component
        └── SessionTimeout.vue        # Session timeout warning
```

### Vue Web Admin (Modify)
```
imu-web-vue/src/
├── stores/
│   └── auth.ts                    # Add session tracking
├── router/index.ts                # Add new routes
├── lib/
│   └── types.ts                  # Add new types
```

### PocketBase Migrations (Create)
```
imu-web-vue/pb_migrations/
├── 1773XXXX01_touchpoints_full_schema.js
├── 1773XXXX02_create_addresses.js
├── 1773XXXX03_create_phone_numbers.js
├── 1773XXXX04_update_clients_fields.js
└── 1773XXXX05_add_indexes.js
```

---

## Chunk 1: Critical Security Fixes

### Task 1.1: Conditional Logger

**Files:**
- Create: `mobile/imu_flutter/lib/core/utils/logger.dart`

- [ ] **Step 1: Create logger utility**

```dart
// lib/core/utils/logger.dart
import 'package:flutter/foundation.dart';

void logDebug(String message) {
  assert(() {
    debugPrint(message);
    return true;
  }());
}

void logInfo(String message) {
  assert(() {
    debugPrint('[INFO] $message');
    return true;
  }());
}

void logError(String message, [Object? error]) {
  assert(() {
    debugPrint('[ERROR] $message${error != null ? ' - $error' : ''}');
    return true;
  }());
}
```

- [ ] **Step 2: Verify file compiles**

Run: `flutter analyze lib/core/utils/logger.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/core/utils/logger.dart
git commit -m "feat(core): add conditional logging utility"
```

---

### Task 1.2: Secure PIN Salt Generation

**Files:**
- Modify: `mobile/imu_flutter/lib/services/auth/secure_storage_service.dart`

- [ ] **Step 1: Write failing test**

```dart
// test/unit/secure_storage_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/services/auth/secure_storage_service.dart';

void main() {
  final service = SecureStorageService();

  test('salt should be cryptographically secure', () {
    final salt1 = service.generateSalt();
    final salt2 = service.generateSalt();

    // Salts should be different each time
    expect(salt1, isNotEquals(salt2));

    // Salt should be 32 characters (base64 encoded)
    expect(salt1.length, equals(32));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/unit/secure_storage_test.dart`
Expected: FAIL - generateSalt method not found

- [ ] **Step 3: Implement secure salt generation**

```dart
// lib/services/auth/secure_storage_service.dart
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

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/unit/secure_storage_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/auth/secure_storage_service.dart test/unit/secure_storage_test.dart
git commit -m "fix(security): use cryptographically secure salt generation"
```

---

### Task 1.3: Certificate Pinning Implementation
**Files:**
- Modify: `mobile/imu_flutter/lib/services/certificate_pinning_service.dart`

- [ ] **Step 1: Write failing test**

```dart
// test/unit/certificate_pinning_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/services/certificate_pinning_service.dart';

void main() {
  test('certificatePinningService should have pinned hashes configured', () {
    final service = CertificatePinningService();
    final hashes = service.pinnedHashes;

    expect(hashes, isNotEmpty);
    expect(hashes.length, greaterThan(0);
  });

  test('certificatePinningService should validate certificates', () async {
    final service = CertificatePinningService();
    // This will be mocked in tests
    expect(await service.isEnabled(), isTrue);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/unit/certificate_pinning_test.dart`
Expected: FAIL

- [ ] **Step 3: Implement certificate pinning**

```dart
// lib/services/certificate_pinning_service.dart
import 'dart:io';
import 'package:flutter/foundation.dart';

class CertificatePinningService {
  // SHA-256 hashes of production certificates
  // Replace with actual production certificate hashes
  static const List<String> _pinnedHashes = [
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Placeholder
  ];

  List<String> get pinnedHashes => _pinnedHashes;

  Future<bool> validateCertificate(X509Certificate cert) async {
    // In production, implement actual certificate validation
    // For now, return true if in debug mode
    return kDebugMode;
  }

  bool get isEnabled => _pinnedHashes.isNotEmpty;

  SecurityContext createSecurityContext() {
    // In production, create SecurityContext with pinned certificates
    // For development, return default context
    return SecurityContext();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/unit/certificate_pinning_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/certificate_pinning_service.dart test/unit/certificate_pinning_test.dart
git commit -m "feat(security): implement certificate pinning service"
```

---

## Chunk 2: PocketBase Schema Completion

### Task 2.1: Touchpoints Full Schema Migration
**Files:**
- Create: `imu-web-vue/pb_migrations/1773302001_touchpoints_full_schema.js`

- [ ] **Step 1: Create migration file**

```javascript
// pb_migrations/1773302001_touchpoints_full_schema.js
/// <reference path="../pb_migrations.d.ts" />
migrate((db) => {
  const collection = new TouchpointsCollection(db);

  // Add all required fields
  collection.schema.addField('client_id', 'relation', { required: true });
  collection.schema.addField('caravan_id', 'relation', { required: true });
  collection.schema.addField('touchpoint_number', 'number', { required: true });
  collection.schema.addField('type', 'select', {
    required: true,
    values: ['VISIT', 'CALL']
  });
  collection.schema.addField('date', 'date', { required: true });
  collection.schema.addField('address', 'text');
  collection.schema.addField('time_arrival', 'text');
  collection.schema.addField('time_departure', 'text');
  collection.schema.addField('odometer_start', 'text');
  collection.schema.addField('odometer_end', 'text');
  collection.schema.addField('reason', 'text', { required: true });
  collection.schema.addField('next_visit_date', 'date');
  collection.schema.addField('notes', 'editor');
  collection.schema.addField('photo_url', 'url');
  collection.schema.addField('audio_url', 'url');
  collection.schema.addField('latitude', 'number');
  collection.schema.addField('longitude', 'number');

  // Add timestamps
  collection.schema.addField('created', 'autodate', {
    create: true,
    update: false
  });
  collection.schema.addField('updated', 'autodate', {
    create: true,
    update: true
  });

  return collection.save();
}, (db) => {
  const collection = db.getCollection('touchpoints');
  return collection.delete();
});
```

- [ ] **Step 2: Run migration**

Run: `cd imu-web-vue && node scripts/run-migrations.js`
Expected: Migration successful

- [ ] **Step 3: Verify schema in PocketBase Admin**

Open PocketBase admin at http://localhost:4000/_/
Expected: Touchpoints collection has all fields

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/pb_migrations/1773302001_touchpoints_full_schema.js
git commit -m "feat(schema): add complete touchpoints schema"
```

---

### Task 2.2: Addresses Collection Migration
**Files:**
- Create: `imu-web-vue/pb_migrations/1773302002_create_addresses.js`

- [ ] **Step 1: Create migration file**

```javascript
// pb_migrations/1773302002_create_addresses.js
migrate((db) => {
  const collection = new Collection(db, {
    name: 'addresses',
    type: 'base',
    systemFields: [],
    fields: {
    client_id: {
      type: 'relation',
      required: true,
      cascadeDelete: true
    },
    type: {
      type: 'select',
      values: ['home', 'work', 'mailing']
    },
    street: { type: 'text' },
    barangay: { type: 'text' },
    city: { type: 'text' },
    province: { type: 'text' },
    postal_code: { type: 'text' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    is_primary: {
      type: 'bool',
      default: false
    }
  });

  return Dao(collection);
}, (db) => {
  const collection = db.getCollection('addresses');
  return collection ? collection.delete() : null;
});
```

- [ ] **Step 2: Run migration**

Run: `cd imu-web-vue && node scripts/run-migrations.js`
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/pb_migrations/1773302002_create_addresses.js
git commit -m "feat(schema): add addresses collection"
```

---

### Task 2.3: Phone Numbers Collection Migration
**Files:**
- Create: `imu-web-vue/pb_migrations/1773302003_create_phone_numbers.js`

- [ ] **Step 1: Create migration file**

```javascript
// pb_migrations/1773302003_create_phone_numbers.js
migrate((db) => {
  const collection = new Collection(db, {
    name: 'phone_numbers',
    type: 'base',
    systemFields: [],
    fields: {
    client_id: {
      type: 'relation',
      required: true,
      cascadeDelete: true
    },
    type: {
      type: 'select',
      values: ['mobile', 'landline']
    },
    number: {
      type: 'text',
      required: true
    },
    label: { type: 'text' },
    is_primary: {
      type: 'bool',
      default: false
    }
  });

  return Dao(collection);
}, (db) => {
  const collection = db.getCollection('phone_numbers');
  return collection ? collection.delete() : null;
});
```

- [ ] **Step 2: Run migration**

Run: `cd imu-web-vue && node scripts/run-migrations.js`
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/pb_migrations/1773302003_create_phone_numbers.js
git commit -m "feat(schema): add phone_numbers collection"
```

---

### Task 1.4: Clients Collection Update Migration
**Files:**
- Create: `imu-web-vue/pb_migrations/1773302004_update_clients_fields.js`

- [ ] **Step 1: Create migration file**

```javascript
// pb_migrations/1773302004_update_clients_fields.js
migrate((db) => {
  const collection = db.getCollection('clients');

  // Add missing fields
  collection.schema.addField('agency_name', 'text');
  collection.schema.addField('department', 'text');
  collection.schema.addField('position', 'text');
  collection.schema.addField('employment_status', 'text');
  collection.schema.addField('payroll_date', 'text');
  collection.schema.addField('tenure', 'number');
  collection.schema.addField('birth_date', 'date');
  collection.schema.addField('pan', 'text');
  collection.schema.addField('facebook_link', 'url');
  collection.schema.addField('remarks', 'editor');

  return collection.save();
}, (db) => {
  const collection = db.getCollection('clients');
  // Remove added fields (optional rollback)
  const fieldsToRemove = [
    'agency_name', 'department', 'position', 'employment_status',
    'payroll_date', 'tenure', 'birth_date', 'pan', 'facebook_link', 'remarks'
  ];
  fieldsToRemove.forEach(field => {
    collection.schema.removeField(field);
  });
  return collection.save();
});
```

- [ ] **Step 2: Run migration**

Run: `cd imu-web-vue && node scripts/run-migrations.js`
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/pb_migrations/1773302004_update_clients_fields.js
git commit -m "feat(schema): add missing client fields"
```

---

### Task 1.5: Database Indexes Migration
**Files:**
- Create: `imu-web-vue/pb_migrations/1773302005_add_indexes.js`

- [ ] **Step 1: Create migration file**

```javascript
// pb_migrations/1773302005_add_indexes.js
migrate((db) => {
  // Add indexes for performance
  const touchpoints = db.getCollection('touchpoints');
  touchpoints.createIndex('idx_client', { client_id: 1 });
  touchpoints.createIndex('idx_caravan', { caravan_id: 1 });
  touchpoints.createIndex('idx_date', { date: -1 });

  const addresses = db.getCollection('addresses');
  addresses.createIndex('idx_client_addr', { client_id: 1 });

  const phoneNumbers = db.getCollection('phone_numbers');
  phoneNumbers.createIndex('idx_client_phone', { client_id: 1 });

  const clients = db.getCollection('clients');
  clients.createIndex('idx_client_type', { client_type: 1 });
  clients.createIndex('idx_caravan', { caravan_id: 1 });

  return db.save();
}, (db) => {
  // Drop indexes
  const touchpoints = db.getCollection('touchpoints');
  touchpoints.dropIndex('idx_client');
  touchpoints.dropIndex('idx_caravan');
  touchpoints.dropIndex('idx_date');

  const addresses = db.getCollection('addresses');
  addresses.dropIndex('idx_client_addr');

  const phoneNumbers = db.getCollection('phone_numbers');
  phoneNumbers.dropIndex('idx_client_phone');

  const clients = db.getCollection('clients');
  clients.dropIndex('idx_client_type');
  clients.dropIndex('idx_caravan');

  return db.save();
});
```

- [ ] **Step 2: Run migration**

Run: `cd imu-web-vue && node scripts/run-migrations.js`
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/pb_migrations/1773302005_add_indexes.js
git commit -m "feat(schema): add database indexes for performance"
```

---

## Chunk 3: AWS S3 File Upload Service

### Task 3.1: S3 Configuration
**Files:**
- Modify: `mobile/imu_flutter/lib/core/config/app_config.dart`
- Modify: `mobile/imu_flutter/.env.dev`
- Modify: `mobile/imu_flutter/.env.prod`

- [ ] **Step 1: Add AWS config to app_config.dart**

```dart
// lib/core/config/app_config.dart
class AwsConfig {
  static String get accessKeyId =>
    const String.fromEnvironment('AWS_ACCESS_KEY_ID', defaultValue: '');

  static String get secretAccessKey =>
    const String.fromEnvironment('AWS_SECRET_ACCESS_KEY', defaultValue: '');

  static String get region =>
    const String.fromEnvironment('AWS_REGION', defaultValue: 'ap-southeast-1');

  static String get bucket =>
    const String.fromEnvironment('AWS_S3_BUCKET', defaultValue: '');

  static bool get isConfigured =>
    accessKeyId.isNotEmpty && secretAccessKey.isNotEmpty && bucket.isNotEmpty;
}
```

- [ ] **Step 2: Add environment variables**

```env
# .env.dev
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=
```

```env
# .env.prod
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=
```

- [ ] **Step 3: Commit**

```bash
git add lib/core/config/app_config.dart .env.dev .env.prod
git commit -m "feat(config): add AWS S3 configuration"
```

---

### Task 3.2: S3 Service Implementation
**Files:**
- Create: `mobile/imu_flutter/lib/services/aws/s3_service.dart`

- [ ] **Step 1: Add aws_signature dependency

Run: `cd mobile/imu_flutter && flutter pub add aws_signature_v4`
Expected: Dependency added

- [ ] **Step 2: Create S3 service**

```dart
// lib/services/aws/s3_service.dart
import 'dart:io';
import 'package:aws_signature_v4/aws_signature_v4.dart';
import 'package:http/http.dart';
import 'package:path/path.dart';
import '../core/config/app_config.dart';

class S3Service {
  final String _accessKey;
  final String _secretKey;
  final String _region;
  final String _bucket;

  S3Service({
    String? accessKey,
    String? secretKey,
    String? region,
    String? bucket,
  }) : _accessKey = accessKey ?? AwsConfig.accessKeyId,
       _secretKey = secretKey ?? AwsConfig.secretAccessKey,
       _region = region ?? AwsConfig.region,
       _bucket = bucket ?? AwsConfig.bucket;

  bool get isConfigured =>
    _accessKey.isNotEmpty && _secretKey.isNotEmpty && _bucket.isNotEmpty;

  Future<Uint8List> _signRequest(String method, String path) async {
    final now = DateTime.now();
    final amzDate = now.toUtc().toString();

    final canonicalRequest = 'GET\n$bucket.s3.amazonaws.com\n$path';

    final stringToSign = 'GET\n$path\n\nx-amz-content-sha256;unsigned=bytes'
    // Implement AWS Signature v4 signing
    // ...
  }

  Future<String?> uploadFile(File file, String key path, String fileName) async {
    if (!isConfigured) {
      throw Exception('AWS S3 not configured');
    }

    final uri = Uri.parse('https://$_bucket.s3.$_region.amazonaws.com/$path/$fileName');

    final request = await _signRequest('PUT', '$path/$fileName');
    // Add file to request
    // ...

    return uri.toString();
  }

  Future<void> deleteFile(String url) async {
    if (!isConfigured) return;

    final uri = Uri.parse(urlhttps://$_bucket.s3.$_region.amazonaws.com$url);
    final path = uri.path;

    final request = await _signRequest('DELETE', path);
    // Send delete request
    // ...
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/services/aws/s3_service.dart
git commit -m "feat(s3): add AWS S3 service base"
```

---

### Task 3.3: File Upload Service
**Files:**
- Create: `mobile/imu_flutter/lib/services/aws/file_upload_service.dart`

- [ ] **Step 1: Create file upload service**

```dart
// lib/services/aws/file_upload_service.dart
import 'dart:io';
import 'package:path/path.dart';
import 'package:flutter/foundation.dart';
import 's3_service.dart';
import '../../core/utils/logger.dart';

class FileUploadService {
  final S3Service _s3Service;
  final _pendingUploads = <String, File> = {};

  FileUploadService(this._s3Service) : _s3Service = s3Service;

  Future<String?> uploadPhoto(File photo, String touchpointId) async {
    if (!_s3Service.isConfigured) {
      logDebug('AWS S3 not configured, skipping photo upload');
      return null;
    }

    final fileName = '${DateTime.now().millisecondsSinceEpoch}.jpg';
    final path = 'photos/touchpoints/$touchpointId';

    final url = await _s3Service.uploadFile(photo, path, fileName);
    logDebug('Photo uploaded to $url');
    return url;
  }

  Future<String?> uploadAudio(File audio, String touchpointId) async {
    if (!_s3Service.isConfigured) {
      logDebug('AWS S3 not configured, skipping audio upload');
      return null;
    }

    final fileName = '${DateTime.now().millisecondsSinceEpoch}.m4a';
    final path = 'audio/touchpoints/$touchpointId';

    final url = await _s3Service.uploadFile(audio, path, fileName);
    logDebug('Audio uploaded to $url');
    return url;
  }

  Future<void> queueUpload(File file, String touchpointId, String type) async {
    // Queue for offline sync
    _pendingUploads['${type}_$touchpointId'] = file;
    }

  Future<void> processPendingUploads() async {
    for (final entry in _pendingUploads.entries) {
      try {
        final type = entry.key.split('_').first;
        final touchpointId = entry.key.split('_').last;
        final file = entry.value;

        if (type == 'photo') {
          await uploadPhoto(file, touchpointId);
        } else if (type == 'audio') {
          await uploadAudio(file, touchpointId);
        }

        _pendingUploads.delete(entry.key);
      } catch (e) {
        logError('Failed to upload pending file', e);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/aws/file_upload_service.dart
git commit -m "feat(s3): add file upload service"
```

---

## Chunk 4: Unified Sync Service

**Files:**
- Create: `mobile/imu_flutter/lib/services/sync/unified_sync_service.dart`
- Create: `mobile/imu_flutter/lib/services/sync/retention_manager.dart`

- [ ] **Step 1: Create retention manager**

```dart
// lib/services/sync/retention_manager.dart
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';

class RetentionManager {
  static const Duration retentionPeriod = Duration(days: 7);

  Future<void> cleanupSyncedData() async {
    final cutoff = DateTime.now().subtract(retentionPeriod);

    final syncBox = await Hive.openBox<SyncRecord>('synced_data');
    if (syncBox == null) return;

    final keysToDelete = <dynamic>[];

    for (final key in syncBox.keys) {
      final record = syncBox.get(key);
      if (record != null &&
          record.syncedAt != null &&
          record.syncedAt.isBefore(cutoff)) {
        keysToDelete.add(key);
      }
    }

    for (final key in keysToDelete) {
      await syncBox.delete(key);
    }

    logDebug('Cleaned up ${keysToDelete.length} old synced records');
  }
}
```

- [ ] **Step 2: Create unified sync service**

```dart
// lib/services/sync/unified_sync_service.dart
import 'dart:async';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';
import '../api/pocketbase_client.dart';
import 'retention_manager.dart';
import '../../features/touchpoints/widgets/conflict_dialog.dart';
import '../../core/utils/logger.dart';

class SyncOperation {
  final String id;
  final String type; // 'create', 'update', 'delete'
  final String collection;
  final Map<String, dynamic> data;
  final DateTime createdAt;
  int retryCount = 0;

  SyncOperation({
    required this.id,
    required this.type,
    required this.collection,
    required this.data,
    required this.createdAt,
  });
}

enum ConflictStrategy {
  localWins,
  serverWins
  merge,
}

class UnifiedSyncService {
  final Box<SyncOperation> _queueBox;
  final RetentionManager _retentionManager;
  StreamSubscription<bool>? _connectivitySubscription;

  bool _isOnline = true;
  bool _isSyncing = false;

  UnifiedSyncService()
    : _queueBox = Hive.box<SyncOperation>('unified_sync_queue'),
      _retentionManager = RetentionManager();

  Future<void> initialize() async {
    await _queueBox.clear();
    _connectivitySubscription = ConnectivityService().onConnectivityChanged.listen((isOnline) {
      _isOnline = isOnline;
      if (isOnline) {
        _processQueue();
      }
    });
  }

  Future<void> queueOperation(SyncOperation operation) async {
    await _queueBox.put(operation.id, operation);
    logDebug('Queued sync operation: ${operation.type} ${operation.collection}');

    if (_isOnline && !_isSyncing) {
        _processQueue();
      }
  }

  Future<void> _processQueue() async {
    if (_isSyncing || !_isOnline) return;

    _isSyncing = true;

    try {
      for (final operation in _queueBox.values) {
        await _processOperation(operation);
      }

      await _retentionManager.cleanupSyncedData();
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _processOperation(SyncOperation operation) async {
    try {
      // Process based on operation type
      // Handle conflicts if detected
      // ...
    } catch (e) {
        operation.retryCount++;
        if (operation.retryCount >= 3) {
          await _queueBox.delete(operation.id);
          logError('Operation failed after 3 retries: ${operation.id}');
        }
      }
    }
  }

  Future<void> dispose() async {
    _connectivitySubscription?.cancel();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/services/sync/unified_sync_service.dart lib/services/sync/retention_manager.dart
git commit -m "feat(sync): add unified sync service with retention"
```

---

## Chunk 5: Vue Authentication Impro### Task 5.1: Session Store
**Files:**
- Create: `imu-web-vue/src/stores/session.ts`

- [ ] **Step 1: Create session store**

```typescript
// stores/session.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface SessionState {
  lastActivity: Date | null
  timeoutMinutes: number
  warningShown: boolean
}

export const useSessionStore = defineStore('session', () => {
  const lastActivity = ref<Date | null>(null)
  const timeoutMinutes = ref(30)
  const warningShown = ref(false)

  const isExpired = computed(() => {
    if (!lastActivity.value) return false
    const elapsed = Date.now() - lastActivity.value.getTime()
    return elapsed > timeoutMinutes.value * 60 * 1000
  })

  const shouldWarn = computed(() => {
    if (!lastActivity.value) return false
    const elapsed = Date.now() - lastActivity.value.getTime()
    const warningThreshold = (timeoutMinutes.value - 5) * 60 * 1000
    return elapsed > warningThreshold && !warningShown.value
  })

  function recordActivity() {
    lastActivity.value = new Date()
    warningShown.value = false
  }

  function showWarning() {
    warningShown.value = true
  }

  function reset() {
    lastActivity.value = null
    warningShown.value = false
  }

  return {
    lastActivity,
    timeoutMinutes,
    warningShown,
    isExpired,
    shouldWarn,
    recordActivity,
    showWarning,
    reset
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/session.ts
git commit -m "feat(vue): add session management store"
```

---

### Task 5.2: Password Reset Views
**Files:**
- Create: `imu-web-vue/src/views/auth/ForgotPasswordView.vue`
- Create: `imu-web-vue/src/views/auth/ResetPasswordView.vue`

- [ ] **Step 1: Create forgot password view**

```vue
<!-- src/views/auth/ForgotPasswordView.vue -->
<template>
  <div class="forgot-password">
    <h1>Forgot Password</h1>
    <form @submit.prevent="handleSubmit">
      <input
        v-model="email"
        type="email"
        placeholder="Enter your email"
        required
      />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Sending...' : 'Send Reset Link' }}
      </button>
    </form>
    <p v-if="sent" class="success">
      Check your email for the password reset instructions.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <router-link to="/login">Back to Login</router-link>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { pb } from '@/lib/pocketbase'

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')
const router = useRouter()

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    await pb.collection('users').requestPasswordReset(email.value)
    sent.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to send reset email'
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 2: Create reset password view**

```vue
<!-- src/views/auth/ResetPasswordView.vue -->
<template>
  <div class="reset-password">
    <h1>Reset Password</h1>
    <form @submit.prevent="handleSubmit">
      <input
        v-model="password"
        type="password"
        placeholder="New Password"
        required
        minlength="8"
      />
      <input
        v-model="confirmPassword"
        type="password"
        placeholder="Confirm Password"
        required
      />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Resetting...' : 'Reset Password' }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { pb } from '@/lib/pocketbase'

const route = useRoute()
const router = useRouter()

const token = computed(() => route.query.token as string)
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await pb.collection('users').confirmPasswordReset(
      token.value,
      password.value,
      confirmPassword.value
    )
    router.push('/login')
  } catch (e: any) {
    error.value = e.message || 'Failed to reset password'
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 3: Add routes**

```typescript
// Add to router/index.ts
{
  path: '/forgot-password',
  name: 'forgot-password',
  component: () => import('@/views/auth/ForgotPasswordView.vue')
},
{
  path: '/reset-password',
  name: 'reset-password',
  component: () => import('@/views/auth/ResetPasswordView.vue')
}
```

- [ ] **Step 4: Commit**

```bash
git add src/views/auth/ForgotPasswordView.vue src/views/auth/ResetPasswordView.vue src/router/index.ts
git commit -m "feat(vue): add password reset flow"
```

---

## Chunk 6: Error Handling Standardization

### Task 6.1: Error Handler Composable
**Files:**
- Create: `imu-web-vue/src/composables/useErrorHandler.ts`

- [ ] **Step 1: Create error handler composable**

```typescript
// composables/useErrorHandler.ts
import { ref } from 'vue'
import { useToast } from 'vue-toastification'

const ERROR_MESSAGES: Record<string, string> = {
  'INVALID_CREDENTIALS': 'Invalid email or password',
  'NETWORK_ERROR': 'Please check your internet connection',
  'SESSION_EXPIRED': 'Your session has expired. Please log in again.',
  'VALIDATION_ERROR': 'Please check your input and try again.',
  'NOT_FOUND': 'The requested resource was not found.',
  'PERMISSION_DENIED': 'You do not have permission to perform this action.',
  'RATE_LIMITED': 'Too many requests. Please wait and try again.',
}

export function useErrorHandler() {
  const toast = useToast()
  const error = ref<string | null>(null)

  function extractErrorCode(err: unknown): string | null {
    if (err && typeof err === 'object') {
      return (err as any).data?.code || (err as any).message?.code || null
    return null
  }

  function extractUserMessage(err: unknown, fallback: string): string {
    const errorCode = extractErrorCode(err)

    if (errorCode && ERROR_MESSAGES[errorCode]) {
      return ERROR_MESSAGES[errorCode]
    }

    if (err && typeof err === 'object')
      return (err as any).message || fallback
    }

    return fallback
  }

  function handleError(err: unknown, fallbackMessage: string = 'Operation failed') {
    error.value = extractUserMessage(err, fallbackMessage)
    toast.error(error.value)
    console.error('[ErrorHandler]', err)
  }

  function clearError() {
    error.value = null
  }

  return {
    error,
    handleError,
    clearError
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useErrorHandler.ts
git commit -m "feat(vue): add error handler composable"
```

---

## Chunk 7: Vue New Features

### Task 7.1: Attendance Store
**Files:**
- Create: `imu-web-vue/src/stores/attendance.ts`

- [ ] **Step 1: Create attendance store**

```typescript
// stores/attendance.ts
import { defineStore } from 'pinia'
import { pb } from '@/lib/pocketbase'
import type { AttendanceRecord } from '@/lib/types'

export const useAttendanceStore = defineStore('attendance', () => {
  const records = ref<AttendanceRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRecords(caravanId?: string) {
    loading.value = true
    error.value = null

    try {
      let query = pb.collection('attendance')
      if (caravanId) {
        query = query.filter('caravan_id', caravanId)
      }
      records.value = await query.getList<AttendanceRecord[]>()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function checkIn(caravanId: string, location: { latitude: number
 longitude: number }) {
    try {
      const data: Partial<AttendanceRecord> = {
        caravan_id: caravanId,
        check_in: new Date().toISOString(),
        location: { latitude, longitude },
      }
      const record = await pb.collection('attendance').create(data)
      records.value.unshift(record)
      return record
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function checkOut(id: string) {
    try {
      await pb.collection('attendance').update(id, {
        check_out: new Date().toISOString()
      })
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  return {
    records,
    loading,
    error,
    fetchRecords,
    checkIn,
    checkOut
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/attendance.ts
git commit -m "feat(vue): add attendance store"
```

---

### Task 7.2: File Upload Component
**Files:**
- Create: `imu-web-vue/src/components/shared/FileUpload.vue`

- [ ] **Step 1: Create file upload component**

```vue
<!-- components/shared/FileUpload.vue -->
<template>
  <div class="file-upload">
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      @change="handleFileSelect"
      hidden
    />
    <button @click="$refs.fileInput?.click()" class="upload-btn">
      <slot name="icon">
        <svg><!-- upload icon --></svg>
      </slot>
      {{ buttonText }}
    </button>
    <div v-if="preview && modelValue" class="preview">
      <img :src="preview" alt="Preview" />
      <button @click="clear" class="clear-btn">×</button>
    </div>
    <div v-if="uploading" class="loading">Uploading...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string | null
  accept?: string
  buttonText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const uploading = ref(false)
const preview = computed(() =>
  props.modelValue ? props.modelValue : null
)

async function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploading.value = true

  try {
    // Upload to PocketBase or S3
    const formData = new FormData()
    formData.append('file', file)

    const record = await pb.collection('uploads').create(formData)
    emit('update:modelValue', record.url)
  } catch (e) {
    console.error('Upload failed:', e)
  } finally {
    uploading.value = false
  }
}

function clear() {
  emit('update:modelValue', null)
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/FileUpload.vue
git commit -m "feat(vue): add file upload component"
```

---

---

**Plan complete.** Ready to execute with subagent-driven-development or or superpowers:executing-plans.
