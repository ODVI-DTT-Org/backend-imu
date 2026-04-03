# Design Document: Loan Calculator, Attendance & My Profile Features

**Date:** 2025-02-25
**Status:** Approved
**Author:** Claude Code

## Overview

This document defines the design for implementing three remaining features in the IMU Flutter mobile app:

1. **Loan Calculator** - Simple amortization calculator for field agents
2. **Attendance** - GPS-based check-in/check-out tracking
3. **My Profile** - Basic profile management with settings link

---

## Feature 1: Loan Calculator

### Purpose

Allow field agents to calculate loan payments for clients during visits, showing monthly payments, total interest, and amortization schedule.

### UI Components

**Inputs:**
- Principal amount (text field with currency formatting)
- Annual interest rate (text field with % formatting)
- Loan term in months (text field)

**Outputs:**
- Monthly payment (prominent display)
- Total interest paid
- Total amount paid
- Amortization schedule (expandable table showing month, payment, principal, interest, balance)

**Actions:**
- Calculate button
- Reset/Clear button

### Data Model

```dart
// lib/features/calculator/data/models/loan_calculation.dart

class LoanCalculation {
  final double principal;
  final double annualRate;
  final int termMonths;
  final double monthlyPayment;
  final double totalInterest;
  final double totalAmount;
  final List<AmortizationEntry> schedule;

  LoanCalculation({
    required this.principal,
    required this.annualRate,
    required this.termMonths,
    required this.monthlyPayment,
    required this.totalInterest,
    required this.totalAmount,
    required this.schedule,
  });
}

class AmortizationEntry {
  final int month;
  final double payment;
  final double principal;
  final double interest;
  final double balance;

  AmortizationEntry({
    required this.month,
    required this.payment,
    required this.principal,
    required this.interest,
    required this.balance,
  });
}
```

### Business Logic

Standard amortization formula:
```
M = P × [r(1+r)^n] / [(1+r)^n – 1]

Where:
M = Monthly payment
P = Principal
r = Monthly interest rate (annual / 12 / 100)
n = Number of months
```

Amortization schedule calculation:
- For each month: payment = fixed, interest = balance × monthly rate, principal = payment - interest, new balance = old balance - principal

### File Structure

```
lib/features/calculator/
├── data/
│   ├── models/
│   │   └── loan_calculation.dart
│   └── services/
│       └── loan_calculator_service.dart
└── presentation/
    ├── pages/
    │   └── loan_calculator_page.dart
    └── widgets/
        ├── calculation_input_form.dart
        ├── calculation_result_card.dart
        └── amortization_schedule_table.dart
```

---

## Feature 2: Attendance

### Purpose

Track field agent work hours with GPS verification for check-in and check-out.

### UI Components

**Main Page:**
- Current status banner (Checked In / Checked Out with time)
- Today's summary card (check-in time, hours worked, location preview)
- Large action button (Check In / Check Out)
- History list (past 7-14 days with status indicator)

**Status Indicators:**
- Green: Checked Out (complete day)
- Blue: Checked In (currently working)
- Orange: Incomplete (forgot to check out)
- Gray: Absent (no record)

### Data Model

```dart
// lib/features/attendance/data/models/attendance_record.dart

class AttendanceRecord {
  final String id;
  final String userId;
  final DateTime date;
  final DateTime? checkInTime;
  final DateTime? checkOutTime;
  final LocationData? checkInLocation;
  final LocationData? checkOutLocation;
  final double? totalHours;
  final AttendanceStatus status;

  AttendanceRecord({
    required this.id,
    required this.userId,
    required this.date,
    this.checkInTime,
    this.checkOutTime,
    this.checkInLocation,
    this.checkOutLocation,
    this.totalHours,
    required this.status,
  });

  double? calculateHours() {
    if (checkInTime == null || checkOutTime == null) return null;
    return checkOutTime!.difference(checkInTime!).inMinutes / 60;
  }
}

enum AttendanceStatus {
  absent,      // No check-in
  checkedIn,   // Checked in but not out
  checkedOut,  // Complete day
  incomplete,  // Missing check-out from previous day
}

class LocationData {
  final double latitude;
  final double longitude;
  final String? address;
  final DateTime timestamp;

  LocationData({
    required this.latitude,
    required this.longitude,
    this.address,
    required this.timestamp,
  });
}
```

### Providers

```dart
// Attendance providers to add to app_providers.dart

/// Today's attendance record
final todayAttendanceProvider = StateNotifierProvider<TodayAttendanceNotifier, AttendanceRecord?>

/// Attendance history (last 14 days)
final attendanceHistoryProvider = FutureProvider<List<AttendanceRecord>>

/// Current check-in status
final isCheckedInProvider = Provider<bool>

/// Attendance stats (days worked, total hours this month)
final attendanceStatsProvider = Provider<AttendanceStats>
```

### Business Logic

- Check-in: Creates new record with timestamp and GPS location
- Check-out: Updates record with end time, GPS, calculates hours
- Auto-detect incomplete: If previous day has check-in but no check-out, mark as incomplete
- Local storage in Hive, sync to backend when online

### GPS Integration

Uses existing services:
- `GeolocationService` for GPS coordinates
- `currentLocationProvider` for reactive location updates

### File Structure

```
lib/features/attendance/
├── data/
│   ├── models/
│   │   └── attendance_record.dart
│   └── repositories/
│       └── attendance_repository.dart
└── presentation/
    ├── pages/
    │   └── attendance_page.dart
    ├── widgets/
    │   ├── check_in_button.dart
    │   ├── today_summary_card.dart
    │   └── attendance_history_list.dart
    └── providers/
        └── attendance_provider.dart
```

---

## Feature 3: My Profile

### Purpose

Allow field agents to view and edit their basic profile information with quick access to settings.

### UI Components

**Profile Header:**
- Profile avatar (circle with initials)
- User's full name
- Role display (e.g., "Field Agent")

**Profile Fields (editable):**
- First Name
- Last Name
- Email
- Phone Number

**Read-only Fields:**
- Employee ID

**Actions:**
- Save Changes button
- Settings link (→ /settings)
- Logout button

### Data Model

```dart
// lib/features/profile/data/models/user_profile.dart

class UserProfile {
  final String id;
  final String employeeId;
  final String firstName;
  final String lastName;
  final String email;
  final String phone;
  final String role;
  final String? profilePhotoUrl;
  final DateTime createdAt;
  final DateTime? updatedAt;

  UserProfile({
    required this.id,
    required this.employeeId,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.role,
    this.profilePhotoUrl,
    required this.createdAt,
    this.updatedAt,
  });

  String get fullName => '$firstName $lastName';
  String get initials {
    if (firstName.isEmpty && lastName.isEmpty) return '?';
    return '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'.toUpperCase();
  }
}
```

### Providers

```dart
// Profile providers to add to app_providers.dart

/// Current user profile
final userProfileProvider = StateNotifierProvider<UserProfileNotifier, UserProfile?>

/// Profile edit form state
final profileEditProvider = StateProvider<UserProfile?>

/// Is profile loading
final isProfileLoadingProvider = Provider<bool>
```

### Integration Points

- Updates `currentUserNameProvider` when name is changed
- Logout uses existing `SessionService` to clear session
- Navigates to existing `/settings` route for app settings

### File Structure

```
lib/features/profile/
├── data/
│   ├── models/
│   │   └── user_profile.dart
│   └── repositories/
│       └── profile_repository.dart
└── presentation/
    ├── pages/
    │   └── profile_page.dart
    ├── widgets/
    │   ├── profile_avatar.dart
    │   └── profile_form.dart
    └── providers/
        └── profile_provider.dart
```

---

## Implementation Order

Following Option 1 (Feature-by-Feature Sequential):

1. **Loan Calculator** (~2 hours)
   - Data model and calculation service
   - UI page with inputs and results
   - Route and navigation

2. **Attendance** (~3 hours)
   - Data model with location
   - Providers and Hive storage
   - UI with check-in/out button
   - GPS integration
   - Route and navigation

3. **My Profile** (~2 hours)
   - Data model
   - Providers
   - UI with editable form
   - Settings integration
   - Route and navigation

**Total Estimated: ~7 hours**

---

## Color Scheme

Following existing IMU design:

| Purpose | Color | Hex |
|---------|-------|-----|
| Primary Action | Blue | #3B82F6 |
| Success (Check In) | Green | #22C55E |
| Warning (Check Out) | Orange | #F59E0B |
| Error/Danger | Red | #EF4444 |
| Background | White | #FFFFFF |
| Card Background | Light Gray | #F9FAFB |
| Text Primary | Dark | #0F172A |
| Text Secondary | Gray | #64748B |

---

## Dependencies

All dependencies already exist in the project:
- `flutter_riverpod` - State management
- `go_router` - Navigation
- `hive` - Local storage
- `lucide_icons` - Icons
- `geolocator` / `geocoding` - GPS (via GeolocationService)

---

## Testing Checklist

### Loan Calculator
- [ ] Calculate displays correct monthly payment
- [ ] Amortization schedule sums correctly
- [ ] Handles edge cases (zero interest, short term)
- [ ] Reset clears all fields

### Attendance
- [ ] Check-in captures GPS and time
- [ ] Check-out calculates hours correctly
- [ ] History shows past records
- [ ] Incomplete status detected
- [ ] Works offline

### My Profile
- [ ] Displays current user info
- [ ] Edit and save updates profile
- [ ] Logout clears session
- [ ] Settings link navigates correctly
