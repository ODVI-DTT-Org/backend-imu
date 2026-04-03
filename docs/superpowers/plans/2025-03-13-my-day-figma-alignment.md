# My Day Tab Figma Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the My Day tab implementation with the Figma design specification (node 973:3620).

**Architecture:** Refactor `my_day_page.dart` to match Figma's simpler client list design with header action buttons, remove summary card, simplify client cards, and add bottom sheet interaction flow for Time In/Selfie/Touchpoint selection.

**Tech Stack:** Flutter, Riverpod, GoRouter, Lucide Icons, Material 3

---

## File Structure

```
mobile/imu_flutter/lib/
├── features/
│   └── my_day/
│       ├── data/
│       │   └── models/
│       │       └── my_day_client.dart        # NEW: Client model for My Day list
│       └── presentation/
│           ├── pages/
│           │   └── my_day_page.dart          # MODIFY: Main page refactor
│           ├── widgets/
│           │   ├── client_card.dart          # NEW: Simplified client card
│           │   ├── header_buttons.dart       # NEW: Multiple Time In + Add Visit buttons
│           │   ├── time_in_bottom_sheet.dart # NEW: Time In/Selfie bottom sheet
│           │   ├── touchpoint_selector.dart  # NEW: 1st-7th touchpoint selector
│           │   └── visit_form.dart           # NEW: Transaction/Status/Remarks form
│           └── providers/
│               └── my_day_provider.dart      # NEW: State management for My Day
├── services/
│   └── api/
│       └── my_day_api_service.dart           # MODIFY: Add new API methods
└── shared/
    └── widgets/
        └── bottom_sheet_wrapper.dart         # NEW: Reusable bottom sheet wrapper
```

---

## Chunk 1: Data Models and Providers

### Task 1: Create My Day Client Model

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/data/models/my_day_client.dart`

- [ ] **Step 1: Write the model class**

```dart
/// Client model for My Day list display
class MyDayClient {
  final String id;
  final String fullName;
  final String? agencyName;
  final String? location;
  final int touchpointNumber; // 1-7, 0 if not started
  final String touchpointType; // 'visit' or 'call'
  final bool isTimeIn;

  MyDayClient({
    required this.id,
    required this.fullName,
    this.agencyName,
    this.location,
    required this.touchpointNumber,
    required this.touchpointType,
    this.isTimeIn = false,
  });

  String get touchpointOrdinal {
    if (touchpointNumber == 0) return '';
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
    return ordinals[touchpointNumber - 1];
  }

  factory MyDayClient.fromJson(Map<String, dynamic> json) {
    return MyDayClient(
      id: json['id'] ?? '',
      fullName: json['full_name'] ?? json['fullName'] ?? '',
      agencyName: json['agency_name'] ?? json['agencyName'],
      location: json['location'] ?? json['agency_name'],
      touchpointNumber: json['touchpoint_number'] ?? json['touchpointNumber'] ?? 0,
      touchpointType: json['touchpoint_type'] ?? json['touchpointType'] ?? 'visit',
      isTimeIn: json['is_time_in'] ?? json['isTimeIn'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'full_name': fullName,
    'agency_name': agencyName,
    'location': location,
    'touchpoint_number': touchpointNumber,
    'touchpoint_type': touchpointType,
    'is_time_in': isTimeIn,
  };

  MyDayClient copyWith({
    String? id,
    String? fullName,
    String? agencyName,
    String? location,
    int? touchpointNumber,
    String? touchpointType,
    bool? isTimeIn,
  }) {
    return MyDayClient(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      agencyName: agencyName ?? this.agencyName,
      location: location ?? this.location,
      touchpointNumber: touchpointNumber ?? this.touchpointNumber,
      touchpointType: touchpointType ?? this.touchpointType,
      isTimeIn: isTimeIn ?? this.isTimeIn,
    );
  }
}
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/data/models/`
Expected: `my_day_client.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/data/models/my_day_client.dart
git commit -m "feat(my_day): add MyDayClient model for list display"
```

---

### Task 2: Create My Day Provider

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/providers/my_day_provider.dart`

- [ ] **Step 1: Write the provider**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../data/models/my_day_client.dart';
import '../../../../services/api/my_day_api_service.dart';

/// State for My Day page
class MyDayState {
  final List<MyDayClient> clients;
  final bool isLoading;
  final String? error;
  final DateTime selectedDate;

  MyDayState({
    this.clients = const [],
    this.isLoading = false,
    this.error,
    DateTime? selectedDate,
  }) : selectedDate = selectedDate ?? DateTime.now();

  MyDayState copyWith({
    List<MyDayClient>? clients,
    bool? isLoading,
    String? error,
    DateTime? selectedDate,
  }) {
    return MyDayState(
      clients: clients ?? this.clients,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      selectedDate: selectedDate ?? this.selectedDate,
    );
  }
}

/// Notifier for My Day state
class MyDayNotifier extends StateNotifier<MyDayState> {
  final MyDayApiService _apiService;

  MyDayNotifier(this._apiService) : super(MyDayState()) {
    loadClients();
  }

  Future<void> loadClients() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final clients = await _apiService.fetchMyDayClients(state.selectedDate);
      state = state.copyWith(clients: clients, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() async {
    await loadClients();
  }

  Future<void> setTimeIn(String clientId, bool isTimeIn) async {
    try {
      await _apiService.setTimeIn(clientId, isTimeIn);
      await loadClients();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> submitVisitForm(String clientId, Map<String, dynamic> formData) async {
    try {
      await _apiService.submitVisitForm(clientId, formData);
      await loadClients();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

/// Provider for My Day state
final myDayStateProvider = StateNotifierProvider<MyDayNotifier, MyDayState>((ref) {
  final apiService = ref.watch(myDayApiServiceProvider);
  return MyDayNotifier(apiService);
});

/// Provider for filtered clients (by time-in status)
final filteredClientsProvider = Provider.family<List<MyDayClient>, bool?>((ref, isTimeIn) {
  final state = ref.watch(myDayStateProvider);
  if (isTimeIn == null) return state.clients;
  return state.clients.where((c) => c.isTimeIn == isTimeIn).toList();
});
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/providers/`
Expected: `my_day_provider.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/providers/my_day_provider.dart
git commit -m "feat(my_day): add MyDay state management with Riverpod"
```

---

### Task 3: Update API Service

**Files:**
- Modify: `mobile/imu_flutter/lib/services/api/my_day_api_service.dart`

- [ ] **Step 1: Add new methods to MyDayApiService**

Add these methods to the existing `MyDayApiService` class (after line 268):

```dart
  /// Fetch clients for My Day list
  Future<List<MyDayClient>> fetchMyDayClients(DateTime date) async {
    if (_useMockData) {
      return _getMockMyDayClients();
    }

    try {
      // TODO: Replace with actual PocketBase query
      // For now, return mock data
      return _getMockMyDayClients();
    } catch (e) {
      debugPrint('Error fetching My Day clients: $e');
      return _getMockMyDayClients();
    }
  }

  /// Generate mock My Day clients for demo
  List<MyDayClient> _getMockMyDayClients() {
    return [
      MyDayClient(
        id: 'client-1',
        fullName: 'Amagar, Mina C.',
        agencyName: 'CSC - MAIN OFFICE',
        location: 'CSC - MAIN OFFICE',
        touchpointNumber: 4,
        touchpointType: 'visit',
        isTimeIn: false,
      ),
      MyDayClient(
        id: 'client-2',
        fullName: 'Reyes, Kristine D.',
        agencyName: 'DOH - CVMC R2 TUG',
        location: 'DOH - CVMC R2 TUG',
        touchpointNumber: 2,
        touchpointType: 'call',
        isTimeIn: false,
      ),
      MyDayClient(
        id: 'client-3',
        fullName: 'DOH - CVMC R2 TUG',
        agencyName: 'DOH - CVMC R2 TUG',
        location: 'DOH - CVMC R2 TUG',
        touchpointNumber: 0,
        touchpointType: 'visit',
        isTimeIn: false,
      ),
      MyDayClient(
        id: 'client-4',
        fullName: 'San Pedro, Sharlene',
        agencyName: 'DOH - ZCMC',
        location: 'DOH - ZCMC',
        touchpointNumber: 7,
        touchpointType: 'visit',
        isTimeIn: false,
      ),
      MyDayClient(
        id: 'client-5',
        fullName: 'Aguas, Nash C.',
        agencyName: 'DOH - ZCMC',
        location: 'DOH - ZCMC',
        touchpointNumber: 4,
        touchpointType: 'visit',
        isTimeIn: false,
      ),
    ];
  }

  /// Set time-in status for a client
  Future<void> setTimeIn(String clientId, bool isTimeIn) async {
    if (_useMockData) {
      // Mock: just return success
      await Future.delayed(const Duration(milliseconds: 300));
      return;
    }

    try {
      // TODO: Replace with actual PocketBase update
      await Future.delayed(const Duration(milliseconds: 300));
    } catch (e) {
      debugPrint('Error setting time-in: $e');
      rethrow;
    }
  }

  /// Submit visit form data
  Future<void> submitVisitForm(String clientId, Map<String, dynamic> formData) async {
    if (_useMockData) {
      // Mock: just return success
      await Future.delayed(const Duration(milliseconds: 500));
      return;
    }

    try {
      // TODO: Replace with actual PocketBase create
      await Future.delayed(const Duration(milliseconds: 500));
    } catch (e) {
      debugPrint('Error submitting visit form: $e');
      rethrow;
    }
  }

  /// Record selfie for a client visit
  Future<String?> uploadSelfie(String clientId, String photoPath) async {
    if (_useMockData) {
      // Mock: return a fake URL
      await Future.delayed(const Duration(milliseconds: 500));
      return 'https://mock-storage.selfie/$clientId.jpg';
    }

    try {
      // TODO: Replace with actual file upload
      await Future.delayed(const Duration(milliseconds: 500));
      return 'https://mock-storage.selfie/$clientId.jpg';
    } catch (e) {
      debugPrint('Error uploading selfie: $e');
      return null;
    }
  }
```

- [ ] **Step 2: Add import for MyDayClient**

Add at the top of the file (after existing imports):

```dart
import 'package:imu_flutter/features/my_day/data/models/my_day_client.dart';
```

- [ ] **Step 3: Verify compilation**

Run: `cd mobile/imu_flutter && flutter analyze lib/services/api/my_day_api_service.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add mobile/imu_flutter/lib/services/api/my_day_api_service.dart
git commit -m "feat(my_day): add MyDay client fetch and time-in API methods"
```

---

## Chunk 2: UI Components

### Task 4: Create Header Buttons Widget

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/header_buttons.dart`

- [ ] **Step 1: Write the header buttons widget**

```dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';

/// Header buttons for My Day: Multiple Time In and Add New Visit
class HeaderButtons extends StatelessWidget {
  final VoidCallback onMultipleTimeIn;
  final VoidCallback onAddNewVisit;

  const HeaderButtons({
    super.key,
    required this.onMultipleTimeIn,
    required this.onAddNewVisit,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Multiple Time In button
        Expanded(
          child: _PillButton(
            icon: _buildHandIcons(),
            label: 'Multiple Time In',
            onTap: onMultipleTimeIn,
          ),
        ),
        const SizedBox(width: 12),
        // Add new visit button
        Expanded(
          child: _PillButton(
            icon: const Icon(LucideIcons.mapPin, size: 16, color: Color(0xFF0F172A)),
            label: 'Add new visit',
            onTap: onAddNewVisit,
          ),
        ),
      ],
    );
  }

  Widget _buildHandIcons() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (index) =>
        Padding(
          padding: EdgeInsets.only(left: index == 0 ? 0 : -8),
          child: const Icon(
            LucideIcons.hand,
            size: 14,
            color: Color(0xFF0F172A),
          ),
        ),
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  final Widget icon;
  final String label;
  final VoidCallback onTap;

  const _PillButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticUtils.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            icon,
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF0F172A),
                ),
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

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/widgets/`
Expected: `header_buttons.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/header_buttons.dart
git commit -m "feat(my_day): add header buttons widget (Multiple Time In, Add new visit)"
```

---

### Task 5: Create Client Card Widget

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/client_card.dart`

- [ ] **Step 1: Write the client card widget**

```dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../data/models/my_day_client.dart';

/// Simplified client card for My Day list (Figma-aligned)
class ClientCard extends StatelessWidget {
  final MyDayClient client;
  final VoidCallback onTap;

  const ClientCard({
    super.key,
    required this.client,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticUtils.lightImpact();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 17, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            // Map pin icon
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                LucideIcons.mapPin,
                size: 18,
                color: Color(0xFF3B82F6),
              ),
            ),
            const SizedBox(width: 12),

            // Touchpoint number badge (if applicable)
            if (client.touchpointNumber > 0) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  client.touchpointOrdinal,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF64748B),
                  ),
                ),
              ),
              const SizedBox(width: 8),
            ],

            // Client info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    client.fullName,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (client.location != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      client.location!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),

            // Chevron
            const Icon(
              LucideIcons.chevronRight,
              size: 16,
              color: Color(0xFF94A3B8),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/widgets/`
Expected: `client_card.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/client_card.dart
git commit -m "feat(my_day): add simplified client card widget matching Figma design"
```

---

### Task 6: Create Touchpoint Selector Widget

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/touchpoint_selector.dart`

- [ ] **Step 1: Write the touchpoint selector widget**

```dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';

/// Touchpoint selector: 1st through 7th + Archive
class TouchpointSelector extends StatelessWidget {
  final int selectedTouchpoint;
  final ValueChanged<int> onTouchpointSelected;
  final VoidCallback onArchiveTap;

  const TouchpointSelector({
    super.key,
    required this.selectedTouchpoint,
    required this.onTouchpointSelected,
    required this.onArchiveTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          ...List.generate(7, (index) => _buildTouchpointButton(index + 1)),
          _buildArchiveButton(),
        ],
      ),
    );
  }

  Widget _buildTouchpointButton(int number) {
    final isSelected = selectedTouchpoint == number;
    final isVisit = number == 1 || number == 4 || number == 7;

    return GestureDetector(
      onTap: () {
        HapticUtils.lightImpact();
        onTouchpointSelected(number);
      },
      child: Container(
        width: 42,
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF3B82F6) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isVisit ? LucideIcons.mapPin : LucideIcons.phone,
              size: 18,
              color: isSelected ? Colors.white : const Color(0xFF64748B),
            ),
            const SizedBox(height: 4),
            Text(
              _getOrdinal(number),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: isSelected ? Colors.white : const Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildArchiveButton() {
    return GestureDetector(
      onTap: () {
        HapticUtils.lightImpact();
        onArchiveTap();
      },
      child: Container(
        width: 56,
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.archive,
              size: 18,
              color: Color(0xFF64748B),
            ),
            const SizedBox(height: 4),
            const Text(
              'Archive',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getOrdinal(int number) {
    switch (number) {
      case 1: return '1st';
      case 2: return '2nd';
      case 3: return '3rd';
      case 4: return '4th';
      case 5: return '5th';
      case 6: return '6th';
      case 7: return '7th';
      default: return '${number}th';
    }
  }
}
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/widgets/`
Expected: `touchpoint_selector.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/touchpoint_selector.dart
git commit -m "feat(my_day): add touchpoint selector widget (1st-7th + Archive)"
```

---

### Task 7: Create Visit Form Widget

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/visit_form.dart`

- [ ] **Step 1: Write the visit form widget**

```dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';

/// Visit form with Transaction, Status, Remarks fields
class VisitForm extends StatefulWidget {
  final Function(Map<String, dynamic>) onSubmit;

  const VisitForm({
    super.key,
    required this.onSubmit,
  });

  @override
  State<VisitForm> createState() => _VisitFormState();
}

class _VisitFormState extends State<VisitForm> {
  String? _selectedTransaction;
  String? _selectedStatus;
  String? _selectedRemarks;
  final _releaseController = TextEditingController();
  final _otherRemarksController = TextEditingController();

  final List<String> _transactions = [
    'New Loan Application',
    'Loan Renewal',
    'Document Submission',
    'Payment Collection',
    'Follow-up',
    'Other',
  ];

  final List<String> _statuses = [
    'Interested',
    'For Processing',
    'For Verification',
    'Not Interested',
    'Not Around',
    'Follow-up Needed',
  ];

  final List<String> _remarks = [
    'Approved',
    'Pending Requirements',
    'Incomplete Documents',
    'Rescheduled',
    'Declined',
    'Other',
  ];

  @override
  void dispose() {
    _releaseController.dispose();
    _otherRemarksController.dispose();
    super.dispose();
  }

  void _handleSubmit() {
    HapticUtils.success();
    widget.onSubmit({
      'transaction': _selectedTransaction,
      'status': _selectedStatus,
      'remarks': _selectedRemarks,
      'releaseAmount': _releaseController.text,
      'otherRemarks': _otherRemarksController.text,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Transaction dropdown
        _buildDropdown(
          label: 'Transaction',
          value: _selectedTransaction,
          hint: 'Select Transaction',
          items: _transactions,
          onChanged: (value) => setState(() => _selectedTransaction = value),
        ),
        const SizedBox(height: 16),

        // Status dropdown
        _buildDropdown(
          label: 'Status',
          value: _selectedStatus,
          hint: 'Select Status',
          items: _statuses,
          onChanged: (value) => setState(() => _selectedStatus = value),
        ),
        const SizedBox(height: 16),

        // Remarks dropdown
        _buildDropdown(
          label: 'Remarks',
          value: _selectedRemarks,
          hint: 'Select Remarks',
          items: _remarks,
          onChanged: (value) => setState(() => _selectedRemarks = value),
        ),
        const SizedBox(height: 16),

        // Add New Release field
        const Text(
          'Add New Release',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _releaseController,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            hintText: 'Php',
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Other Remarks field
        const Text(
          'Other Remarks',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _otherRemarksController,
          maxLines: 4,
          decoration: InputDecoration(
            hintText: 'Enter remarks...',
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Submit button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F172A),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            onPressed: _handleSubmit,
            child: const Text('SUBMIT'),
          ),
        ),
      ],
    );
  }

  Widget _buildDropdown({
    required String label,
    required String? value,
    required String hint,
    required List<String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              hint: Text(
                hint,
                style: const TextStyle(color: Color(0xFF94A3B8)),
              ),
              items: items.map((item) => DropdownMenuItem(
                value: item,
                child: Text(item),
              )).toList(),
              onChanged: onChanged,
              icon: const Icon(
                LucideIcons.chevronDown,
                size: 18,
                color: Color(0xFF64748B),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/widgets/`
Expected: `visit_form.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/visit_form.dart
git commit -m "feat(my_day): add visit form widget with Transaction/Status/Remarks"
```

---

### Task 8: Create Time In Bottom Sheet

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart`

- [ ] **Step 1: Write the time in bottom sheet widget**

```dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../data/models/my_day_client.dart';
import 'touchpoint_selector.dart';
import 'visit_form.dart';

/// Bottom sheet for Time In, Selfie, Touchpoint selection, and Visit form
class TimeInBottomSheet extends StatefulWidget {
  final MyDayClient client;
  final Function(bool) onTimeInToggle;
  final Function(String?) onSelfieCapture;
  final Function(int) onTouchpointSelected;
  final Function(Map<String, dynamic>) onFormSubmit;

  const TimeInBottomSheet({
    super.key,
    required this.client,
    required this.onTimeInToggle,
    required this.onSelfieCapture,
    required this.onTouchpointSelected,
    required this.onFormSubmit,
  });

  static Future<void> show({
    required BuildContext context,
    required MyDayClient client,
    required Function(bool) onTimeInToggle,
    required Function(String?) onSelfieCapture,
    required Function(int) onTouchpointSelected,
    required Function(Map<String, dynamic>) onFormSubmit,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) => TimeInBottomSheet(
          client: client,
          onTimeInToggle: onTimeInToggle,
          onSelfieCapture: onSelfieCapture,
          onTouchpointSelected: onTouchpointSelected,
          onFormSubmit: onFormSubmit,
        ),
      ),
    );
  }

  @override
  State<TimeInBottomSheet> createState() => _TimeInBottomSheetState();
}

class _TimeInBottomSheetState extends State<TimeInBottomSheet> {
  int _selectedTouchpoint = 1;
  bool _isTimeIn = false;
  String? _selfiePath;

  @override
  void initState() {
    super.initState();
    _selectedTouchpoint = widget.client.touchpointNumber > 0
        ? widget.client.touchpointNumber
        : 1;
    _isTimeIn = widget.client.isTimeIn;
  }

  void _handleTimeIn() {
    HapticUtils.success();
    setState(() => _isTimeIn = true);
    widget.onTimeInToggle(true);
  }

  void _handleSelfie() async {
    HapticUtils.lightImpact();
    // TODO: Implement camera capture
    // For now, simulate capture
    await Future.delayed(const Duration(milliseconds: 500));
    setState(() => _selfiePath = 'mock_selfie_path.jpg');
    widget.onSelfieCapture(_selfiePath);
  }

  void _handleFormSubmit(Map<String, dynamic> formData) {
    widget.onFormSubmit(formData);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header with client info
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                // Back button
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: const Text(
                    '< Back',
                    style: TextStyle(
                      fontSize: 14,
                      color: Color(0xFF3B82F6),
                    ),
                  ),
                ),
                const Spacer(),
                // Client info
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      widget.client.fullName,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (widget.client.location != null)
                      Text(
                        widget.client.location!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Time In and Selfie buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _buildActionButton(
                    icon: LucideIcons.clock,
                    label: 'Time In',
                    onTap: _isTimeIn ? null : _handleTimeIn,
                    isCompleted: _isTimeIn,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildActionButton(
                    icon: LucideIcons.camera,
                    label: 'Selfie',
                    onTap: _handleSelfie,
                    isCompleted: _selfiePath != null,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Touchpoint selector
          TouchpointSelector(
            selectedTouchpoint: _selectedTouchpoint,
            onTouchpointSelected: (number) {
              setState(() => _selectedTouchpoint = number);
              widget.onTouchpointSelected(number);
            },
            onArchiveTap: () {
              // TODO: Handle archive
              HapticUtils.lightImpact();
            },
          ),

          const Divider(height: 1),

          // Visit form
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: VisitForm(onSubmit: _handleFormSubmit),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required VoidCallback? onTap,
    required bool isCompleted,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isCompleted
              ? const Color(0xFF22C55E).withOpacity(0.1)
              : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isCompleted
                ? const Color(0xFF22C55E)
                : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          children: [
            Icon(
              isCompleted ? LucideIcons.check : icon,
              size: 24,
              color: isCompleted
                  ? const Color(0xFF22C55E)
                  : const Color(0xFF64748B),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: isCompleted
                    ? const Color(0xFF22C55E)
                    : const Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify file is created**

Run: `ls mobile/imu_flutter/lib/features/my_day/presentation/widgets/`
Expected: `time_in_bottom_sheet.dart` exists

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart
git commit -m "feat(my_day): add Time In bottom sheet with Selfie, Touchpoint, and Form"
```

---

## Chunk 3: Page Refactor

### Task 9: Refactor My Day Page

**Files:**
- Modify: `mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart`

- [ ] **Step 1: Replace the entire file content**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../../../../shared/widgets/pull_to_refresh.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../../../services/api/my_day_api_service.dart';
import '../providers/my_day_provider.dart';
import '../widgets/header_buttons.dart';
import '../widgets/client_card.dart';
import '../widgets/time_in_bottom_sheet.dart';
import '../../../data/models/my_day_client.dart';

class MyDayPage extends ConsumerStatefulWidget {
  const MyDayPage({super.key});

  @override
  ConsumerState<MyDayPage> createState() => _MyDayPageState();
}

class _MyDayPageState extends ConsumerState<MyDayPage> {
  Future<void> _handleRefresh() async {
    HapticUtils.pullToRefresh();
    await ref.read(myDayStateProvider.notifier).refresh();
  }

  void _onMultipleTimeIn() {
    HapticUtils.lightImpact();
    // TODO: Implement multiple time-in functionality
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Multiple Time In feature coming soon'),
        backgroundColor: Color(0xFF3B82F6),
      ),
    );
  }

  void _onAddNewVisit() {
    HapticUtils.lightImpact();
    // Navigate to client selection or add visit flow
    context.push('/clients');
  }

  void _onClientTap(MyDayClient client) {
    TimeInBottomSheet.show(
      context: context,
      client: client,
      onTimeInToggle: (isTimeIn) async {
        await ref.read(myDayStateProvider.notifier).setTimeIn(client.id, isTimeIn);
      },
      onSelfieCapture: (path) async {
        if (path != null) {
          await ref.read(myDayApiServiceProvider).uploadSelfie(client.id, path);
        }
      },
      onTouchpointSelected: (number) {
        // Touchpoint selected - update state if needed
      },
      onFormSubmit: (formData) async {
        await ref.read(myDayStateProvider.notifier).submitVisitForm(client.id, formData);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(myDayStateProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: PullToRefresh(
          onRefresh: _handleRefresh,
          child: state.isLoading
              ? const Center(child: CircularProgressIndicator())
              : state.error != null
                  ? _buildErrorState(state.error!)
                  : _buildContent(state.clients),
        ),
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.alertCircle, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text('Error: $error'),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => ref.read(myDayStateProvider.notifier).refresh(),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(List<MyDayClient> clients) {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(17),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'My Day',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    Text(
                      DateFormat('MMM d, yyyy').format(DateTime.now()),
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Header buttons
                HeaderButtons(
                  onMultipleTimeIn: _onMultipleTimeIn,
                  onAddNewVisit: _onAddNewVisit,
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // Client list
          if (clients.isEmpty)
            SizedBox(
              height: 400,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      LucideIcons.users,
                      size: 64,
                      color: Colors.grey[300],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No clients for today',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Tap "Add new visit" to get started',
                      style: TextStyle(color: Colors.grey[500]),
                    ),
                  ],
                ),
              ),
            )
          else
            ...clients.map((client) => ClientCard(
                  client: client,
                  onTap: () => _onClientTap(client),
                )),

          const SizedBox(height: 100), // Bottom nav padding
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd mobile/imu_flutter && flutter analyze lib/features/my_day/presentation/pages/my_day_page.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart
git commit -m "refactor(my_day): align My Day page with Figma design

- Remove summary card with progress circle
- Replace filter button with Multiple Time In + Add new visit buttons
- Remove FAB (Add Task)
- Simplify client cards with touchpoint badge + client name + location
- Add bottom sheet interaction for Time In/Selfie/Touchpoint/Form flow"
```

---

### Task 10: Create Widget Barrel Export

**Files:**
- Create: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/widgets.dart`

- [ ] **Step 1: Create barrel export file**

```dart
export 'header_buttons.dart';
export 'client_card.dart';
export 'touchpoint_selector.dart';
export 'visit_form.dart';
export 'time_in_bottom_sheet.dart';
```

- [ ] **Step 2: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/widgets/widgets.dart
git commit -m "chore(my_day): add widget barrel export"
```

---

## Chunk 4: Testing and Verification

### Task 11: Run Flutter Analyze

- [ ] **Step 1: Run static analysis**

Run: `cd mobile/imu_flutter && flutter analyze`
Expected: No errors or warnings

- [ ] **Step 2: Fix any issues found**

If issues are found, fix them and re-run.

---

### Task 12: Manual Testing Checklist

- [ ] **Step 1: Test header buttons**
  - Tap "Multiple Time In" - should show snackbar (placeholder)
  - Tap "Add new visit" - should navigate to clients page

- [ ] **Step 2: Test client list**
  - Verify clients display with touchpoint badge (4th, 2nd, 7th, etc.)
  - Verify client name and location display correctly
  - Tap client card - should open bottom sheet

- [ ] **Step 3: Test bottom sheet**
  - Tap "Time In" - should mark as completed
  - Tap "Selfie" - should trigger camera (mock)
  - Tap touchpoint numbers (1st-7th) - should highlight selected
  - Tap "Archive" - should trigger haptic feedback
  - Fill form and submit - should close bottom sheet

- [ ] **Step 4: Verify FAB is removed**
  - Confirm no floating action button is visible

- [ ] **Step 5: Verify summary card is removed**
  - Confirm no dark card with progress circle

---

### Task 13: Final Commit

- [ ] **Step 1: Stage all changes**

```bash
git add mobile/imu_flutter/lib/features/my_day/
git add mobile/imu_flutter/lib/services/api/my_day_api_service.dart
```

- [ ] **Step 2: Create final commit**

```bash
git commit -m "feat(my_day): complete Figma alignment for My Day tab

BREAKING CHANGE: My Day page UI significantly changed

Changes:
- Replace filter button with Multiple Time In + Add new visit buttons
- Remove dark summary card with progress circle
- Remove FloatingActionButton (Add Task)
- Simplify client cards: touchpoint badge + client name + location
- Add Time In bottom sheet with Selfie, Touchpoint selector (1-7), and Visit form
- Add new data model: MyDayClient
- Add new provider: MyDayNotifier for state management

Files created:
- my_day_client.dart (data model)
- my_day_provider.dart (state management)
- header_buttons.dart (Multiple Time In + Add new visit)
- client_card.dart (simplified card)
- touchpoint_selector.dart (1st-7th + Archive)
- visit_form.dart (Transaction/Status/Remarks form)
- time_in_bottom_sheet.dart (main interaction flow)

Files modified:
- my_day_page.dart (complete refactor)
- my_day_api_service.dart (new API methods)"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Create MyDayClient model | - [ ] |
| 2 | Create My Day provider | - [ ] |
| 3 | Update API service | - [ ] |
| 4 | Create HeaderButtons widget | - [ ] |
| 5 | Create ClientCard widget | - [ ] |
| 6 | Create TouchpointSelector widget | - [ ] |
| 7 | Create VisitForm widget | - [ ] |
| 8 | Create TimeInBottomSheet widget | - [ ] |
| 9 | Refactor MyDayPage | - [ ] |
| 10 | Create widget barrel export | - [ ] |
| 11 | Run Flutter analyze | - [ ] |
| 12 | Manual testing | - [ ] |
| 13 | Final commit | - [ ] |
