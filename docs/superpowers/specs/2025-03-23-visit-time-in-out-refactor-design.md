# Visit Time In/Out Refactor Design

**Date:** 2025-03-23
**Status:** Draft
**Author:** Claude + User
**Related:** Sprint 1 discussion on visit time tracking

---

## Problem Statement

Field agents currently have an automatic Time In feature that captures the exact moment they tap the button. This creates issues:

1. **Agents forget to time in** - They arrive at a client, forget to tap, and want to backdate later
2. **Distracted tapping** - Sometimes they tap the button late (distracted), recording wrong time
3. **Compliance needs** - Management needs to record "actual" arrival/departure times for audit purposes
4. **No Time Out feature** - Current implementation has no Time Out; departure time is just a manual text field

## Solution Overview

Refactor Time In and Time Out to be:
- **Inside the visit form** (not separate dialogs or buttons on client list)
- **Manual time selection** (user picks the time, can backdate)
- **GPS captured at button tap** (shows actual location when recording)
- **Strict sequence enforced** (Time In → Form → Time Out → Submit)

## Requirements

| Aspect | Decision |
|--------|----------|
| Time In/Out Location | Inside the visit form |
| Time In | Required first before form is enabled |
| Time Out | Required before submit is enabled |
| Time Selection | Manual - user picks time via time picker |
| GPS Capture | Captured when user taps the "Capture" button |
| Backdating | Allowed - user can select any time |
| Sequence | Time In → Fill Form → Time Out → Submit |
| Time Validation | Time Out must be chronologically after Time In |
| Touchpoint Type | Visit type only (Call type skips Time In/Out flow) |

## User Flow

### State 1: Form Opens (Time In Required)

```
┌────────────────────────────────────────────────────────────────┐
│  VISIT FORM                                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📍 TIME IN                                        [⏸️]  │  │
│  │  Time:  --:-- --   (not captured)                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            CAPTURE TIME IN                         │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [All form fields DISABLED/GRAYED OUT]                        │
│                                                                │
│  [TIME OUT section HIDDEN]                                    │
│                                                                │
│  [SUBMIT button DISABLED]                                     │
└────────────────────────────────────────────────────────────────┘
```

### State 2: Time In Captured (Form Enabled)

```
┌────────────────────────────────────────────────────────────────┐
│  VISIT FORM                                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📍 TIME IN                                        [✏️]  │  │
│  │  Time:  🕐 9:00 AM    ✓ Captured                         │  │
│  │  📍 GPS: 14.5995, 120.9842                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            ✓ TIME IN CAPTURED                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  TOUCHPOINT NUMBER: [1] [2] [3] [4] [5] [6] [7]  [ENABLED]    │
│  TRANSACTION TYPE:  [Dropdown...]               [ENABLED]      │
│  CLIENT STATUS:     [Dropdown...]               [ENABLED]      │
│  REMARKS:           [Text area...]              [ENABLED]      │
│  ODOMETER ARRIVAL:  [_______]                   [ENABLED]      │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📍 TIME OUT                                       [⏸️]  │  │
│  │  Time:  --:-- --   (not captured)                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            CAPTURE TIME OUT                        │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ODOMETER DEPARTURE: [_______]                  [ENABLED]      │
│                                                                │
│  [SUBMIT button DISABLED - waiting for Time Out]              │
└────────────────────────────────────────────────────────────────┘
```

### State 3: Time Out Captured (Ready to Submit)

```
┌────────────────────────────────────────────────────────────────┐
│  VISIT FORM                                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📍 TIME IN                                        [✏️]  │  │
│  │  Time:  🕐 9:00 AM    ✓ Captured                         │  │
│  │  📍 GPS: 14.5995, 120.9842                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Form fields - filled by agent]                              │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📍 TIME OUT                                       [✏️]  │  │
│  │  Time:  🕐 10:30 AM   ✓ Captured                         │  │
│  │  📍 GPS: 14.5995, 120.9842                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │            ✓ TIME OUT CAPTURED                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ODOMETER DEPARTURE: [123456]                  [ENABLED]       │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  SUBMIT VISIT                         ▶  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Time Selection UI

When user taps "CAPTURE TIME IN" or "CAPTURE TIME OUT":

### Step 1: Time Picker Dialog

```
┌─────────────────────────────────────────┐
│         🕐 SELECT TIME                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │      [  9  ] : [  00  ] AM     │    │  ← Flutter time picker
│  └─────────────────────────────────┘    │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📍 GPS will be captured when confirmed │
│                                         │
│  ┌────────────────┐ ┌────────────────┐  │
│  │    CANCEL      │ │    CONFIRM     │  │
│  └────────────────┘ └────────────────┘  │
└─────────────────────────────────────────┘
```

### Step 2: GPS Capturing (Loading State)

After user taps CONFIRM, show GPS capture in progress:

```
┌─────────────────────────────────────────┐
│         📍 CAPTURING GPS...             │
├─────────────────────────────────────────┤
│                                         │
│           [░░░░░░░░░░░░░░░]             │  ← Progress indicator
│                                         │
│         Time: 9:00 AM                   │
│         Acquiring location...           │
│                                         │
│         ┌────────────────────┐          │
│         │    CANCEL          │          │
│         └────────────────────┘          │
└─────────────────────────────────────────┘
```

### Step 3: GPS Timeout (After 30 seconds)

If GPS takes too long:

```
┌─────────────────────────────────────────┐
│         ⚠️ GPS SIGNAL WEAK              │
├─────────────────────────────────────────┤
│                                         │
│    Unable to get accurate location      │
│    after 30 seconds.                    │
│                                         │
│    Time: 9:00 AM                        │
│    GPS: Not captured                    │
│                                         │
│    ┌────────────────┐ ┌──────────────┐  │
│    │   TRY AGAIN    │ │   SKIP GPS   │  │
│    └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────┘
```

### Step 4: GPS Permission Denied

```
┌─────────────────────────────────────────┐
│         ⚠️ LOCATION PERMISSION          │
├─────────────────────────────────────────┤
│                                         │
│    Location permission is required      │
│    for GPS capture.                     │
│                                         │
│    Time: 9:00 AM                        │
│    GPS: Not captured                    │
│                                         │
│    ┌────────────────┐ ┌──────────────┐  │
│    │  OPEN SETTINGS │ │ CONTINUE     │  │
│    │                │ │ WITHOUT GPS  │  │
│    └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────┘
```

**On CONFIRM:**
1. Save selected time
2. Capture current GPS coordinates (with 30s timeout)
3. If successful: Reverse-geocode to get address
4. If timeout/permission denied: Show options to retry or skip
5. Update UI to show captured state

## Edit Behavior

After capturing, the [✏️ Edit] button allows:
- **Re-picking time** - Opens time picker again
- **Re-capturing GPS** - Captures new location when confirmed
- **Form data preserved** - All filled form fields remain intact when editing Time In/Out

This is useful if agent made a mistake or wants to correct the entry.

## Time Validation

### Time Out Must Be After Time In

When user confirms Time Out, validate that `timeOut > timeIn`:

```
┌─────────────────────────────────────────┐
│         ⚠️ INVALID TIME                 │
├─────────────────────────────────────────┤
│                                         │
│    Time Out (9:00 AM) must be after     │
│    Time In (10:30 AM).                  │
│                                         │
│    Please select a later time.          │
│                                         │
│         ┌────────────────────┐          │
│         │        OK          │          │
│         └────────────────────┘          │
└─────────────────────────────────────────┘
```

The Time Out picker should default to a time after Time In (e.g., Time In + 15 minutes).

## Data Model

### Touchpoint Model Changes

**File:** `lib/features/clients/data/models/client_model.dart`

```dart
class Touchpoint {
  // ... existing fields ...

  // Time In
  DateTime? timeIn;                    // Manual time selection
  double? timeInGpsLat;                // GPS latitude at capture
  double? timeInGpsLng;                // GPS longitude at capture
  String? timeInGpsAddress;            // Reverse-geocoded address

  // Time Out
  DateTime? timeOut;                   // Manual time selection
  double? timeOutGpsLat;               // GPS latitude at capture
  double? timeOutGpsLng;               // GPS longitude at capture
  String? timeOutGpsAddress;           // Reverse-geocoded address

  // Keep existing for backwards compatibility
  TimeOfDay? timeArrival;              // @deprecated - use timeIn
  TimeOfDay? timeDeparture;            // @deprecated - use timeOut
}
```

### Backend Schema Changes

**Table:** `touchpoints`

```sql
ALTER TABLE touchpoints ADD COLUMN time_in TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN time_in_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN time_in_gps_lng DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN time_in_gps_address TEXT;

ALTER TABLE touchpoints ADD COLUMN time_out TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN time_out_gps_lat DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN time_out_gps_lng DOUBLE PRECISION;
ALTER TABLE touchpoints ADD COLUMN time_out_gps_address TEXT;
```

## Components to Modify

### 1. Touchpoint Form Widget
**File:** `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

This is a modal widget (not a page) that shows the visit/touchpoint form.

Changes:
- Add Time In section at top of form
- Disable all form fields until Time In is captured (for Visit type)
- Add Time Out section after form fields
- Disable Submit until Time Out is captured
- Remove/replace existing `timeArrival`/`timeDeparture` text fields
- For Call type: Hide Time In/Out sections, enable form immediately

### 2. Time Capture Widget (New)
**File:** `lib/features/touchpoints/presentation/widgets/time_capture_section.dart`

A reusable widget for Time In and Time Out:
```dart
class TimeCaptureSection extends StatefulWidget {
  final String label;                    // "Time In" or "Time Out"
  final DateTime? capturedTime;
  final double? gpsLat;
  final double? gpsLng;
  final String? gpsAddress;
  final bool isEnabled;
  final bool showGps;                    // false for Call type
  final Function(DateTime, double?, double?, String?) onCapture;
}
```

Features:
- Shows "Capture" button when not captured
- Shows loading state while capturing GPS
- Shows captured time + GPS when captured
- Edit button to re-capture
- Time picker dialog on tap
- Handles GPS timeout with "Skip GPS" option

### 3. Form State Management
**File:** `lib/features/touchpoints/providers/touchpoint_form_provider.dart` (create if not exists)

The current implementation uses local state in the widget. A provider should be created for cleaner state management.

State to track:
```dart
class TouchpointFormState {
  TouchpointType type;  // Visit or Call

  // Time In
  DateTime? timeIn;
  double? timeInGpsLat;
  double? timeInGpsLng;
  String? timeInGpsAddress;
  bool timeInCaptured = false;

  // Time Out
  DateTime? timeOut;
  double? timeOutGpsLat;
  double? timeOutGpsLng;
  String? timeOutGpsAddress;
  bool timeOutCaptured = false;

  // Form data (preserved during edits)
  Map<String, dynamic> formData = {};

  // Computed
  bool get canFillForm => type == TouchpointType.call || timeInCaptured;
  bool get canSubmit => type == TouchpointType.call
    || (timeInCaptured && timeOutCaptured && timeOut!.isAfter(timeIn!));
}
```

### 4. My Day Client List (Simplified)
**File:** `lib/features/my_day/presentation/widgets/my_day_client_card.dart`

Changes:
- Remove existing Time In button from client card
- Replace with single "Start Visit" button that opens the visit form modal
- Remove `time_in_bottom_sheet.dart` (no longer needed)

## Migration Plan

### Phase 1: Add New Fields
1. Add new fields to Touchpoint model in `client_model.dart`
2. Regenerate Hive adapters: `dart run build_runner build --delete-conflicting-outputs`
3. Add new columns to backend database
4. Keep existing `timeArrival`/`timeDeparture` fields for backwards compatibility
5. Update Hive field IDs carefully (increment from last used ID)

### Phase 2: Update UI
1. Create `TouchpointFormProvider` for state management
2. Create `TimeCaptureSection` widget
3. Update touchpoint form widget to use new flow
4. Update My Day client card
5. Remove old time in bottom sheet

### Phase 3: Cleanup
1. Remove deprecated `timeArrival`/`timeDeparture` fields from model
2. Regenerate Hive adapters again
3. Update any reports/exports that used old fields
4. Remove old columns from database (after data migration)

## Edge Cases

### Call vs Visit Touchpoints

**Visit Type:** Requires full Time In/Out flow with GPS capture.

**Call Type:** Different flow - no GPS needed:
- Time In/Out section is hidden or simplified
- Only shows time fields (no GPS)
- No location tracking required
- Form is immediately enabled (no Time In gate)

This matches the current behavior where GPS is only captured for Visit type.

### GPS Permission Denied
- Show clear error message
- Allow time capture without GPS (GPS fields remain null)
- Flag in UI that GPS was not captured

### GPS Timeout
- After 30 seconds, show option to skip GPS
- Allow proceeding with time only

### Offline Mode
- Time capture works offline
- GPS capture works offline (if device has cached location)
- Sync happens when connection restored
- Form data is persisted locally if user closes app before submission

### Form Persistence
If user closes/reopens the form before submission:
- All captured times are preserved
- All filled form fields are preserved
- GPS coordinates are preserved
- User can continue where they left off

### Editing Submitted Visit
- Time In/Out can be edited if visit not yet synced
- Show warning that changes will be logged

## Acceptance Criteria

1. **Time In required first (Visit type):** Form fields are disabled until Time In is captured
2. **Manual time selection:** User can pick any time via time picker
3. **GPS captured on confirm:** GPS coordinates captured when user confirms time
4. **Time Out required:** Submit button disabled until Time Out is captured
5. **Time validation:** Time Out must be after Time In (error shown if not)
6. **Edit capability:** User can edit Time In/Out after capturing; form data preserved
7. **GPS handling:** Graceful handling of permission denial and timeout with "Skip GPS" option
8. **GPS loading state:** Show progress indicator while capturing GPS
9. **Call type handling:** Call touchpoints skip Time In/Out flow; form enabled immediately
10. **Offline support:** Time/GPS capture works offline; form data persisted locally
11. **Data sync:** New fields sync to backend correctly
12. **Hive migration:** Adapters regenerated after model changes

## Files Changed

| File | Action |
|------|--------|
| `lib/features/clients/data/models/client_model.dart` | Modify - add new Time In/Out fields |
| `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` | Modify - integrate Time In/Out flow |
| `lib/features/touchpoints/presentation/widgets/time_capture_section.dart` | Create - new widget |
| `lib/features/touchpoints/providers/touchpoint_form_provider.dart` | Create - form state management |
| `lib/features/my_day/presentation/widgets/my_day_client_card.dart` | Modify - simplify to "Start Visit" button |
| `lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart` | Delete - no longer needed |
| `lib/services/location/geolocation_service.dart` | Modify - add timeout handling |
| `backend/src/routes/touchpoints.ts` | Modify - new fields |
| `mobile/imu_flutter/pubspec.yaml` | Modify - if new dependencies needed |
| Database migration | Create - new columns |

## Hive Model Field IDs

When adding new fields to the Touchpoint model, use sequential Hive field IDs:

```dart
@HiveType(typeId: 3)
class Touchpoint extends HiveObject {
  // ... existing fields with IDs 0-19 ...

  // New fields - use next available IDs
  @HiveField(20)
  DateTime? timeIn;

  @HiveField(21)
  double? timeInGpsLat;

  @HiveField(22)
  double? timeInGpsLng;

  @HiveField(23)
  String? timeInGpsAddress;

  @HiveField(24)
  DateTime? timeOut;

  @HiveField(25)
  double? timeOutGpsLat;

  @HiveField(26)
  double? timeOutGpsLng;

  @HiveField(27)
  String? timeOutGpsAddress;
}
```

**Important:** After modifying the model, always run:
```bash
dart run build_runner build --delete-conflicting-outputs
```
