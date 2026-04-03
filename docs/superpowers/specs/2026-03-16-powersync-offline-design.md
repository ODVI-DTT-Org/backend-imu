# IMU Full Offline Support Design Specification

**Date:** 2026-03-16
**Status:** Draft
**Author:** Claude Code Assistant

---

## Overview

This document specifies the implementation of full offline support for the IMU mobile and web applications using PowerSync + PostgreSQL.

### Goals
- Full offline CRUD support for all entities (Clients, Touchpoints, Itinerary)
- Automatic background sync with conflict UI
- Server-wins conflict resolution
- Seamless mobile + web compatibility

### Non-Goals
- Real-time collaboration features
- Complex merge conflict resolution
- Offline authentication (requires online login initially)

---

## Architecture

### Current State
```
┌─────────────────┐
│  Flutter App     │
│  (Hive storage)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PocketBase     │
│   (Go backend)   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   Vue Admin      │
│   (Pinia store)  │
└─────────────────┘
```

### Target State
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flutter App     │────▶│ PowerSync Service │◀────│  PostgreSQL DB  │
│  (SQLite local)  │     │ (Offline-first   │     │ (Primary data   │
│                  │     │  sync engine)    │     │  store)         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vue Admin      │────▶│ PowerSync Service │◀────│  PostgreSQL DB  │
│  (Pinia store)   │     │ (Same sync engine)│     │  (Same DB)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Technology Stack

### Backend
- **PostgreSQL 15+** - Primary database
- **Supabase** (recommended) or self-hosted PostgreSQL
- **PowerSync** - Offline-first sync engine

### Mobile (Flutter)
- **PowerSync SDK** - Offline-first data sync
- **SQLite** - Local database (managed by PowerSync)
- **Riverpod** - State management

### Web (Vue)
- **Supabase JS SDK** - Database client
- **Pinia** - State management
- **TanStack Query** - Server state management (optional)

---

## Database Schema

### PostgreSQL Schema

```sql
-- Migration: 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Create indexes (PostgreSQL requires separate statements)
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

-- Caravans table (field agents)
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

-- Note: PowerSync manages its own internal metadata tables.
-- Do not create custom sync tracking tables.

-- Updated_at trigger for all tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_touchpoints_updated_at BEFORE UPDATE ON touchpoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON itineraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Flutter Implementation

### Dependencies

```yaml
# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter

  # PowerSync
  powersync: ^2.0.0
  powersync_attachments_client: ^2.0.0

  # PostgreSQL client
  postgres: ^3.0.0

  # State management
  flutter_riverpod: ^2.4.0

  # UUID generation
  uuid: ^4.0.0

  # Connectivity
  connectivity_plus: ^6.0.0

  # Environment
  flutter_dotenv: ^5.0.0
```

### PowerSync Configuration

```dart
// lib/services/sync/powersync_service.dart
import 'package:powersync/powersync.dart';
import 'package:sqlite3/sqlite3.dart';

class PowerSyncService {
  static PowerSyncDatabase? _database;

  static const String _host = String.fromEnvironment(
    'POWERSYNC_HOST',
    defaultValue: 'https://your-powersync-instance.com',
  );

  static Future<PowerSyncDatabase> get database async {
    if (_database != null) return _database!;

    final db = await PowerSyncDatabase.open(
      databasePath: await _getDatabasePath(),
      schema: _schema,
    );

    _database = db;
    return db;
  }

  static const Schema _schema = Schema([
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
  ]);
}
```

### Client Repository Pattern

```dart
// lib/features/clients/data/repositories/client_repository.dart
import 'package:powersync/powersync.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'client_repository.g.dart';

@riverpod
ClientRepository clientRepository(ClientRepositoryRef ref) {
  return ClientRepository(ref.watch(powerSyncServiceProvider));
}

class ClientRepository {
  final PowerSyncDatabase _db;

  ClientRepository(this._db);

  // Watch all clients with real-time updates
  Stream<List<Client>> watchClients() {
    return _db.watch(
      'SELECT * FROM clients ORDER BY created_at DESC',
    ).map((rows) => rows.map(Client.fromRow));
  }

  // Watch single client with relations
  Stream<Client?> watchClient(String id) {
    return _db.watch(
      'SELECT * FROM clients WHERE id = ?',
      [id],
    ).map((rows) {
      if (rows.isEmpty) return null;
      return Client.fromRow(rows.first);
    });
  }

  // Create client (offline-first)
  Future<Client> createClient(Client client) async {
    final id = client.id ?? uuid.v4();
    final now = DateTime.now().toIso8601String();

    await _db.execute(
      '''INSERT INTO clients (
        id, first_name, last_name, middle_name, birth_date, email, phone,
        agency_name, department, position, employment_status, payroll_date, tenure,
        client_type, product_type, market_type, pension_type, pan, facebook_link, remarks,
        agency_id, caravan_id, is_starred, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
      [
        id, client.firstName, client.lastName, client.middleName, client.birthDate, client.email, client.phone,
        client.agencyName, client.department, client.position, client.employmentStatus, client.payrollDate, client.tenure,
        client.clientType, client.productType, client.marketType, client.pensionType, client.pan, client.facebookLink, client.remarks,
        client.agencyId, client.caravanId, client.isStarred ? 1 : 0, now, now,
      ],
    );

    return client.copyWith(id: id, createdAt: DateTime.parse(now));
  }

  // Update client (offline-first)
  Future<Client> updateClient(Client client) async {
    final now = DateTime.now().toIso8601String();

    await _db.execute(
      '''UPDATE clients SET
        first_name = ?, last_name = ?, middle_name = ?, birth_date = ?, email = ?, phone = ?,
        agency_name = ?, department = ?, position = ?, employment_status = ?, payroll_date = ?, tenure = ?,
        client_type = ?, product_type = ?, market_type = ?, pension_type = ?, pan = ?, facebook_link = ?, remarks = ?,
        agency_id = ?, caravan_id = ?, is_starred = ?, updated_at = ?
      WHERE id = ?''',
      [
        client.firstName, client.lastName, client.middleName, client.birthDate, client.email, client.phone,
        client.agencyName, client.department, client.position, client.employmentStatus, client.payrollDate, client.tenure,
        client.clientType, client.productType, client.marketType, client.pensionType, client.pan, client.facebookLink, client.remarks,
        client.agencyId, client.caravanId, client.isStarred ? 1 : 0, now,
        client.id,
      ],
    );

    return client.copyWith(updatedAt: DateTime.parse(now));
  }

  // Delete client (offline-first)
  Future<void> deleteClient(String id) async {
    await _db.execute('DELETE FROM clients WHERE id = ?', [id]);
  }
}
```

### Sync Queue Integration

```dart
// lib/services/sync/sync_queue_service.dart
import 'dart:async';
import 'package:powersync/powersync.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SyncQueueService {
  final PowerSyncDatabase _db;
  final Connectivity _connectivity;
  StreamSubscription? _connectivitySubscription;
  StreamSubscription? _syncStatusSubscription;
  bool _isSyncing = false;

  SyncQueueService(this._db, this._connectivity);

  Future<void> initialize() async {
    // Listen for connectivity changes
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((results) {
      if (!results.contains(ConnectivityResult.none)) {
        _triggerSync();
      }
    });

    // Watch sync status changes
    _syncStatusSubscription = _db.syncStatus.listen((status) {
      if (status.connected && status.uploading == false && _hasPendingUploads()) {
        _triggerSync();
      }
    });

    // Initial sync if online
    final connectivityResult = await _connectivity.checkConnectivity();
    if (!connectivityResult.contains(ConnectivityResult.none)) {
      await _triggerSync();
    }
  }

  bool _hasPendingUploads() {
    // PowerSync automatically tracks pending uploads
    // We can check the upload queue length
    return _db.uploadQueue.isNotEmpty;
  }

  Future<void> _triggerSync() async {
    if (_isSyncing) return;

    _isSyncing = true;
    try {
      // PowerSync handles upload queue processing automatically
      // This method can trigger manual sync if needed
      await _db.uploadQueue.process();
    } catch (e) {
      logError('Sync failed: $e');
    } finally {
      _isSyncing = false;
    }
  }

  // Force sync (user-initiated)
  Future<void> forceSync() async {
    await _triggerSync();
  }

  // Get pending upload count for UI
  int get pendingUploadCount => _db.uploadQueue.length;

  void dispose() {
    _connectivitySubscription?.cancel();
    _syncStatusSubscription?.cancel();
  }
}

// Riverpod provider
final syncQueueServiceProvider = Provider<SyncQueueService>((ref) {
  final db = ref.watch(powerSyncDatabaseProvider);
  final connectivity = Connectivity();
  return SyncQueueService(db, connectivity);
});
```

### Conflict Detection & UI

PowerSync uses a server-side conflict resolution strategy configured in the PowerSync service. For server-wins resolution, conflicts are automatically resolved before data reaches the client.

```dart
// lib/services/sync/conflict_notification_service.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  ConflictNotificationService(this._db);

  /// Watch for sync status changes to detect conflicts
  Stream<ConflictNotification?> watchForConflicts() {
    return _db.syncStatus.map((status) {
      // When sync completes, check if any local changes were overwritten
      if (status.uploading == false && status.downloading == false) {
        // PowerSync resolves conflicts server-side
        // We detect this by watching for records where our changes disappeared
        return _detectOverwrittenChanges();
      }
      return null;
    }).where((notification) => notification != null);
  }

  Future<ConflictNotification?> _detectOverwrittenChanges() async {
    // Check if any pending uploads were rejected due to conflicts
    // PowerSync logs rejected uploads - we can query them
    final rejectedOps = await _db.getOptional(
      'SELECT COUNT(*) as count FROM ps_crud WHERE client_id IS NULL',
    );

    if (rejectedOps != null && rejectedOps['count'] > 0) {
      return ConflictNotification(
        tableName: 'various',
        recordId: '',
        message: 'Some changes were not saved because newer data exists on the server.',
        timestamp: DateTime.now(),
      );
    }
    return null;
  }
}

// Conflict notification snackbar widget
class ConflictSnackbar extends StatelessWidget {
  final ConflictNotification notification;

  const ConflictSnackbar({super.key, required this.notification});

  @override
  Widget build(BuildContext context) {
    return SnackBar(
      content: Row(
        children: [
          Icon(Icons.sync_problem, color: Colors.orange),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              notification.message,
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      backgroundColor: Colors.orange.shade800,
      duration: Duration(seconds: 5),
      action: SnackBarAction(
        label: 'Dismiss',
        textColor: Colors.white,
        onPressed: () {},
      ),
    );
  }
}
```

---

## PowerSync Backend Connector

The backend connector handles authentication and data sync between the Flutter app and PostgreSQL.

```dart
// lib/services/sync/powersync_backend_connector.dart
import 'package:powersync/powersync.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
        _httpClient = Dio(),
        _secureStorage = const FlutterSecureStorage();

  @override
  Future<String?> fetchCredentials() async {
    try {
      // Get stored refresh token
      final refreshToken = await _secureStorage.read(key: 'refresh_token');
      if (refreshToken == null) {
        return null;
      }

      // Refresh the PowerSync token
      final response = await _httpClient.post(
        '$_authUrl/token/refresh',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200) {
        final token = response.data['token'];
        await _secureStorage.write(key: 'powersync_token', value: token);
        return token;
      }

      return null;
    } catch (e) {
      logError('Failed to fetch PowerSync credentials: $e');
      return null;
    }
  }

  @override
  Future<void> invalidateCredentials() async {
    await _secureStorage.delete(key: 'powersync_token');
    await _secureStorage.delete(key: 'refresh_token');
  }

  @override
  Future<Uri> powersyncUri() async {
    return Uri.parse(_powersyncUrl);
  }
}

// Provider
final powerSyncConnectorProvider = Provider<PowerSyncBackendConnector>((ref) {
  return PowerSyncBackendConnector(
    powersyncUrl: const String.fromEnvironment(
      'POWERSYNC_URL',
      defaultValue: 'https://your-powersync-instance.powersync.co',
    ),
    authUrl: const String.fromEnvironment(
      'AUTH_URL',
      defaultValue: 'https://your-auth-server.com',
    ),
  );
});
```

---

## Offline Authentication Strategy

### Overview

The app uses a **token-based offline authentication** strategy that allows users to access the app offline after an initial online login.

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     ONLINE AUTHENTICATION                        │
├─────────────────────────────────────────────────────────────────┤
│  1. User enters email + password                                 │
│  2. Server validates credentials                                 │
│  3. Server returns:                                              │
│     - Access token (short-lived, e.g., 1 hour)                   │
│     - Refresh token (long-lived, e.g., 30 days)                  │
│     - User profile data                                          │
│  4. Tokens stored securely in flutter_secure_storage             │
│  5. User profile cached in SQLite (via PowerSync)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OFFLINE ACCESS                               │
├─────────────────────────────────────────────────────────────────┤
│  1. Check for cached tokens in secure storage                    │
│  2. Validate token expiry locally (JWT decode)                   │
│  3. If token valid: Allow access to cached data                  │
│  4. If token expired: Require re-authentication                  │
│  5. Load user profile from local SQLite                          │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

```dart
// lib/services/auth/offline_auth_service.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:jwt_decoder/jwt_decoder.dart';

class OfflineAuthService {
  final FlutterSecureStorage _secureStorage;
  final PowerSyncDatabase _db;

  OfflineAuthService(this._secureStorage, this._db);

  /// Check if user can access app offline
  Future<bool> canAccessOffline() async {
    final token = await _secureStorage.read(key: 'access_token');
    if (token == null) return false;

    // Check if token is expired
    if (JwtDecoder.isExpired(token)) {
      // Try to refresh token if online
      final refreshed = await _tryRefreshToken();
      return refreshed;
    }

    return true;
  }

  Future<bool> _tryRefreshToken() async {
    final refreshToken = await _secureStorage.read(key: 'refresh_token');
    if (refreshToken == null) return false;

    // Check if refresh token is also expired
    if (JwtDecoder.isExpired(refreshToken)) {
      return false;
    }

    // Would attempt server refresh if online
    // For now, return false to require re-login
    return false;
  }

  /// Get cached user profile for offline access
  Future<UserProfile?> getCachedUserProfile() async {
    final results = await _db.getAll(
      'SELECT * FROM user_profiles LIMIT 1',
    );

    if (results.isEmpty) return null;
    return UserProfile.fromRow(results.first);
  }

  /// Store tokens after successful login
  Future<void> storeAuthTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _secureStorage.write(key: 'access_token', value: accessToken);
    await _secureStorage.write(key: 'refresh_token', value: refreshToken);
  }

  /// Clear all auth data (logout)
  Future<void> clearAuthData() async {
    await _secureStorage.delete(key: 'access_token');
    await _secureStorage.delete(key: 'refresh_token');
    await _secureStorage.delete(key: 'powersync_token');
  }
}

// Token refresh threshold (refresh 5 minutes before expiry)
const tokenRefreshThreshold = Duration(minutes: 5);
```

### Session Management

| Aspect | Online | Offline |
|--------|--------|---------|
| Token Storage | SecureStorage | SecureStorage |
| Token Validation | Server-side | Local JWT decode |
| Session Timeout | 8 hours | Until token expires |
| Auto-Logout | On token expiry | On token expiry |
| PIN/Biometric | Required | Required |

---

## Vue Admin Offline Support

The Vue admin app uses a **different strategy** since it's primarily a web application:

### Strategy: Optimistic UI with Server Sync

```typescript
// src/lib/offline/offline-manager.ts
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
        this.pendingOperations = JSON.parse(stored)
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

    async queueOperation(operation: Omit<PendingOperation, 'id' | 'timestamp'>) {
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
        for (const op of [...this.pendingOperations]) {
          await this.processOperation(op)
          this.pendingOperations = this.pendingOperations.filter(p => p.id !== op.id)
        }
      } finally {
        this.syncInProgress = false
        this.savePendingOperations()
      }
    },

    async processOperation(op: PendingOperation) {
      const { supabase } = await import('@/lib/supabase')

      switch (op.type) {
        case 'create':
          await supabase.from(op.table).insert(op.data)
          break
        case 'update':
          await supabase.from(op.table).update(op.data).eq('id', op.data.id)
          break
        case 'delete':
          await supabase.from(op.table).delete().eq('id', op.data.id)
          break
      }
    },

    savePendingOperations() {
      localStorage.setItem('pendingOperations', JSON.stringify(this.pendingOperations))
    },

    get pendingCount() {
      return this.pendingOperations.length
    },
  },
})
```

### Vue Admin Offline Capabilities

| Feature | Supported | Notes |
|---------|-----------|-------|
| View cached data | Yes | Via browser cache |
| Create records | Limited | Queued to localStorage |
| Update records | Limited | Queued to localStorage |
| Delete records | Limited | Queued to localStorage |
| File uploads | No | Requires online |
| Real-time updates | No | Requires online |

---

## Data Migration Strategy

### Migrating from PocketBase to PostgreSQL

```typescript
// scripts/migrate-pocketbase-to-supabase.ts
import PocketBase from 'pocketbase'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const pb = new PocketBase('http://localhost:8090')
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface MigrationConfig {
  sourceCollection: string
  targetTable: string
  fieldMapping: Record<string, string>
  transform?: (record: any) => any
}

const migrations: MigrationConfig[] = [
  {
    sourceCollection: 'clients',
    targetTable: 'clients',
    fieldMapping: {
      id: 'id',
      first_name: 'first_name',
      last_name: 'last_name',
      // ... map all fields
      created: 'created_at',
      updated: 'updated_at',
    },
    transform: (record) => ({
      ...record,
      // Convert PocketBase date format to ISO8601
      created_at: new Date(record.created).toISOString(),
      updated_at: new Date(record.updated).toISOString(),
    }),
  },
  {
    sourceCollection: 'addresses',
    targetTable: 'addresses',
    fieldMapping: {
      id: 'id',
      client: 'client_id', // PocketBase relation field
      // ... other fields
    },
  },
  // ... other collections
]

async function runMigration() {
  console.log('Starting migration from PocketBase to Supabase...')

  for (const config of migrations) {
    console.log(`\nMigrating ${config.sourceCollection} -> ${config.targetTable}`)

    // Fetch all records from PocketBase
    const records = await pb.collection(config.sourceCollection).getFullList({
      expand: Object.keys(config.fieldMapping).filter(f => f !== 'id'),
    })

    console.log(`Found ${records.length} records`)

    // Transform and insert into Supabase
    const transformedRecords = records.map(record => {
      const transformed: Record<string, any> = {}

      for (const [sourceField, targetField] of Object.entries(config.fieldMapping)) {
        transformed[targetField] = record[sourceField]
      }

      if (config.transform) {
        Object.assign(transformed, config.transform(record))
      }

      return transformed
    })

    // Insert in batches of 100
    const batchSize = 100
    for (let i = 0; i < transformedRecords.length; i += batchSize) {
      const batch = transformedRecords.slice(i, i + batchSize)

      const { error } = await supabase
        .from(config.targetTable)
        .insert(batch)

      if (error) {
        console.error(`Error inserting batch ${i / batchSize}:`, error)
        // Save failed batch for manual review
        fs.appendFileSync(
          'migration-errors.json',
          JSON.stringify({ table: config.targetTable, batch, error }, null, 2)
        )
      } else {
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transformedRecords.length / batchSize)}`)
      }
    }
  }

  console.log('\nMigration complete!')
}

runMigration().catch(console.error)
```

### Migration Checklist

- [ ] Backup PocketBase data (`pb_data` folder)
- [ ] Export PocketBase schema
- [ ] Create PostgreSQL tables
- [ ] Run migration script
- [ ] Verify record counts match
- [ ] Spot-check data integrity
- [ ] Update Flutter app to use PowerSync
- [ ] Update Vue app to use Supabase
- [ ] Decommission PocketBase

---

## Environment Configuration

### Flutter (.env)

```env
# PowerSync Configuration
POWERSYNC_URL=https://your-instance.powersync.co
POWERSYNC_TOKEN=

# Authentication
AUTH_URL=https://your-auth-server.com

# Supabase (for reference)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Vue Admin (.env)

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# PowerSync (for future use)
VITE_POWERSYNC_URL=https://your-instance.powersync.co
```

---

## Vue Admin Implementation

### Supabase Client

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type-safe query builder
export const from = <T extends string>(table: T) => supabase.from(table)
```

### Clients Store

```typescript
// src/stores/clients.ts
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { Client, ClientInsert, Address, PhoneNumber, Touchpoint } from '@/lib/types'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    clients: [] as Client[],
    loading: false,
    error: null as string | null,
    pendingSync: 0,
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

    async createClient(client: ClientInsert) {
      this.loading = true
      this.error = null

      try {
        // Create client
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

---

## Compatibility Matrix

### Mobile vs Web vs Database

| Feature | Flutter (Mobile) | Vue (Web) | PostgreSQL |
|---------|------------------|-----------|------------|
| **Local Storage** | SQLite (via PowerSync) | Browser localStorage + IndexedDB | N/A |
| **Primary Data Store** | SQLite | PostgreSQL | PostgreSQL |
| **Offline Support** | Full CRUD | Optimistic UI with queue | N/A |
| **Sync Engine** | PowerSync | Supabase client + offline manager | N/A |
| **Conflict Resolution** | Server wins (PowerSync) | Server wins (Supabase) | N/A |
| **Real-time Updates** | PowerSync watch | Supabase realtime | LISTEN/NOTIFY |
| **File Uploads** | PowerSync attachments | Supabase storage | S3-compatible |

### Vue Admin Offline Details

The Vue admin supports **optimistic offline operations** for a better UX:

1. **Online Mode**: Operations go directly to Supabase
2. **Offline Mode**: Operations queued in localStorage, processed when online
3. **Conflict Handling**: Server-wins with toast notification
4. **Limitations**: No offline file uploads, no complex transactions

### Data Type Compatibility

| PostgreSQL | SQLite (Flutter) | TypeScript (Vue) | Notes |
|------------|------------------|------------------|-------|
| UUID | TEXT | string | Compatible |
| TIMESTAMPTZ | TEXT (ISO8601) | string | Compatible |
| INTEGER | INTEGER | number | Compatible |
| DECIMAL | REAL | number | Minor precision loss |
| TEXT | TEXT | string | Compatible |
| BOOLEAN | INTEGER (0/1) | boolean | Needs conversion |
| JSONB | TEXT (JSON string) | object | Needs parsing |

---

## Migration Plan

### Phase 1: Backend Setup (2-3 days)
1. Set up PostgreSQL/Supabase project
2. Create database schema with migrations
3. Deploy PowerSync service
4. Configure authentication

### Phase 2: Data Migration (1-2 days)
1. Backup PocketBase data
2. Run migration script (see Data Migration Strategy section)
3. Verify data integrity
4. Test queries in PostgreSQL

### Phase 3: Flutter Migration (3-4 days)
1. Add PowerSync dependency
2. Create schema definitions
3. Migrate providers to use PowerSync
4. Remove PocketBase client code
5. Implement sync queue
6. Implement offline auth

### Phase 4: Sync Implementation (2-3 days)
1. Implement upload queue
2. Add conflict detection
3. Build conflict UI
4. Implement background sync

### Phase 5: Vue Admin Migration (2-3 days)
1. Migrate from PocketBase to Supabase client
2. Implement optimistic UI with offline queue
3. Update stores
4. Update API services
5. Remove PocketBase references

### Phase 6: Testing & Polish (1-2 days)
1. End-to-end testing
2. Conflict UI polish
3. Performance optimization
4. Documentation
5. Decommission PocketBase

**Total Estimated Duration:** 12-18 days

---

## Risk Mitigation

### Risk 1: Data Loss During Migration
**Mitigation:**
- Create full backup of PocketBase data
- Run migration in staging environment first
- Implement rollback procedure
- Test with subset of data first

### Risk 2: Sync Conflicts
**Mitigation:**
- Server-wins resolution is simple and predictable
- Clear user notification when changes are discarded
- Option to view discarded changes
- Manual re-apply capability

### Risk 3: Performance Issues
**Mitigation:**
- Implement pagination for large datasets
- Use incremental sync (only changes since last sync)
- Add sync progress UI
- Background sync with low priority

### Risk 4: Offline File Uploads
**Mitigation:**
- Store files locally first
- Queue file uploads separately
- Retry failed uploads automatically
- Show upload status in UI

---

## Success Criteria

1. **Full Offline CRUD:** Users can create, edit, and delete clients, touchpoints, and itineraries while offline
2. **Automatic Sync:** Changes sync automatically when connectivity is restored
3. **Conflict Handling:** Conflicts are detected and resolved with clear user notification
4. **Data Consistency:** Mobile and web apps show consistent data after sync
5. **Performance:** Sync operations complete within 5 seconds for typical datasets
6. **User Experience:** Offline indicator and sync status are clearly visible

---

## Next Steps

1. Review and approve this design specification
2. Set up Supabase project
3. Create implementation plan
4. Begin Phase 1 implementation
