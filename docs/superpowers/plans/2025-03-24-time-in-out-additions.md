# Time In/Out Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 Time In/Out additions: Form Persistence, Bulk Time In/Out, Vue Admin Time Columns, Reports Duration, Edit Warning for Synced Visits, and Approval Workflow.

**Architecture:** Start with database migration for sync/approval columns, then backend sync status logic, followed by mobile form persistence and edit warning, then bulk time in/out, and finally Vue admin updates and reports.

**Tech Stack:** Flutter 3.x (Riverpod, Hive), Vue 3 (TypeScript, Pinia), Node.js/Express (PostgreSQL), PowerSync

**Spec:** `docs/superpowers/specs/2025-03-24-time-in-out-additions-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/migrations/003_add_sync_and_approval_columns.sql` | Create | DB migration for sync/approval |
| `backend/src/routes/touchpoints.ts` | Modify | Add sync status logic |
| `backend/src/routes/approvals.ts` | Modify | Add approval endpoints |
| `backend/src/routes/reports.ts` | Modify | Add visit duration endpoint |
| `backend/src/schema.sql` | Modify | Update schema documentation |
| `lib/features/touchpoints/services/form_draft_service.dart` | Create | Form draft persistence |
| `lib/features/touchpoints/providers/touchpoint_form_provider.dart` | Modify | Add form fields to state |
| `lib/features/my_day/providers/bulk_time_in_provider.dart` | Create | Bulk time in/out state |
| `lib/features/my_day/presentation/widgets/multiple_time_in_sheet.dart` | Modify | Add time out functionality |
| `lib/features/clients/data/models/client_model.dart` | Modify | Add sync/approval fields |
| `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart` | Modify | Add edit warning |
| `lib/main.dart` | Modify | Register Hive box |
| `imu-web-vue/src/lib/types.ts` | Modify | Add Time In/Out types |
| `imu-web-vue/src/lib/utils/touchpoint-utils.ts` | Create | Duration helpers |
| `imu-web-vue/src/views/clients/ClientDetailView.vue` | Modify | Add time columns |
| `imu-web-vue/src/views/caravan/CaravanDetailView.vue` | Modify | Add time columns |
| `imu-web-vue/src/views/approvals/ApprovalsView.vue` | Modify | Touchpoint approvals |

---

## Task 1: Create Database Migration for Sync/Approval Columns

**Files:**
- Create: `backend/src/migrations/003_add_sync_and_approval_columns.sql`
- Modify: `backend/src/schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 003_add_sync_and_approval_columns.sql

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

- [ ] **Step 2: Update schema.sql**

Add the new columns to the touchpoints table definition in `backend/src/schema.sql`.

- [ ] **Step 3: Commit migration**

```bash
cd backend && git add src/migrations/003_add_sync_and_approval_columns.sql src/schema.sql && git commit -m "feat(db): add sync and approval columns to touchpoints

- Add is_synced, synced_at for sync tracking
- Add edit_status, edited_at, edited_by, proposed_changes for approval workflow
- Add index for approval queue queries
- Migrate existing data as synced

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Update Backend Touchpoints Route for Sync Status

**Files:**
- Modify: `backend/src/routes/touchpoints.ts`

- [ ] **Step 1: Add sync status logic to POST (create)**

After successful touchpoint creation, set `is_synced = true` and `synced_at = NOW()`:

```typescript
// In POST /api/touchpoints handler, after successful insert
const result = await db.query(`
  INSERT INTO touchpoints (id, client_id, type, reason, date, remarks,
    time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address,
    time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address,
    is_synced, synced_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW())
  RETURNING *
`, [id, clientId, type, reason, date, remarks,
    timeIn, timeInGpsLat, timeInGpsLng, timeInGpsAddress,
    timeOut, timeOutGpsLat, timeOutGpsLng, timeOutGpsAddress]);
```

- [ ] **Step 2: Add sync-aware update logic to PUT (update)**

For synced touchpoints, store pending changes instead of direct update:

```typescript
// In PUT /api/touchpoints/:id handler
const existing = await db.query('SELECT * FROM touchpoints WHERE id = $1', [id]);
const touchpoint = existing.rows[0];

if (touchpoint.is_synced) {
  // Store pending changes for approval
  await db.query(`
    UPDATE touchpoints
    SET edit_status = 'pending_approval',
        edited_at = NOW(),
        edited_by = $1,
        proposed_changes = $2
    WHERE id = $3
  `, [userId, JSON.stringify(updates), id]);

  return res.json({
    message: 'Changes submitted for approval',
    touchpoint: { ...touchpoint, editStatus: 'pending_approval' }
  });
} else {
  // Direct update for unsynced touchpoints
  await db.query(`UPDATE touchpoints SET ... WHERE id = $1`, [...]);
  return res.json({ touchpoint: updatedTouchpoint });
}
```

- [ ] **Step 3: Add is_synced and synced_at to SELECT response**

Ensure the GET endpoints return the new fields.

- [ ] **Step 4: Commit backend changes**

```bash
cd backend && git add src/routes/touchpoints.ts && git commit -m "feat(backend): add sync status logic to touchpoints

- Set is_synced on create
- Store pending changes for synced touchpoint edits
- Return sync status in responses

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update Backend Approvals Route

**Files:**
- Modify: `backend/src/routes/approvals.ts`

- [ ] **Step 1: Add GET /api/approvals endpoint for touchpoint edits**

```typescript
// GET /api/approvals - List pending touchpoint edit approvals
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await db.query(`
    SELECT
      t.id,
      t.id as touchpoint_id,
      t.client_id,
      c.name as client_name,
      t.agent_id,
      a.name as agent_name,
      t.proposed_changes,
      t.edited_at,
      t.edit_status
    FROM touchpoints t
    JOIN clients c ON c.id = t.client_id
    JOIN agents a ON a.id = t.agent_id
    WHERE t.edit_status = 'pending_approval'
    ORDER BY t.edited_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const countResult = await db.query(
    "SELECT COUNT(*) FROM touchpoints WHERE edit_status = 'pending_approval'"
  );

  res.json({
    data: result.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
});
```

- [ ] **Step 2: Add POST /api/approvals/:id/approve endpoint**

```typescript
// POST /api/approvals/:id/approve
router.post('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  const existing = await db.query(
    'SELECT * FROM touchpoints WHERE id = $1 AND edit_status = $2',
    [id, 'pending_approval']
  );

  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Pending approval not found' });
  }

  const touchpoint = existing.rows[0];
  const changes = touchpoint.proposed_changes;

  // Apply the proposed changes
  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(changes)) {
    updateFields.push(`${key} = $${paramCount}`);
    updateValues.push(value);
    paramCount++;
  }

  updateFields.push(`edit_status = $${paramCount}`);
  updateValues.push('approved');

  await db.query(
    `UPDATE touchpoints SET ${updateFields.join(', ')} WHERE id = $${paramCount + 1}`,
    [...updateValues, id]
  );

  res.json({ success: true, message: 'Changes approved and applied' });
});
```

- [ ] **Step 3: Add POST /api/approvals/:id/reject endpoint**

```typescript
// POST /api/approvals/:id/reject
router.post('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  await db.query(
    `UPDATE touchpoints
     SET edit_status = 'rejected',
         proposed_changes = NULL
     WHERE id = $1 AND edit_status = 'pending_approval'`,
    [id]
  );

  res.json({ success: true, message: 'Edit rejected, original data preserved' });
});
```

- [ ] **Step 4: Commit approvals route changes**

```bash
cd backend && git add src/routes/approvals.ts && git commit -m "feat(backend): add touchpoint edit approval endpoints

- GET /api/approvals lists pending approvals
- POST /api/approvals/:id/approve applies changes
- POST /api/approvals/:id/reject preserves original

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Create Form Draft Service (Mobile)

**Files:**
- Create: `lib/features/touchpoints/services/form_draft_service.dart`
- Modify: `lib/main.dart`

- [ ] **Step 1: Create the FormDraftService class**

```dart
// lib/features/touchpoints/services/form_draft_service.dart

import 'package:hive/hive.dart';

const int kFormDraftVersion = 1;
const int kDraftExpirationDays = 7;

class FormDraftService {
  static const String _boxName = 'form_drafts';
  static Box<Map>? _box;

  static Future<void> initialize() async {
    _box = await Hive.openBox<Map>(_boxName);
    await _cleanupExpiredDrafts();
  }

  static String _key(String clientId, int touchpointNumber) =>
      'draft_${clientId}_$touchpointNumber';

  static Future<void> saveDraft({
    required String clientId,
    required int touchpointNumber,
    required Map<String, dynamic> timeIn,
    required Map<String, dynamic> timeOut,
    required Map<String, dynamic> formFields,
  }) async {
    final box = _box!;
    await box.put(_key(clientId, touchpointNumber), {
      'version': kFormDraftVersion,
      'savedAt': DateTime.now().toIso8601String(),
      'timeIn': timeIn,
      'timeOut': timeOut,
      'formFields': formFields,
    });
  }

  static Map<String, dynamic>? getDraft({
    required String clientId,
    required int touchpointNumber,
  }) {
    final box = _box!;
    final draft = box.get(_key(clientId, touchpointNumber));

    if (draft == null) return null;

    // Check version compatibility
    final version = draft['version'] as int? ?? 0;
    if (version < kFormDraftVersion) {
      deleteDraft(clientId: clientId, touchpointNumber: touchpointNumber);
      return null;
    }

    return Map<String, dynamic>.from(draft);
  }

  static Future<void> deleteDraft({
    required String clientId,
    required int touchpointNumber,
  }) async {
    final box = _box!;
    await box.delete(_key(clientId, touchpointNumber));
  }

  static Future<void> _cleanupExpiredDrafts() async {
    final box = _box!;
    final expirationDate = DateTime.now().subtract(Duration(days: kDraftExpirationDays));

    final keysToDelete = <dynamic>[];

    for (final key in box.keys) {
      final draft = box.get(key);
      if (draft == null) continue;

      final savedAtStr = draft['savedAt'] as String?;
      if (savedAtStr == null) {
        keysToDelete.add(key);
        continue;
      }

      final savedAt = DateTime.tryParse(savedAtStr);
      if (savedAt == null || savedAt.isBefore(expirationDate)) {
        keysToDelete.add(key);
      }
    }

    for (final key in keysToDelete) {
      await box.delete(key);
    }
  }
}
```

- [ ] **Step 2: Register Hive box in main.dart**

```dart
// In main.dart, during initialization
await FormDraftService.initialize();
```

- [ ] **Step 3: Commit form draft service**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/services/form_draft_service.dart lib/main.dart && git commit -m "feat(mobile): add FormDraftService for form persistence

- Auto-save form state to Hive
- Auto-restore on form reopen
- 7-day draft expiration
- Schema version checking

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update TouchpointFormProvider for Form Fields

**Files:**
- Modify: `lib/features/touchpoints/providers/touchpoint_form_provider.dart`

- [ ] **Step 1: Add form field values to TouchpointFormState**

```dart
class TouchpointFormState {
  final String touchpointType;
  final TimeCaptureState timeIn;
  final TimeCaptureState timeOut;
  final bool isSubmitting;

  // Form field values (new)
  final String? reason;
  final String? remarks;
  final String? photoPath;
  final String? audioPath;

  const TouchpointFormState({
    this.touchpointType = 'Visit',
    this.timeIn = const TimeCaptureState(),
    this.timeOut = const TimeCaptureState(),
    this.isSubmitting = false,
    this.reason,
    this.remarks,
    this.photoPath,
    this.audioPath,
  });

  // ... existing computed properties ...

  TouchpointFormState copyWith({
    String? touchpointType,
    TimeCaptureState? timeIn,
    TimeCaptureState? timeOut,
    bool? isSubmitting,
    String? reason,
    String? remarks,
    String? photoPath,
    String? audioPath,
  }) {
    return TouchpointFormState(
      touchpointType: touchpointType ?? this.touchpointType,
      timeIn: timeIn ?? this.timeIn,
      timeOut: timeOut ?? this.timeOut,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      reason: reason ?? this.reason,
      remarks: remarks ?? this.remarks,
      photoPath: photoPath ?? this.photoPath,
      audioPath: audioPath ?? this.audioPath,
    );
  }
}
```

- [ ] **Step 2: Add form field setters to TouchpointFormNotifier**

```dart
class TouchpointFormNotifier extends StateNotifier<TouchpointFormState> {
  // ... existing methods ...

  void setReason(String? reason) {
    state = state.copyWith(reason: reason);
  }

  void setRemarks(String? remarks) {
    state = state.copyWith(remarks: remarks);
  }

  void setPhotoPath(String? photoPath) {
    state = state.copyWith(photoPath: photoPath);
  }

  void setAudioPath(String? audioPath) {
    state = state.copyWith(audioPath: audioPath);
  }
}
```

- [ ] **Step 3: Commit provider changes**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/providers/touchpoint_form_provider.dart && git commit -m "feat(mobile): add form fields to TouchpointFormState

- Add reason, remarks, photoPath, audioPath fields
- Add setters for form field values
- Update copyWith method

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Update TouchpointForm with Draft Persistence and Edit Warning

**Files:**
- Modify: `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`

- [ ] **Step 1: Add edit warning for synced visits**

At the start of the form, check if editing a synced touchpoint:

```dart
// In _TouchpointFormModalState.initState or build
if (widget.existingTouchpoint?.isSynced == true) {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    _showSyncedEditWarning();
  });
}

void _showSyncedEditWarning() {
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.warning_amber, color: Colors.orange),
          SizedBox(width: 8),
          Text('Edit Synced Visit?'),
        ],
      ),
      content: const Text(
        'This visit has been synced to the server. '
        'Changes will require admin approval before being applied.',
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.pop(context); // Close dialog
            Navigator.pop(context); // Close form
          },
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Continue'),
        ),
      ],
    ),
  );
}
```

- [ ] **Step 2: Add draft save on state changes**

```dart
// Add debounced save to draft
Timer? _saveDraftTimer;

void _scheduleDraftSave() {
  _saveDraftTimer?.cancel();
  _saveDraftTimer = Timer(const Duration(milliseconds: 500), () {
    _saveDraft();
  });
}

void _saveDraft() {
  final formState = ref.read(touchpointFormProvider);
  FormDraftService.saveDraft(
    clientId: widget.clientId,
    touchpointNumber: widget.touchpointNumber,
    timeIn: {
      'time': formState.timeIn.time?.toIso8601String(),
      'gpsLat': formState.timeIn.gpsLat,
      'gpsLng': formState.timeIn.gpsLng,
      'gpsAddress': formState.timeIn.gpsAddress,
    },
    timeOut: {
      'time': formState.timeOut.time?.toIso8601String(),
      'gpsLat': formState.timeOut.gpsLat,
      'gpsLng': formState.timeOut.gpsLng,
      'gpsAddress': formState.timeOut.gpsAddress,
    },
    formFields: {
      'reason': formState.reason,
      'remarks': formState.remarks,
      'photoPath': formState.photoPath,
      'audioPath': formState.audioPath,
    },
  );
}
```

- [ ] **Step 3: Add draft restore on form open**

```dart
void _restoreDraftIfExists() {
  final draft = FormDraftService.getDraft(
    clientId: widget.clientId,
    touchpointNumber: widget.touchpointNumber,
  );

  if (draft == null) return;

  final notifier = ref.read(touchpointFormProvider.notifier);

  // Restore time in
  final timeInData = draft['timeIn'] as Map<String, dynamic>?;
  if (timeInData != null && timeInData['time'] != null) {
    notifier.setTimeIn(
      DateTime.parse(timeInData['time']),
      timeInData['gpsLat']?.toDouble(),
      timeInData['gpsLng']?.toDouble(),
      timeInData['gpsAddress'],
    );
  }

  // Restore time out
  final timeOutData = draft['timeOut'] as Map<String, dynamic>?;
  if (timeOutData != null && timeOutData['time'] != null) {
    notifier.setTimeOut(
      DateTime.parse(timeOutData['time']),
      timeOutData['gpsLat']?.toDouble(),
      timeOutData['gpsLng']?.toDouble(),
      timeOutData['gpsAddress'],
    );
  }

  // Restore form fields
  final formFields = draft['formFields'] as Map<String, dynamic>?;
  if (formFields != null) {
    notifier.setReason(formFields['reason']);
    notifier.setRemarks(formFields['remarks']);
    notifier.setPhotoPath(formFields['photoPath']);
    notifier.setAudioPath(formFields['audioPath']);
  }
}
```

- [ ] **Step 4: Delete draft on successful submit**

```dart
void _submitForm() async {
  // ... existing submit logic ...

  // On success, delete draft
  await FormDraftService.deleteDraft(
    clientId: widget.clientId,
    touchpointNumber: widget.touchpointNumber,
  );
}
```

- [ ] **Step 5: Commit touchpoint form changes**

```bash
cd mobile/imu_flutter && git add lib/features/touchpoints/presentation/widgets/touchpoint_form.dart && git commit -m "feat(mobile): add draft persistence and edit warning to TouchpointForm

- Show warning when editing synced visits
- Auto-save form state on changes
- Auto-restore draft on form open
- Delete draft on successful submit

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update Mobile Touchpoint Model for Sync Fields

**Files:**
- Modify: `lib/features/clients/data/models/client_model.dart`

- [ ] **Step 1: Add sync/approval fields to Touchpoint class**

```dart
class Touchpoint {
  // ... existing fields ...

  // === Sync/Approval fields ===
  final bool isSynced;
  final DateTime? syncedAt;
  final String? editStatus;
  final DateTime? editedAt;
  final String? editedBy;

  Touchpoint({
    // ... existing parameters ...
    this.isSynced = false,
    this.syncedAt,
    this.editStatus,
    this.editedAt,
    this.editedBy,
  });
}
```

- [ ] **Step 2: Update copyWith method**

```dart
Touchpoint copyWith({
  // ... existing parameters ...
  bool? isSynced,
  DateTime? syncedAt,
  String? editStatus,
  DateTime? editedAt,
  String? editedBy,
}) {
  return Touchpoint(
    // ... existing fields ...
    isSynced: isSynced ?? this.isSynced,
    syncedAt: syncedAt ?? this.syncedAt,
    editStatus: editStatus ?? this.editStatus,
    editedAt: editedAt ?? this.editedAt,
    editedBy: editedBy ?? this.editedBy,
  );
}
```

- [ ] **Step 3: Update toJson method**

```dart
Map<String, dynamic> toJson() {
  return {
    // ... existing fields ...
    'is_synced': isSynced,
    'synced_at': syncedAt?.toIso8601String(),
    'edit_status': editStatus,
    'edited_at': editedAt?.toIso8601String(),
    'edited_by': editedBy,
  };
}
```

- [ ] **Step 4: Update fromJson method**

```dart
factory Touchpoint.fromJson(Map<String, dynamic> json) {
  return Touchpoint(
    // ... existing fields ...
    isSynced: json['is_synced'] ?? false,
    syncedAt: json['synced_at'] != null ? DateTime.parse(json['synced_at']) : null,
    editStatus: json['edit_status'],
    editedAt: json['edited_at'] != null ? DateTime.parse(json['edited_at']) : null,
    editedBy: json['edited_by'],
  );
}
```

- [ ] **Step 5: Commit model changes**

```bash
cd mobile/imu_flutter && git add lib/features/clients/data/models/client_model.dart && git commit -m "feat(mobile): add sync/approval fields to Touchpoint model

- Add isSynced, syncedAt for sync tracking
- Add editStatus, editedAt, editedBy for approval workflow
- Update toJson, fromJson, copyWith

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create Bulk Time In Provider

**Files:**
- Create: `lib/features/my_day/providers/bulk_time_in_provider.dart`

- [ ] **Step 1: Create the bulk time in state classes**

```dart
// lib/features/my_day/providers/bulk_time_in_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';

class BulkClient {
  final String id;
  final String name;
  final int touchpointNumber;
  final String type;

  const BulkClient({
    required this.id,
    required this.name,
    required this.touchpointNumber,
    required this.type,
  });
}

class BulkTimeInState {
  final List<BulkClient> selectedClients;
  final DateTime? timeIn;
  final double? timeInGpsLat;
  final double? timeInGpsLng;
  final String? timeInGpsAddress;
  final Set<String> visitedClientIds;
  final DateTime? timeOut;
  final double? timeOutGpsLat;
  final double? timeOutGpsLng;
  final String? timeOutGpsAddress;
  final bool isCapturingGps;
  final String? errorMessage;

  const BulkTimeInState({
    this.selectedClients = const [],
    this.timeIn,
    this.timeInGpsLat,
    this.timeInGpsLng,
    this.timeInGpsAddress,
    this.visitedClientIds = const {},
    this.timeOut,
    this.timeOutGpsLat,
    this.timeOutGpsLng,
    this.timeOutGpsAddress,
    this.isCapturingGps = false,
    this.errorMessage,
  });

  bool get canCaptureTimeOut =>
      timeIn != null && visitedClientIds.isNotEmpty;

  int get visitedCount => visitedClientIds.length;

  BulkTimeInState copyWith({
    List<BulkClient>? selectedClients,
    DateTime? timeIn,
    double? timeInGpsLat,
    double? timeInGpsLng,
    String? timeInGpsAddress,
    Set<String>? visitedClientIds,
    DateTime? timeOut,
    double? timeOutGpsLat,
    double? timeOutGpsLng,
    String? timeOutGpsAddress,
    bool? isCapturingGps,
    String? errorMessage,
  }) {
    return BulkTimeInState(
      selectedClients: selectedClients ?? this.selectedClients,
      timeIn: timeIn ?? this.timeIn,
      timeInGpsLat: timeInGpsLat ?? this.timeInGpsLat,
      timeInGpsLng: timeInGpsLng ?? this.timeInGpsLng,
      timeInGpsAddress: timeInGpsAddress ?? this.timeInGpsAddress,
      visitedClientIds: visitedClientIds ?? this.visitedClientIds,
      timeOut: timeOut ?? this.timeOut,
      timeOutGpsLat: timeOutGpsLat ?? this.timeOutGpsLat,
      timeOutGpsLng: timeOutGpsLng ?? this.timeOutGpsLng,
      timeOutGpsAddress: timeOutGpsAddress ?? this.timeOutGpsAddress,
      isCapturingGps: isCapturingGps ?? this.isCapturingGps,
      errorMessage: errorMessage,
    );
  }
}

class BulkTimeInNotifier extends StateNotifier<BulkTimeInState> {
  BulkTimeInNotifier() : super(const BulkTimeInState());

  void setSelectedClients(List<BulkClient> clients) {
    state = state.copyWith(selectedClients: clients);
  }

  void toggleClientSelection(BulkClient client) {
    final currentIds = state.selectedClients.map((c) => c.id).toList();
    if (currentIds.contains(client.id)) {
      state = state.copyWith(
        selectedClients: state.selectedClients.where((c) => c.id != client.id).toList(),
      );
    } else {
      state = state.copyWith(
        selectedClients: [...state.selectedClients, client],
      );
    }
  }

  void setTimeIn(DateTime time, double? lat, double? lng, String? address) {
    state = state.copyWith(
      timeIn: time,
      timeInGpsLat: lat,
      timeInGpsLng: lng,
      timeInGpsAddress: address,
      isCapturingGps: false,
    );
  }

  void markClientAsVisited(String clientId) {
    final newVisited = Set<String>.from(state.visitedClientIds)..add(clientId);
    state = state.copyWith(visitedClientIds: newVisited);
  }

  void unmarkClientAsVisited(String clientId) {
    final newVisited = Set<String>.from(state.visitedClientIds)..remove(clientId);
    state = state.copyWith(visitedClientIds: newVisited);
  }

  void setTimeOut(DateTime time, double? lat, double? lng, String? address) {
    state = state.copyWith(
      timeOut: time,
      timeOutGpsLat: lat,
      timeOutGpsLng: lng,
      timeOutGpsAddress: address,
      isCapturingGps: false,
    );
  }

  void setCapturingGps(bool capturing) {
    state = state.copyWith(isCapturingGps: capturing);
  }

  void setError(String? error) {
    state = state.copyWith(errorMessage: error, isCapturingGps: false);
  }

  void reset() {
    state = const BulkTimeInState();
  }
}

final bulkTimeInProvider =
    StateNotifierProvider<BulkTimeInNotifier, BulkTimeInState>(
  (ref) => BulkTimeInNotifier(),
);
```

- [ ] **Step 2: Commit bulk time in provider**

```bash
cd mobile/imu_flutter && git add lib/features/my_day/providers/bulk_time_in_provider.dart && git commit -m "feat(mobile): add BulkTimeInProvider for bulk time in/out

- BulkClient model for selected clients
- BulkTimeInState with time in/out and GPS
- Track visited clients separately
- Computed canCaptureTimeOut property

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Update MultipleTimeInSheet for Bulk Time Out

**Files:**
- Modify: `lib/features/my_day/presentation/widgets/multiple_time_in_sheet.dart`

- [ ] **Step 1: Add Time Out section after Time In is captured**

After the existing Time In capture UI, add a section for marking clients as visited and capturing Time Out:

```dart
// After Time In is captured, show visited tracking
if (bulkState.timeIn != null) ...[
  // Time In confirmation
  Card(
    child: ListTile(
      leading: Icon(Icons.check_circle, color: Colors.green),
      title: Text('Time In: ${_formatTime(bulkState.timeIn!)}'),
      subtitle: bulkState.timeInGpsLat != null
          ? Text('GPS: ${bulkState.timeInGpsLat!.toStringAsFixed(4)}, ${bulkState.timeInGpsLng!.toStringAsFixed(4)}')
          : Text('GPS: Not captured'),
    ),
  ),

  const SizedBox(height: 16),

  // Client visit tracking
  Text('Mark clients as visited:', style: theme.textTheme.titleMedium),
  ...bulkState.selectedClients.map((client) => ListTile(
    title: Text(client.name),
    trailing: bulkState.visitedClientIds.contains(client.id)
        ? TextButton(
            child: Text('Visited ✓'),
            onPressed: () => ref.read(bulkTimeInProvider.notifier).unmarkClientAsVisited(client.id),
          )
        : TextButton(
            child: Text('Mark as Visited'),
            onPressed: () => ref.read(bulkTimeInProvider.notifier).markClientAsVisited(client.id),
          ),
  )),

  const SizedBox(height: 16),

  // Time Out button
  SizedBox(
    width: double.infinity,
    child: ElevatedButton.icon(
      onPressed: bulkState.canCaptureTimeOut
          ? () => _captureTimeOutWithGps()
          : null,
      icon: const Icon(Icons.access_time),
      label: Text('CAPTURE TIME OUT (${bulkState.visitedCount} clients)'),
    ),
  ),
],
```

- [ ] **Step 2: Add _captureTimeOutWithGps method**

```dart
Future<void> _captureTimeOutWithGps() async {
  final notifier = ref.read(bulkTimeInProvider.notifier);
  notifier.setCapturingGps(true);

  try {
    final geoService = GeolocationService();
    final (position, result, errorMessage) = await geoService.getCurrentPositionWithResult();

    if (position == null) {
      notifier.setError(errorMessage ?? 'GPS capture failed');
      _showGpsErrorDialog(result, errorMessage);
      return;
    }

    String? address;
    try {
      address = await geoService.getAddressFromCoordinates(
        position.latitude,
        position.longitude,
      );
    } catch (_) {}

    final timeOut = DateTime.now();
    notifier.setTimeOut(
      timeOut,
      position.latitude,
      position.longitude,
      address,
    );

    // Create touchpoints for all visited clients
    _createTouchpointsForVisitedClients();

  } catch (e) {
    notifier.setError(e.toString());
  }
}
```

- [ ] **Step 3: Add _createTouchpointsForVisitedClients method**

```dart
void _createTouchpointsForVisitedClients() {
  final bulkState = ref.read(bulkTimeInProvider);

  for (final client in bulkState.selectedClients) {
    if (!bulkState.visitedClientIds.contains(client.id)) continue;

    final touchpoint = Touchpoint(
      id: uuid.v4(),
      clientId: client.id,
      type: 'Visit',
      touchpointNumber: client.touchpointNumber,
      date: DateTime.now(),
      timeIn: bulkState.timeIn,
      timeInGpsLat: bulkState.timeInGpsLat,
      timeInGpsLng: bulkState.timeInGpsLng,
      timeInGpsAddress: bulkState.timeInGpsAddress,
      timeOut: bulkState.timeOut,
      timeOutGpsLat: bulkState.timeOutGpsLat,
      timeOutGpsLng: bulkState.timeOutGpsLng,
      timeOutGpsAddress: bulkState.timeOutGpsAddress,
    );

    // Save via callback or Hive service
    widget.onTouchpointCreated?.call(touchpoint);
  }

  // Reset state after completion
  ref.read(bulkTimeInProvider.notifier).reset();
  Navigator.pop(context);
}
```

- [ ] **Step 4: Commit multiple time in sheet changes**

```bash
cd mobile/imu_flutter && git add lib/features/my_day/presentation/widgets/multiple_time_in_sheet.dart && git commit -m "feat(mobile): add bulk Time Out to MultipleTimeInSheet

- Track visited clients separately
- Mark/unmark clients as visited
- Capture Time Out with GPS
- Create individual touchpoints for visited clients

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Add Visit Duration Reports Endpoint

**Files:**
- Modify: `backend/src/routes/reports.ts`

- [ ] **Step 1: Add GET /api/reports/visit-duration endpoint**

```typescript
// GET /api/reports/visit-duration
router.get('/visit-duration', requireAuth, async (req, res) => {
  const { startDate, endDate, agentId, groupId } = req.query;

  // Build WHERE clause
  const conditions = ["t.type = 'Visit'"];
  const params: any[] = [];
  let paramCount = 1;

  if (startDate) {
    conditions.push(`t.date >= $${paramCount++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`t.date <= $${paramCount++}`);
    params.push(endDate);
  }
  if (agentId) {
    conditions.push(`t.agent_id = $${paramCount++}`);
    params.push(agentId);
  }
  if (groupId) {
    conditions.push(`a.group_id = $${paramCount++}`);
    params.push(groupId);
  }

  const whereClause = conditions.join(' AND ');

  // Summary stats
  const summaryResult = await db.query(`
    SELECT
      COUNT(*) as total_visits,
      COUNT(*) FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as completed_visits,
      COUNT(*) FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NULL) as in_progress_visits,
      AVG(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60)
        FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as avg_duration_minutes,
      SUM(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 3600)
        FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as total_visit_hours
    FROM touchpoints t
    LEFT JOIN agents a ON a.id = t.agent_id
    WHERE ${whereClause}
  `, params);

  // By agent
  const byAgentResult = await db.query(`
    SELECT
      a.id as agent_id,
      a.name as agent_name,
      COUNT(*) as total_visits,
      COUNT(*) FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as completed_visits,
      AVG(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60)
        FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as avg_duration_minutes,
      SUM(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 3600)
        FILTER (WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL) as total_visit_hours
    FROM touchpoints t
    LEFT JOIN agents a ON a.id = t.agent_id
    WHERE ${whereClause}
    GROUP BY a.id, a.name
    ORDER BY total_visits DESC
  `, params);

  // By duration range
  const byDurationResult = await db.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 < 15
      ) as under_15_min,
      COUNT(*) FILTER (
        WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 >= 15
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 < 30
      ) as fifteen_to_30_min,
      COUNT(*) FILTER (
        WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 >= 30
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 < 60
      ) as thirty_to_60_min,
      COUNT(*) FILTER (
        WHERE t.time_in IS NOT NULL AND t.time_out IS NOT NULL
        AND EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60 >= 60
      ) as over_60_min
    FROM touchpoints t
    LEFT JOIN agents a ON a.id = t.agent_id
    WHERE ${whereClause}
  `, params);

  res.json({
    summary: {
      totalVisits: parseInt(summaryResult.rows[0].total_visits),
      completedVisits: parseInt(summaryResult.rows[0].completed_visits),
      inProgressVisits: parseInt(summaryResult.rows[0].in_progress_visits),
      avgDurationMinutes: Math.round(summaryResult.rows[0].avg_duration_minutes || 0),
      totalVisitHours: Math.round((summaryResult.rows[0].total_visit_hours || 0) * 10) / 10,
    },
    byAgent: byAgentResult.rows.map(row => ({
      agentId: row.agent_id,
      agentName: row.agent_name,
      totalVisits: parseInt(row.total_visits),
      completedVisits: parseInt(row.completed_visits),
      avgDurationMinutes: Math.round(row.avg_duration_minutes || 0),
      totalVisitHours: Math.round((row.total_visit_hours || 0) * 10) / 10,
    })),
    byDurationRange: {
      under15Min: parseInt(byDurationResult.rows[0].under_15_min),
      fifteenTo30Min: parseInt(byDurationResult.rows[0].fifteen_to_30_min),
      thirtyTo60Min: parseInt(byDurationResult.rows[0].thirty_to_60_min),
      over60Min: parseInt(byDurationResult.rows[0].over_60_min),
    },
  });
});
```

- [ ] **Step 2: Add duration fields to existing agent performance report**

Add to the existing agent performance query:

```sql
AVG(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 60)
  FILTER (WHERE t.type = 'Visit' AND t.time_in IS NOT NULL AND t.time_out IS NOT NULL)
  as avg_visit_duration_minutes,
SUM(EXTRACT(EPOCH FROM (t.time_out - t.time_in)) / 3600)
  FILTER (WHERE t.type = 'Visit' AND t.time_in IS NOT NULL AND t.time_out IS NOT NULL)
  as total_visit_hours
```

- [ ] **Step 3: Commit reports changes**

```bash
cd backend && git add src/routes/reports.ts && git commit -m "feat(backend): add visit duration reports endpoint

- GET /api/reports/visit-duration with summary, byAgent, byDurationRange
- Add duration fields to agent performance report
- Exclude call type touchpoints from duration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Add Vue Admin Types for Time In/Out

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts`
- Create: `imu-web-vue/src/lib/utils/touchpoint-utils.ts`

- [ ] **Step 1: Update Touchpoint interface in types.ts**

```typescript
// Extend existing Touchpoint interface
interface Touchpoint {
  // ... existing fields ...

  // Time In/Out fields
  timeIn?: string;
  timeInGpsLat?: number;
  timeInGpsLng?: number;
  timeInGpsAddress?: string;
  timeOut?: string;
  timeOutGpsLat?: number;
  timeOutGpsLng?: number;
  timeOutGpsAddress?: string;

  // Sync/Approval fields
  isSynced: boolean;
  syncedAt?: string;
  editStatus?: 'pending_approval' | 'approved' | 'rejected';
  editedAt?: string;
  editedBy?: string;
}

// Helper type for duration display
interface TouchpointWithDuration extends Touchpoint {
  durationMinutes?: number;
  durationDisplay?: string;
}
```

- [ ] **Step 2: Create touchpoint-utils.ts**

```typescript
// imu-web-vue/src/lib/utils/touchpoint-utils.ts

export function calculateDuration(touchpoint: Touchpoint): number | null {
  if (!touchpoint.timeIn || !touchpoint.timeOut) return null;

  const start = new Date(touchpoint.timeIn).getTime();
  const end = new Date(touchpoint.timeOut).getTime();
  const diffMs = end - start;

  if (diffMs < 0) return null; // Invalid: time out before time in

  return Math.round(diffMs / 60000); // minutes
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function hasGps(touchpoint: Touchpoint): boolean {
  return !!(touchpoint.timeInGpsLat && touchpoint.timeInGpsLng);
}
```

- [ ] **Step 3: Commit Vue types and utils**

```bash
cd imu-web-vue && git add src/lib/types.ts src/lib/utils/touchpoint-utils.ts && git commit -m "feat(vue): add Time In/Out types and utility functions

- Extend Touchpoint interface with time fields
- Add calculateDuration, formatDuration helpers
- Add formatTime and hasGps utilities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Update Client Detail View with Time Columns

**Files:**
- Modify: `imu-web-vue/src/views/clients/ClientDetailView.vue`

- [ ] **Step 1: Add Time In, Time Out, Duration columns to touchpoint table**

Locate the touchpoint history table and add columns:

```vue
<template>
  <!-- ... existing template ... -->
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reason</th>
        <!-- New columns -->
        <th>Time In</th>
        <th>Time Out</th>
        <th>Duration</th>
        <th>GPS</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="touchpoint in touchpoints" :key="touchpoint.id">
        <td>{{ formatDate(touchpoint.date) }}</td>
        <td>{{ touchpoint.type }}</td>
        <td>{{ touchpoint.reason || '-' }}</td>
        <!-- New columns -->
        <td>{{ touchpoint.timeIn ? formatTime(touchpoint.timeIn) : 'N/A' }}</td>
        <td>{{ touchpoint.timeOut ? formatTime(touchpoint.timeOut) : 'N/A' }}</td>
        <td>{{ getDurationDisplay(touchpoint) }}</td>
        <td>{{ hasGps(touchpoint) ? '✓' : '-' }}</td>
        <td>
          <span v-if="touchpoint.editStatus === 'pending_approval'" class="badge badge-warning">
            Pending Approval
          </span>
          <span v-else-if="touchpoint.editStatus === 'approved'" class="badge badge-success">
            Edited
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { calculateDuration, formatDuration, formatTime, hasGps } from '@/lib/utils/touchpoint-utils';

function getDurationDisplay(touchpoint: Touchpoint): string {
  const minutes = calculateDuration(touchpoint);
  return minutes !== null ? formatDuration(minutes) : 'N/A';
}
</script>
```

- [ ] **Step 2: Commit Client Detail View changes**

```bash
cd imu-web-vue && git add src/views/clients/ClientDetailView.vue && git commit -m "feat(vue): add Time In/Out columns to Client Detail view

- Add Time In, Time Out, Duration columns
- Add GPS indicator
- Add edit status badge

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Update Caravan Detail View with Time Columns

**Files:**
- Modify: `imu-web-vue/src/views/caravan/CaravanDetailView.vue`

- [ ] **Step 1: Add Time columns to visits table**

```vue
<template>
  <!-- ... existing template ... -->
  <table>
    <thead>
      <tr>
        <th>Client</th>
        <th>Date</th>
        <!-- New columns -->
        <th>Time In</th>
        <th>Time Out</th>
        <th>Duration</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="visit in visits" :key="visit.id">
        <td>{{ visit.clientName }}</td>
        <td>{{ formatDate(visit.date) }}</td>
        <!-- New columns -->
        <td>{{ visit.timeIn ? formatTime(visit.timeIn) : 'N/A' }}</td>
        <td>{{ visit.timeOut ? formatTime(visit.timeOut) : '--' }}</td>
        <td>{{ getDurationDisplay(visit) }}</td>
        <td>
          <span v-if="visit.editStatus === 'pending_approval'">Pending Approval</span>
          <span v-else-if="visit.timeIn && !visit.timeOut">In Progress</span>
          <span v-else-if="visit.isSynced">Synced</span>
          <span v-else>Completed</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 2: Add duration filter dropdown**

```vue
<div class="filter-row">
  <label>Duration:</label>
  <select v-model="durationFilter">
    <option value="all">All</option>
    <option value="under15">&lt; 15 min</option>
    <option value="15to30">15-30 min</option>
    <option value="30to60">30-60 min</option>
    <option value="over60">&gt; 60 min</option>
  </select>
</div>
```

- [ ] **Step 3: Commit Caravan Detail View changes**

```bash
cd imu-web-vue && git add src/views/caravan/CaravanDetailView.vue && git commit -m "feat(vue): add Time In/Out columns to Caravan Detail view

- Add Time In, Time Out, Duration columns
- Add visit status display
- Add duration filter dropdown

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 14: Update Approvals View for Touchpoint Approvals

**Files:**
- Modify: `imu-web-vue/src/views/approvals/ApprovalsView.vue`

- [ ] **Step 1: Add touchpoint approvals section**

Add a tab or section for pending touchpoint edit approvals:

```vue
<template>
  <!-- ... existing template ... -->
  <div class="approvals-section">
    <h3>Touchpoint Edit Approvals</h3>

    <div v-if="touchpointApprovals.length === 0" class="empty-state">
      No pending touchpoint edits
    </div>

    <div v-else class="approval-list">
      <div v-for="approval in touchpointApprovals" :key="approval.id" class="approval-card">
        <div class="approval-header">
          <strong>{{ approval.clientName }}</strong>
          <span class="agent-name">by {{ approval.agentName }}</span>
        </div>

        <div class="approval-details">
          <div class="original">
            <label>Original:</label>
            <pre>{{ JSON.stringify(approval.originalData, null, 2) }}</pre>
          </div>
          <div class="proposed">
            <label>Proposed Changes:</label>
            <pre>{{ JSON.stringify(approval.proposedChanges, null, 2) }}</pre>
          </div>
        </div>

        <div class="approval-meta">
          <span>Edited: {{ formatDateTime(approval.editedAt) }}</span>
        </div>

        <div class="approval-actions">
          <button @click="approveEdit(approval.id)" class="btn btn-success">
            Approve
          </button>
          <button @click="rejectEdit(approval.id)" class="btn btn-danger">
            Reject
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const touchpointApprovals = ref([]);

async function fetchTouchpointApprovals() {
  const response = await fetch('/api/approvals');
  const data = await response.json();
  touchpointApprovals.value = data.data;
}

async function approveEdit(id: string) {
  await fetch(`/api/approvals/${id}/approve`, { method: 'POST' });
  await fetchTouchpointApprovals();
}

async function rejectEdit(id: string) {
  const reason = prompt('Rejection reason:');
  if (reason) {
    await fetch(`/api/approvals/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    await fetchTouchpointApprovals();
  }
}

onMounted(fetchTouchpointApprovals);
</script>
```

- [ ] **Step 2: Commit Approvals View changes**

```bash
cd imu-web-vue && git add src/views/approvals/ApprovalsView.vue && git commit -m "feat(vue): add touchpoint edit approvals to ApprovalsView

- Display pending touchpoint edits
- Show original vs proposed changes
- Add approve/reject actions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Final Summary

After all tasks are complete, run final verification:

```bash
# Mobile
cd mobile/imu_flutter && flutter analyze
cd mobile/imu_flutter && flutter test

# Backend
cd backend && npm test

# Vue
cd imu-web-vue && npm test
```

---

## Testing Checklist

Refer to the testing checklist in the spec document for comprehensive testing scenarios.
