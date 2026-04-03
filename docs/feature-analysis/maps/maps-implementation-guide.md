# Maps Integration Implementation Guide

## Overview

This document describes the maps integration implementation for the IMU Flutter app, including configuration, services, and UI components for displaying client locations and providing navigation.

## Architecture

### Configuration

**File**: `lib/core/config/map_config.dart`

The `MapConfig` class manages all map-related configuration:

- Mapbox access token (loaded from environment)
- Map style URL
- Zoom levels (default, min, max)
- Clustering settings
- Offline mode toggle

**Environment Variables** (`.env.dev` / `.env.prod`):
```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12
MAP_DEFAULT_ZOOM=15.0
MAP_MIN_ZOOM=10.0
MAP_MAX_ZOOM=20.0
MAP_ENABLE_CLUSTERING=true
MAP_CLUSTER_RADIUS=50
MAP_OFFLINE_ENABLED=false
```

### Services

#### 1. Interactive Map Service

**File**: `lib/services/maps/interactive_map_service.dart`

Provides core map functionality:

- **View Modes**: All clients, today's itinerary, nearby clients, route view
- **Filtering**: By touchpoint status, product type, client type, distance
- **Location Tracking**: Real-time user location updates
- **Route Optimization**: Nearest-neighbor algorithm for visiting clients
- **Statistics**: Client counts by touchpoint status

**Key Methods**:
```dart
// Initialize the service
await InteractiveMapService().initialize();

// Update markers with client data
service.updateMarkers(clients);

// Set view mode
service.setViewMode(MapViewMode.nearbyClients);

// Get nearby clients within radius
final nearby = service.getNearbyClients(radiusKm: 5.0);

// Calculate optimal route
final route = service.calculateOptimalRoute(clients: clients);

// Search clients by address
final results = service.searchByAddress('Makati');
```

#### 2. Map Service (External Navigation)

**File**: `lib/services/maps/map_service.dart`

Handles external map app integration:

- Google Maps navigation
- Waze navigation
- Apple Maps (iOS)
- Route preview
- Static map URLs

**Usage**:
```dart
final mapService = MapService();

// Open Google Maps navigation
await mapService.openGoogleMapsNavigation(
  latitude: 14.5995,
  longitude: 120.9842,
  label: 'Client Name',
);

// Show route preview
await mapService.showRoutePreview(
  startLat: currentLat,
  startLng: currentLng,
  endLat: clientLat,
  endLng: clientLng,
);
```

### UI Components

#### 1. Client Map View

**File**: `lib/shared/widgets/map_widgets/client_map_view.dart`

Full-featured map widget for displaying client locations:

**Features**:
- Interactive Google Maps
- Client markers with touchpoint status colors
- User location marker
- Filter by touchpoint status
- View mode selection
- Search functionality
- Statistics panel
- Map controls (zoom, center, fit all)

**Usage**:
```dart
ClientMapView(
  clients: clients,
  selectedClientId: currentClientId,
  onClientTap: (clientId) {
    context.push('/clients/$clientId');
  },
  showControls: true,
  showSearch: true,
  initialMode: MapViewMode.allClients,
)
```

#### 2. Location Preview Widget

**File**: `lib/shared/widgets/map_widgets/location_preview.dart`

Compact location display widget:

**Features**:
- Static location preview
- Coordinates display
- Navigation button
- Distance calculator

**Usage**:
```dart
LocationPreviewWidget(
  latitude: address.latitude!,
  longitude: address.longitude!,
  address: address.fullAddress,
  label: client.fullName,
  height: 200,
  showNavigation: true,
)
```

#### 3. Client Map Marker

**File**: `lib/shared/widgets/map_widgets/client_map_marker.dart`

Individual marker widget for clients:

**Features**:
- Touchpoint status colors
- Completed touchpoints count
- Cluster markers for grouped clients

### Pages

#### 1. Client Detail Page (Updated)

**File**: `lib/features/clients/presentation/pages/client_detail_page.dart`

Added map integration:

- Map preview for client address
- Navigation button
- Full-screen map modal
- External map app integration

**Changes**:
- Added map view for clients with coordinates
- Navigation options bottom sheet
- Map modal for detailed view

#### 2. Clients Map Page

**File**: `lib/features/clients/presentation/pages/clients_map_page.dart`

Full-screen map page for viewing all clients:

**Features**:
- Displays all clients with locations
- Filter and search
- Tap to view client details
- Refresh button

## Setup Instructions

### 1. Get Mapbox Access Token

1. Go to [Mapbox Account](https://account.mapbox.com/)
2. Sign up or log in
3. Create a new access token
4. Copy the token

### 2. Configure Environment

Edit `.env.dev` (or `.env.prod`):

```bash
MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijo...your-token-here
```

### 3. Install Dependencies

```bash
cd mobile/imu_flutter
flutter pub get
```

New dependencies:
- `google_maps_flutter: ^2.5.3`

### 4. Platform Configuration

#### Android (`android/app/src/main/AndroidManifest.xml`)

```xml
<manifest>
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>

    <application>
        <!-- Add your Google Maps API key -->
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="YOUR_GOOGLE_MAPS_API_KEY"/>
    </application>
</manifest>
```

#### iOS (`ios/Runner/Info.plist`)

```xml
<dict>
    <!-- Permissions -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>This app needs access to location to show client locations.</string>
    <key>NSLocationAlwaysUsageDescription</key>
    <string>This app needs access to location to track visits.</string>

    <!-- Google Maps API Key -->
    <key>GoogleMapsApiKey</key>
    <string>YOUR_GOOGLE_MAPS_API_KEY</string>
</dict>
```

### 5. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Maps SDK for Android and iOS
4. Create credentials (API Key)
5. Restrict key by package name/bundle ID
6. Copy the key

## Usage Examples

### Display Client Location in Detail Page

```dart
// In ClientDetailPage
if (client.addresses.any((a) => a.latitude != null && a.longitude != null))
  Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: ClientMapView(
      clients: [client],
      showControls: false,
      showSearch: false,
    ),
  )
```

### Navigate to Client

```dart
final mapService = MapService();
await mapService.openGoogleMapsNavigation(
  latitude: address.latitude!,
  longitude: address.longitude!,
  label: client.fullName,
);
```

### Show Full Map Page

```dart
// In router
GoRoute(
  path: '/clients/map',
  builder: (context, state) => const ClientsMapPage(),
),

// Navigate
context.push('/clients/map');
```

### Filter Nearby Clients

```dart
final service = InteractiveMapService();
await service.initialize();
service.setViewMode(MapViewMode.nearbyClients);

// Update filters
service.updateFilters(
  MapFilters(
    maxDistanceKm: 5.0,
    showInProgress: true,
  ),
);
```

## Data Models

### TouchpointStatus

```dart
enum TouchpointStatus {
  none(0, 'Not Started', 0xFF9E9E9E),      // Grey
  inProgress(1, 'In Progress', 0xFFFFA726), // Orange
  completed(2, 'Completed', 0xFF66BB6A),    // Green
}
```

### ClientMapMarker

```dart
class ClientMapMarker {
  final String clientId;
  final String clientName;
  final double latitude;
  final double longitude;
  final TouchpointStatus status;
  final int completedTouchpoints;
  final String? address;
}
```

## File Structure

```
lib/
├── core/
│   └── config/
│       └── map_config.dart              # Map configuration
├── services/
│   └── maps/
│       ├── map_service.dart             # External navigation
│       ├── offline_map_service.dart     # Offline caching
│       └── interactive_map_service.dart # Interactive map logic
├── shared/
│   └── widgets/
│       └── map_widgets/
│           ├── client_map_view.dart     # Main map widget
│           ├── client_map_marker.dart   # Marker widgets
│           └── location_preview.dart    # Location preview widget
└── features/
    └── clients/
        └── presentation/
            └── pages/
                ├── client_detail_page.dart  # Updated with map
                └── clients_map_page.dart    # Full map page
```

## Permissions

The app requires the following permissions:

- **Location**: Fine and coarse location for user position
- **Internet**: For map tiles and navigation
- **Maps API**: For displaying maps

## Best Practices

1. **Always check configuration** before showing maps
   ```dart
   if (MapConfig.isConfigured) {
     // Show map
   } else {
     // Show placeholder
   }
   ```

2. **Handle missing coordinates** gracefully
   ```dart
   if (address.latitude != null && address.longitude != null) {
     // Show location
   }
   ```

3. **Filter clients by location** before rendering
   ```dart
   final clientsWithLocations = clients.where((client) {
     return client.addresses.any((addr) =>
       addr.latitude != null &&
       addr.longitude != null &&
       addr.latitude != 0.0 &&
       addr.longitude != 0.0
     );
   }).toList();
   ```

4. **Use offline caching** for better performance
   ```dart
   if (MapConfig.offlineModeEnabled) {
     // Cache map tiles
   }
   ```

## Troubleshooting

### Map Not Showing

1. Check if Mapbox token is set in `.env` file
2. Verify Google Maps API key is configured
3. Check internet connection
4. Ensure location permissions are granted

### Markers Not Appearing

1. Verify client addresses have valid coordinates
2. Check if coordinates are not 0.0, 0.0
3. Ensure markers are being added to the set

### Navigation Not Working

1. Check if Google Maps/Waze is installed
2. Verify coordinates are valid
3. Check if URL launching is working

## Future Enhancements

1. **Offline Maps**: Download map tiles for areas
2. **Custom Markers**: Use client avatars as markers
3. **Route Optimization**: Better routing algorithms
4. **Geofencing**: Notifications when near clients
5. **Traffic**: Show traffic conditions
6. **Weather**: Display weather at client locations

## Testing

```dart
// Test map service
void main() {
  test('Calculate distance', () {
    final distance = GeolocationService().calculateDistanceInKm(
      14.5995, 120.9842, // Manila
      14.5764, 121.0851, // Quezon City
    );
    expect(distance, greaterThan(10));
  });

  test('Filter nearby clients', () {
    final service = InteractiveMapService();
    final nearby = service.getNearbyClients(
      center: Position(latitude: 14.5995, longitude: 120.9842),
      radiusKm: 5.0,
    );
    expect(nearby, isNotEmpty);
  });
}
```

## References

- [Google Maps Flutter Plugin](https://pub.dev/packages/google_maps_flutter)
- [Geolocator Plugin](https://pub.dev/packages/geolocator)
- [Mapbox Documentation](https://docs.mapbox.com/)
- [Google Maps API](https://developers.google.com/maps)
