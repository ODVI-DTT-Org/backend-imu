# Touchpoint Sequence Validation Implementation

## Overview

This document describes the implementation of touchpoint sequence validation for the IMU application. The touchpoint sequence follows a fixed pattern:

**1st: Visit → 2nd: Call → 3rd: Call → 4th: Visit → 5th: Call → 6th: Call → 7th: Visit**

## Architecture

### Backend (Node.js/PostgreSQL)

#### 1. Validation Functions (`backend/src/routes/touchpoints.ts`)

**Touchpoint Sequence Constants:**
```typescript
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;
```

**Key Functions:**

- `getExpectedTouchpointType(touchpointNumber: number): 'Visit' | 'Call'`
  - Returns the expected type for a given touchpoint number (1-7)
  - Throws error if number is out of range

- `getNextTouchpointNumber(clientId: string): Promise<number | null>`
  - Queries the database for existing touchpoints
  - Returns the next expected number (1-7) or null if all 7 are completed
  - Counts only approved or pending_approval touchpoints

- `validateTouchpointSequence(touchpointNumber, touchpointType)`
  - Validates that the type matches the expected type for the number
  - Returns `{ isValid, error?, expectedType?, providedType? }`

**API Endpoint:**

- `GET /api/touchpoints/next/:clientId`
  - Returns information about the next expected touchpoint
  - Response includes:
    - `nextTouchpointNumber`: The next expected number
    - `nextTouchpointType`: The expected type ('Visit' or 'Call')
    - `completedTouchpoints`: Count of completed touchpoints
    - `sequence`: The full sequence pattern
    - `canCreate`: Whether a new touchpoint can be created
    - `existingTouchpoints`: List of existing touchpoints

**Validation in POST /api/touchpoints:**

1. Validates touchpoint type matches sequence pattern
2. Checks if this is the next expected touchpoint number
3. Prevents duplicate touchpoint numbers
4. Returns detailed error messages with sequence info

### Frontend (Flutter/Dart)

#### 1. Validation Service (`mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart`)

**Key Methods:**

```dart
class TouchpointValidationService {
  // Get expected type for a touchpoint number
  static TouchpointType getExpectedTouchpointType(int touchpointNumber)

  // Get next touchpoint number for a client (from local data)
  static int? getNextTouchpointNumber(Client client)

  // Validate touchpoint sequence
  static TouchpointValidationResult validateTouchpointSequence({
    required int touchpointNumber,
    required TouchpointType touchpointType,
  })

  // Check if client can create a new touchpoint
  static TouchpointCanCreateResult canCreateTouchpoint(Client client)

  // Get sequence as display strings
  static List<String> getSequenceDisplay()

  // Get the sequence pattern
  static List<TouchpointType> getSequence()
}
```

#### 2. Validation Models (`mobile/imu_flutter/lib/features/clients/data/models/touchpoint_validation_model.dart`)

```dart
// Result of sequence validation
class TouchpointValidationResult {
  final bool isValid
  final String? error
  final TouchpointType? expectedType
  final TouchpointType? providedType
  final int? touchpointNumber
}

// Result of checking if touchpoint can be created
class TouchpointCanCreateResult {
  final bool canCreate
  final String? reason
  final int completedTouchpoints
  final int? nextTouchpointNumber
  final TouchpointType? nextTouchpointType
  final String? nextTouchpointDisplay
}
```

#### 3. Touchpoint Form UI (`mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`)

**New Features:**

- **Sequence Info Card**: Shows the full sequence pattern with current touchpoint highlighted
- **Validation on Init**: Validates the touchpoint sequence when form opens
- **Error Dialog**: Shows detailed error if sequence is invalid
- **Visual Indicators**:
  - Current touchpoint: Blue background with border
  - Completed touchpoints: Green background
  - Future touchpoints: Grey background

**Sequence Card Layout:**
```
┌─────────────────────────────────────────┐
│ ℹ️  Touchpoint Sequence                │
│                                         │
│ [1st Visit] [2nd Call] [3rd Call] ...  │
│                                         │
│ Creating: 3rd Call                      │
└─────────────────────────────────────────┘
```

#### 4. Client Detail Page (`mobile/imu_flutter/lib/features/clients/presentation/pages/client_detail_page.dart`)

**Enhancements:**

- Validates sequence before opening touchpoint form
- Shows completion dialog when all 7 touchpoints are done
- Displays full sequence with checkmarks
- Prevents creating touchpoints after completion

**Completion Dialog:**
```
┌─────────────────────────────────────────┐
│ ✓  All Touchpoints Completed!          │
│                                         │
│ Congratulations! [Client Name] has      │
│ completed all 7 touchpoints.            │
│                                         │
│ Touchpoint Sequence Completed:          │
│ ✓ 1st Visit                             │
│ ✓ 2nd Call                              │
│ ...                                     │
└─────────────────────────────────────────┘
```

#### 5. My Day Page (`mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart`)

**Enhancements:**

- Validates sequence before opening touchpoint form
- Shows completion dialog for 7th touchpoint
- Shows validation error dialog for invalid sequences
- Prevents creating beyond 7 touchpoints

#### 6. API Service (`mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart`)

**New Method:**

```dart
Future<NextTouchpointInfo?> getNextTouchpointInfo(String clientId)
```

**Response Model:**
```dart
class NextTouchpointInfo {
  final int? nextTouchpointNumber
  final String? nextTouchpointType
  final int completedTouchpoints
  final List<String>? sequence
  final bool? canCreate
  final String? message
  final List<Map<String, dynamic>>? existingTouchpoints

  bool get isCompleted
  String? get nextTouchpointDisplay
}
```

## Error Messages

### Backend Error Responses

**Invalid Type:**
```json
{
  "message": "Invalid touchpoint type for touchpoint #3. Expected 'Call' but got 'Visit'",
  "expectedType": "Call",
  "providedType": "Visit",
  "touchpointNumber": 3,
  "sequence": ["Visit", "Call", "Call", "Visit", "Call", "Call", "Visit"]
}
```

**Wrong Number:**
```json
{
  "message": "Invalid touchpoint number. Expected touchpoint #3 (Call)",
  "providedNumber": 5,
  "expectedNumber": 3,
  "expectedType": "Call",
  "sequence": ["Visit", "Call", "Call", "Visit", "Call", "Call", "Visit"]
}
```

**All Completed:**
```json
{
  "message": "All 7 touchpoints have been completed for this client",
  "completedTouchpoints": 7,
  "sequence": ["Visit", "Call", "Call", "Visit", "Call", "Call", "Visit"]
}
```

**Duplicate Touchpoint:**
```json
{
  "message": "Touchpoint #3 already exists for this client",
  "existingTouchpoint": {
    "id": "...",
    "touchpointNumber": 3,
    "type": "Call",
    "editStatus": "pending_approval"
  }
}
```

### Frontend Error Dialogs

**Validation Error:**
```
┌─────────────────────────────────────────┐
│ ⚠️  Invalid Touchpoint Type            │
│                                         │
│ Invalid touchpoint type for             │
│ touchpoint #3. Expected 'Call' but      │
│ got 'Visit'.                            │
│                                         │
│ Expected Sequence:                      │
│ • 1st Visit                             │
│ • 2nd Call                              │
│ • 3rd Call                              │
│ ...                                     │
└─────────────────────────────────────────┘
```

## Testing

### Backend Tests

Run the test script:
```bash
cd backend
export AUTH_TOKEN=your_jwt_token
export TEST_CLIENT_ID=your_client_id
node test-touchpoint-validation.js
```

**Test Cases:**
1. Get next touchpoint info
2. Create touchpoint with correct sequence (should succeed)
3. Create touchpoint with wrong type (should fail)
4. Create touchpoint with wrong number (should fail)
5. Verify sequence pattern

### Manual Testing Steps

1. **Test Normal Flow:**
   - Create client with no touchpoints
   - Verify 1st touchpoint is Visit
   - Create 1st touchpoint (Visit)
   - Verify 2nd touchpoint is Call
   - Create 2nd touchpoint (Call)
   - Continue through all 7

2. **Test Validation Errors:**
   - Try to create 2nd touchpoint as Visit (should fail)
   - Try to create 5th touchpoint when only 2 exist (should fail)
   - Try to create duplicate touchpoint number (should fail)

3. **Test Completion:**
   - Complete all 7 touchpoints
   - Verify completion dialog shows
   - Verify cannot create more touchpoints

## Database Queries

### Get Next Touchpoint Number
```sql
SELECT COUNT(DISTINCT touchpoint_number) as count
FROM touchpoints
WHERE client_id = $1
AND edit_status IN ('approved', 'pending_approval')
```

### Check for Existing Touchpoint
```sql
SELECT id, touchpoint_number, type, edit_status
FROM touchpoints
WHERE client_id = $1
AND touchpoint_number = $2
AND edit_status IN ('approved', 'pending_approval')
LIMIT 1
```

### Get Existing Touchpoints for Client
```sql
SELECT touchpoint_number, type, date, edit_status
FROM touchpoints
WHERE client_id = $1
AND edit_status IN ('approved', 'pending_approval')
ORDER BY touchpoint_number ASC
```

## Files Modified

### Backend
- `backend/src/routes/touchpoints.ts` - Added validation functions and endpoint
- `backend/test-touchpoint-validation.js` - Test script

### Mobile (Flutter)
- `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart` - NEW
- `mobile/imu_flutter/lib/features/clients/data/models/touchpoint_validation_model.dart` - NEW
- `mobile/imu_flutter/lib/services/api/touchpoint_api_service.dart` - Added next touchpoint endpoint
- `mobile/imu_flutter/lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` - Added sequence info card and validation
- `mobile/imu_flutter/lib/features/clients/presentation/pages/client_detail_page.dart` - Added validation and completion dialog
- `mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart` - Added validation and completion dialog

## Future Enhancements

1. **Sync Validation:** Add validation when syncing touchpoints from mobile to backend
2. **Admin Override:** Allow admins to override sequence validation if needed
3. **Sequence History:** Track sequence violations for audit purposes
4. **Custom Sequences:** Support different sequences for different client types
5. **Batch Validation:** Validate multiple touchpoints in a single request

## Summary

The touchpoint sequence validation ensures data integrity by enforcing the correct pattern:

- **Backend**: Validates on API endpoint with detailed error messages
- **Mobile**: Pre-validates before showing form and provides visual feedback
- **User Experience**: Clear visual indicators and helpful error messages
- **Flexibility**: Easy to modify sequence pattern if business rules change

This implementation prevents data inconsistency and ensures field agents follow the correct touchpoint sequence.
