---
title: Geofencing Proximity Notifications for Caravan Agents
date: 2026-05-15
status: draft
owner: itranario@oakdriveventures.com
---

# Geofencing Proximity Notifications

## 1. Problem

Caravan field agents visit clients across wide geographic areas. Currently, agents have no way of knowing when they are physically near a client who hasn't been visited yet. This means nearby clients are often missed during field days, requiring additional trips later. The team wants agents to be automatically notified when they enter a client's vicinity so they can act on the opportunity in real time.

## 2. Goal

When a caravan agent moves within 400 meters of any active, non-released client's home location, their Android device fires a local notification showing the client's name, address, and distance, with action buttons to navigate to the client, add them to the day's itinerary, or dismiss. A 16-hour per-client cooldown prevents notification spam. Clients with `loan_released = true` (EXISTING category) are excluded — consistent with the existing rule that touchpoints are disabled for released-loan clients.

## 3. Scope

In scope:
- A new `GEOCODE_CLIENTS` background job that geocodes client addresses using standardized PSGC names (via existing `psgc_id`) + Mapbox Geocoding API, storing coordinates in the `clients` table.
- Auto-geocoding when a new client is created or their address is updated.
- PowerSync sync of `latitude` and `longitude` columns to mobile devices.
- A new `GeofencingService` in the Flutter app that checks proximity on every 10m GPS movement update.
- Local push notifications with three action buttons: Navigate Now, Add to Itinerary, Dismiss.
- 16-hour cooldown per client, stored in `SharedPreferences` on-device.

Out of scope:
- Server-side geofencing or FCM push notifications.
- Background location tracking when the app is closed.
- Per-client configurable radius (fixed at 400m for v1).
- Web admin changes.
- Flutter iOS platform — Android only for v1 (iOS background notification actions require additional entitlements).

## 4. Architecture Overview

```
Phase 1 — Geocoding (Backend, one-time + ongoing)
  Existing clients → PSGC ID lookup → Mapbox API → lat/lng stored in clients table

Phase 2 — Coordinate Sync (PowerSync, automatic)
  clients.latitude + clients.longitude sync to device alongside existing client data

Phase 3 — Geofencing + Notification (Flutter, on-device, fully offline)
  GeofencingService owns its own Geolocator stream (10m filter)
    → checks bounding-box-filtered synced clients
    → within 400m + cooldown clear → local notification
    → agent taps action → itinerary update + optional map navigation
```

## 5. Phase 1: Geocoding Pipeline

### 5.1 Schema migration

New migration (`052_add_geocoding_to_clients.sql`):

```sql
ALTER TABLE clients
  ADD COLUMN latitude        DOUBLE PRECISION,
  ADD COLUMN longitude       DOUBLE PRECISION,
  ADD COLUMN geocoded_at     TIMESTAMPTZ,
  ADD COLUMN geocode_status  TEXT DEFAULT 'pending';
  -- geocode_status values: 'pending' | 'success' | 'failed' | 'skipped'
```

### 5.2 GEOCODE_CLIENTS job

A new job type `GEOCODE_CLIENTS` added to a new `GeocodingJobType` enum in `job-types.ts`. The handler lives at `backend-imu/src/queues/handlers/geocode-clients-handler.ts`.

Processing steps per client:
1. Pull batch of 50 clients where `geocode_status = 'pending'` ordered by `created_at ASC`.
2. Use the client's existing `psgc_id` (already populated by the `LocationAssignmentsProcessor`) to look up standardized `(region, province, city_municipality, barangay)` names from the `psgc` table. If `psgc_id` is null, fall back to the raw `(province, municipality, barangay)` fields.
3. Construct the geocoding query string: `{barangay}, {municipality}, {province}, Philippines`.
4. Call Mapbox Geocoding API (`/geocoding/v5/mapbox.places/{query}.json`) with bounding box biased to the Philippines (`bbox=116.9,4.6,126.6,21.1`).
5. If confidence score ≥ 0.5 and result is within the Philippines bounding box → store `latitude`, `longitude`, `geocoded_at = NOW()`, `geocode_status = 'success'`.
6. If no result or low confidence → `geocode_status = 'failed'`. Failed clients can be retried by re-setting status to `pending` via an admin action (future work).
7. If `province`, `municipality`, and `barangay` are all empty → `geocode_status = 'skipped'`.

Rate limiting: 300ms delay between Mapbox calls to respect the free-tier rate limit (600 requests/minute).

### 5.3 Trigger points

- **Initial backfill**: The job is enqueued once on deployment for all existing clients with `geocode_status = 'pending'`.
- **New client or address update (REST path)**: After `POST /api/clients` or when `province`, `municipality`, `barangay`, or `full_address` changes on `PATCH /api/clients/:id`, `geocode_status` is reset to `'pending'` and a geocoding job is queued.
- **New client or address update (PowerSync path)**: Manager roles (admin, area_manager, assistant_area_manager) write clients directly to local SQLite via PowerSync's CRUD queue, which syncs to the backend database without going through the REST endpoints above. To cover this path, a Postgres trigger fires on `clients` INSERT or address-field UPDATE and enqueues a geocoding job:

```sql
CREATE OR REPLACE FUNCTION notify_geocode_needed() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR
     (OLD.province IS DISTINCT FROM NEW.province OR
      OLD.municipality IS DISTINCT FROM NEW.municipality OR
      OLD.barangay IS DISTINCT FROM NEW.barangay) THEN
    NEW.geocode_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_geocode_clients
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION notify_geocode_needed();
```

The trigger resets `geocode_status` to `'pending'`; the existing background job processor polls for `geocode_status = 'pending'` clients and handles the rest. No separate notification channel is needed.

### 5.4 PowerSync sync rule update

Add `latitude` and `longitude` to the existing clients sync rule in `backend-imu/src/sync/sync-rules.yaml` (or equivalent). No new sync bucket needed — they join the existing `clients` bucket.

## 6. Phase 2: On-Device Geofencing (Flutter)

### 6.1 GeofencingService

New file: `frontend-mobile-imu/imu_flutter/lib/services/geofencing/geofencing_service.dart`

> **Location service note:** The project has multiple location service files (`location_tracking_service.dart`, `location_service.dart`, `enhanced_location_service.dart`, `geolocation_service.dart`). `GeofencingService` does NOT depend on any of them — it starts its own `Geolocator.getPositionStream` directly. Permission checking should reuse `location_tracking_service.dart`'s `checkLocationPermission()` as it is the most complete implementation.

```
GeofencingService
  - starts its own Geolocator.getPositionStream(distanceFilter: 10m, accuracy: high) on init
    (LocationTrackingService.startTracking() is only called from the debug dashboard today
     and is not running during normal field operations — GeofencingService owns its stream)
  - on each position update:
      1. query PowerSync local SQLite for clients within a bounding box:
         WHERE latitude IS NOT NULL AND loan_released = false
           AND latitude  BETWEEN (agentLat - 0.005) AND (agentLat + 0.005)
           AND longitude BETWEEN (agentLng - 0.005) AND (agentLng + 0.005)
         (±0.005° ≈ ~550m — safely wider than the 400m radius, eliminates most non-candidates before the precise check)
      2. for each returned client, call Geolocator.distanceBetween(agentLat, agentLng, clientLat, clientLng)
      3. if distance ≤ 400m → check cooldown
      4. cooldown key: 'geofence_cooldown_{client_id}' in SharedPreferences (Unix ms timestamp)
      5. if now - stored_timestamp ≥ 16 hours (or key absent) → fire notification + write timestamp
  - const GEOFENCE_RADIUS_METERS = 400.0
  - const COOLDOWN_DURATION = Duration(hours: 16)
```

The cooldown timestamp is written when the notification fires, not when the agent taps an action button. This prevents re-triggering if the agent lingers in the area.

Lifecycle: `GeofencingService` is initialized in `main.dart` alongside other app services and disposed on app close. No background location permission is required — the service only runs while the app is open.

### 6.2 Local Notifications

Package: `flutter_local_notifications` (already in `pubspec.yaml` at `^17.0.0`).

Notification payload:
```
Title:  You are near {client.full_name}
Body:   {client.full_address} · {distance}m away
Data:   { client_id, client_lat, client_lng, client_full_name }
```

Three action buttons registered at app startup in `NotificationService`:

| Button | Action |
|--------|--------|
| **Navigate Now** | Opens `geo:{lat},{lng}?q={lat},{lng}` URI (launches default map app) + calls `POST /api/my-day/add-client` to add client to today's itinerary |
| **Add to Itinerary** | Calls `POST /api/my-day/add-client` only |
| **Dismiss** | No API call; cooldown already started |

Note: `POST /api/my-day/add-client` rejects clients with `loan_released = true`. Geofencing already excludes EXISTING clients (see §6.1 SQLite query), so this endpoint rejection should never be reached in practice.

All three buttons start the 16-hour cooldown (cooldown is set at notification fire time, so this is implicit).

### 6.3 Riverpod wiring

```
geofencingServiceProvider = Provider<GeofencingService>((ref) {
  final db = ref.watch(powerSyncDatabaseProvider);
  return GeofencingService(db: db);
  // GeofencingService manages its own Geolocator stream independently
  // of LocationTrackingService (which is debug-only today)
});
```

`GeofencingService` is watched in a root widget so it stays alive for the app's lifetime.

## 7. Visual Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: GEOCODING (Backend — runs once for all existing clients)  │
└─────────────────────────────────────────────────────────────────────┘

  New/existing client
  (province, municipality,           ┌──────────────────┐
   barangay, full_address)    ──────▶│  PSGC ID Lookup  │
                                     │ (psgc_id → psgc  │
                                     │  table → std str)│
                                     └────────┬─────────┘
                                              │ standardized address
                                              ▼
                                     ┌──────────────────┐
                                     │   Mapbox API     │
                                     │   Geocoding      │
                                     └────────┬─────────┘
                                              │ lat, lng
                                              ▼
                                     ┌──────────────────┐
                                     │  clients table   │
                                     │  + latitude      │
                                     │  + longitude     │
                                     │  + geocoded_at   │
                                     └──────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: SYNC (PowerSync — automatic, same as existing client data)│
└─────────────────────────────────────────────────────────────────────┘

  Backend DB                         Device (SQLite via PowerSync)
  ┌───────────────┐                  ┌───────────────────────────┐
  │ clients       │  ─────sync──────▶│ clients (local)           │
  │  id           │                  │  id, name, address        │
  │  full_name    │                  │  latitude, longitude  ◀── │ new
  │  address...   │                  │  category, ...            │
  │  latitude  ◀──│── new columns    └───────────────────────────┘
  │  longitude    │
  └───────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: GEOFENCING (On-device, fully offline)                     │
└─────────────────────────────────────────────────────────────────────┘

  Agent moves (phone GPS)
          │
          │ every 10m of movement
          ▼
  ┌───────────────────┐
  │GeofencingService  │  (owns its own Geolocator stream)
  │  GPS stream       │
  └────────┬──────────┘
           │ current lat/lng
           ▼
  ┌───────────────────┐     already notified       ┌──────────────────┐
  │ GeofencingService │──── within 16hrs? ────────▶│  skip (cooldown) │
  │ (NEW)             │         YES                 └──────────────────┘
  │                   │
  │  bbox pre-filter  │         NO
  │  → precise dist   │
  │  check per client │──── within 400m? ──── NO ──▶  nothing
  └────────┬──────────┘         YES
           │
           ▼
  ┌────────────────────────────────────────────────┐
  │  LOCAL NOTIFICATION (flutter_local_notifications)│
  │                                                │
  │  You are near Juan Dela Cruz                   │
  │  Brgy. Poblacion, Zamboanga City               │
  │  ~250 meters away                              │
  │                                                │
  │  [Navigate Now]  [Add to Itinerary]  [Dismiss] │
  └────────────────┬───────────────────────────────┘
                   │
          agent taps action
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
  [Navigate]  [Add to It.]    [Dismiss]
  Opens        Adds client    Starts
  Maps app     to today's     16hr
  + adds to    itinerary      cooldown
  itinerary    only           timer
  (auto)                      (stored
                               locally)
```

## 8. Testing

### Backend (Vitest)

File: `backend-imu/src/tests/unit/geocode-clients.test.ts`

- `psgc_id` lookup in the `psgc` table produces a clean, standardized address string; when `psgc_id` is null, raw `(province, municipality, barangay)` fields are used as fallback
- Mapbox API is called with the standardized string and Philippines bounding box
- `geocode_status` transitions: `pending → success` on valid result, `pending → failed` on empty result / low confidence, `pending → skipped` when all address fields are empty
- Batch of 50 clients is processed; next batch starts only after first completes
- New client creation queues a geocoding job
- Address field update resets `geocode_status` to `pending` and queues a new job

### Flutter (unit tests)

File: `frontend-mobile-imu/imu_flutter/test/unit/services/geofencing_service_test.dart`

- Client at 399m, no cooldown → notification fires
- Client at 401m → no notification
- Client at 399m, cooldown active (8 hours ago) → no notification
- Client at 399m, cooldown expired (17 hours ago) → notification fires
- Cooldown timestamp is written at notification fire time, not on tap
- Multiple clients within 400m → each triggers its own notification
- Client with null coordinates → skipped
- Client with `loan_released = true` → skipped even if within 400m

### Flutter (widget tests)

- Notification displays correct client name, address, and distance string
- "Navigate Now" invokes map URI launch + add-to-itinerary API
- "Add to Itinerary" invokes add-to-itinerary API only, no map launch
- "Dismiss" triggers no API call

### Manual smoke

- Simulate GPS coordinates within 400m of a geocoded client → notification appears within one 10m movement update
- Dismiss notification and re-simulate within 16 hours → no second notification
- Simulate after 16+ hours → notification re-fires
- Tap "Navigate Now" → default map app opens at client coordinates; client appears in today's itinerary list
- Tap "Add to Itinerary" → client appears in itinerary; no map app opens

## 9. Permissions

### Android (`AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`ACCESS_BACKGROUND_LOCATION` is intentionally excluded — geofencing only runs while the app is in the foreground.

On Android 13+ (API 33+), `POST_NOTIFICATIONS` is a runtime permission that must be requested explicitly at runtime (not just declared in the manifest). `GeofencingService.init()` must call `Permission.notification.request()` (via the `permission_handler` package) before firing the first notification, and should check `Permission.notification.isGranted` before each `show()` call. If denied, geofencing proximity checks continue silently — the agent simply won't see the notification for that approach.

### Backend

No new API permissions. The geocoding job runs under the existing job-queue system. New clients geocoding reuses the existing service-level DB access.

## 10. Known Limitations

- **Geocoding accuracy**: Mapbox geocodes to barangay-level at best for rural Philippine addresses. Agents in densely-covered barangays may see notifications for clients whose actual homes are slightly farther than 400m. Acceptable for v1.
- **Failed geocodes**: Clients with `geocode_status = 'failed'` will not appear in geofencing until manually corrected. A future admin UI can expose a retry action.
- **Foreground only**: Geofencing stops when the app is backgrounded or closed. Agents must keep the app open during field days.
- **Single device**: Cooldown is local to the device. If an agent uses two devices, the same notification may fire on both.
- **Android only**: All caravan agents use Android devices. iOS is out of scope.
- **Performance on large client lists**: At 10,000+ geocoded clients, iterating all on every 10m update would lag. The bounding box pre-filter in §6.1 (±0.005° ≈ ~550m) is baseline and handles this.

## 11. Open Items

- **iOS support:** All caravan agents use Android. iOS excluded from scope permanently unless fleet changes.
- Whether to show a "failed geocode" indicator in the admin client detail view so staff can correct problematic addresses.
- Whether the Mapbox API key should be scoped to geocoding-only (recommended for security) or reuse a shared key.
- Whether to surface a count of geocoded vs. pending vs. failed clients on the admin dashboard.
