# Visit Time In/Out Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the visit Time In/Out feature to be inside the visit form with manual time selection and GPS capture, following a strict sequence: Time In → Form → Time Out → Submit.

**Architecture:** Create a new `TimeCaptureSection` widget for reusable Time In/Out UI with GPS capture. Add a `TouchpointFormProvider` for state management. Modify the existing `touchpoint_form.dart` to integrate the new flow while preserving existing form fields.

**Tech Stack:** Flutter 3.x, Riverpod 2.0, Hive (local storage), Geolocator + Geocoding (GPS)

**Spec:** `docs/superpowers/specs/2025-03-23-visit-time-in-out-refactor-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `lib/features/clients/data/models/client_model.dart` | Modify | Add Time In/Out fields to Touchpoint |
| `lib/features/touchpoints/providers/touchpoint_form_provider.dart` | Create | State management for form + Time In/Out |
| `lib/features/touchpoints/presentation/widgets/time_capture_section.dart` | Create | Reusable Time In/Out widget with GPS |
| `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` | Modify | Integrate new Time In/Out flow |
| `lib/features/my_day/presentation/pages/my_day_page.dart` | Modify | Update client card to use "Start Visit" |
| `lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart` | Delete | No longer needed |

---

## Task 1: Add Time In/Out Fields to Touchpoint Model

**Files:**
- Modify: `mobile/imu_flutter/lib/features/clients/data/models/client_model.dart`

**IMPORTANT:** This project uses Hive for local storage. The Touchpoint model needs Hive field annotations with sequential IDs. Find the highest existing @HiveField ID in the Touchpoint class and use the next available IDs.

- [ ] **Step 1: Check existing Hive field IDs**

Find the Touchpoint class and identify the highest @HiveField ID currently in use. The new fields should start from the next ID (e.g., if highest is 19, start from 20).

- [ ] **Step 2: Add new fields to Touchpoint class with Hive annotations**

Add these new fields after the existing `longitude` field (adjust field IDs as needed):

```dart
  // === Time In/Out fields (new) ===
  @HiveField(20)
  final DateTime? timeIn;

  @HiveField(21)
  final double? timeInGpsLat;

  @HiveField(22)
  final double? timeInGpsLng;

  @HiveField(23)
  final String? timeInGpsAddress;

  @HiveField(24)
  final DateTime? timeOut;

  @HiveField(25)
  final double? timeOutGpsLat;

  @HiveField(26)
  final double? timeOutGpsLng;

  @HiveField(27)
  final String? timeOutGpsAddress;
```

- [ ] **Step 2: Update Touchpoint constructor**

Add the new fields to the constructor (after `this.longitude`):

```dart
    this.timeIn,
    this.timeInGpsLat,
    this.timeInGpsLng,
    this.timeInGpsAddress,
    this.timeOut,
    this.timeOutGpsLat,
    this.timeOutGpsLng,
    this.timeOutGpsAddress,
```

- [ ] **Step 3: Update copyWith method**

Add the new fields to the `copyWith` method:

```dart
    timeIn: timeIn ?? this.timeIn,
    timeInGpsLat: timeInGpsLat ?? this.timeInGpsLat,
    timeInGpsLng: timeInGpsLng ?? this.timeInGpsLng,
    timeInGpsAddress: timeInGpsAddress ?? this.timeInGpsAddress,
    timeOut: timeOut ?? this.timeOut,
    timeOutGpsLat: timeOutGpsLat ?? this.timeOutGpsLat,
    timeOutGpsLng: timeOutGpsLng ?? this.timeOutGpsLng,
    timeOutGpsAddress: timeOutGpsAddress ?? this.timeOutGpsAddress,
```

- [ ] **Step 4: Update toJson method**

Add the new fields to `toJson`:

```dart
    'time_in': timeIn?.toIso8601String(),
    'time_in_gps_lat': timeInGpsLat,
    'time_in_gps_lng': timeInGpsLng,
    'time_in_gps_address': timeInGpsAddress,
    'time_out': timeOut?.toIso8601String(),
    'time_out_gps_lat': timeOutGpsLat,
    'time_out_gps_lng': timeOutGpsLng,
    'time_out_gps_address': timeOutGpsAddress,
```

- [ ] **Step 5: Update fromJson method**

Add the new fields to `fromJson`:

```dart
    timeIn: json['time_in'] != null ? DateTime.parse(json['time_in']) : null,
    timeInGpsLat: json['time_in_gps_lat']?.toDouble(),
    timeInGpsLng: json['time_in_gps_lng']?.toDouble(),
    timeInGpsAddress: json['time_in_gps_address'],
    timeOut: json['time_out'] != null ? DateTime.parse(json['time_out']) : null,
    timeOutGpsLat: json['time_out_gps_lat']?.toDouble(),
    timeOutGpsLng: json['time_out_gps_lng']?.toDouble(),
    timeOutGpsAddress: json['time_out_gps_address'],
```

- [ ] **Step 6: Regenerate Hive adapters**

After modifying the Touchpoint model, regenerate the Hive adapters:

```bash
cd mobile/imu_flutter && dart run build_runner build --delete-conflicting-outputs
```

Expected: Build completes successfully with new adapter code generated.

- [ ] **Step 7: Commit model changes**

```bash
cd mobile/imu_flutter && git add lib/features/clients/data/models/client_model.dart && git commit -m "feat(touchpoints): add Time In/Out fields to Touchpoint model

- Add timeIn/timeOut DateTime fields
- Add GPS coordinates (lat/lng/address) for both
- Update constructor, copyWith, toJson, fromJson

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 7: Regenerate Hive adapters**

After modifying the Touchpoint model with new @HiveField annotations, regenerate the adapters:

```bash
cd mobile/imu_flutter && dart run build_runner build --delete-conflicting-outputs
```

Expected: New `client_model.g.dart` generated with fields 20-27 for Time In/Out.

---

## Task 2: Create TouchpointFormProvider

**Files:**
- Create: `mobile/imu_flutter/lib/features/touchpoints/providers/touchpoint_form_provider.dart`

- [ ] **Step 1: Create the provider file**

Create directory if needed, then create the provider file:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// State for Time In/Out capture
class TimeCaptureState {
  final DateTime? time;
  final double? gpsLat;
  final double? gpsLng;
  final String? gpsAddress;
  final bool isCapturing;
  final String? error;

  const TimeCaptureState({
    this.time,
    this.gpsLat,
    this.gpsLng,
    this.gpsAddress,
    this.isCapturing = false,
    this.error,
  });

  bool get isCaptured => time != null;

  TimeCaptureState copyWith({
    DateTime? time,
    double? gpsLat,
    double? gpsLng,
    String? gpsAddress,
    bool? isCapturing,
    String? error,
  }) {
    return TimeCaptureState(
      time: time ?? this.time,
      gpsLat: gpsLat ?? this.gpsLat,
      gpsLng: gpsLng ?? this.gpsLng,
      gpsAddress: gpsAddress ?? this.gpsAddress,
      isCapturing: isCapturing ?? this.isCapturing,
      error: error,
    );
  }

  factory TimeCaptureState.empty() => const TimeCaptureState();
}

/// State for the entire touchpoint form
class TouchpointFormState {
  final String touchpointType; // 'Visit' or 'Call'
  final TimeCaptureState timeIn;
  final TimeCaptureState timeOut;
  final bool isSubmitting;

  const TouchpointFormState({
    this.touchpointType = 'Visit',
    this.timeIn = const TimeCaptureState(),
    this.timeOut = const TimeCaptureState(),
    this.isSubmitting = false,
  });

  /// Form fields are enabled after Time In is captured (for Visit type)
  bool get canFillForm => touchpointType == 'Call' || timeIn.isCaptured;

  /// Submit is enabled after Time Out is captured (for Visit type)
  bool get canSubmit {
    if (touchpointType == 'Call') return true;
    if (!timeIn.isCaptured || !timeOut.isCaptured) return false;
    // Time Out must be after Time In
    return timeOut.time!.isAfter(timeIn.time!);
  }

  /// Check if Time Out time is valid (after Time In)
  bool get isTimeOutValid {
    if (!timeIn.isCaptured || !timeOut.isCaptured) return true;
    return timeOut.time!.isAfter(timeIn.time!);
  }

  /// Calculate visit duration in minutes
  int? get visitDurationMinutes {
    if (!timeIn.isCaptured || !timeOut.isCaptured) return null;
    return timeOut.time!.difference(timeIn.time!).inMinutes;
  }

  TouchpointFormState copyWith({
    String? touchpointType,
    TimeCaptureState? timeIn,
    TimeCaptureState? timeOut,
    bool? isSubmitting,
  }) {
    return TouchpointFormState(
      touchpointType: touchpointType ?? this.touchpointType,
      timeIn: timeIn ?? this.timeIn,
      timeOut: timeOut ?? this.timeOut,
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }
}

/// Notifier for touchpoint form state
class TouchpointFormNotifier extends StateNotifier<TouchpointFormState> {
  TouchpointFormNotifier() : super(const TouchpointFormState());

  void setTouchpointType(String type) {
    state = state.copyWith(touchpointType: type);
  }

  void setTimeInCapturing(bool isCapturing) {
    state = state.copyWith(
      timeIn: state.timeIn.copyWith(isCapturing: isCapturing),
    );
  }

  void setTimeIn(DateTime time, double? lat, double? lng, String? address) {
    state = state.copyWith(
      timeIn: TimeCaptureState(
        time: time,
        gpsLat: lat,
        gpsLng: lng,
        gpsAddress: address,
      ),
    );
  }

  void setTimeInError(String error) {
    state = state.copyWith(
      timeIn: state.timeIn.copyWith(
        isCapturing: false,
        error: error,
      ),
    );
  }

  void setTimeOutCapturing(bool isCapturing) {
    state = state.copyWith(
      timeOut: state.timeOut.copyWith(isCapturing: isCapturing),
    );
  }

  void setTimeOut(DateTime time, double? lat, double? lng, String? address) {
    state = state.copyWith(
      timeOut: TimeCaptureState(
        time: time,
        gpsLat: lat,
        gpsLng: lng,
        gpsAddress: address,
      ),
    );
  }

  void setTimeOutError(String error) {
    state = state.copyWith(
      timeOut: state.timeOut.copyWith(
        isCapturing: false,
        error: error,
      ),
    );
  }

  void reset() {
    state = const TouchpointFormState();
  }
}

/// Provider for touchpoint form state
final touchpointFormProvider =
    StateNotifierProvider<TouchpointFormNotifier, TouchpointFormState>(
  (ref) => TouchpointFormNotifier(),
);
```

- [ ] **Step 2: Commit provider**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/providers/touchpoint_form_provider.dart && git commit -m "feat(touchpoints): add TouchpointFormProvider for Time In/Out state

- TimeCaptureState for individual time capture
- TouchpointFormState for form-level state
- Computed properties: canFillForm, canSubmit, isTimeOutValid
- Notifiers for state updates

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create TimeCaptureSection Widget

**Files:**
- Create: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/time_capture_section.dart`

- [ ] **Step 1: Create the widget file**

```dart
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../services/location/geolocation_service.dart';

enum TimeCaptureStatus {
  notCaptured,
  capturing,
  captured,
  error,
  timeout,
  permissionDenied,
}

class TimeCaptureSection extends StatefulWidget {
  final String label;
  final String buttonLabel;
  final TimeCaptureStatus status;
  final DateTime? capturedTime;
  final double? gpsLat;
  final double? gpsLng;
  final String? gpsAddress;
  final String? errorMessage;
  final bool isEnabled;
  final bool showGps;
  final DateTime? minTime;
  final Function(DateTime time, double? lat, double? lng, String? address) onCapture;
  final VoidCallback? onSkip;
  final VoidCallback? onRetry;

  const TimeCaptureSection({
    super.key,
    required this.label,
    required this.buttonLabel,
    required this.status,
    this.capturedTime,
    this.gpsLat,
    this.gpsLng,
    this.gpsAddress,
    this.errorMessage,
    this.isEnabled = true,
    this.showGps = true,
    this.minTime,
    required this.onCapture,
    this.onSkip,
    this.onRetry,
  });

  @override
  State<TimeCaptureSection> createState() => _TimeCaptureSectionState();
}

class _TimeCaptureSectionState extends State<TimeCaptureSection> {
  final GeolocationService _geoService = GeolocationService();
  TimeOfDay _selectedTime = TimeOfDay.now();
  bool _isCapturingGps = false;

  String _formatTime(DateTime time) {
    final hour = time.hour > 12 ? time.hour - 12 : time.hour == 0 ? 12 : time.hour;
    final minute = time.minute.toString().padLeft(2, '0');
    final period = time.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $period';
  }

  Future<void> _showTimePicker() async {
    // For Time Out, default to Time In + 15 minutes
    TimeOfDay initialTime = _selectedTime;
    if (widget.minTime != null) {
      final defaultTime = widget.minTime!.add(const Duration(minutes: 15));
      initialTime = TimeOfDay(hour: defaultTime.hour, minute: defaultTime.minute);
    }

    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: initialTime,
    );

    if (picked != null) {
      setState(() {
        _selectedTime = picked;
      });
      await _captureWithGps();
    }
  }

  Future<void> _captureWithGps() async {
    if (!widget.showGps) {
      // No GPS needed, just capture time
      final now = DateTime.now();
      final capturedTime = DateTime(
        now.year,
        now.month,
        now.day,
        _selectedTime.hour,
        _selectedTime.minute,
      );
      widget.onCapture(capturedTime, null, null, null);
      return;
    }

    setState(() {
      _isCapturingGps = true;
    });

    try {
      final (position, result, errorMessage) =
          await _geoService.getCurrentPositionWithResult();

      if (position == null) {
        setState(() {
          _isCapturingGps = false;
        });
        if (mounted) {
          _showGpsErrorDialog(result, errorMessage);
        }
        return;
      }

      // Get address
      String? address;
      try {
        address = await _geoService.getAddressFromCoordinates(
          position.latitude,
          position.longitude,
        );
      } catch (_) {
        // Address lookup failed, continue without it
      }

      final now = DateTime.now();
      final capturedTime = DateTime(
        now.year,
        now.month,
        now.day,
        _selectedTime.hour,
        _selectedTime.minute,
      );

      widget.onCapture(
        capturedTime,
        position.latitude,
        position.longitude,
        address,
      );

      setState(() {
        _isCapturingGps = false;
      });
    } catch (e) {
      setState(() {
        _isCapturingGps = false;
      });
      if (mounted) {
        _showGpsErrorDialog(LocationResult.error, e.toString());
      }
    }
  }

  void _showGpsErrorDialog(LocationResult? result, String? message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange[700]),
            const SizedBox(width: 8),
            Text(
              result == LocationResult.permissionDenied
                  ? 'Location Permission'
                  : 'GPS Signal Weak',
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              result == LocationResult.permissionDenied
                  ? 'Location permission is required for GPS capture.'
                  : 'Unable to get accurate location after 30 seconds.',
            ),
            const SizedBox(height: 12),
            Text('Time: ${_formatTime(DateTime.now())}'),
            Text('GPS: Not captured'),
          ],
        ),
        actions: [
          if (result == LocationResult.permissionDenied)
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                Geolocator.openAppSettings();
              },
              child: const Text('Open Settings'),
            ),
          if (widget.onRetry != null)
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                widget.onRetry!();
              },
              child: const Text('Try Again'),
            ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _captureWithoutGps();
            },
            child: const Text('Continue Without GPS'),
          ),
        ],
      ),
    );
  }

  void _captureWithoutGps() {
    final now = DateTime.now();
    final capturedTime = DateTime(
      now.year,
      now.month,
      now.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );
    widget.onCapture(capturedTime, null, null, null);
  }

  @override
  Widget build(BuildContext context) {
    final isCaptured = widget.status == TimeCaptureStatus.captured;
    final isCapturing = widget.status == TimeCaptureStatus.capturing || _isCapturingGps;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isCaptured ? Icons.check_circle : Icons.access_time,
                  color: isCaptured ? Colors.green : Colors.grey[600],
                ),
                const SizedBox(width: 8),
                Text(
                  widget.label,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const Spacer(),
                if (isCaptured && widget.isEnabled)
                  TextButton.icon(
                    onPressed: _showTimePicker,
                    icon: const Icon(Icons.edit, size: 18),
                    label: const Text('Edit'),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (isCaptured) ...[
              Row(
                children: [
                  const Icon(Icons.schedule, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Time: ${_formatTime(widget.capturedTime!)}',
                    style: const TextStyle(fontSize: 16),
                  ),
                ],
              ),
              if (widget.showGps) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(
                      widget.gpsLat != null ? Icons.location_on : Icons.location_off,
                      size: 20,
                      color: widget.gpsLat != null ? Colors.green : Colors.orange,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.gpsLat != null
                            ? 'GPS: ${widget.gpsLat!.toStringAsFixed(4)}, ${widget.gpsLng!.toStringAsFixed(4)}'
                            : 'GPS: Not captured',
                        style: TextStyle(
                          fontSize: 14,
                          color: widget.gpsLat != null ? null : Colors.orange,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${widget.label} Captured',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.green[700]),
                ),
              ),
            ] else if (isCapturing) ...[
              const Center(
                child: Column(
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 12),
                    Text('Capturing GPS...'),
                    SizedBox(height: 4),
                    Text('Acquiring location...'),
                  ],
                ),
              ),
            ] else ...[
              if (widget.showGps)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.grey[600]),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'GPS will be captured when confirmed',
                          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        ),
                      ),
                    ],
                  ),
                ),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: widget.isEnabled ? _showTimePicker : null,
                  icon: const Icon(Icons.access_time),
                  label: Text(widget.buttonLabel),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit widget**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/presentation/widgets/time_capture_section.dart && git commit -m "feat(touchpoints): add TimeCaptureSection widget

- Time picker dialog for manual time selection
- GPS capture with loading state
- Error handling for permission denied and timeout
- Skip GPS option for poor signal
- Edit capability after capture
- Visual states: not captured, capturing, captured

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update TouchpointForm to Use New Flow

**Files:**
- Modify: `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

- [ ] **Step 1: Add imports for new provider and widget**

Add at the top of the file:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/touchpoint_form_provider.dart';
import './time_capture_section.dart';
```

- [ ] **Step 2: Convert widget to ConsumerStatefulWidget**

Change the class declaration from `class TouchpointForm extends StatefulWidget` to:

```dart
class TouchpointForm extends ConsumerStatefulWidget {
  // ... existing constructor params

  @override
  ConsumerState<TouchpointForm> createState() => _TouchpointFormState();
}

class _TouchpointFormState extends ConsumerState<TouchpointForm> {
```

- [ ] **Step 3: Add Time In section at top of form**

After the header section in the build method, add:

```dart
            // Time In/Out sections for Visit type only
            if (widget.touchpointType == 'Visit') ...[
              // Time In Section
              TimeCaptureSection(
                label: 'TIME IN',
                buttonLabel: 'CAPTURE TIME IN',
                status: ref.watch(touchpointFormProvider).timeIn.isCapturing
                    ? TimeCaptureStatus.capturing
                    : ref.watch(touchpointFormProvider).timeIn.isCaptured
                        ? TimeCaptureStatus.captured
                        : TimeCaptureStatus.notCaptured,
                capturedTime: ref.watch(touchpointFormProvider).timeIn.time,
                gpsLat: ref.watch(touchpointFormProvider).timeIn.gpsLat,
                gpsLng: ref.watch(touchpointFormProvider).timeIn.gpsLng,
                gpsAddress: ref.watch(touchpointFormProvider).timeIn.gpsAddress,
                isEnabled: true,
                showGps: true,
                onCapture: (time, lat, lng, address) {
                  ref.read(touchpointFormProvider.notifier).setTimeIn(
                        time,
                        lat,
                        lng,
                        address,
                      );
                },
                onRetry: () {
                  _retryTimeIn();
                },
              ),

              const SizedBox(height: 16),
            ],
```

- [ ] **Step 4: Wrap form fields in IgnorePointer for disabled state**

Wrap the existing form fields section with:

```dart
            IgnorePointer(
              ignoring: !ref.watch(touchpointFormProvider).canFillForm,
              child: Opacity(
                opacity: ref.watch(touchpointFormProvider).canFillForm ? 1.0 : 0.5,
                child: Column(
                  children: [
                    // ... existing form fields (reason dropdowns, remarks, etc.)
                  ],
                ),
              ),
            ),
```

- [ ] **Step 5: Add Time Out section before Submit button**

Before the Submit button, add:

```dart
            // Time Out Section for Visit type
            if (widget.touchpointType == 'Visit') ...[
              const SizedBox(height: 16),
              TimeCaptureSection(
                label: 'TIME OUT',
                buttonLabel: 'CAPTURE TIME OUT',
                status: ref.watch(touchpointFormProvider).timeOut.isCapturing
                    ? TimeCaptureStatus.capturing
                    : ref.watch(touchpointFormProvider).timeOut.isCaptured
                        ? TimeCaptureStatus.captured
                        : TimeCaptureStatus.notCaptured,
                capturedTime: ref.watch(touchpointFormProvider).timeOut.time,
                gpsLat: ref.watch(touchpointFormProvider).timeOut.gpsLat,
                gpsLng: ref.watch(touchpointFormProvider).timeOut.gpsLng,
                gpsAddress: ref.watch(touchpointFormProvider).timeOut.gpsAddress,
                isEnabled: ref.watch(touchpointFormProvider).timeIn.isCaptured,
                showGps: true,
                minTime: ref.watch(touchpointFormProvider).timeIn.time,
                onCapture: (time, lat, lng, address) {
                  // Validate Time Out is after Time In
                  final timeIn = ref.read(touchpointFormProvider).timeIn.time;
                  if (timeIn != null && !time.isAfter(timeIn)) {
                    _showTimeOutValidationError(timeIn, time);
                    return;
                  }
                  ref.read(touchpointFormProvider.notifier).setTimeOut(
                        time,
                        lat,
                        lng,
                        address,
                      );
                },
                onRetry: () {
                  _retryTimeOut();
                },
              ),
            ],
```

- [ ] **Step 6: Add validation error dialog method**

Add this method to the state class:

```dart
  void _showTimeOutValidationError(DateTime timeIn, DateTime timeOut) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange),
            SizedBox(width: 8),
            Text('Invalid Time'),
          ],
        ),
        content: Text(
          'Time Out (${_formatTime(timeOut)}) must be after '
          'Time In (${_formatTime(timeIn)}).\n\n'
          'Please select a later time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final hour = time.hour > 12 ? time.hour - 12 : time.hour == 0 ? 12 : time.hour;
    final minute = time.minute.toString().padLeft(2, '0');
    final period = time.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $period';
  }

  void _retryTimeIn() {
    // Reset time in and show picker again
    setState(() {
      // Will trigger time picker on next build
    });
  }

  void _retryTimeOut() {
    // Reset time out and show picker again
    setState(() {
      // Will trigger time picker on next build
    });
  }
```

- [ ] **Step 7: Update Submit button to use canSubmit**

Change the Submit button to:

```dart
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: ref.watch(touchpointFormProvider).canSubmit
                      ? _submitForm
                      : null,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: const Text(
                    'SUBMIT VISIT',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
```

- [ ] **Step 8: Remove auto-GPS capture on form open**

Remove or comment out this code block (GPS is now captured on Time In button tap):

```dart
// Remove this:
if (widget.touchpointType == 'Visit') {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    _captureGps();
  });
}
```

- [ ] **Step 9: Update _submitForm to include Time In/Out data**

Modify the submit method to include the new fields:

```dart
  void _submitForm() {
    final formState = ref.read(touchpointFormProvider);

    // Create touchpoint with Time In/Out data
    final touchpoint = Touchpoint(
      // ... existing fields ...
      timeIn: formState.timeIn.time,
      timeInGpsLat: formState.timeIn.gpsLat,
      timeInGpsLng: formState.timeIn.gpsLng,
      timeInGpsAddress: formState.timeIn.gpsAddress,
      timeOut: formState.timeOut.time,
      timeOutGpsLat: formState.timeOut.gpsLat,
      timeOutGpsLng: formState.timeOut.gpsLng,
      timeOutGpsAddress: formState.timeOut.gpsAddress,
    );

    // ... rest of submit logic
  }
```

- [ ] **Step 10: Commit touchpoint form changes**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/presentation/widgets/touchpoint_form.dart && git commit -m "feat(touchpoints): integrate Time In/Out flow into form

- Add TimeCaptureSection for Time In at top
- Wrap form fields in disabled state until Time In captured
- Add TimeCaptureSection for Time Out before submit
- Validate Time Out must be after Time In
- Update submit button to use canSubmit
- Remove auto-GPS capture (now on button tap)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update My Day Client Card

**Files:**
- Modify: `mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart`
- Or: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/client_card.dart` (if exists)

- [ ] **Step 1: Find the client card or list tile implementation**

Locate where clients are displayed in the My Day page. Look for widgets that show the client list with Time In button.

- [ ] **Step 2: Replace Time In button with Start Visit button**

Change the existing Time In button to open the touchpoint form directly:

```dart
// Before (existing):
// IconButton for Time In that opens time_in_bottom_sheet

// After:
ElevatedButton.icon(
  onPressed: () {
    // Open touchpoint form directly
    _showTouchpointForm(client);
  },
  icon: const Icon(Icons.play_arrow),
  label: const Text('Start Visit'),
  style: ElevatedButton.styleFrom(
    backgroundColor: Theme.of(context).primaryColor,
    foregroundColor: Colors.white,
  ),
),
```

- [ ] **Step 3: Update _showTouchpointForm method**

Ensure the method opens the TouchpointForm widget:

```dart
void _showTouchpointForm(MyDayClient client) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => TouchpointForm(
        clientId: client.id,
        clientName: client.fullName,
        touchpointNumber: client.touchpointNumber,
        touchpointType: client.touchpointType,
        scrollController: scrollController,
        onSubmit: (touchpoint) {
          Navigator.pop(context);
          _refreshClients();
        },
      ),
    ),
  );
}
```

- [ ] **Step 4: Commit My Day changes**

```bash
cd mobile/imu_flutter && git add lib/features/my_day/ && git commit -m "feat(my-day): replace Time In button with Start Visit

- Remove separate Time In button
- Add Start Visit button that opens form directly
- Form now handles Time In/Out internally

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Delete Time In Bottom Sheet

**Files:**
- Delete: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart`

- [ ] **Step 1: Delete the file**

```bash
rm mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart
```

- [ ] **Step 2: Remove any imports referencing the deleted file**

Search for and remove imports like:

```dart
import '../widgets/time_in_bottom_sheet.dart';
```

- [ ] **Step 3: Commit deletion**

```bash
cd mobile/imu_flutter && git add -A && git commit -m "refactor: remove time_in_bottom_sheet (functionality moved to form)

Time In/Out now handled inside TouchpointForm via TimeCaptureSection.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update Backend Route for New Fields

**Files:**
- Modify: `backend/src/routes/touchpoints.ts`

- [ ] **Step 1: Add new fields to SELECT query**

Find the SELECT statement and add the new columns:

```typescript
// In the SELECT query for touchpoints
SELECT
  t.id,
  t.client_id,
  -- ... existing fields ...
  t.time_in,
  t.time_in_gps_lat,
  t.time_in_gps_lng,
  t.time_in_gps_address,
  t.time_out,
  t.time_out_gps_lat,
  t.time_out_gps_lng,
  t.time_out_gps_address
FROM touchpoints t
```

- [ ] **Step 2: Add new fields to INSERT query**

Update the create touchpoint endpoint:

```typescript
// In INSERT statement
INSERT INTO touchpoints (
  id,
  client_id,
  -- ... existing fields ...
  time_in,
  time_in_gps_lat,
  time_in_gps_lng,
  time_in_gps_address,
  time_out,
  time_out_gps_lat,
  time_out_gps_lng,
  time_out_gps_address
) VALUES ($1, $2, ..., $8, $9, $10, $11, $12, $13, $14, $15)
```

- [ ] **Step 3: Add validation for Time Out > Time In**

Add validation in the create/update handler:

```typescript
// Validate Time Out is after Time In
if (timeIn && timeOut) {
  const timeInDate = new Date(timeIn);
  const timeOutDate = new Date(timeOut);
  if (timeOutDate <= timeInDate) {
    return res.status(400).json({
      error: 'Time Out must be after Time In',
    });
  }
}
```

- [ ] **Step 4: Commit backend changes**

```bash
cd backend && git add src/routes/touchpoints.ts && git commit -m "feat(backend): add Time In/Out fields to touchpoints route

- Add new columns to SELECT
- Add new fields to INSERT/UPDATE
- Add validation for Time Out > Time In

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create Database Migration

**Files:**
- Create: Database migration script or SQL file

- [ ] **Step 1: Create migration SQL**

Create a migration file or run directly:

```sql
-- Add Time In/Out columns to touchpoints table
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_lng DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_in_gps_address TEXT;

ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_lng DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS time_out_gps_address TEXT;

-- Create index for queries filtering by time_in
CREATE INDEX IF NOT EXISTS idx_touchpoints_time_in ON touchpoints(time_in);
```

- [ ] **Step 2: Commit migration**

```bash
git add backend/migrations/ && git commit -m "feat(db): add Time In/Out columns migration

- Add time_in/time_out with GPS fields
- Add index on time_in for query performance

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Run Tests and Verify

- [ ] **Step 1: Run Flutter analyze**

```bash
cd mobile/imu_flutter && flutter analyze
```

Expected: No errors related to the new code.

- [ ] **Step 2: Run Flutter tests**

```bash
cd mobile/imu_flutter && flutter test
```

Expected: All tests pass.

- [ ] **Step 3: Run app and verify manually**

```bash
cd mobile/imu_flutter && flutter run
```

Test the following:
1. Open My Day page
2. Tap "Start Visit" on a client
3. Verify Time In section appears at top
4. Verify form fields are disabled
5. Tap "Capture Time In", select time, verify GPS capture
6. Verify form fields become enabled
7. Fill out form fields
8. Tap "Capture Time Out", select time after Time In
9. Verify Submit button becomes enabled
10. Submit and verify data is saved

- [ ] **Step 4: Test Call type touchpoint**

1. Start a Call touchpoint
2. Verify Time In/Out sections are hidden
3. Verify form is immediately enabled
4. Submit and verify

---

## Additional Considerations

### Form Persistence (Future Enhancement)

The spec mentions form data should be preserved if user closes/reopens. This can be added later using:

1. **Hive box for draft forms** - Store form state in a dedicated Hive box
2. **Auto-save on changes** - Save form state after each field change
3. **Restore on form open** - Check for existing draft and prompt user to continue

```dart
// Future: Add to TouchpointFormProvider
Future<void> saveDraft() async {
  final box = await Hive.openBox('form_drafts');
  await box.put('draft_${widget.clientId}', state.toJson());
}

Future<void> restoreDraft() async {
  final box = await Hive.openBox('form_drafts');
  final draft = box.get('draft_${widget.clientId}');
  if (draft != null) {
    // Restore state from draft
  }
}
```

### Edit Warning for Synced Visits

When editing a visit that has already been synced to the server, show a warning:

```dart
void _showEditWarning() {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Edit Visit?'),
      content: const Text(
        'This visit has already been synced. Changes will be logged and may require approval.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () {
            Navigator.pop(context);
            // Proceed with edit
          },
          child: const Text('Continue'),
        ),
      ],
    ),
  );
}
```

### TimePicker Defaulting

For Time Out, the picker defaults to Time In + 15 minutes (already implemented in Step 1 of Task 3). This provides a reasonable default while still allowing manual adjustment.

---

## Final Commit

- [ ] **Step 1: Create final summary commit if needed**

```bash
git add -A && git commit -m "feat(visit): complete Time In/Out refactor

- Time In/Out inside form with manual time selection
- GPS capture on button tap with timeout handling
- Time Out must be after Time In validation
- Call type skips Time In/Out flow
- Removed separate time_in_bottom_sheet

Closes: #issue-number

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
