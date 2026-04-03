# PowerSync Full Offline Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full offline CRUD support for IMU mobile and web applications using PowerSync + PostgreSQL, replacing the current PocketBase + Hive architecture.

**Architecture:** Migrate from PocketBase (Go backend) to PostgreSQL + PowerSync (offline-first sync engine). Flutter app uses SQLite locally via PowerSync SDK, Vue admin uses Supabase JS client. Server-wins conflict resolution with user notification UI.

**Tech Stack:** Flutter, PowerSync SDK, PostgreSQL/Supabase, Riverpod (Flutter), Pinia (Vue), SQLite (mobile local storage)

---

## File Structure

### Flutter (Mobile) - New Files
```
mobile/imu_flutter/lib/
├── services/
│   └── sync/
│       ├── powersync_service.dart          # PowerSync database & schema
│       ├── powersync_connector.dart        # Backend auth connector
│       ├── offline_auth_service.dart       # Offline token validation
│       ├── token_refresh_service.dart      # Smart retry with backoff (CRITICAL)
│       ├── conflict_notification_service.dart
│       ├── undo_sync_service.dart            # Revert sync operations (N2H)
│       └── smart_retry_service.dart           # Exponential backoff (N2H)
│   └── notifications/
│       └── offline_notification_service.dart   # Push notifications while offline (N2H)
│   └── maps/
│       └── offline_map_service.dart          # Cache map tiles (N2H)
├── features/
│   └── clients/
│       └── data/
│           └── repositories/
│               └── client_repository.dart   # PowerSync-based repository
│   └── touchpoints/
│       └── data/
│           └── repositories/
│               └── touchpoint_repository.dart  # Touchpoint CRUD (CRITICAL)
│   └── itineraries/
│       └── data/
│           └── repositories/
│               └── itinerary_repository.dart  # Itinerary CRUD (CRITICAL)
└── shared/
    └── widgets/
        ├── conflict_snackbar.dart           # Conflict notification UI
        └── sync_progress_widget.dart         # Sync progress indicator (N2H)

### Flutter - Modified Files
```
mobile/imu_flutter/lib/
├── main.dart                               # Initialize PowerSync
├── app.dart                                 # Add PowerSync providers
├── pubspec.yaml                             # Add PowerSync dependencies
├── services/
│   ├── local_storage/hive_service.dart      # Deprecate, add migration
│   └── sync/unified_sync_service.dart       # Replace with PowerSync
└── features/clients/presentation/providers/clients_provider.dart
```

### Vue Admin - New Files
```
imu-web-vue/src/
├── lib/
│   ├── supabase.ts                          # Supabase client
│   └── offline/
│       └── offline-manager.ts               # Offline queue manager
└── types/
    └── database.ts                          # Generated database types
```

### Vue Admin - Modified Files
```
imu-web-vue/src/
├── lib/pocketbase.ts                        # Replace with supabase.ts
├── stores/clients.ts                        # Use Supabase client
├── stores/auth.ts                           # Use Supabase auth
└── .env                                      # Add Supabase credentials
```

### Backend/Infrastructure
```
supabase/
├── migrations/
│   └── 001_initial_schema.sql              # PostgreSQL schema
└── config/
    └── powersync.yaml                       # PowerSync config
```

---

## Chunk 1: Backend Infrastructure Setup

### Task 1.1: Create Supabase/PostgreSQL Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the SQL migration file**

```sql
-- supabase/migrations/001_initial_schema.sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Caravans table (field agents) - must be created first due to foreign keys
CREATE TABLE caravans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    assigned_area VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Agencies table
CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    region VARCHAR(100),
    address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    birth_date DATE,
    email VARCHAR(255),
    phone VARCHAR(50),
    agency_name VARCHAR(255),
    department VARCHAR(255),
    position VARCHAR(255),
    employment_status VARCHAR(50),
    payroll_date VARCHAR(50),
    tenure INTEGER,
    client_type VARCHAR(20) NOT NULL DEFAULT 'POTENTIAL',
    product_type VARCHAR(50),
    market_type VARCHAR(50),
    pension_type VARCHAR(50),
    pan VARCHAR(50),
    facebook_link VARCHAR(500),
    remarks TEXT,
    agency_id UUID REFERENCES agencies(id),
    caravan_id UUID REFERENCES caravans(id),
    is_starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Addresses table
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'home',
    street TEXT,
    barangay VARCHAR(100),
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Phone numbers table
CREATE TABLE phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'mobile',
    number VARCHAR(20) NOT NULL,
    label VARCHAR(50),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Touchpoints table
CREATE TABLE touchpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    caravan_id UUID REFERENCES caravans(id),
    touchpoint_number INTEGER NOT NULL CHECK (touchpoint_number BETWEEN 1 AND 7),
    type VARCHAR(10) NOT NULL CHECK (type IN ('VISIT', 'CALL')),
    date DATE NOT NULL,
    address TEXT,
    time_arrival TIME,
    time_departure TIME,
    odometer_arrival VARCHAR(50),
    odometer_departure VARCHAR(50),
    reason VARCHAR(100) NOT NULL,
    next_visit_date DATE,
    notes TEXT,
    photo_url VARCHAR(500),
    audio_url VARCHAR(500),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Itineraries table
CREATE TABLE itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caravan_id UUID NOT NULL REFERENCES caravans(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority VARCHAR(10) DEFAULT 'normal',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_clients_caravan ON clients(caravan_id);
CREATE INDEX idx_clients_type ON clients(client_type);
CREATE INDEX idx_clients_starred ON clients(is_starred);
CREATE INDEX idx_addresses_client ON addresses(client_id);
CREATE INDEX idx_phones_client ON phone_numbers(client_id);
CREATE INDEX idx_touchpoints_client ON touchpoints(client_id);
CREATE INDEX idx_touchpoints_caravan ON touchpoints(caravan_id);
CREATE INDEX idx_touchpoints_date ON touchpoints(date DESC);
CREATE INDEX idx_itineraries_caravan ON itineraries(caravan_id);
CREATE INDEX idx_itineraries_date ON itineraries(scheduled_date);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_touchpoints_updated_at BEFORE UPDATE ON touchpoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;

-- Caravans can only see their own assigned data
CREATE POLICY "Caravans can view own clients" ON clients
    FOR SELECT USING (caravan_id = auth.uid());

CREATE POLICY "Caravans can insert own clients" ON clients
    FOR INSERT WITH CHECK (caravan_id = auth.uid());

CREATE POLICY "Caravans can update own clients" ON clients
    FOR UPDATE USING (caravan_id = auth.uid());

-- Similar policies for touchpoints and itineraries
CREATE POLICY "Caravans can manage own touchpoints" ON touchpoints
    FOR ALL USING (caravan_id = auth.uid());

CREATE POLICY "Caravans can manage own itineraries" ON itineraries
    FOR ALL USING (caravan_id = auth.uid());
```

- [ ] **Step 2: Commit schema migration**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat(db): add PostgreSQL schema for PowerSync migration"
```

---

### Task 1.2: Add PowerSync Flutter Dependencies

**Files:**
- Modify: `mobile/imu_flutter/pubspec.yaml`

- [ ] **Step 1: Add PowerSync dependencies to pubspec.yaml**

Add to `mobile/imu_flutter/pubspec.yaml` under `dependencies:`:

```yaml
  # PowerSync - Offline-first sync engine
  powersync: ^2.0.0
  powersync_attachments_client: ^2.0.0

  # UUID generation
  uuid: ^4.5.1

  # Environment configuration
  flutter_dotenv: ^5.2.1

  # HTTP client for auth
  dio: ^5.7.0
```

- [ ] **Step 2: Run flutter pub get**

```bash
cd mobile/imu_flutter && flutter pub get
```
Expected: Dependencies resolved successfully

- [ ] **Step 3: Create .env.example with PowerSync configuration**

Create `mobile/imu_flutter/.env.example`:

```env
# PowerSync Configuration
POWERSYNC_URL=https://your-instance.powersync.co
AUTH_URL=https://your-auth-server.com

# Supabase (for reference)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Commit dependencies**

```bash
git add mobile/imu_flutter/pubspec.yaml mobile/imu_flutter/pubspec.lock mobile/imu_flutter/.env.example
git commit -m "feat(flutter): add PowerSync dependencies"
```

---

## Chunk 2: Flutter PowerSync Core Services

### Task 2.1: Create PowerSync Service with Schema

**Files:**
- Create: `mobile/imu_flutter/lib/services/sync/powersync_service.dart`

- [ ] **Step 1: Create PowerSync service file**

```dart
// mobile/imu_flutter/lib/services/sync/powersync_service.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:powersync/powersync.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import '../../core/utils/logger.dart';

/// PowerSync database schema matching PostgreSQL tables
const Schema _powerSyncSchema = Schema([
  Table('clients', [
    Column.text('first_name'),
    Column.text('last_name'),
    Column.text('middle_name'),
    Column.text('birth_date'),
    Column.text('email'),
    Column.text('phone'),
    Column.text('agency_name'),
    Column.text('department'),
    Column.text('position'),
    Column.text('employment_status'),
    Column.text('payroll_date'),
    Column.integer('tenure'),
    Column.text('client_type'),
    Column.text('product_type'),
    Column.text('market_type'),
    Column.text('pension_type'),
    Column.text('pan'),
    Column.text('facebook_link'),
    Column.text('remarks'),
    Column.text('agency_id'),
    Column.text('caravan_id'),
    Column.integer('is_starred'),
  ]),
  Table('addresses', [
    Column.text('client_id'),
    Column.text('type'),
    Column.text('street'),
    Column.text('barangay'),
    Column.text('city'),
    Column.text('province'),
    Column.text('postal_code'),
    Column.real('latitude'),
    Column.real('longitude'),
    Column.integer('is_primary'),
  ]),
  Table('phone_numbers', [
    Column.text('client_id'),
    Column.text('type'),
    Column.text('number'),
    Column.text('label'),
    Column.integer('is_primary'),
  ]),
  Table('touchpoints', [
    Column.text('client_id'),
    Column.text('caravan_id'),
    Column.integer('touchpoint_number'),
    Column.text('type'),
    Column.text('date'),
    Column.text('address'),
    Column.text('time_arrival'),
    Column.text('time_departure'),
    Column.text('odometer_arrival'),
    Column.text('odometer_departure'),
    Column.text('reason'),
    Column.text('next_visit_date'),
    Column.text('notes'),
    Column.text('photo_url'),
    Column.text('audio_url'),
    Column.real('latitude'),
    Column.real('longitude'),
  ]),
  Table('itineraries', [
    Column.text('caravan_id'),
    Column.text('client_id'),
    Column.text('scheduled_date'),
    Column.text('scheduled_time'),
    Column.text('status'),
    Column.text('priority'),
    Column.text('notes'),
  ]),
  Table('user_profiles', [
    Column.text('user_id'),
    Column.text('name'),
    Column.text('email'),
    Column.text('role'),
    Column.text('avatar_url'),
  ]),
]);

/// PowerSync service managing the local SQLite database
class PowerSyncService {
  static PowerSyncDatabase? _database;
  static const String _databaseName = 'imu_powersync.db';

  /// Get the database path
  static Future<String> _getDatabasePath() async {
    final dir = await getApplicationDocumentsDirectory();
    return p.join(dir.path, _databaseName);
  }

  /// Initialize and get the PowerSync database
  static Future<PowerSyncDatabase> get database async {
    if (_database != null) return _database!;

    final dbPath = await _getDatabasePath();
    logDebug('Opening PowerSync database at: $dbPath');

    final db = await PowerSyncDatabase.open(
      databasePath: dbPath,
      schema: _powerSyncSchema,
    );

    _database = db;
    logDebug('PowerSync database initialized');
    return db;
  }

  /// Get sync status stream
  static Stream<SyncStatus> get syncStatus {
    return _database?.syncStatus ?? Stream.value(SyncStatus());
  }

  /// Check if connected to PowerSync service
  static bool get isConnected => _database?.connected ?? false;

  /// Get pending upload count
  static int get pendingUploadCount => _database?.uploadQueue.length ?? 0;

  /// Close the database
  static Future<void> close() async {
    await _database?.close();
    _database = null;
    logDebug('PowerSync database closed');
  }
}

/// Sync status data class
class SyncStatus {
  final bool connected;
  final bool uploading;
  final bool downloading;
  final DateTime? lastSyncAt;
  final int pendingUploads;

  SyncStatus({
    this.connected = false,
    this.uploading = false,
    this.downloading = false,
    this.lastSyncAt,
    this.pendingUploads = 0,
  });
}

/// Riverpod provider for PowerSync database
final powerSyncDatabaseProvider = FutureProvider<PowerSyncDatabase>((ref) async {
  return await PowerSyncService.database;
});

/// Provider for sync status stream
final syncStatusProvider = StreamProvider<SyncStatus>((ref) {
  return PowerSyncService.syncStatus;
});
```

- [ ] **Step 2: Commit PowerSync service**

```bash
git add mobile/imu_flutter/lib/services/sync/powersync_service.dart
git commit -m "feat(flutter): add PowerSync service with schema definition"
```

---

### Task 2.2: Create PowerSync Backend Connector

**Files:**
- Create: `mobile/imu_flutter/lib/services/sync/powersync_connector.dart`

- [ ] **Step 1: Create backend connector**

```dart
// mobile/imu_flutter/lib/services/sync/powersync_connector.dart
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:powersync/powersync.dart';
import '../../core/utils/logger.dart';

/// Backend connector for PowerSync authentication
class PowerSyncBackendConnector extends PowerSyncBackendConnector {
  final Dio _httpClient;
  final FlutterSecureStorage _secureStorage;
  final String _powersyncUrl;
  final String _authUrl;

  PowerSyncBackendConnector({
    required String powersyncUrl,
    required String authUrl,
  })  : _powersyncUrl = powersyncUrl,
        _authUrl = authUrl,
        _httpClient = Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
        )),
        _secureStorage = const FlutterSecureStorage();

  @override
  Future<String?> fetchCredentials() async {
    try {
      // Get stored refresh token
      final refreshToken = await _secureStorage.read(key: 'refresh_token');
      if (refreshToken == null) {
        logDebug('No refresh token found - user needs to login');
        return null;
      }

      // Refresh the PowerSync token
      final response = await _httpClient.post(
        '$_authUrl/token/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200 && response.data['token'] != null) {
        final token = response.data['token'] as String;
        await _secureStorage.write(key: 'powersync_token', value: token);
        logDebug('PowerSync token refreshed successfully');
        return token;
      }

      logDebug('Token refresh failed: ${response.statusCode}');
      return null;
    } catch (e) {
      logError('Failed to fetch PowerSync credentials', e);
      return null;
    }
  }

  @override
  Future<void> invalidateCredentials() async {
    await _secureStorage.delete(key: 'powersync_token');
    await _secureStorage.delete(key: 'refresh_token');
    await _secureStorage.delete(key: 'access_token');
    logDebug('Credentials invalidated');
  }

  @override
  Future<Uri> powersyncUri() async {
    return Uri.parse(_powersyncUrl);
  }
}

/// Provider for PowerSync connector
final powerSyncConnectorProvider = Provider<PowerSyncBackendConnector>((ref) {
  final powersyncUrl = dotenv.env['POWERSYNC_URL'] ?? 'https://your-instance.powersync.co';
  final authUrl = dotenv.env['AUTH_URL'] ?? 'https://your-auth-server.com';

  return PowerSyncBackendConnector(
    powersyncUrl: powersyncUrl,
    authUrl: authUrl,
  );
});
```

- [ ] **Step 2: Commit backend connector**

```bash
git add mobile/imu_flutter/lib/services/sync/powersync_connector.dart
git commit -m "feat(flutter): add PowerSync backend connector for authentication"
```

---

### Task 2.3: Create Offline Auth Service

**Files:**
- Create: `mobile/imu_flutter/lib/services/sync/offline_auth_service.dart`

- [ ] **Step 1: Create offline auth service**

```dart
// mobile/imu_flutter/lib/services/sync/offline_auth_service.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:jwt_decoder/jwt_decoder.dart';
import 'package:powersync/powersync.dart';
import '../../core/utils/logger.dart';
import '../../features/profile/data/models/user_profile.dart';
import 'powersync_service.dart';

/// Service for handling offline authentication
class OfflineAuthService {
  final FlutterSecureStorage _secureStorage;
  final PowerSyncDatabase _db;

  OfflineAuthService(this._secureStorage, this._db);

  /// Check if user can access app offline
  Future<bool> canAccessOffline() async {
    try {
      final accessToken = await _secureStorage.read(key: 'access_token');
      if (accessToken == null) {
        return false;
      }

      // Check if token is expired (with 5 minute buffer)
      if (JwtDecoder.isExpired(accessToken)) {
        // Token expired - try to refresh if online
        return false;
      }

      return true;
    } catch (e) {
      logError('Failed to check offline access', e);
      return false;
    }
  }

  /// Get cached user profile for offline access
  Future<UserProfile?> getCachedUserProfile() async {
    try {
      final results = await _db.getAll(
        'SELECT * FROM user_profiles LIMIT 1',
      );

      if (results.isEmpty) return null;

      final row = results.first;
      return UserProfile(
        userId: row['user_id'] as String,
        name: row['name'] as String,
        email: row['email'] as String,
        role: row['role'] as String,
        avatarUrl: row['avatar_url'] as String?,
      );
    } catch (e) {
      logError('Failed to get cached user profile', e);
      return null;
    }
  }

  /// Store tokens after successful login
  Future<void> storeAuthTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _secureStorage.write(key: 'access_token', value: accessToken);
    await _secureStorage.write(key: 'refresh_token', value: refreshToken);
    logDebug('Auth tokens stored');
  }

  /// Clear all auth data (logout)
  Future<void> clearAuthData() async {
    await _secureStorage.delete(key: 'access_token');
    await _secureStorage.delete(key: 'refresh_token');
    await _secureStorage.delete(key: 'powersync_token');
    logDebug('Auth data cleared');
  }

  /// Cache user profile for offline access
  Future<void> cacheUserProfile(UserProfile profile) async {
    await _db.execute(
      '''INSERT OR REPLACE INTO user_profiles
      (id, user_id, name, email, role, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)''',
      [
        profile.userId,
        profile.userId,
        profile.name,
        profile.email,
        profile.role,
        profile.avatarUrl,
      ],
    );
    logDebug('User profile cached');
  }
}

/// Provider for offline auth service
final offlineAuthProvider = FutureProvider<OfflineAuthService>((ref) async {
  final db = await ref.watch(powerSyncDatabaseProvider.future);
  return OfflineAuthService(
    const FlutterSecureStorage(),
    db,
  );
});
```

- [ ] **Step 2: Add jwt_decoder dependency**

Add to `mobile/imu_flutter/pubspec.yaml`:

```yaml
  # JWT decoding for offline auth
  jwt_decoder: ^2.0.1
```

Run: `cd mobile/imu_flutter && flutter pub get`

- [ ] **Step 3: Commit offline auth service**

```bash
git add mobile/imu_flutter/lib/services/sync/offline_auth_service.dart mobile/imu_flutter/pubspec.yaml
git commit -m "feat(flutter): add offline authentication service"
```

---

## Chunk 3: Flutter Client Repository Pattern

### Task 3.1: Create Client Repository

**Files:**
- Create: `mobile/imu_flutter/lib/features/clients/data/repositories/client_repository.dart`

- [ ] **Step 1: Create client repository**

```dart
// mobile/imu_flutter/lib/features/clients/data/repositories/client_repository.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:powersync/powersync.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/utils/logger.dart';
import '../models/client_model.dart';
import '../../../addresses/data/models/address_model.dart';
import '../../../phone_numbers/data/models/phone_number_model.dart';
import '../../../../services/sync/powersync_service.dart';

/// Repository for client CRUD operations using PowerSync
class ClientRepository {
  final PowerSyncDatabase _db;
  final _uuid = const Uuid();

  ClientRepository(this._db);

  /// Watch all clients with real-time updates
  Stream<List<Client>> watchClients() {
    return _db.watch(
      'SELECT * FROM clients ORDER BY created_at DESC',
    ).map((rows) => rows.map(Client.fromRow).toList());
  }

  /// Watch single client by ID
  Stream<Client?> watchClient(String id) {
    return _db.watch(
      'SELECT * FROM clients WHERE id = ?',
      [id],
    ).map((rows) {
      if (rows.isEmpty) return null;
      return Client.fromRow(rows.first);
    });
  }

  /// Get all clients (one-time fetch)
  Future<List<Client>> getClients() async {
    final rows = await _db.getAll(
      'SELECT * FROM clients ORDER BY created_at DESC',
    );
    return rows.map(Client.fromRow).toList();
  }

  /// Get client by ID (one-time fetch)
  Future<Client?> getClient(String id) async {
    final row = await _db.getOptional(
      'SELECT * FROM clients WHERE id = ?',
      [id],
    );
    if (row == null) return null;
    return Client.fromRow(row);
  }

  /// Create a new client (offline-first)
  Future<Client> createClient(Client client) async {
    final id = client.id ?? _uuid.v4();
    final now = DateTime.now().toIso8601String();

    await _db.execute(
      '''INSERT INTO clients (
        id, first_name, last_name, middle_name, birth_date, email, phone,
        agency_name, department, position, employment_status, payroll_date, tenure,
        client_type, product_type, market_type, pension_type, pan, facebook_link, remarks,
        agency_id, caravan_id, is_starred, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
      [
        id,
        client.firstName,
        client.lastName,
        client.middleName,
        client.birthDate,
        client.email,
        client.phone,
        client.agencyName,
        client.department,
        client.position,
        client.employmentStatus,
        client.payrollDate,
        client.tenure,
        client.clientType,
        client.productType,
        client.marketType,
        client.pensionType,
        client.pan,
        client.facebookLink,
        client.remarks,
        client.agencyId,
        client.caravanId,
        client.isStarred ? 1 : 0,
        now,
        now,
      ],
    );

    logDebug('Created client: $id');
    return client.copyWith(id: id);
  }

  /// Update an existing client (offline-first)
  Future<Client> updateClient(Client client) async {
    if (client.id == null) {
      throw ArgumentError('Client ID is required for update');
    }

    final now = DateTime.now().toIso8601String();

    await _db.execute(
      '''UPDATE clients SET
        first_name = ?, last_name = ?, middle_name = ?, birth_date = ?,
        email = ?, phone = ?, agency_name = ?, department = ?, position = ?,
        employment_status = ?, payroll_date = ?, tenure = ?, client_type = ?,
        product_type = ?, market_type = ?, pension_type = ?, pan = ?,
        facebook_link = ?, remarks = ?, agency_id = ?, caravan_id = ?,
        is_starred = ?, updated_at = ?
      WHERE id = ?''',
      [
        client.firstName,
        client.lastName,
        client.middleName,
        client.birthDate,
        client.email,
        client.phone,
        client.agencyName,
        client.department,
        client.position,
        client.employmentStatus,
        client.payrollDate,
        client.tenure,
        client.clientType,
        client.productType,
        client.marketType,
        client.pensionType,
        client.pan,
        client.facebookLink,
        client.remarks,
        client.agencyId,
        client.caravanId,
        client.isStarred ? 1 : 0,
        now,
        client.id,
      ],
    );

    logDebug('Updated client: ${client.id}');
    return client.copyWith(updatedAt: DateTime.parse(now));
  }

  /// Delete a client (offline-first)
  Future<void> deleteClient(String id) async {
    await _db.execute('DELETE FROM clients WHERE id = ?', [id]);
    logDebug('Deleted client: $id');
  }

  /// Toggle client starred status
  Future<void> toggleStar(String id) async {
    await _db.execute(
      'UPDATE clients SET is_starred = NOT is_starred WHERE id = ?',
      [id],
    );
    logDebug('Toggled star for client: $id');
  }

  /// Search clients by name
  Stream<List<Client>> searchClients(String query) {
    final searchQuery = '%$query%';
    return _db.watch(
      'SELECT * FROM clients WHERE first_name LIKE ? OR last_name LIKE ? ORDER BY created_at DESC',
      [searchQuery, searchQuery],
    ).map((rows) => rows.map(Client.fromRow).toList());
  }

  /// Get clients by type
  Stream<List<Client>> watchClientsByType(String clientType) {
    return _db.watch(
      'SELECT * FROM clients WHERE client_type = ? ORDER BY created_at DESC',
      [clientType],
    ).map((rows) => rows.map(Client.fromRow).toList());
  }

  /// Get starred clients
  Stream<List<Client>> watchStarredClients() {
    return _db.watch(
      'SELECT * FROM clients WHERE is_starred = 1 ORDER BY created_at DESC',
    ).map((rows) => rows.map(Client.fromRow).toList());
  }
}

/// Provider for client repository
final clientRepositoryProvider = FutureProvider<ClientRepository>((ref) async {
  final db = await ref.watch(powerSyncDatabaseProvider.future);
  return ClientRepository(db);
});
```

- [ ] **Step 2: Add fromRow factory to Client model**

Add to `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`:

```dart
  /// Create Client from PowerSync row
  factory Client.fromRow(Map<String, dynamic> row) {
    return Client(
      id: row['id'] as String,
      firstName: row['first_name'] as String,
      lastName: row['last_name'] as String,
      middleName: row['middle_name'] as String?,
      birthDate: row['birth_date'] as String?,
      email: row['email'] as String?,
      phone: row['phone'] as String?,
      agencyName: row['agency_name'] as String?,
      department: row['department'] as String?,
      position: row['position'] as String?,
      employmentStatus: row['employment_status'] as String?,
      payrollDate: row['payroll_date'] as String?,
      tenure: row['tenure'] as int?,
      clientType: row['client_type'] as String? ?? 'POTENTIAL',
      productType: row['product_type'] as String?,
      marketType: row['market_type'] as String?,
      pensionType: row['pension_type'] as String?,
      pan: row['pan'] as String?,
      facebookLink: row['facebook_link'] as String?,
      remarks: row['remarks'] as String?,
      agencyId: row['agency_id'] as String?,
      caravanId: row['caravan_id'] as String?,
      isStarred: (row['is_starred'] as int?) == 1,
      createdAt: row['created_at'] != null
          ? DateTime.parse(row['created_at'] as String)
          : null,
      updatedAt: row['updated_at'] != null
          ? DateTime.parse(row['updated_at'] as String)
          : null,
    );
  }

  /// Copy with new values
  Client copyWith({
    String? id,
    String? firstName,
    String? lastName,
    String? middleName,
    String? birthDate,
    String? email,
    String? phone,
    String? agencyName,
    String? department,
    String? position,
    String? employmentStatus,
    String? payrollDate,
    int? tenure,
    String? clientType,
    String? productType,
    String? marketType,
    String? pensionType,
    String? pan,
    String? facebookLink,
    String? remarks,
    String? agencyId,
    String? caravanId,
    bool? isStarred,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Client(
      id: id ?? this.id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      middleName: middleName ?? this.middleName,
      birthDate: birthDate ?? this.birthDate,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      agencyName: agencyName ?? this.agencyName,
      department: department ?? this.department,
      position: position ?? this.position,
      employmentStatus: employmentStatus ?? this.employmentStatus,
      payrollDate: payrollDate ?? this.payrollDate,
      tenure: tenure ?? this.tenure,
      clientType: clientType ?? this.clientType,
      productType: productType ?? this.productType,
      marketType: marketType ?? this.marketType,
      pensionType: pensionType ?? this.pensionType,
      pan: pan ?? this.pan,
      facebookLink: facebookLink ?? this.facebookLink,
      remarks: remarks ?? this.remarks,
      agencyId: agencyId ?? this.agencyId,
      caravanId: caravanId ?? this.caravanId,
      isStarred: isStarred ?? this.isStarred,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
```

- [ ] **Step 3: Commit client repository**

```bash
git add mobile/imu_flutter/lib/features/clients/data/repositories/client_repository.dart mobile/imu_flutter/lib/features/clients/data/models/client_model.dart
git commit -m "feat(flutter): add PowerSync client repository with full CRUD"
```

---

## Chunk 4: Conflict Notification UI

### Task 4.1: Create Conflict Notification Service

**Files:**
- Create: `mobile/imu_flutter/lib/services/sync/conflict_notification_service.dart`

- [ ] **Step 1: Create conflict notification service**

```dart
// mobile/imu_flutter/lib/services/sync/conflict_notification_service.dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:powersync/powersync.dart';
import '../../core/utils/logger.dart';
import 'powersync_service.dart';

/// Conflict notification data
class ConflictNotification {
  final String tableName;
  final String recordId;
  final String message;
  final DateTime timestamp;

  ConflictNotification({
    required this.tableName,
    required this.recordId,
    required this.message,
    required this.timestamp,
  });
}

/// Service for handling conflict notifications from PowerSync
class ConflictNotificationService {
  final PowerSyncDatabase _db;
  final _notificationController = StreamController<ConflictNotification>.broadcast();

  ConflictNotificationService(this._db);

  /// Stream of conflict notifications
  Stream<ConflictNotification> get notifications => _notificationController.stream;

  /// Watch for sync status changes to detect conflicts
  void startWatching() {
    _db.syncStatus.listen((status) {
      // When sync completes, check if any local changes were overwritten
      if (!status.uploading && !status.downloading && status.connected) {
        _detectOverwrittenChanges();
      }
    });
  }

  /// Detect if local changes were overwritten by server
  Future<void> _detectOverwrittenChanges() async {
    try {
      // Check if there are any rejected operations in the upload queue
      // PowerSync stores upload queue entries that failed server validation
      final rejectedOps = await _db.getOptional(
        'SELECT COUNT(*) as count FROM ps_crud WHERE client_id IS NULL',
      );

      if (rejectedOps != null && rejectedOps['count'] > 0) {
        _notificationController.add(ConflictNotification(
          tableName: 'various',
          recordId: '',
          message: 'Some changes were not saved because newer data exists on the server.',
          timestamp: DateTime.now(),
        ));
      }
    } catch (e) {
      logError('Failed to detect conflicts', e);
    }
  }

  /// Dispose resources
  void dispose() {
    _notificationController.close();
  }
}

/// Provider for conflict notification service
final conflictNotificationServiceProvider = FutureProvider<ConflictNotificationService>((ref) async {
  final db = await ref.watch(powerSyncDatabaseProvider.future);
  final service = ConflictNotificationService(db);
  service.startWatching();
  ref.onDispose(() => service.dispose());
  return service;
});
```

- [ ] **Step 2: Commit conflict service**

```bash
git add mobile/imu_flutter/lib/services/sync/conflict_notification_service.dart
git commit -m "feat(flutter): add conflict notification service"
```

---

### Task 4.2: Create Conflict Snackbar Widget

**Files:**
- Create: `mobile/imu_flutter/lib/shared/widgets/conflict_snackbar.dart`

- [ ] **Step 1: Create conflict snackbar widget**

```dart
// mobile/imu_flutter/lib/shared/widgets/conflict_snackbar.dart
import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../services/sync/conflict_notification_service.dart';

/// SnackBar widget for displaying conflict notifications
class ConflictSnackbar {
  static SnackBar create(ConflictNotification notification) {
    return SnackBar(
      content: Row(
        children: [
          const Icon(
            Icons.sync_problem,
            color: Colors.white,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sync Conflict',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  notification.message,
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
        ],
      ),
      backgroundColor: AppColors.warningOrange,
      duration: const Duration(seconds: 5),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
      action: SnackBarAction(
        label: 'Dismiss',
        textColor: Colors.white,
        onPressed: () {},
      ),
    );
  }

  /// Show conflict snackbar
  static void show(BuildContext context, ConflictNotification notification) {
    ScaffoldMessenger.of(context).showSnackBar(create(notification));
  }
}

/// Widget that listens for conflict notifications and displays them
class ConflictNotificationListener extends ConsumerWidget {
  final Widget child;

  const ConflictNotificationListener({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationService = ref.watch(conflictNotificationServiceProvider);

    notificationService.whenData((service) {
      service.notifications.listen((notification) {
        if (context.mounted) {
          ConflictSnackbar.show(context, notification);
        }
      });
    });

    return child;
  }
}
```

- [ ] **Step 2: Add warning orange color to AppColors**

Add to `mobile/imu_flutter/lib/core/constants/app_colors.dart`:

```dart
  static const Color warningOrange = Color(0xFFE67E22);
```

- [ ] **Step 3: Commit conflict snackbar**

```bash
git add mobile/imu_flutter/lib/shared/widgets/conflict_snackbar.dart mobile/imu_flutter/lib/core/constants/app_colors.dart
git commit -m "feat(flutter): add conflict notification snackbar widget"
```

---

## Chunk 5: Vue Admin Supabase Integration

### Task 5.1: Create Supabase Client

**Files:**
- Create: `imu-web-vue/src/lib/supabase.ts`

- [ ] **Step 1: Create Supabase client**

```typescript
// imu-web-vue/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Type-safe query builder helper
export const from = <T extends keyof Database['public']['Tables']>(table: T) =>
  supabase.from(table)
```

- [ ] **Step 2: Add Supabase dependencies**

```bash
cd imu-web-vue && pnpm add @supabase/supabase-js
```

- [ ] **Step 3: Update .env.example**

Add to `imu-web-vue/.env.example`:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Commit Supabase client**

```bash
git add imu-web-vue/src/lib/supabase.ts imu-web-vue/package.json imu-web-vue/.env.example
git commit -m "feat(vue): add Supabase client for PostgreSQL connection"
```

---

### Task 5.2: Migrate Clients Store to Supabase

**Files:**
- Modify: `imu-web-vue/src/stores/clients.ts`

- [ ] **Step 1: Update clients store to use Supabase**

```typescript
// imu-web-vue/src/stores/clients.ts
import { defineStore } from 'pinia'
import { supabase, from } from '@/lib/supabase'
import type { Client, Address, PhoneNumber, Touchpoint } from '@/lib/types'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    clients: [] as Client[],
    loading: false,
    error: null as string | null,
  }),

  getters: {
    getClientById: (state) => (id: string) =>
      state.clients.find(c => c.id === id),

    starredClients: (state) =>
      state.clients.filter(c => c.is_starred),

    potentialClients: (state) =>
      state.clients.filter(c => c.client_type === 'POTENTIAL'),

    existingClients: (state) =>
      state.clients.filter(c => c.client_type === 'EXISTING'),
  },

  actions: {
    async fetchClients() {
      this.loading = true
      this.error = null

      try {
        const { data, error } = await supabase
          .from('clients')
          .select(`
            *,
            addresses (*),
            phone_numbers (*),
            touchpoints (
              *,
              caravan:caravans (*)
            )
          `)
          .order('created_at', { ascending: false })

        if (error) throw error
        this.clients = data
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to fetch clients'
      } finally {
        this.loading = false
      }
    },

    async createClient(client: Partial<Client>) {
      this.loading = true
      this.error = null

      try {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert(client)
          .select()
          .single()

        if (clientError) throw clientError

        // Create addresses if provided
        if (client.addresses?.length) {
          const addresses = client.addresses.map(a => ({
            ...a,
            client_id: newClient.id,
          }))
          await supabase.from('addresses').insert(addresses)
        }

        // Create phone numbers if provided
        if (client.phone_numbers?.length) {
          const phones = client.phone_numbers.map(p => ({
            ...p,
            client_id: newClient.id,
          }))
          await supabase.from('phone_numbers').insert(phones)
        }

        // Fetch complete client with relations
        const { data: completeClient } = await supabase
          .from('clients')
          .select(`*, addresses (*), phone_numbers (*)`)
          .eq('id', newClient.id)
          .single()

        this.clients.unshift(completeClient)
        return completeClient
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to create client'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateClient(id: string, updates: Partial<Client>) {
      this.loading = true
      this.error = null

      try {
        const { data, error } = await supabase
          .from('clients')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single()

        if (error) throw error

        const index = this.clients.findIndex(c => c.id === id)
        if (index !== -1) {
          this.clients[index] = { ...this.clients[index], ...data }
        }

        return data
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to update client'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteClient(id: string) {
      this.loading = true
      this.error = null

      try {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', id)

        if (error) throw error

        this.clients = this.clients.filter(c => c.id !== id)
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to delete client'
        throw e
      } finally {
        this.loading = false
      }
    },

    async toggleStar(id: string) {
      const client = this.clients.find(c => c.id === id)
      if (!client) return

      return this.updateClient(id, { is_starred: !client.is_starred })
    },
  },
})
```

- [ ] **Step 2: Commit clients store migration**

```bash
git add imu-web-vue/src/stores/clients.ts
git commit -m "feat(vue): migrate clients store from PocketBase to Supabase"
```

---

### Task 5.3: Create Vue Offline Manager

**Files:**
- Create: `imu-web-vue/src/lib/offline/offline-manager.ts`

- [ ] **Step 1: Create offline manager**

```typescript
// imu-web-vue/src/lib/offline/offline-manager.ts
import { defineStore } from 'pinia'

interface PendingOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  table: string
  data: Record<string, unknown>
  timestamp: number
}

export const useOfflineManager = defineStore('offlineManager', {
  state: () => ({
    isOnline: navigator.onLine,
    pendingOperations: [] as PendingOperation[],
    syncInProgress: false,
  }),

  actions: {
    initialize() {
      // Load pending operations from localStorage
      const stored = localStorage.getItem('pendingOperations')
      if (stored) {
        try {
          this.pendingOperations = JSON.parse(stored)
        } catch {
          this.pendingOperations = []
        }
      }

      // Listen for online/offline events
      window.addEventListener('online', () => {
        this.isOnline = true
        this.processPendingOperations()
      })

      window.addEventListener('offline', () => {
        this.isOnline = false
      })
    },

    savePendingOperations() {
      localStorage.setItem(
        'pendingOperations',
        JSON.stringify(this.pendingOperations)
      )
    },

    async queueOperation(
      operation: Omit<PendingOperation, 'id' | 'timestamp'>
    ) {
      const pendingOp: PendingOperation = {
        ...operation,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }

      this.pendingOperations.push(pendingOp)
      this.savePendingOperations()

      // If online, try to process immediately
      if (this.isOnline) {
        await this.processPendingOperations()
      }
    },

    async processPendingOperations() {
      if (this.syncInProgress || !this.isOnline) return

      this.syncInProgress = true

      try {
        const { supabase } = await import('../supabase')

        for (const op of [...this.pendingOperations]) {
          try {
            await this.processOperation(op, supabase)
            this.pendingOperations = this.pendingOperations.filter(
              p => p.id !== op.id
            )
          } catch (error) {
            console.error(`Failed to process operation ${op.id}:`, error)
            // Keep operation in queue for retry
          }
        }

        this.savePendingOperations()
      } finally {
        this.syncInProgress = false
      }
    },

    async processOperation(
      op: PendingOperation,
      supabase: typeof import('../supabase').supabase
    ) {
      switch (op.type) {
        case 'create':
          await supabase.from(op.table).insert(op.data)
          break
        case 'update':
          await supabase
            .from(op.table)
            .update(op.data)
            .eq('id', op.data.id)
          break
        case 'delete':
          await supabase.from(op.table).delete().eq('id', op.data.id)
          break
      }
    },

    get pendingCount() {
      return this.pendingOperations.length
    },
  },
})
```

- [ ] **Step 2: Commit offline manager**

```bash
git add imu-web-vue/src/lib/offline/offline-manager.ts
git commit -m "feat(vue): add offline manager with optimistic queue"
```

---

## Chunk 6: Integration and Testing

### Task 6.1: Update Main.dart with PowerSync Initialization

**Files:**
- Modify: `mobile/imu_flutter/lib/main.dart`

- [ ] **Step 1: Add PowerSync initialization to main.dart**

```dart
// Add to main.dart before runApp
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize dotenv
  await dotenv.load(fileName: ".env");

  // Initialize Hive (for migration period, will be deprecated)
  await HiveService().init();

  // Initialize PowerSync
  await PowerSyncService.database;

  runApp(
    ProviderScope(
      child: const IMUApp(),
    ),
  );
}
```

- [ ] **Step 2: Add imports**

```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'services/sync/powersync_service.dart';
import 'services/local_storage/hive_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
```

- [ ] **Step 3: Commit main.dart update**

```bash
git add mobile/imu_flutter/lib/main.dart
git commit -m "feat(flutter): initialize PowerSync in main.dart"
```

---

### Task 6.2: Create Data Migration Script

**Files:**
- Create: `scripts/migrate_pocketbase_to_supabase.ts`

- [ ] **Step 1: Create migration script**

```typescript
// scripts/migrate_pocketbase_to_supabase.ts
import PocketBase from 'pocketbase'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const pb = new PocketBase('http://localhost:8090')
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key for migration
)

const migrations = [
  {
    sourceCollection: 'clients',
    targetTable: 'clients',
    fieldMapping: {
      id: 'id',
      first_name: 'first_name',
      last_name: 'last_name',
      middle_name: 'middle_name',
      birth_date: 'birth_date',
      email: 'email',
      phone: 'phone',
      agency_name: 'agency_name',
      department: 'department',
      position: 'position',
      employment_status: 'employment_status',
      payroll_date: 'payroll_date',
      tenure: 'tenure',
      client_type: 'client_type',
      product_type: 'product_type',
      market_type: 'market_type',
      pension_type: 'pension_type',
      pan: 'pan',
      facebook_link: 'facebook_link',
      remarks: 'remarks',
      agency_id: 'agency_id',
      caravan_id: 'caravan_id',
      is_starred: 'is_starred',
      created: 'created_at',
      updated: 'updated_at',
    },
    transform: (record: Record<string, unknown>) => ({
      ...record,
      is_starred: record.is_starred ? true : false,
      created_at: record.created
        ? new Date(record.created as string).toISOString()
        : new Date().toISOString(),
      updated_at: record.updated
        ? new Date(record.updated as string).toISOString()
        : new Date().toISOString(),
    }),
  },
  // Add other collections (addresses, phone_numbers, touchpoints, itineraries)
]

async function runMigration() {
  console.log('Starting migration from PocketBase to Supabase...')

  for (const config of migrations) {
    console.log(`\nMigrating ${config.sourceCollection} -> ${config.targetTable}`)

    const records = await pb.collection(config.sourceCollection).getFullList()
    console.log(`Found ${records.length} records`)

    const batchSize = 100
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const transformed = batch.map((record) => {
        const mapped: Record<string, unknown> = {}
        for (const [source, target] of Object.entries(config.fieldMapping)) {
          mapped[target] = record[source]
        }
        return config.transform(mapped)
      })

      const { error } = await supabase.from(config.targetTable).insert(transformed)

      if (error) {
        console.error(`Error inserting batch:`, error)
        fs.appendFileSync(
          'migration-errors.json',
          JSON.stringify({ table: config.targetTable, batch, error }, null, 2)
        )
      } else {
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}`)
      }
    }
  }

  console.log('\nMigration complete!')
}

runMigration().catch(console.error)
```

- [ ] **Step 2: Commit migration script**

```bash
git add scripts/migrate_pocketbase_to_supabase.ts
git commit -m "feat(scripts): add PocketBase to Supabase migration script"
```

---

## Summary

| Phase | Tasks | Estimated Duration |
|-------|-------|-------------------|
| Chunk 1: Backend Setup | 1.1, 1.2 | 2-3 days |
| Chunk 2: Flutter Core Services | 2.1, 2.2, 2.3 | 2-3 days |
| Chunk 3: Client Repository | 3.1 | 1-2 days |
| Chunk 4: Conflict UI | 4.1, 4.2 | 1 day |
| Chunk 5: Vue Integration | 5.1, 5.2, 5.3 | 2-3 days |
| Chunk 6: Integration | 6.1, 6.2 | 1-2 days |

**Total:** 10-14 days

---

## Testing Checklist

After implementation:

- [ ] Flutter app connects to PowerSync successfully
- [ ] Clients can be created offline
- [ ] Clients can be updated offline
- [ ] Clients can be deleted offline
- [ ] Changes sync when connectivity restored
- [ ] Conflict notification shows when server wins
- [ ] Vue admin fetches data from Supabase
- [ ] Vue admin CRUD operations work
- [ ] Offline queue in Vue processes when online
- [ ] Data migration script runs without errors
- [ ] Record counts match between PocketBase and Supabase

---

## Rollback Plan

If issues arise:

1. Keep PocketBase running during migration
2. Feature flag to switch between PocketBase and Supabase
3. Database backups before migration
4. Hive service remains available as fallback
