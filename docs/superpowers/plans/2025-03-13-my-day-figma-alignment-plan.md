# My Day Figma Alignment Implementation Plan

> **Spec:** `docs/superpowers/specs/2025-03-13-myu-day-figma-alignment-design.md`
> **Date:** 2025-03-13
> **Status:** Ready for Execution
> **Review:** Addressed critical issues from plan review (see Review Notes section)

---

## Goal

Align Flutter IMU mobile app's "My Day" feature with Figma design (Node ID 973:3620) - transforming from task-centric to visit-centric UX with simplified touchpoint form.

## Architecture
- **Pattern:** MVVM with Riverpod state management
- **Storage:** Hive for offline-first local data
- **Navigation:** Go Router
- **Services:** GeolocationService, CameraService (existing)
- **Approach:** Vertical slice delivery - each task is independent and testable

## Tech Stack
- Flutter 3.x with Dart
- Riverpod 2.0 for state management
- Hive for local storage
- geolocator + geocoding for location
- image_picker for camera
- go_router for navigation

---

## Task Checklist

Use this checklist to track progress:
- [ ] Task 1: Update Touchpoint data model
- [ ] Task 2: Create visit_card.dart widget
- [ ] Task 3: Create filter_buttons.dart widget
- [ ] Task 4: Create time_in_button.dart widget
- [ ] Task 5: Create selfie_button.dart widget
- [ ] Task 6: Create touchpoint_sequence_bar.dart widget
- [ ] Task 7: Redesign my_day_page.dart
- [ ] Task 8: Update client_detail_page.dart
- [ ] Task 9: Simplify touchpoint_form.dart
- [ ] Task 10: Integration testing

---

## Chunk 1: Data Model Updates

Update the Touchpoint model to match Figma design.

### Files
- Modify: `lib/features/clients/data/models/client_model.dart`
- Modify: `lib/features/clients/data/models/client_model.g.dart` (Hive adapter)

### Changes Required

#### 1.1 Update Touchpoint Model
Location: `lib/features/clients/data/models/client_model.dart`

```dart
// BEFORE (current model)
class Touchpoint {
  final String id;
  final String clientId;
  final int touchpointNumber;
  final TouchpointType type;
  final String reason;
  final DateTime date;
  final String? timeArrival;
  final String? timeDeparture;
  final String? odometerArrival;
  final String? odometerDeparture;
  final String? photoPath;
  final DateTime? nextVisitDate;
  final String? remarks;
  final double? latitude;
  final double? longitude;
  final DateTime createdAt;
  // ... constructor, copyWith, etc.
}

// AFTER (new model)
class Touchpoint {
  final String id;
  final String clientId;
  final int touchpointNumber;
  final TouchpointType type;
  final DateTime date;

  // NEW Figma-aligned fields
  final String transaction;        // Dropdown value
  final String status;             // Dropdown value
  final String remarks;            // Dropdown value
  final String? otherRemarks;      // Free-form text
  final double? releaseAmount;     // Currency field

  // Time In (auto-captured)
  final DateTime? timeIn;
  final String? timeInAddress;
  final double? latitude;
  final double? longitude;

  // Selfie (from Selfie button)
  final String? selfiePath;

  final DateTime createdAt;

  Touchpoint({
    required this.id,
    required this.clientId,
    required this.touchpointNumber,
    required this.type,
    required this.date,
    required this.transaction,
    required this.status,
    required this.remarks,
    this.otherRemarks,
    this.releaseAmount,
    this.timeIn,
    this.timeInAddress,
    this.latitude,
    this.longitude,
    this.selfiePath,
    required this.createdAt,
  });

  Touchpoint copyWith({
    String? id,
    String? clientId,
    int? touchpointNumber,
    TouchpointType? type,
    DateTime? date,
    String? transaction,
    String? status,
    String? remarks,
    String? otherRemarks,
    double? releaseAmount,
    DateTime? timeIn,
    String? timeInAddress,
    double? latitude,
    double? longitude,
    String? selfiePath,
    DateTime? createdAt,
  });
}
```

#### 1.2 Update Hive TypeAdapter
Regenerate Hive adapter after model changes:
```bash
cd mobile/imu_flutter
dart run build_runner build --delete-conflicting-outputs
```

### Testing
- Unit test: Create Touchpoint with new fields
- Unit test: copyWith preserves all fields
- Verify Hive serialization/deserialization works

### Dependencies
None (foundation task)

---

## Chunk 2: Visit Card Widget
Create the visit card widget for the My Day screen.

### Files
- Create: `lib/features/my_day/presentation/widgets/visit_card.dart`

### Implementation

```dart
// lib/features/my_day/presentation/widgets/visit_card.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class VisitCard extends StatelessWidget {
  final String clientId;
  final String clientName;
  final String agencyName;
  final int touchpointNumber;
  final TouchpointType touchpointType;

  const VisitCard({
    super(key: key);
    required this.clientId,
    required this.clientName,
    required this.agencyName,
    required this.touchpointNumber,
    required this.touchpointType,
  });

  String get _ordinalSuffix {
    // 1st, 2nd, 3rd, 4th, 5th, 6th, 7th
    if (touchpointNumber >= 11 && touchpointNumber <= 13) return 'th';
    switch (touchpointNumber % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go('/clients/$clientId'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Touchpoint indicator
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  touchpointType == TouchpointType.visit
                    ? Icons.map_pin_outlined
                    : Icons.phone_outlined,
                  size: 20,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 4),
                Text(
                  '$touchpointNumber$_ordinalSuffix',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(width: 12),
            // Client info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    clientName,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    agencyName,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

### Testing
- Widget test: Renders with all props
- Widget test: Tap navigates to client detail
- Widget test: Ordinal suffix calculation

### Dependencies
- Chunk 1 (Touchpoint model must have TouchpointType enum)

---

## Chunk 3: Filter Buttons Widget
Create the filter buttons component for My Day header.

### Files
- Create: `lib/features/my_day/presentation/widgets/filter_buttons.dart`

### Implementation

```dart
// lib/features/my_day/presentation/widgets/filter_buttons.dart
import 'package:flutter/material.dart';

class FilterButtons extends StatelessWidget {
  final VoidCallback onMultipleTimeIn;
  final VoidCallback onAddNewVisit;

  const FilterButtons({
    super(key: key);
    required this.onMultipleTimeIn,
    required this.onAddNewVisit,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 17),
      child: Row(
        children: [
          Expanded(
            child: _FilterButton(
              icon: Icons.pan_tool_outlined, // Multiple hands icon
              label: 'Multiple Time In',
              onTap: onMultipleTimeIn,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _FilterButton(
              icon: Icons.add_location_outlined,
              label: 'Add new visit',
              onTap: onAddNewVisit,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _FilterButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.grey.shade200,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.bodySmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
    );
  }
}
```

### Testing
- Widget test: Renders both buttons
- Widget test: Tap callbacks are called

### Dependencies
None

---

## Chunk 4: Time In Button Widget
Create the Time In button with GPS capture functionality.

### Files
- Create: `lib/features/touchpoints/presentation/widgets/time_in_button.dart`

### Implementation

```dart
// lib/features/touchpoints/presentation/widgets/time_in_button.dart
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:intl/intl.dart';  // Added for DateFormat

class TimeInButton extends StatefulWidget {
  final Function(DateTime timeIn, String address, double lat, double lng) onTimeInCaptured;
  final DateTime? initialTimeIn;
  final String? initialAddress;

  const TimeInButton({
    super(key: key);
    required this.onTimeInCaptured,
    this.initialTimeIn,
    this.initialAddress,
  });

  @override
  State<TimeInButton> createState() => _TimeInButtonState();
}

class _TimeInButtonState extends State<TimeInButton> {
  bool _isLoading = false;
  DateTime? _timeIn;
  String? _address;
  String? _error;

  @override
  void initState() {
    super.initState();
    _timeIn = widget.initialTimeIn;
    _address = widget.initialAddress;
  }

  Future<void> _captureTimeIn() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Check permission
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Location service disabled');
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever ||
          permission == LocationPermission.denied) {
        throw Exception('Location permission denied');
      }

      // Get position
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      // Reverse geocode
      String address;
      try {
        // Correct geocoding API - pass lat/lng directly
        // Fixed: Correct geocoding API - no Coordinates wrapper needed
        List<Placemark> placemarks = await placemarkFromCoordinates(
          position.latitude,
          position.longitude,
        );
        Placemark place = placemarks.first;
        address = '${place.street}, ${place.locality}, ${place.administrativeArea}';
      } catch (e) {
        address = '${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}';
      }

      final timeIn = DateTime.now();

      setState(() {
        _timeIn = timeIn;
        _address = address;
        _isLoading = false;
      });

      widget.onTimeInCaptured(timeIn, address, position.latitude, position.longitude);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeFormatter = DateFormat('h:mm a');

    return InkWell(
      onTap: _isLoading ? null : _captureTimeIn,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, color: Colors.red),
                      Text(_error!, style: const TextStyle(color: Colors.red)),
                      const Text('Tap to retry'),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.map_pin_outlined, size: 32),
                      const SizedBox(height: 8),
                      Text(
                        _timeIn != null
                            ? timeFormatter.format(_timeIn!)
                            : 'Time In',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      if (_address != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          _address!,
                          style: Theme.of(context).textTheme.bodySmall,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
      ),
    );
  }
}
```

### Testing
- Widget test: Shows loading state
- Widget test: Shows time and address after capture
- Widget test: Shows error state
- Integration test: GPS capture with mock location

### Dependencies
- geolocator package (existing)
- geocoding package (existing)
- intl package for DateFormat

---

## Chunk 5: Selfie Button Widget
Create the Selfie camera button widget.

### Files
- Create: `lib/features/touchpoints/presentation/widgets/selfie_button.dart`

### Implementation

```dart
// lib/features/touchpoints/presentation/widgets/selfie_button.dart
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';

class SelfieButton extends StatefulWidget {
  final Function(String path) onSelfieCaptured;
  final String? initialSelfiePath;

  const SelfieButton({
    super(key: key);
    required this.onSelfieCaptured,
    this.initialSelfiePath,
  });

  @override
  State<SelfieButton> createState() => _SelfieButtonState();
}

class _SelfieButtonState extends State<SelfieButton> {
  String? _selfiePath;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _selfiePath = widget.initialSelfiePath;
  }

  Future<void> _captureSelfie() async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );

      if (photo != null) {
        setState(() {
          _selfiePath = photo.path;
        });
        widget.onSelfieCaptured(photo.path);
      }
    } catch (e) {
      // Handle error - show snackbar or dialog
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to capture selfie: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: _captureSelfie,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: _selfiePath != null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      File(_selfiePath!),
                      width: 60,
                      height: 60,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text('Selfie', style: TextStyle(fontWeight: FontWeight.bold)),
                  const Text('Tap to retake', style: TextStyle(color: Colors.grey)),
                ],
              )
            : const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.camera_alt_outlined, size: 32),
                  SizedBox(height: 8),
                  Text('Selfie', style: TextStyle(fontWeight: FontWeight.bold)),
                ],
              ),
      ),
    );
  }
}
```

### Testing
- Widget test: Renders empty state
- Widget test: Shows thumbnail after capture
- Integration test: Camera capture (mocked)

### Dependencies
- image_picker package (existing)

---

## Chunk 6: Touchpoint Sequence Bar Widget
Create the horizontal scrollable bar showing 1st-7th touchpoints + Archive.

### Files
- Create: `lib/features/touchpoints/presentation/widgets/touchpoint_sequence_bar.dart`

### Implementation

```dart
// lib/features/touchpoints/presentation/widgets/touchpoint_sequence_bar.dart
import 'package:flutter/material.dart';

class TouchpointSequenceBar extends StatelessWidget {
  final int currentTouchpoint;
  final int completedCount;
  final Function(int number)? onTouchpointTap;

  const TouchpointSequenceBar({
    super(key: key);
    required this.currentTouchpoint,
    required this.completedCount,
    this.onTouchpointTap,
  });

  // Touchpoint pattern: Visit, Call, Call, Visit, Call, Call, Visit
  static const List<bool> _isVisit = [true, false, false, true, false, false, true];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 17),
      child: Row(
        children: [
          for (int i = 1; i <= 7; i++) ...{
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _TouchpointItem(
                number: i,
                isVisit: _isVisit[i - 1],
                isCurrent: i == currentTouchpoint,
                isCompleted: i <= completedCount,
                onTap: onTouchpointTap != null ? () => onTouchpointTap!(i) : null,
              ),
            ),
          },
          // Archive button
          _TouchpointItem(
            number: null, // null indicates archive
            isVisit: false,
            isCurrent: false,
            isCompleted: false,
            icon: Icons.archive_outlined,
            label: 'Archive',
            onTap: onTouchpointTap != null ? () => onTouchpointTap!(0) : null, // 0 = archive
          ),
        ],
      ),
    );
  }
}

class _TouchpointItem extends StatelessWidget {
  final int? number;
  final bool isVisit;
  final bool isCurrent;
  final bool isCompleted;
  final IconData? icon;
  final String? label;
  final VoidCallback? onTap;

  const _TouchpointItem({
    required this.number,
    required this.isVisit,
    required this.isCurrent,
    required this.isCompleted,
    this.icon,
    this.label,
    this.onTap,
  });

  String get _ordinalSuffix {
    if (number == null) return '';
    if (number! >= 11 && number! <= 13) return 'th';
    switch (number! % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  @override
  Widget build(BuildContext context) {
    final Color bgColor = isCurrent
        ? Theme.of(context).colorScheme.primary
        : isCompleted
            ? Colors.green
            : Colors.grey.shade200;

    final Color textColor = isCurrent || isCompleted
        ? Colors.white
        : Colors.black;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon ?? (isVisit ? Icons.map_pin_outlined : Icons.phone_outlined),
                size: 16,
                color: textColor,
              ),
              const SizedBox(width: 4),
              Text(
                label ?? '$number$_ordinalSuffix',
                style: TextStyle(color: textColor, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
    );
  }
}
```

### Testing
- Widget test: Renders all 7 items + archive
- Widget test: Highlights current touchpoint
- Widget test: Shows completed touchpoints in green
- Widget test: Tap callback works

### Dependencies
- Chunk 1 (TouchpointType for reference)

---

## Chunk 7: My Day Page Redesign
Complete redesign of the My Day page to visit-centric layout.

### Files
- Modify: `lib/features/my_day/presentation/pages/my_day_page.dart`
- Delete: `lib/features/my_day/presentation/widgets/task_card.dart`

### Changes Required

Remove:
- Summary card at top
- Status tabs (Pending/In Progress/Completed)
- Task cards with checkboxes

Add:
- Header with "My Day" + date
- FilterButtons widget
- ListView of VisitCard widgets

### Implementation Overview

```dart
// Key changes in my_day_page.dart

class MyDayPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visits = ref.watch(visitsProvider);
    final isLoading = ref.watch(visitsLoadingProvider);

    return Scaffold(
      body: Column(
        children: [
          // Status bar space
          SizedBox(height: MediaQuery.of(context).padding.top),

          // Header
          _buildHeader(context),

          // Filter buttons
          FilterButtons(
            onMultipleTimeIn: _showMultipleTimeInModal,
            onAddNewVisit: _navigateToAddVisit,
          ),

          // Visit list
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : visits.isEmpty
                    ? _buildEmptyState(context)
                    : ListView.builder(
                        itemCount: visits.length,
                        itemBuilder: (context, index) => VisitCard(
                          clientId: visits[index].clientId,
                          clientName: visits[index].clientName,
                          agencyName: visits[index].agencyName,
                          touchpointNumber: visits[index].touchpointNumber,
                          touchpointType: visits[index].touchpointType,
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final now = DateTime.now();
    final dateFormatter = DateFormat('MMM dd, yyyy');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('My Day', style: Theme.of(context).textTheme.headlineSmall),
          Text(dateFormatter.format(now), style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }

  void _showMultipleTimeInModal() {
    // Show modal with visit selection for bulk time-in
    showModalBottomSheet(
      context: context,
      builder: (context) => MultipleTimeInModal(visits: visits),
    );
  }
}
```

### New Provider Required
Create a provider that transforms clients into visits for today:

```dart
// In my_day_provider.dart
final visitsProvider = Provider<List<Visit>>((ref) {
  final clients = ref.watch(clientsProvider);
  final today = DateTime.now();

  return clients
      .where((c) => c.nextTouchpointDate?.day == today.day &&
              c.nextTouchpointDate?.month == today.month)
      .map((c) => Visit(
        clientId: c.id,
        clientName: c.fullName,
        agencyName: c.agency ?? 'Unknown Agency',
        touchpointNumber: c.touchpoints.length + 1,
        touchpointType: c.nextTouchpointType,
      ))
      .toList();
});
```

### Testing
- Widget test: Shows empty state when no visits
- Widget test: Shows visit list
- Widget test: Filter buttons work
- Widget test: Header shows current date
- Integration test: Full page renders correctly

### Dependencies
- Chunk 2 (VisitCard)
- Chunk 3 (FilterButtons)
- Chunk 4 (TimeInButton) - for MultipleTimeInModal

---

## Chunk 8: Client Detail Page Updates
Add Time In/Selfie buttons and touchpoint sequence bar to client detail.

### Files
- Modify: `lib/features/clients/presentation/pages/client_detail_page.dart`

### Changes Required

Add above the existing touchpoint form:
1. Row with TimeInButton and SelfieButton
2. TouchpointSequenceBar widget

Update the touchpoint form to use the new simplified version.

### Implementation Overview

```dart
// Add to client_detail_page.dart in the touchpoint section

Column(
  children: [
    // Time In / Selfie buttons row
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 17),
      child: Row(
        children: [
          Expanded(
            child: TimeInButton(
              onTimeInCaptured: (time, address, lat, lng) {
                setState(() {
                  _currentTimeIn = time;
                  _currentAddress = address;
                  _currentLat = lat;
                  _currentLng = lng;
                });
              },
              initialTimeIn: _existingTouchpoint?.timeIn,
              initialAddress: _existingTouchpoint?.timeInAddress,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: SelfieButton(
              onSelfieCaptured: (path) {
                setState(() {
                  _currentSelfiePath = path;
                });
              },
              initialSelfiePath: _existingTouchpoint?.selfiePath,
            ),
          ),
        ],
      ),
    ),

    const SizedBox(height: 16),

    // Touchpoint sequence bar
    TouchpointSequenceBar(
      currentTouchpoint: client.touchpoints.length + 1,
      completedCount: client.touchpoints.length,
      onTouchpointTap: (number) {
        if (number > 0 && number <= client.touchpoints.length) {
          _showTouchpointDetails(client.touchpoints[number - 1]);
        }
      },
    ),

    const SizedBox(height: 16),

    // Simplified touchpoint form (Chunk 9)
    TouchpointForm(...),
  ],
)
```

### Testing
- Widget test: Time In button renders
- Widget test: Selfie button renders
- Widget test: Sequence bar shows correct progress
- Integration test: Full flow works

### Dependencies
- Chunk 4 (TimeInButton)
- Chunk 5 (SelfieButton)
- Chunk 6 (TouchpointSequenceBar)
- Chunk 9 (TouchpointForm)

---

## Chunk 9: Touchpoint Form Simplification
Simplify the touchpoint form to match Figma design.

### Files
- Modify: `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

### Changes Required

Remove fields:
- Reason dropdown (25+ options)
- Time of Arrival picker
- Time of Departure picker
- Odometer Arrival input
- Odometer Departure input
- Photo Evidence button
- Next Visit Date picker

Add fields:
- Transaction dropdown
- Status dropdown
- Remarks dropdown
- Add New Release (Php) currency input
- Other Remarks text area

### Implementation

```dart
// lib/features/touchpoints/presentation/widgets/touchpoint_form.dart

class TouchpointForm extends ConsumerStatefulWidget {
  final Client client;
  final Touchpoint? existingTouchpoint;
  final Function(Touchpoint) onSubmit;

  const TouchpointForm({
    super(key: key);
    required this.client,
    this.existingTouchpoint,
    required this.onSubmit,
  });
}

class _TouchpointFormState extends ConsumerState<TouchpointForm> {
  // Form state
  String? _transaction;
  String? _status;
  String? _remarks;
  String _otherRemarks = '';
  String _releaseAmount = '';

  // Time In / Selfie data (passed from parent)
  DateTime? _timeIn;
  String? _timeInAddress;
  double? _latitude;
  double? _longitude;
  String? _selfiePath;

  // Validation
  bool _isSubmitting = false;
  String? _transactionError;
  String? _statusError;
  String? _remarksError;

  // Dropdown options (placeholder values from spec)
  static const List<String> _transactionOptions = [
    'New Business',
    'Follow-up',
    'Collection',
    'Renewal',
    'Inquiry',
  ];

  static const List<String> _statusOptions = [
    'Pending',
    'In Progress',
    'Completed',
    'Cancelled',
    'Rescheduled',
  ];

  static const List<String> _remarksOptions = [
    'Successful visit',
    'Client not available',
    'Reschedule needed',
    'Requires follow-up',
    'Other',
  ];

  bool get _canSubmit {
    return _transaction != null &&
           _status != null &&
           _remarks != null &&
           _timeIn != null &&
           !_isSubmitting;
  }

  Future<void> _handleSubmit() async {
    if (!_canSubmit) return;

    setState(() {
      _isSubmitting = true;
      _transactionError = null;
      _statusError = null;
      _remarksError = null;
    });

    // Validate
    bool hasError = false;
    if (_transaction == null) {
      _transactionError = 'Please select a transaction';
      hasError = true;
    }
    if (_status == null) {
      _statusError = 'Please select a status';
      hasError = true;
    }
    if (_remarks == null) {
      _remarksError = 'Please select remarks';
      hasError = true;
    }

    if (hasError) {
      setState(() => _isSubmitting = false);
      return;
    }

    // Create touchpoint
    final touchpoint = Touchpoint(
      id: widget.existingTouchpoint?.id ?? const Uuid().v4(),
      clientId: widget.client.id,
      touchpointNumber: widget.client.touchpoints.length + 1,
      type: widget.client.nextTouchpointType,
      date: DateTime.now(),
      transaction: _transaction!,
      status: _status!,
      remarks: _remarks!,
      otherRemarks: _otherRemarks.isEmpty ? null : _otherRemarks,
      releaseAmount: _releaseAmount.isEmpty ? null : double.tryParse(_releaseAmount),
      timeIn: _timeIn,
      timeInAddress: _timeInAddress,
      latitude: _latitude,
      longitude: _longitude,
      selfiePath: _selfiePath,
      createdAt: DateTime.now(),
    );

    await widget.onSubmit(touchpoint);

    setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(17),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Transaction dropdown
          _buildDropdown(
            label: 'Transaction',
            value: _transaction,
            options: _transactionOptions,
            error: _transactionError,
            onChanged: (v) => setState(() => _transaction = v),
          ),
          const SizedBox(height: 16),

          // Status dropdown
          _buildDropdown(
            label: 'Status',
            value: _status,
            options: _statusOptions,
            error: _statusError,
            onChanged: (v) => setState(() => _status = v),
          ),
          const SizedBox(height: 16),

          // Remarks dropdown
          _buildDropdown(
            label: 'Remarks',
            value: _remarks,
            options: _remarksOptions,
            error: _remarksError,
            onChanged: (v) => setState(() => _remarks = v),
          ),
          const SizedBox(height: 16),

          // Add New Release field
          _buildCurrencyField(
            label: 'Add New Release',
            value: _releaseAmount,
            onChanged: (v) => setState(() => _releaseAmount = v),
          ),
          const SizedBox(height: 16),

          // Other Remarks
          _buildTextArea(
            label: 'Other Remarks',
            value: _otherRemarks,
            onChanged: (v) => setState(() => _otherRemarks = v),
          ),
          const SizedBox(height: 24),

          // Submit button
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              onPressed: _canSubmit ? _handleSubmit : null,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Submit'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDropdown({
    required String label,
    required String? value,
    required List<String> options,
    required String? error,
    required Function(String) onChanged,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 82,
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                value: value,
                decoration: InputDecoration(
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  errorText: error,
                ),
                hint: Text('Select $label'),
                items: options.map((o) => DropdownMenuItem(
                  value: o,
                  child: Text(o),
                )).toList(),
                onChanged: (v) => v != null ? onChanged(v) : null,
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ... _buildCurrencyField and _buildTextArea implementations
}
```

### Testing
- Widget test: All fields render
- Widget test: Validation errors show
- Widget test: Submit disabled until required fields filled
- Widget test: Submit creates Touchpoint with correct data

### Dependencies
- Chunk 1 (Touchpoint model)
- Chunk 8 (parent provides Time In/Selfie data)

---

## Chunk 10: Integration Testing
End-to-end testing of the complete flow.

### Files
- Create: `integration_test/my_day_flow_test.dart`

### Test Scenarios

```dart
// integration_test/my_day_flow_test.dart

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('My Day Figma Alignment Flow', () {
    testWidgets('Complete visit flow', (tester) async {
      // 1. Launch app
      await tester.pumpWidget(MyApp());

      // 2. Navigate to My Day
      await tester.tap(find.text('My Day'));
      await tester.pumpAndSettle();

      // 3. Verify My Day screen shows visit cards
      expect(find.text('4th'), findsOneWidget);
      expect(find.text('Amagar, Mina C.'), findsOneWidget);

      // 4. Tap a visit card
      await tester.tap(find.text('Amagar, Mina C.'));
      await tester.pumpAndSettle();

      // 5. Verify Client Detail shows Time In / Selfie buttons
      expect(find.text('Time In'), findsOneWidget);
      expect(find.text('Selfie'), findsOneWidget);

      // 6. Verify touchpoint sequence bar
      expect(find.text('1st'), findsOneWidget);
      expect(find.text('7th'), findsOneWidget);

      // 7. Tap Time In (mock GPS)
      await tester.tap(find.text('Time In'));
      await tester.pump(Duration(seconds: 2)); // Wait for GPS

      // 8. Verify form is visible
      expect(find.text('Transaction'), findsOneWidget);
      expect(find.text('Status'), findsOneWidget);

      // 9. Fill form
      await tester.tap(find.text('Transaction'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New Business').last);

      await tester.tap(find.text('Status'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Completed').last);

      await tester.tap(find.text('Remarks'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Successful visit').last);

      // 10. Submit
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();

      // 11. Verify back on My Day with updated state
      expect(find.text('My Day'), findsOneWidget);
    });
  });
}
```

### Manual Testing Checklist
- [ ] My Day shows visits for today
- [ ] Filter buttons appear and are tappable
- [ ] Visit card shows touchpoint number and agency
- [ ] Tapping visit card navigates to client detail
- [ ] Time In captures GPS and shows address
- [ ] Selfie opens camera and captures photo
- [ ] Touchpoint sequence bar shows progress
- [ ] Form has 5 fields (Transaction, Status, Remarks, Release, Other Remarks)
- [ ] Submit saves touchpoint and navigates back

### Dependencies
- All previous chunks completed

---

## Commit Strategy

Commit after each chunk:

1. `feat(model): update Touchpoint model for Figma alignment`
2. `feat(ui): add visit card widget`
3. `feat(ui): add filter buttons widget`
4. `feat(ui): add time in button with GPS capture`
5. `feat(ui): add selfie button widget`
6. `feat(ui): add touchpoint sequence bar widget`
7. `refactor(my-day): redesign to visit-centric layout`
8. `feat(client-detail): add Time In/Selfie buttons and sequence bar`
9. `refactor(touchpoint-form): simplify to Figma design`
10. `test(integration): add My Day flow tests`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| GPS permission denied | Clear error message with settings link |
| Reverse geocoding fails | Show coordinates instead of address |
| Camera permission denied | Clear error message with retry option |
| Hive data migration | App not deployed, clear local data if needed |
| Dropdown values incorrect | Placeholder values, easy to update |

---

## Estimated Effort

| Chunk | Effort |
|-------|--------|
| Chunk 1: Data Model | 1-2 hours |
| Chunk 2: Visit Card | 1 hour |
| Chunk 3: Filter Buttons | 30 min |
| Chunk 4: Time In Button | 2-3 hours |
| Chunk 5: Selfie Button | 1 hour |
| Chunk 6: Sequence Bar | 1 hour |
| Chunk 7: My Day Redesign | 2-3 hours |
| Chunk 8: Client Detail | 1-2 hours |
| Chunk 9: Form Simplification | 2-3 hours |
| Chunk 10: Integration Tests | 2 hours |
| **Total** | **14-19 hours** |
