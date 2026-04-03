# My Day Figma Alignment Design Spec

**Date:** 2025-03-13
**Status:** Approved for Implementation
**Related:** Figma Node ID 973:3620
**Review Notes:** Addressed reviewer feedback - added user flow, validation, error handling, placeholder dropdowns

---

## Overview

This spec defines the changes required to align the Flutter IMU mobile app with the Figma design for the "My Day" feature. The goal is to achieve an exact match with the Figma design, simplifying the user experience for field agents.

## Goals

1. Redesign "My Day" main screen to be visit-centric (not task-centric)
2. Add prominent "Time In" and "Selfie" buttons for quick check-in
3. Simplify touchpoint form to dropdown-based inputs
4. Remove odometer tracking and manual time pickers

## Non-Goals

- Preserving backward compatibility (app not yet deployed)
- Adding new features beyond Figma design
- Maintaining existing task status grouping (pending/in_progress/completed)

---

## Section 1: My Day Main Screen

### Current State
- Summary card with progress statistics
- Status tabs (Pending, In Progress, Completed)
- Task cards with checkbox, task type icon, client name, scheduled time

### Target State
- Simple header with "My Day" title and current date
- Two filter buttons: "Multiple Time In" and "Add new visit"
- Visit cards showing: touchpoint number, client name, agency name
- No checkboxes - tap card to open

### UI Components

#### Header
```
┌─────────────────────────────────────┐
│  My Day              Sep 16, 2024   │
└─────────────────────────────────────┘
```
- Title: "My Day" (left-aligned)
- Date: Current date in "MMM DD, YYYY" format (right-aligned)

#### Filter Buttons Row
```
┌─────────────────────────────────────┐
│  ┌──────────────┐ ┌───────────────┐ │
│  │Multiple Time │ │ 📍Add new     │ │
│  │     In       │ │   visit       │ │
│  └──────────────┘ └───────────────┘ │
└─────────────────────────────────────┘
```
- "Multiple Time In" button (left)
  - Icon: hand-point (multiple)
  - Background: Light gray
  - Rounded corners
- "Add new visit" button (right)
  - Icon: map-pin
  - Background: Light gray
  - Rounded corners

#### Visit Card
```
┌─────────────────────────────────────┐
│  📍 4th                             │
│     Amagar, Mina C.                 │
│     CSC - MAIN OFFICE               │
├─────────────────────────────────────┤
│  📍 2nd                             │
│     Reyes, Kristine D.              │
│     DOH - CVMC R2 TUG               │
└─────────────────────────────────────┘
```
- Touchpoint indicator: map-pin icon + ordinal ("4th", "2nd", "7th")
- Client name: Full name, bold
- Agency name: Gray text, below client name
- Tap entire card to navigate to client detail

### Files to Modify

| File | Action |
|------|--------|
| `lib/features/my_day/presentation/pages/my_day_page.dart` | Complete redesign |

### Files to Create

| File | Purpose |
|------|---------|
| `lib/features/my_day/presentation/widgets/visit_card.dart` | New visit card widget |
| `lib/features/my_day/presentation/widgets/filter_buttons.dart` | Filter buttons component |

---

## Section 2: Time In / Selfie UX

### Current State
- Time of Arrival: TimeOfDay picker in form
- Time of Departure: TimeOfDay picker in form
- Photo Evidence: Camera button in form

### Target State
- Prominent "Time In" button capturing GPS + timestamp
- Prominent "Selfie" button for verification photo
- Both buttons displayed at top of visit detail, before form

### UI Components

#### Time In Button
```
┌─────────────────┐
│       📍        │
│     Time In     │
│                 │
│    8:30 AM      │  ← After capture
│ 88 National Rd, │
│  Tuguegarao...  │
└─────────────────┘
```
- Large tap target
- Icon: map-pin
- Before capture: Shows "Time In" label
- After capture: Shows timestamp and reverse-geocoded address
- Auto-captures: current time, GPS coordinates
- Reverse geocodes to human-readable address

#### Selfie Button
```
┌─────────────────┐
│       📷        │
│     Selfie      │
│                 │
│    (empty)      │  ← Before capture
│                 │
└─────────────────┘

┌─────────────────┐
│     [photo]     │
│     Selfie      │
│                 │
│    ✓ Captured   │  ← After capture
│                 │
└─────────────────┘
```
- Large tap target
- Icon: camera
- Opens camera for selfie capture
- Shows thumbnail after capture
- Tap to retake

#### Touchpoint Sequence Bar
```
┌─────────────────────────────────────────────────────────────────┐
│ [📍1st][📞2nd][📍3rd][📍4th][📞5th][📞6th][📍7th][📦Archive]     │
└─────────────────────────────────────────────────────────────────┘
```
- Horizontal scrollable bar
- Shows all 7 touchpoints + Archive
- Visit = map-pin icon
- Call = phone icon
- Current touchpoint highlighted
- Tap to view that touchpoint's details (if completed)

### Behavior

**Time In Flow:**
1. User taps "Time In" button
2. System captures current timestamp
3. System captures GPS coordinates
4. System reverse geocodes to address
5. Button updates to show time + address
6. Data stored in touchpoint record

**Selfie Flow:**
1. User taps "Selfie" button
2. Camera opens in selfie mode
3. User captures photo
4. Photo displays in button area
5. Tap again to retake

### Files to Modify

| File | Action |
|------|--------|
| `lib/features/clients/presentation/pages/client_detail_page.dart` | Add Time In/Selfie buttons, sequence bar |

### Files to Create

| File | Purpose |
|------|---------|
| `lib/features/touchpoints/presentation/widgets/time_in_button.dart` | Time In button with GPS |
| `lib/features/touchpoints/presentation/widgets/selfie_button.dart` | Selfie camera button |
| `lib/features/touchpoints/presentation/widgets/touchpoint_sequence_bar.dart` | 1st-7th + Archive bar |

---

## Section 3: Touchpoint Form Simplification

### Current State
```
- Reason (25+ dropdown with color coding)
- Time of Arrival (TimeOfDay picker)
- Time of Departure (TimeOfDay picker)
- Odometer Arrival (text input)
- Odometer Departure (text input)
- Photo Evidence (camera picker)
- Next Visit Date (date picker)
- Remarks (text field)
```

### Target State
```
- Transaction (dropdown)
- Status (dropdown)
- Remarks (dropdown)
- Add New Release ⭐ (currency input - Php)
- Other Remarks (text area)
- Submit button (right-aligned)
```

### UI Layout
```
┌─────────────────────────────────────┐
│  Transaction    [Select Transaction]│
│  Status         [Select Status]     │
│  Remarks        [Select Remarks]    │
│  Add New Release ⭐  [Php ______]   │
│  Other Remarks  [________________]  │
│  _________________________________  │
│  _________________________________  │
│                    ┌────────┐       │
│                    │ Submit │       │
│                    └────────┘       │
└─────────────────────────────────────┘
```
- Label width: 82px (left-aligned)
- Input width: fill remaining (261px on 393px screen)
- Row height: 40px for dropdowns
- "Other Remarks": 148px height text area
- "Submit" button: 98px width, right-aligned

### Dropdown Options (Placeholder Values)

These options will be replaced with actual business values before deployment:

**Transaction Options (Placeholder):**
- New Business
- Follow-up
- Collection
- Renewal
- Inquiry

**Status Options (Placeholder):**
- Pending
- In Progress
- Completed
- Cancelled
- Rescheduled

**Remarks Options (Placeholder):**
- Successful visit
- Client not available
- Reschedule needed
- Requires follow-up
- Other (triggers Other Remarks field)

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        MY DAY FLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. MY DAY SCREEN
   ┌── User sees list of visits for today
   └── Tap "Multiple Time In" → Bulk time-in for selected visits
   └── Tap "Add new visit" → Navigate to client selector
   └── Tap visit card → Navigate to VISIT DETAIL

2. VISIT DETAIL SCREEN
   ┌── Header: < Back | Client name, Agency, Touchpoint #
   ┌── [Time In] [Selfie] buttons at top
   └── Touchpoint sequence bar (1st-7th + Archive)
   └── Form: Transaction, Status, Remarks, Release Amount, Other Remarks
   └── Submit button

3. TIME IN FLOW
   ┌── Tap "Time In" button
   └── Loading spinner (capturing GPS)
   └── Success: Shows time + address
   └── Error: Shows error message, retry option

4. SELFIE FLOW
   ┌── Tap "Selfie" button
   └── Camera opens in selfie mode
   └── Capture photo
   └── Preview: Retake or Accept
   └── Accept: Shows thumbnail in button

5. FORM SUBMISSION
   └── Fill required fields (Transaction, Status, Remarks)
   └── Optionally fill Release Amount, Other Remarks
   └── Tap Submit
   └── Validation errors shown if required fields empty
   └── Success: Navigate back to My Day, touchpoint marked complete
```

---

## Form Validation Rules

| Field | Required | Validation |
|-------|----------|------------|
| Transaction | Yes | Must select from dropdown |
| Status | Yes | Must select from dropdown |
| Remarks | Yes | Must select from dropdown |
| Release Amount | No | Must be positive number if provided |
| Other Remarks | No | Max 500 characters |
| Time In | Yes* | Auto-captured before form submit |
| Selfie | No | Optional verification photo |

*Time In is required before Submit is enabled

---

## Error Handling

### GPS/Time In Errors
| Error | User Message | Action |
|-------|--------------|--------|
| Location permission denied | "Location permission required. Please enable in Settings." | Button shows error state, retry option |
| GPS unavailable | "Unable to get location. Please check your GPS settings." | Retry option |
| Reverse geocoding failed | "Location captured but address unavailable" | Shows coordinates instead, continues |

### Camera/Selfie Errors
| Error | User Message | Action |
|-------|--------------|--------|
| Camera permission denied | "Camera permission required. Please enable in Settings." | Button shows error state, retry option |
| Camera capture failed | "Failed to capture photo. Please try again." | Retry option |

### Form Errors
| Error | User Message | Action |
|-------|--------------|--------|
| Required field empty | "Please select a [field name]" | Inline error below field |
| Submit without Time In | "Please tap Time In before submitting" | Disable Submit button until Time In captured |

---

## Multiple Time In Behavior

The "Multiple Time In" button enables bulk check-in:

1. Tap "Multiple Time In" button
2. Modal opens showing list of visits for today
3. User selects multiple visits (checkboxes)
4. Tap "Time In All" button
5. System captures GPS + timestamp once
6. All selected visits receive same Time In data
7. Modal closes, returns to My Day screen

### Files to Modify

| File | Action |
|------|--------|
| `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` | Major simplification |
| `lib/features/touchpoints/data/models/touchpoint_model.dart` | Update model fields |

---

## Data Model Changes

### Touchpoint Model

```dart
// BEFORE
class Touchpoint {
  final String id;
  final int touchpointNumber;
  final TouchpointType type;
  final String reason;
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
}

// AFTER
class Touchpoint {
  final String id;
  final int touchpointNumber;
  final TouchpointType type;
  final String transaction;        // NEW
  final String status;             // NEW
  final String remarks;            // Changed from free-text to dropdown
  final String? otherRemarks;      // NEW - for additional notes
  final double? releaseAmount;     // NEW - currency field
  final DateTime? timeIn;          // NEW - auto-captured
  final String? timeInAddress;     // NEW - reverse geocoded
  final double? latitude;          // From Time In
  final double? longitude;         // From Time In
  final String? selfiePath;        // NEW - from Selfie button
  final DateTime createdAt;
}
```

### Fields Removed
- `reason` (replaced by transaction/status/remarks)
- `timeArrival` (replaced by timeIn)
- `timeDeparture` (removed - not in Figma)
- `odometerArrival` (removed - not in Figma)
- `odometerDeparture` (removed - not in Figma)
- `photoPath` (replaced by selfiePath)
- `nextVisitDate` (removed - not in Figma)

### Fields Added
- `transaction` (dropdown value)
- `status` (dropdown value)
- `otherRemarks` (free-form text)
- `releaseAmount` (currency)
- `timeIn` (DateTime auto-captured)
- `timeInAddress` (reverse geocoded string)
- `selfiePath` (file path)

---

## Files Summary

### Files to Create (5 files)
1. `lib/features/my_day/presentation/widgets/visit_card.dart`
2. `lib/features/my_day/presentation/widgets/filter_buttons.dart`
3. `lib/features/touchpoints/presentation/widgets/time_in_button.dart`
4. `lib/features/touchpoints/presentation/widgets/selfie_button.dart`
5. `lib/features/touchpoints/presentation/widgets/touchpoint_sequence_bar.dart`

### Files to Modify (4 files)
1. `lib/features/my_day/presentation/pages/my_day_page.dart` - Complete redesign
2. `lib/features/clients/presentation/pages/client_detail_page.dart` - Add buttons, sequence bar
3. `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` - Major simplification
4. `lib/features/touchpoints/data/models/touchpoint_model.dart` - Update model

### Files to Delete (1 file)
1. `lib/features/my_day/presentation/widgets/task_card.dart` - Replaced by visit_card.dart

---

## Open Questions

1. **Transaction dropdown options** - What are the valid transaction types?
2. **Status dropdown options** - What are the valid status values?
3. **Remarks dropdown options** - What are the predefined remarks?
4. **Add New Release field** - Is this mandatory? What's the validation?

---

## Success Criteria

1. My Day screen shows visit list with touchpoint numbers and agency names
2. Filter buttons are functional and filter the visit list
3. Time In button captures GPS and timestamp in one tap
4. Selfie button opens camera and captures verification photo
5. Touchpoint form has only 5 fields (Transaction, Status, Remarks, Release Amount, Other Remarks)
6. Submit button saves touchpoint with all captured data
7. Touchpoint sequence bar shows 1st-7th + Archive
