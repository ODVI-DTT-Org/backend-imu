# Time In/Out Additions Design Spec

> **Goal:** Address gaps identified after the initial Time In/Out refactor implementation.

**Related Spec:** `docs/superpowers/specs/2025-03-23-visit-time-in-out-refactor-design.md`

---

## Overview

This spec addresses 6 additions to the Time In/Out feature:

1. **Form Persistence** - Auto-save/restore form drafts
2. **MultipleTimeInSheet Update** - Bulk Time In/Out support
3. **PowerSync Sync Rules** - Document current state (no changes needed)
4. **Vue Web Admin** - Display Time In/Out in admin views
5. **Reports - Visit Duration** - Add duration metrics
6. **Edit Warning for Synced Visits** - Approval workflow for edits

---

## 1. Form Persistence

### Problem
If a user closes the touchpoint form mid-way (e.g., after capturing Time In but before Time Out), all progress is lost.

### Solution
Auto-save form state to local Hive storage and auto-restore on form reopen.

### Implementation Details

#### Storage
```dart
// Hive box: form_drafts
// Key: draft_{clientId}_{touchpointNumber}
// Value:
{
  "version": 1,              // Schema version - increment when form fields change
  "savedAt": "2025-03-24T10:30:00Z",
  "timeIn": {
    "time": "2025-03-24T09:30:00Z",
    "gpsLat": 14.5678,
    "gpsLng": 121.0123,
    "gpsAddress": "123 Main St, City"
  },
  "timeOut": {
    "time": null,
    "gpsLat": null,
    "gpsLng": null,
    "gpsAddress": null
  },
  "formFields": {
    "reason": "Payment Follow-up",
    "remarks": "Client promised to pay next week",
    "photoPath": "/path/to/photo.jpg",
    "audioPath": "/path/to/audio.m4a"  // Audio recording path
  }
}
```

#### Hive Box Registration
Register the new `form_drafts` box in the app's Hive initialization:

```dart
// In main.dart or hive_service.dart
await Hive.openBox('form_drafts');
```

#### Draft Expiration
- Drafts older than **7 days** are automatically deleted on app start
- Cleanup runs in `main.dart` during initialization

#### Schema Versioning
- Store `version` field with each draft
- Current form version stored in `FormDraftService`
- If draft version < current version, discard draft (schema changed)

#### Behavior
1. **On form change:** Save draft to Hive (debounced, 500ms delay)
2. **On form open:** Check for existing draft, auto-restore if found
3. **On successful submit:** Delete draft
4. **On app start:** Delete drafts older than 7 days

#### TouchpointFormState Extension
Extend the existing `TouchpointFormState` class to include form field values:

```dart
// Add to TouchpointFormState in touchpoint_form_provider.dart
class TouchpointFormState {
  // ... existing fields ...

  // Form field values (new)
  final String? reason;
  final String? remarks;
  final String? photoPath;
  final String? audioPath;
}
```

### Files
| File | Action |
|------|--------|
| `lib/features/touchpoints/services/form_draft_service.dart` | Create |
| `lib/features/touchpoints/providers/touchpoint_form_provider.dart` | Modify |
| `lib/main.dart` | Modify (register Hive box) |

---

## 2. MultipleTimeInSheet Update

### Problem
Current bulk time-in only captures Time In. It doesn't support the new Time In/Out pattern.

### Solution
Add bulk Time Out functionality. Agents can:
1. Select multiple clients
2. Capture Time In (with GPS) for all
3. Visit clients individually
4. Capture Time Out (with GPS) for all visited clients

### UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│  MULTIPLE TIME IN                                           │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Select Clients                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [✓] Juan Dela Cruz              [Remove]            │    │
│  │ [✓] Maria Santos                [Remove]            │    │
│  │ [✓] Pedro Reyes                 [Remove]            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Selected: 3 clients                                        │
│                                                             │
│  [CAPTURE TIME IN]                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (after Time In captured)
┌─────────────────────────────────────────────────────────────┐
│  MULTIPLE TIME IN                                           │
├─────────────────────────────────────────────────────────────┤
│  ✓ Time In Captured: 9:30 AM                                │
│  ✓ GPS: 14.5678, 121.0123                                   │
│                                                             │
│  Visited: 0 of 3                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Juan Dela Cruz          [Mark as Visited]           │    │
│  │ Maria Santos            [Mark as Visited]           │    │
│  │ Pedro Reyes             [Mark as Visited]           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [CAPTURE TIME OUT] (disabled until at least 1 visited)    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (after marking clients as visited)
┌─────────────────────────────────────────────────────────────┐
│  MULTIPLE TIME IN                                           │
├─────────────────────────────────────────────────────────────┤
│  ✓ Time In Captured: 9:30 AM                                │
│                                                             │
│  Visited: 3 of 3                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ✓ Juan Dela Cruz        Visited                     │    │
│  │ ✓ Maria Santos          Visited                     │    │
│  │ ✓ Pedro Reyes           Visited                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [CAPTURE TIME OUT]                                         │
└─────────────────────────────────────────────────────────────┘
```

### GPS Failure Handling
If GPS fails during Time In or Time Out:
```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ GPS Signal Weak                                         │
├─────────────────────────────────────────────────────────────┤
│  Unable to get accurate location after 30 seconds.         │
│                                                             │
│  Time: 9:30 AM                                              │
│  GPS: Not captured                                          │
│                                                             │
│  [Try Again]    [Continue Without GPS]                     │
└─────────────────────────────────────────────────────────────┘
```

### State Management
```dart
class BulkTimeInState {
  final List<BulkClient> selectedClients;
  final DateTime? timeIn;
  final double? timeInGpsLat;
  final double? timeInGpsLng;
  final String? timeInGpsAddress;
  final Set<String> visitedClientIds;  // Clients marked as visited
  final DateTime? timeOut;
  final double? timeOutGpsLat;
  final double? timeOutGpsLng;
  final String? timeOutGpsAddress;
  final bool isCapturingGps;
}

class BulkClient {
  final String id;
  final String name;
  final int touchpointNumber;
  final String type;  // 'Visit' or 'Call' - aligned with Touchpoint.type
}
```

### Data Flow to Touchpoint Records
When bulk Time Out is captured, individual `Touchpoint` records are created:

```dart
// In MultipleTimeInSheet after Time Out captured
for (final clientId in visitedClientIds) {
  final touchpoint = Touchpoint(
    id: uuid.v4(),
    clientId: clientId,
    type: 'Visit',  // All bulk visits are 'Visit' type
    // ... other fields ...
    timeIn: state.timeIn,
    timeInGpsLat: state.timeInGpsLat,
    timeInGpsLng: state.timeInGpsLng,
    timeInGpsAddress: state.timeInGpsAddress,
    timeOut: state.timeOut,
    timeOutGpsLat: state.timeOutGpsLat,
    timeOutGpsLng: state.timeOutGpsLng,
    timeOutGpsAddress: state.timeOutGpsAddress,
  );
  // Save touchpoint via Hive service or API
}
```

### Callback Signature Update
Update the `onBulkTimeIn` callback to include GPS coordinates:

```dart
// Before:
// void onBulkTimeIn(List<String> clientIds, DateTime timeIn, String address);

// After:
void onBulkTimeIn(
  List<String> clientIds,
  DateTime timeIn,
  double? gpsLat,
  double? gpsLng,
  String? gpsAddress,
);

void onBulkTimeOut(
  List<String> clientIds,
  DateTime timeOut,
  double? gpsLat,
  double? gpsLng,
  String? gpsAddress,
);
```

### Files
| File | Action |
|------|--------|
| `lib/features/my_day/presentation/widgets/multiple_time_in_sheet.dart` | Modify |
| `lib/features/my_day/providers/bulk_time_in_provider.dart` | Create |

---

## 3. PowerSync Sync Rules

### Current State
The sync rules file uses `SELECT * FROM touchpoints` which automatically includes all columns.

### Decision
**No changes needed.** The new Time In/Out columns will be synced automatically.

### File
| File | Action |
|------|--------|
| `docs/powersync-sync-rules.yaml` | No change |

---

## 4. Vue Web Admin

### Problem
Admins cannot see Time In/Out data in the web dashboard.

### Solution
Add Time In/Out columns to Client Detail and Caravan Detail views.

### Client Detail View

#### Touchpoint History Table
| Date | Type | Reason | Time In | Time Out | Duration | GPS |
|------|------|--------|---------|----------|----------|-----|
| Mar 24 | Visit | Payment | 9:30 AM | 10:15 AM | 45 min | ✓ |
| Mar 23 | Call | Follow-up | N/A | N/A | N/A | - |
| Mar 22 | Visit | Collection | 2:00 PM | 2:30 PM | 30 min | ✓ |

#### Display Rules
- **Time In/Out missing:** Display "N/A" (for old data before refactor)
- **Duration:** Format as "X min" or "X hr Y min"
- **GPS indicator:** Show ✓ if GPS captured, - if not

### Caravan Detail View

#### Visits Table
| Client | Date | Time In | Time Out | Duration | Status |
|--------|------|---------|----------|----------|--------|
| Juan Dela Cruz | Mar 24 | 9:30 AM | 10:15 AM | 45 min | Completed |
| Maria Santos | Mar 24 | 10:30 AM | -- | -- | In Progress |
| Pedro Reyes | Mar 24 | N/A | N/A | N/A | Synced |

#### Filter Options
```
Duration: [All ▼] [< 15 min] [15-30 min] [30-60 min] [> 60 min]
Status:   [All ▼] [Completed] [In Progress] [Pending Approval]
```

### Type Definitions
```typescript
// imu-web-vue/src/lib/types.ts

// Extend existing Touchpoint interface with Time In/Out fields
interface Touchpoint {
  // ... existing fields ...
  timeIn?: string;           // ISO timestamp
  timeInGpsLat?: number;
  timeInGpsLng?: number;
  timeInGpsAddress?: string;
  timeOut?: string;          // ISO timestamp
  timeOutGpsLat?: number;
  timeOutGpsLng?: number;
  timeOutGpsAddress?: string;
  isSynced: boolean;
  syncedAt?: string;
  editStatus?: 'pending_approval' | 'approved' | 'rejected';
}

// Helper type for duration display
interface TouchpointWithDuration extends Touchpoint {
  durationMinutes?: number;  // Calculated: timeOut - timeIn
  durationDisplay?: string;  // Formatted: "45 min" or "1 hr 30 min"
}
```

### Duration Calculation Helper
```typescript
// imu-web-vue/src/lib/utils/touchpoint-utils.ts

export function calculateDuration(touchpoint: Touchpoint): number | null {
  if (!touchpoint.timeIn || !touchpoint.timeOut) return null;
  const start = new Date(touchpoint.timeIn).getTime();
  const end = new Date(touchpoint.timeOut).getTime();
  return Math.round((end - start) / 60000); // minutes
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}
```

### Files
| File | Action |
|------|--------|
| `imu-web-vue/src/views/clients/ClientDetailView.vue` | Modify |
| `imu-web-vue/src/views/caravan/CaravanDetailView.vue` | Modify |
| `imu-web-vue/src/lib/types.ts` | Modify |
| `imu-web-vue/src/lib/utils/touchpoint-utils.ts` | Create |

---

## 5. Reports - Visit Duration

### Problem
Reports don't include visit duration metrics based on Time In/Out data.

### Solution
Add visit duration metrics to reports and a new dedicated endpoint.

### New Endpoint: GET /api/reports/visit-duration

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Start date filter (ISO) |
| `endDate` | string | End date filter (ISO) |
| `agentId` | string | Filter by agent (optional) |
| `groupId` | string | Filter by group (optional) |

#### Response
```json
{
  "summary": {
    "totalVisits": 150,
    "completedVisits": 120,
    "inProgressVisits": 5,
    "callsExcluded": 25,
    "avgDurationMinutes": 32,
    "totalVisitHours": 64.5
  },
  "byAgent": [
    {
      "agentId": "uuid",
      "agentName": "Juan Agent",
      "totalVisits": 45,
      "completedVisits": 40,
      "avgDurationMinutes": 28,
      "totalVisitHours": 18.7
    }
  ],
  "byDurationRange": {
    "under15Min": 20,
    "fifteenTo30Min": 50,
    "thirtyTo60Min": 40,
    "over60Min": 10
  },
  "trend": [
    { "date": "2025-03-01", "avgDuration": 30, "visitCount": 12 },
    { "date": "2025-03-02", "avgDuration": 35, "visitCount": 15 }
  ]
}
```

### Handling Edge Cases

| Scenario | Handling |
|----------|----------|
| Call type touchpoint | Exclude from duration calculations (no Time In/Out) |
| Incomplete visit (no Time Out) | Count as "in progress", exclude from averages |
| Missing Time In/Out | Display "N/A", exclude from averages |
| Negative duration (data error) | Exclude from calculations, log warning |

### Existing Reports Update

#### Agent Performance Report
Add fields:
```json
{
  "avgVisitDurationMinutes": 28,
  "totalVisitHours": 18.7
}
```

**SQL Modification for Agent Performance:**
```sql
-- Add to agent performance query
SELECT
  a.id,
  a.name,
  COUNT(t.id) FILTER (WHERE t.type = 'Visit') as total_visits,
  -- ... existing fields ...
  AVG(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60)
    FILTER (WHERE t.type = 'Visit' AND t.time_in IS NOT NULL AND t.time_out IS NOT NULL)
    as avg_visit_duration_minutes,
  SUM(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 3600)
    FILTER (WHERE t.type = 'Visit' AND t.time_in IS NOT NULL AND t.time_out IS NOT NULL)
    as total_visit_hours
FROM agents a
LEFT JOIN touchpoints t ON t.agent_id = a.id
GROUP BY a.id, a.name
```

#### CSV Export
Add columns:
- `time_in` - ISO timestamp
- `time_out` - ISO timestamp
- `duration_minutes` - Integer (calculated: EXTRACT(EPOCH FROM (time_out - time_in)) / 60)

### Files
| File | Action |
|------|--------|
| `backend/src/routes/reports.ts` | Modify |
| `imu-web-vue/src/views/reports/ReportsView.vue` | Modify |

---

## 6. Edit Warning for Synced Visits

### Problem
Once a visit is synced to the server, editing it could cause data inconsistencies or audit issues.

### Solution
Show warning when editing synced visits. Changes require admin approval.

### Database Schema Changes

> **Note:** This project's existing migrations use sequential numbering. Check `backend/src/migrations/` for the correct next number.

```sql
-- Migration: 003_add_sync_and_approval_columns.sql
-- (Adjust number based on existing migrations)

-- === Touchpoints Table Updates ===
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edit_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS edited_by VARCHAR(255);
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS proposed_changes JSONB;

-- Comments
COMMENT ON COLUMN touchpoints.is_synced IS 'True when touchpoint has been synced to central DB';
COMMENT ON COLUMN touchpoints.synced_at IS 'Timestamp when sync completed';
COMMENT ON COLUMN touchpoints.edit_status IS 'NULL | pending_approval | approved | rejected';
COMMENT ON COLUMN touchpoints.edited_at IS 'Timestamp when edit was submitted for approval';
COMMENT ON COLUMN touchpoints.edited_by IS 'User ID who made the edit';
COMMENT ON COLUMN touchpoints.proposed_changes IS 'JSON object containing proposed field changes';

-- Index for approval queue queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_edit_status ON touchpoints(edit_status) WHERE edit_status IS NOT NULL;

-- === Migration Strategy for Existing Data ===
-- Mark all existing touchpoints as synced
UPDATE touchpoints
SET is_synced = true, synced_at = created_at
WHERE is_synced = false AND created_at IS NOT NULL;
```

### Mobile Flow

```
User opens synced visit for editing
              │
              ▼
     ┌────────────────────────────────────┐
     │  ⚠️ Edit Synced Visit?             │
     │                                    │
     │  This visit has been synced to     │
     │  the server. Changes will require  │
     │  admin approval before being       │
     │  applied.                          │
     │                                    │
     │  [Cancel]       [Continue]         │
     └────────────────────────────────────┘
              │
              ▼ (if Continue)
     User makes changes and saves
              │
              ▼
     Save with edit_status = 'pending_approval'
     Original data preserved
              │
              ▼
     In touchpoint list, show "Pending Approval" badge
```

### Backend Flow

```
POST /api/touchpoints/:id (update)
              │
              ▼
     Check if touchpoint.is_synced = true
              │
        ┌─────┴─────┐
        │           │
    is_synced    not_synced
    = true        = false
        │           │
        ▼           ▼
   Store pending   Apply changes
   changes with    directly
   edit_status =
   'pending_approval'
```

### API Endpoints

#### GET /api/approvals
List pending approvals for admin review.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "touchpointId": "uuid",
      "clientId": "uuid",
      "clientName": "Juan Dela Cruz",
      "agentId": "uuid",
      "agentName": "Maria Agent",
      "originalData": { ... },
      "proposedChanges": { ... },
      "editedAt": "2025-03-24T10:30:00Z",
      "editReason": "Corrected time from 9:00 AM to 9:30 AM"
    }
  ],
  "pagination": { ... }
}
```

#### POST /api/approvals/:id/approve
Approve the proposed changes.

**Response:**
```json
{
  "success": true,
  "touchpoint": { ... }
}
```

#### POST /api/approvals/:id/reject
Reject the proposed changes (keep original data).

**Request:**
```json
{
  "reason": "Insufficient justification for change"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Edit rejected, original data preserved"
}
```

### Mobile Touchpoint List Display
```dart
Widget _buildStatusBadge(Touchpoint touchpoint) {
  if (touchpoint.editStatus == 'pending_approval') {
    return Badge(
      label: 'Pending Approval',
      color: Colors.orange,
    );
  } else if (touchpoint.editStatus == 'approved') {
    return Badge(
      label: 'Edited',
      color: Colors.green,
    );
  } else if (touchpoint.editStatus == 'rejected') {
    return Badge(
      label: 'Edit Rejected',
      color: Colors.red,
    );
  }
  return SizedBox.shrink();
}
```

### Sync Status Logic
- `is_synced` is set to `true` when touchpoint is successfully created/updated via API
- `synced_at` is set to current timestamp
- Mobile app receives sync status in API response

### Mobile Model Updates

#### Touchpoint Model Fields (Dart)
Add these fields to the `Touchpoint` class in `client_model.dart`:

```dart
// === Sync/Approval fields (new) ===
// Hive Field IDs: Continue from 27 (Time In/Out fields use 20-27)
@HiveField(28)
final bool isSynced;

@HiveField(29)
final DateTime? syncedAt;

@HiveField(30)
final String? editStatus;  // NULL | 'pending_approval' | 'approved' | 'rejected'

@HiveField(31)
final DateTime? editedAt;

@HiveField(32)
final String? editedBy;  // User ID who made the edit
```

**Note:** This project uses plain Dart classes with manual Hive field management, NOT code generation. Update the toJson`, `fromJson`, `copyWith`, and the constructor accordingly.

#### PowerSync Mobile Schema
Update the local SQLite schema in the mobile app to include new columns:

```sql
-- In PowerSync schema definition
CREATE TABLE IF NOT EXISTS touchpoints (
  -- ... existing columns ...
  is_synced BOOLEAN DEFAULT 0,
  synced_at TEXT,  -- ISO timestamp
  edit_status TEXT,  -- NULL | 'pending_approval' | 'approved' | 'rejected'
  edited_at TEXT,  -- ISO timestamp
  edited_by TEXT
);
```

### Files
| File | Action |
|------|--------|
| `backend/src/migrations/003_add_sync_and_approval_columns.sql` | Create |
| `backend/src/routes/touchpoints.ts` | Modify |
| `backend/src/routes/approvals.ts` | Modify |
| `backend/src/schema.sql` | Modify |
| `lib/features/clients/data/models/client_model.dart` | Modify |
| `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` | Modify |
| `imu-web-vue/src/views/approvals/ApprovalsView.vue` | Modify |

---

## Implementation Order

Recommended implementation order:

1. **Database Migration** (Task 8.1)
   - Add `is_synced`, `synced_at`, `edit_status`, `edited_at`, `edited_by` columns
   - Run migration

2. **Backend: Sync Status** (Task 8.2)
   - Update touchpoints route to set `is_synced` on create/update
   - Add approval queue endpoints

3. **Mobile: Form Persistence** (Task 8.3)
   - Create FormDraftService
   - Update TouchpointFormProvider

4. **Mobile: Edit Warning** (Task 8.4)
   - Add warning dialog to TouchpointForm
   - Add status badge to touchpoint list

5. **Mobile: Bulk Time In/Out** (Task 8.5)
   - Update MultipleTimeInSheet
   - Add bulk Time Out functionality

6. **Backend: Reports** (Task 8.6)
   - Add visit duration endpoint
   - Update existing reports

7. **Vue Admin: Time Columns** (Task 8.7)
   - Update Client Detail view
   - Update Caravan Detail view

8. **Vue Admin: Approval Queue** (Task 8.8)
   - Update ApprovalsView for touchpoint approvals

---

## Testing Checklist

### Form Persistence
- [ ] Draft saved on form change
- [ ] Draft restored on form reopen
- [ ] Draft deleted on successful submit
- [ ] Drafts older than 7 days deleted on app start
- [ ] Draft invalidated if form schema version changed

### Bulk Time In/Out
- [ ] Select multiple clients
- [ ] Capture bulk Time In with GPS
- [ ] Remove client from selection
- [ ] Mark clients as visited
- [ ] Capture bulk Time Out with GPS
- [ ] Handle GPS failure gracefully
- [ ] Data saved correctly for all clients

### Vue Admin
- [ ] Time In/Out displayed in Client Detail
- [ ] Time In/Out displayed in Caravan Detail
- [ ] "N/A" shown for missing data
- [ ] Duration calculated correctly
- [ ] Filters work correctly

### Reports
- [ ] Visit duration endpoint returns correct data
- [ ] Call type touchpoints excluded
- [ ] Incomplete visits handled correctly
- [ ] CSV export includes new columns

### Edit Warning
- [ ] Warning shown for synced visits
- [ ] Edit saved as pending approval
- [ ] Status badge shown in list
- [ ] Approval queue shows pending edits
- [ ] Approve applies changes
- [ ] Reject preserves original data

---

## Test File Updates

The spec requires updating existing tests:

### Mobile Tests
| File | Action |
|------|--------|
| `test/unit/form_draft_service_test.dart` | Create |
| `test/unit/bulk_time_in_provider_test.dart` | Create |
| `test/widget/touchpoint_form_test.dart` | Modify |

### Backend Tests
| File | Action |
|------|--------|
| `test/routes/reports.test.ts` | Modify |
| `test/routes/approvals.test.ts` | Modify |

### Vue Tests
| File | Action |
|------|--------|
| `src/views/clients/ClientDetailView.spec.ts` | Modify |
| `src/views/caravan/CaravanDetailView.spec.ts` | Modify |
