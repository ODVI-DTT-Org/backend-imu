# My Targets & Missed Visits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement performance tracking (My Targets) and follow-up management (Missed Visits) features for the IMU Flutter mobile app.

**Architecture:** Feature-based folder structure following existing patterns. Uses Riverpod for state management, Hive for local storage, and go_router for navigation. Data models include computed properties for business logic.

**Tech Stack:** Flutter, Riverpod, Hive, go_router, lucide_icons

---

## Slice 1: My Targets - Data Model & Provider

**Duration:** ~1 hour
**Deliverable:** Target model with JSON serialization, providers, and mock data

### Task 1.1: Create Target Model

**Files:**
- Create: `lib/features/targets/data/models/target_model.dart`

**Step 1: Create the target model file**

```dart
import 'package:imu_flutter/features/clients/data/models/client_model.dart';

/// Performance target for field agents
class Target {
  final String id;
  final String userId;
  final DateTime periodStart;
  final DateTime periodEnd;
  final TargetPeriod period;
  final int clientVisitsTarget;
  final int clientVisitsCompleted;
  final int touchpointsTarget;
  final int touchpointsCompleted;
  final int newClientsTarget;
  final int newClientsAdded;
  final DateTime createdAt;
  final DateTime? updatedAt;

  Target({
    required this.id,
    required this.userId,
    required this.periodStart,
    required this.periodEnd,
    required this.period,
    required this.clientVisitsTarget,
    this.clientVisitsCompleted = 0,
    required this.touchpointsTarget,
    this.touchpointsCompleted = 0,
    required this.newClientsTarget,
    this.newClientsAdded = 0,
    required this.createdAt,
    this.updatedAt,
  });

  /// Calculate overall progress as percentage (0.0 to 1.0)
  double get overallProgress {
    final total = clientVisitsTarget + touchpointsTarget + newClientsTarget;
    if (total == 0) return 0;
    final completed = clientVisitsCompleted + touchpointsCompleted + newClientsAdded;
    return completed / total;
  }

  /// Determine target status based on progress vs elapsed time
  TargetStatus get status {
    final progress = overallProgress;
    final now = DateTime.now();
    final elapsed = now.difference(periodStart).inDays;
    final total = periodEnd.difference(periodStart).inDays;
    final expected = total > 0 ? elapsed / total : 0;

    if (progress >= expected) return TargetStatus.onTrack;
    if (progress >= expected * 0.8) return TargetStatus.atRisk;
    return TargetStatus.behind;
  }

  /// Get progress for individual metric
  double get clientVisitsProgress {
    if (clientVisitsTarget == 0) return 0;
    return clientVisitsCompleted / clientVisitsTarget;
  }

  double get touchpointsProgress {
    if (touchpointsTarget == 0) return 0;
    return touchpointsCompleted / touchpointsTarget;
  }

  double get newClientsProgress {
    if (newClientsTarget == 0) return 0;
    return newClientsAdded / newClientsTarget;
  }

  /// Get period label for display
  String get periodLabel {
    switch (period) {
      case TargetPeriod.daily:
        return 'Today';
      case TargetPeriod.weekly:
        return 'This Week';
      case TargetPeriod.monthly:
        return 'This Month';
    }
  }

  Target copyWith({
    String? id,
    String? userId,
    DateTime? periodStart,
    DateTime? periodEnd,
    TargetPeriod? period,
    int? clientVisitsTarget,
    int? clientVisitsCompleted,
    int? touchpointsTarget,
    int? touchpointsCompleted,
    int? newClientsTarget,
    int? newClientsAdded,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Target(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      periodStart: periodStart ?? this.periodStart,
      periodEnd: periodEnd ?? this.periodEnd,
      period: period ?? this.period,
      clientVisitsTarget: clientVisitsTarget ?? this.clientVisitsTarget,
      clientVisitsCompleted: clientVisitsCompleted ?? this.clientVisitsCompleted,
      touchpointsTarget: touchpointsTarget ?? this.touchpointsTarget,
      touchpointsCompleted: touchpointsCompleted ?? this.touchpointsCompleted,
      newClientsTarget: newClientsTarget ?? this.newClientsTarget,
      newClientsAdded: newClientsAdded ?? this.newClientsAdded,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'periodStart': periodStart.toIso8601String(),
    'periodEnd': periodEnd.toIso8601String(),
    'period': period.name,
    'clientVisitsTarget': clientVisitsTarget,
    'clientVisitsCompleted': clientVisitsCompleted,
    'touchpointsTarget': touchpointsTarget,
    'touchpointsCompleted': touchpointsCompleted,
    'newClientsTarget': newClientsTarget,
    'newClientsAdded': newClientsAdded,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };

  factory Target.fromJson(Map<String, dynamic> json) {
    return Target(
      id: json['id'] ?? '',
      userId: json['userId'] ?? '',
      periodStart: DateTime.parse(json['periodStart']),
      periodEnd: DateTime.parse(json['periodEnd']),
      period: TargetPeriod.values.firstWhere(
        (e) => e.name == json['period'],
        orElse: () => TargetPeriod.weekly,
      ),
      clientVisitsTarget: json['clientVisitsTarget'] ?? 0,
      clientVisitsCompleted: json['clientVisitsCompleted'] ?? 0,
      touchpointsTarget: json['touchpointsTarget'] ?? 0,
      touchpointsCompleted: json['touchpointsCompleted'] ?? 0,
      newClientsTarget: json['newClientsTarget'] ?? 0,
      newClientsAdded: json['newClientsAdded'] ?? 0,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'])
          : null,
    );
  }
}

enum TargetPeriod { daily, weekly, monthly }

enum TargetStatus { onTrack, atRisk, behind }
```

**Step 2: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/features/targets/data/models/target_model.dart`
Expected: No errors

**Step 3: Commit**

```bash
cd mobile/imu_flutter
git add lib/features/targets/data/models/target_model.dart
git commit -m "feat(targets): add Target data model with progress calculations"
```

---

### Task 1.2: Add Target Providers

**Files:**
- Modify: `lib/shared/providers/app_providers.dart`

**Step 1: Add imports at top of file**

Add after line 7:
```dart
import '../../features/targets/data/models/target_model.dart';
```

**Step 2: Add target providers at end of file (before last closing brace)**

Add before the last `}`:
```dart
// ==================== Target Providers ====================

/// Selected target period
final targetPeriodProvider = StateProvider<TargetPeriod>((ref) {
  return TargetPeriod.weekly;
});

/// Current targets (mock data for now)
final targetsProvider = FutureProvider<List<Target>>((ref) async {
  final hiveService = ref.watch(hiveServiceProvider);

  if (!hiveService.isInitialized) {
    await hiveService.init();
  }

  // TODO: Replace with actual Hive storage
  // For now, return mock data
  return _getMockTargets();
});

/// Current period target
final currentTargetProvider = Provider<Target?>((ref) {
  final period = ref.watch(targetPeriodProvider);
  final targetsAsync = ref.watch(targetsProvider);

  return targetsAsync.when(
    data: (targets) {
      try {
        return targets.firstWhere((t) => t.period == period);
      } catch (_) {
        return null;
      }
    },
    loading: () => null,
    error: (_, __) => null,
  );
});

/// Helper to generate mock targets
List<Target> _getMockTargets() {
  final now = DateTime.now();
  final weekStart = now.subtract(Duration(days: now.weekday - 1));
  final weekEnd = weekStart.add(const Duration(days: 6));
  final monthStart = DateTime(now.year, now.month, 1);
  final monthEnd = DateTime(now.year, now.month + 1, 0);

  return [
    Target(
      id: 'daily-1',
      userId: 'user-1',
      periodStart: DateTime(now.year, now.month, now.day),
      periodEnd: DateTime(now.year, now.month, now.day, 23, 59, 59),
      period: TargetPeriod.daily,
      clientVisitsTarget: 5,
      clientVisitsCompleted: 3,
      touchpointsTarget: 10,
      touchpointsCompleted: 6,
      newClientsTarget: 2,
      newClientsAdded: 1,
      createdAt: now,
    ),
    Target(
      id: 'weekly-1',
      userId: 'user-1',
      periodStart: weekStart,
      periodEnd: weekEnd,
      period: TargetPeriod.weekly,
      clientVisitsTarget: 25,
      clientVisitsCompleted: 18,
      touchpointsTarget: 50,
      touchpointsCompleted: 35,
      newClientsTarget: 10,
      newClientsAdded: 7,
      createdAt: weekStart,
    ),
    Target(
      id: 'monthly-1',
      userId: 'user-1',
      periodStart: monthStart,
      periodEnd: monthEnd,
      period: TargetPeriod.monthly,
      clientVisitsTarget: 100,
      clientVisitsCompleted: 45,
      touchpointsTarget: 200,
      touchpointsCompleted: 90,
      newClientsTarget: 40,
      newClientsAdded: 18,
      createdAt: monthStart,
    ),
  ];
}
```

**Step 2: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/shared/providers/app_providers.dart`
Expected: No errors

**Step 3: Commit**

```bash
cd mobile/imu_flutter
git add lib/shared/providers/app_providers.dart
git commit -m "feat(targets): add target providers with mock data"
```

---

## Slice 2: My Targets - Basic UI

**Duration:** ~1.5 hours
**Deliverable:** Targets page with period selector and navigation from home

### Task 2.1: Create Targets Page

**Files:**
- Create: `lib/features/targets/presentation/pages/targets_page.dart`

**Step 1: Create the targets page file**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../../../shared/providers/app_providers.dart';
import '../../data/models/target_model.dart';

class TargetsPage extends ConsumerStatefulWidget {
  const TargetsPage({super.key});

  @override
  ConsumerState<TargetsPage> createState() => _TargetsPageState();
}

class _TargetsPageState extends ConsumerState<TargetsPage> {
  @override
  Widget build(BuildContext context) {
    final targetAsync = ref.watch(targetsProvider);
    final selectedPeriod = ref.watch(targetPeriodProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('My Targets'),
      ),
      body: Column(
        children: [
          // Period Selector
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                bottom: BorderSide(color: Colors.grey[200]!),
              ),
            ),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: TargetPeriod.values.map((period) {
                  final isSelected = selectedPeriod == period;
                  return Expanded(
                    child: GestureDetector(
                      onTap: () {
                        HapticUtils.selectionClick();
                        ref.read(targetPeriodProvider.notifier).state = period;
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected ? Colors.white : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.05),
                                    blurRadius: 4,
                                  ),
                                ]
                              : null,
                        ),
                        child: Text(
                          _getPeriodLabel(period),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontWeight: isSelected ? FontWeight.w500 : FontWeight.w400,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Content
          Expanded(
            child: targetAsync.when(
              data: (targets) {
                final target = targets.where((t) => t.period == selectedPeriod).firstOrNull;
                if (target == null) {
                  return const Center(
                    child: Text('No targets found for this period'),
                  );
                }
                return _TargetsContent(target: target);
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(LucideIcons.alertCircle, size: 48, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text('Error: $error'),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _getPeriodLabel(TargetPeriod period) {
    switch (period) {
      case TargetPeriod.daily:
        return 'Daily';
      case TargetPeriod.weekly:
        return 'Weekly';
      case TargetPeriod.monthly:
        return 'Monthly';
    }
  }
}

class _TargetsContent extends StatelessWidget {
  final Target target;

  const _TargetsContent({required this.target});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Overall Progress Card
          _OverallProgressCard(target: target),
          const SizedBox(height: 32),

          // Individual Metrics
          const Text(
            'Breakdown',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),

          _MetricProgressBar(
            label: 'Client Visits',
            completed: target.clientVisitsCompleted,
            total: target.clientVisitsTarget,
            icon: LucideIcons.users,
            color: _getStatusColor(target.status),
          ),
          const SizedBox(height: 16),

          _MetricProgressBar(
            label: 'Touchpoints',
            completed: target.touchpointsCompleted,
            total: target.touchpointsTarget,
            icon: LucideIcons.messageCircle,
            color: _getStatusColor(target.status),
          ),
          const SizedBox(height: 16),

          _MetricProgressBar(
            label: 'New Clients',
            completed: target.newClientsAdded,
            total: target.newClientsTarget,
            icon: LucideIcons.userPlus,
            color: _getStatusColor(target.status),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(TargetStatus status) {
    switch (status) {
      case TargetStatus.onTrack:
        return const Color(0xFF22C55E);
      case TargetStatus.atRisk:
        return const Color(0xFFF59E0B);
      case TargetStatus.behind:
        return const Color(0xFFEF4444);
    }
  }
}

class _OverallProgressCard extends StatelessWidget {
  final Target target;

  const _OverallProgressCard({required this.target});

  @override
  Widget build(BuildContext context) {
    final progress = target.overallProgress;
    final status = target.status;
    final statusColor = _getStatusColor(status);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          // Circular Progress
          Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 120,
                height: 120,
                child: CircularProgressIndicator(
                  value: progress,
                  strokeWidth: 10,
                  backgroundColor: Colors.grey[200],
                  valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                ),
              ),
              Column(
                children: [
                  Text(
                    '${(progress * 100).toInt()}%',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: statusColor,
                    ),
                  ),
                  Text(
                    'Complete',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Status Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: statusColor,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _getStatusText(status),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(TargetStatus status) {
    switch (status) {
      case TargetStatus.onTrack:
        return const Color(0xFF22C55E);
      case TargetStatus.atRisk:
        return const Color(0xFFF59E0B);
      case TargetStatus.behind:
        return const Color(0xFFEF4444);
    }
  }

  String _getStatusText(TargetStatus status) {
    switch (status) {
      case TargetStatus.onTrack:
        return 'On Track';
      case TargetStatus.atRisk:
        return 'At Risk';
      case TargetStatus.behind:
        return 'Behind';
    }
  }
}

class _MetricProgressBar extends StatelessWidget {
  final String label;
  final int completed;
  final int total;
  final IconData icon;
  final Color color;

  const _MetricProgressBar({
    required this.label,
    required this.completed,
    required this.total,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final progress = total > 0 ? completed / total : 0.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: Colors.grey[600]),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              Text(
                '$completed / $total',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: Colors.grey[200],
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }
}
```

**Step 2: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/features/targets/presentation/pages/targets_page.dart`
Expected: No errors

**Step 3: Commit**

```bash
cd mobile/imu_flutter
git add lib/features/targets/presentation/pages/targets_page.dart
git commit -m "feat(targets): add TargetsPage with period selector and progress display"
```

---

### Task 2.2: Add Route and Navigation

**Files:**
- Modify: `lib/core/router/app_router.dart`
- Modify: `lib/features/home/presentation/pages/home_page.dart`

**Step 1: Add import to app_router.dart**

Add after line 17:
```dart
import '../../features/targets/presentation/pages/targets_page.dart';
```

**Step 2: Add route before the debug route (around line 115)**

Add before `// Debug route`:
```dart
// Targets route
GoRoute(
  path: '/targets',
  builder: (context, state) => const TargetsPage(),
),
```

**Step 3: Update home_page.dart navigation**

In `_handleNavigation` method, replace the targets case (around line 224):
```dart
case 'targets':
  context.push('/targets');
  break;
```

**Step 4: Verify app compiles**

Run: `cd mobile/imu_flutter && flutter analyze`
Expected: No errors

**Step 5: Test navigation**

Run: `cd mobile/imu_flutter && flutter run`
- Navigate to home screen
- Tap "My Targets"
- Verify page loads with mock data

**Step 6: Commit**

```bash
cd mobile/imu_flutter
git add lib/core/router/app_router.dart lib/features/home/presentation/pages/home_page.dart
git commit -m "feat(targets): add route and enable navigation from home"
```

---

## Slice 3: Missed Visits - Data Model & Provider

**Duration:** ~1 hour
**Deliverable:** MissedVisit model and computed provider from existing touchpoints

### Task 3.1: Create Missed Visit Model

**Files:**
- Create: `lib/features/visits/data/models/missed_visit_model.dart`

**Step 1: Create the missed visit model file**

```dart
import 'package:imu_flutter/features/clients/data/models/client_model.dart';

/// Represents a missed/overdue client visit
class MissedVisit {
  final String id;
  final String clientId;
  final String clientName;
  final int touchpointNumber;
  final TouchpointType touchpointType;
  final DateTime scheduledDate;
  final DateTime createdAt;
  final String? primaryPhone;
  final String? primaryAddress;

  MissedVisit({
    required this.id,
    required this.clientId,
    required this.clientName,
    required this.touchpointNumber,
    required this.touchpointType,
    required this.scheduledDate,
    required this.createdAt,
    this.primaryPhone,
    this.primaryAddress,
  });

  /// Calculate days overdue
  int get daysOverdue {
    return DateTime.now().difference(scheduledDate).inDays;
  }

  /// Determine priority based on days overdue
  MissedVisitPriority get priority {
    if (daysOverdue >= 7) return MissedVisitPriority.high;
    if (daysOverdue >= 3) return MissedVisitPriority.medium;
    return MissedVisitPriority.low;
  }

  /// Get ordinal string for touchpoint number
  String get touchpointOrdinal {
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
    if (touchpointNumber >= 1 && touchpointNumber <= 7) {
      return ordinals[touchpointNumber - 1];
    }
    return '${touchpointNumber}th';
  }

  /// Get touchpoint type label
  String get touchpointTypeLabel {
    return touchpointType == TouchpointType.visit ? 'Visit' : 'Call';
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'clientId': clientId,
    'clientName': clientName,
    'touchpointNumber': touchpointNumber,
    'touchpointType': touchpointType.name,
    'scheduledDate': scheduledDate.toIso8601String(),
    'createdAt': createdAt.toIso8601String(),
    'primaryPhone': primaryPhone,
    'primaryAddress': primaryAddress,
  };

  factory MissedVisit.fromJson(Map<String, dynamic> json) {
    return MissedVisit(
      id: json['id'] ?? '',
      clientId: json['clientId'] ?? '',
      clientName: json['clientName'] ?? '',
      touchpointNumber: json['touchpointNumber'] ?? 1,
      touchpointType: TouchpointType.values.firstWhere(
        (e) => e.name == json['touchpointType'],
        orElse: () => TouchpointType.visit,
      ),
      scheduledDate: json['scheduledDate'] != null
          ? DateTime.parse(json['scheduledDate'])
          : DateTime.now(),
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      primaryPhone: json['primaryPhone'],
      primaryAddress: json['primaryAddress'],
    );
  }
}

enum MissedVisitPriority { high, medium, low }
```

**Step 2: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/features/visits/data/models/missed_visit_model.dart`
Expected: No errors

**Step 3: Commit**

```bash
cd mobile/imu_flutter
git add lib/features/visits/data/models/missed_visit_model.dart
git commit -m "feat(visits): add MissedVisit data model with priority calculation"
```

---

### Task 3.2: Add Missed Visits Provider

**Files:**
- Modify: `lib/shared/providers/app_providers.dart`

**Step 1: Add import at top of file**

Add after the targets import:
```dart
import '../../features/visits/data/models/missed_visit_model.dart';
```

**Step 2: Add missed visits providers at end of file**

Add before the last `}`:
```dart
// ==================== Missed Visits Providers ====================

/// Missed visits filter
final missedVisitsFilterProvider = StateProvider<MissedVisitPriority?>((ref) {
  return null; // null means show all
});

/// Compute missed visits from clients and touchpoints
final missedVisitsProvider = Provider<List<MissedVisit>>((ref) {
  final clientsAsync = ref.watch(clientsProvider);

  return clientsAsync.when(
    data: (clients) {
      final missedVisits = <MissedVisit>[];

      for (final client in clients) {
        // Get the next expected touchpoint
        final nextTouchpointNum = client.completedTouchpoints + 1;
        if (nextTouchpointNum > 7) continue; // All touchpoints completed

        final nextType = client.nextTouchpointType;
        if (nextType == null) continue;

        // Determine scheduled date based on last touchpoint or client creation
        DateTime scheduledDate;
        if (client.touchpoints.isNotEmpty) {
          final lastTouchpoint = client.touchpoints.last;
          // Schedule next touchpoint 3 days after last one
          scheduledDate = lastTouchpoint.date.add(const Duration(days: 3));
        } else {
          // If no touchpoints, check if client was created more than 3 days ago
          scheduledDate = client.createdAt.add(const Duration(days: 3));
        }

        // Check if overdue
        if (DateTime.now().isAfter(scheduledDate)) {
          final primaryPhone = client.phoneNumbers.isNotEmpty
              ? client.phoneNumbers.first.number
              : null;
          final primaryAddress = client.addresses.isNotEmpty
              ? client.addresses.first.fullAddress
              : null;

          missedVisits.add(MissedVisit(
            id: '${client.id}_$nextTouchpointNum',
            clientId: client.id,
            clientName: client.fullName,
            touchpointNumber: nextTouchpointNum,
            touchpointType: nextType,
            scheduledDate: scheduledDate,
            createdAt: DateTime.now(),
            primaryPhone: primaryPhone,
            primaryAddress: primaryAddress,
          ));
        }
      }

      // Sort by priority (high first) then by days overdue
      missedVisits.sort((a, b) {
        final priorityCompare = b.priority.index.compareTo(a.priority.index);
        if (priorityCompare != 0) return priorityCompare;
        return b.daysOverdue.compareTo(a.daysOverdue);
      });

      return missedVisits;
    },
    loading: () => [],
    error: (_, __) => [],
  );
});

/// Filtered missed visits by priority
final filteredMissedVisitsProvider = Provider<List<MissedVisit>>((ref) {
  final missedVisits = ref.watch(missedVisitsProvider);
  final filter = ref.watch(missedVisitsFilterProvider);

  if (filter == null) return missedVisits;

  return missedVisits.where((v) => v.priority == filter).toList();
});

/// Missed visits count by priority
final missedVisitsCountProvider = Provider<Map<MissedVisitPriority, int>>((ref) {
  final missedVisits = ref.watch(missedVisitsProvider);

  return {
    MissedVisitPriority.high: missedVisits.where((v) => v.priority == MissedVisitPriority.high).length,
    MissedVisitPriority.medium: missedVisits.where((v) => v.priority == MissedVisitPriority.medium).length,
    MissedVisitPriority.low: missedVisits.where((v) => v.priority == MissedVisitPriority.low).length,
  };
});
```

**Step 3: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/shared/providers/app_providers.dart`
Expected: No errors

**Step 4: Commit**

```bash
cd mobile/imu_flutter
git add lib/shared/providers/app_providers.dart
git commit -m "feat(visits): add missed visits providers computed from touchpoints"
```

---

## Slice 4: Missed Visits - List UI

**Duration:** ~1.5 hours
**Deliverable:** MissedVisitsPage with filterable list and navigation

### Task 4.1: Create Missed Visits Page

**Files:**
- Create: `lib/features/visits/presentation/pages/missed_visits_page.dart`

**Step 1: Create the missed visits page file**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/utils/haptic_utils.dart';
import '../../../../shared/providers/app_providers.dart';
import '../../data/models/missed_visit_model.dart';

class MissedVisitsPage extends ConsumerStatefulWidget {
  const MissedVisitsPage({super.key});

  @override
  ConsumerState<MissedVisitsPage> createState() => _MissedVisitsPageState();
}

class _MissedVisitsPageState extends ConsumerState<MissedVisitsPage> {
  @override
  Widget build(BuildContext context) {
    final missedVisits = ref.watch(filteredMissedVisitsProvider);
    final allMissedVisits = ref.watch(missedVisitsProvider);
    final selectedFilter = ref.watch(missedVisitsFilterProvider);
    final counts = ref.watch(missedVisitsCountProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/home'),
        ),
        title: Text('Missed Visits (${allMissedVisits.length})'),
      ),
      body: Column(
        children: [
          // Filter Chips
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                bottom: BorderSide(color: Colors.grey[200]!),
              ),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    count: allMissedVisits.length,
                    isSelected: selectedFilter == null,
                    onTap: () {
                      HapticUtils.lightImpact();
                      ref.read(missedVisitsFilterProvider.notifier).state = null;
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'High',
                    count: counts[MissedVisitPriority.high] ?? 0,
                    isSelected: selectedFilter == MissedVisitPriority.high,
                    color: const Color(0xFFEF4444),
                    onTap: () {
                      HapticUtils.lightImpact();
                      ref.read(missedVisitsFilterProvider.notifier).state = MissedVisitPriority.high;
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Medium',
                    count: counts[MissedVisitPriority.medium] ?? 0,
                    isSelected: selectedFilter == MissedVisitPriority.medium,
                    color: const Color(0xFFF59E0B),
                    onTap: () {
                      HapticUtils.lightImpact();
                      ref.read(missedVisitsFilterProvider.notifier).state = MissedVisitPriority.medium;
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Low',
                    count: counts[MissedVisitPriority.low] ?? 0,
                    isSelected: selectedFilter == MissedVisitPriority.low,
                    color: const Color(0xFF3B82F6),
                    onTap: () {
                      HapticUtils.lightImpact();
                      ref.read(missedVisitsFilterProvider.notifier).state = MissedVisitPriority.low;
                    },
                  ),
                ],
              ),
            ),
          ),

          // List
          Expanded(
            child: missedVisits.isEmpty
                ? _EmptyState()
                : ListView.builder(
                    itemCount: missedVisits.length,
                    itemBuilder: (context, index) {
                      return _MissedVisitCard(
                        missedVisit: missedVisits[index],
                        onCall: () => _handleCall(missedVisits[index]),
                        onReschedule: () => _handleReschedule(missedVisits[index]),
                        onTap: () => _handleTap(missedVisits[index]),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  void _handleCall(MissedVisit visit) async {
    HapticUtils.lightImpact();

    if (visit.primaryPhone == null || visit.primaryPhone!.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No phone number available')),
        );
      }
      return;
    }

    final uri = Uri(scheme: 'tel', path: visit.primaryPhone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not launch phone app')),
        );
      }
    }
  }

  void _handleReschedule(MissedVisit visit) {
    HapticUtils.lightImpact();

    showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    ).then((date) {
      if (date != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Rescheduled ${visit.clientName} to ${_formatDate(date)}'),
          ),
        );
        // TODO: Save rescheduled date
      }
    });
  }

  void _handleTap(MissedVisit visit) {
    HapticUtils.lightImpact();
    context.push('/clients/${visit.clientId}');
  }

  String _formatDate(DateTime date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final bool isSelected;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.isSelected,
    this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? Colors.grey[700]!;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? chipColor : chipColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? chipColor : chipColor.withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : chipColor,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white.withOpacity(0.2) : chipColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  color: isSelected ? Colors.white : chipColor,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.checkCircle, size: 64, color: Colors.green[400]),
          const SizedBox(height: 16),
          const Text(
            'All caught up!',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'No missed visits at this time',
            style: TextStyle(color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}

class _MissedVisitCard extends StatelessWidget {
  final MissedVisit missedVisit;
  final VoidCallback onCall;
  final VoidCallback onReschedule;
  final VoidCallback onTap;

  const _MissedVisitCard({
    required this.missedVisit,
    required this.onCall,
    required this.onReschedule,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final priorityColor = _getPriorityColor(missedVisit.priority);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Colors.grey[100]!),
          ),
        ),
        child: Row(
          children: [
            // Priority indicator
            Container(
              width: 4,
              height: 60,
              decoration: BoxDecoration(
                color: priorityColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          missedVisit.clientName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: priorityColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              missedVisit.touchpointType == TouchpointType.visit
                                  ? LucideIcons.mapPin
                                  : LucideIcons.phone,
                              size: 12,
                              color: priorityColor,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              missedVisit.touchpointOrdinal,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: priorityColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${missedVisit.daysOverdue} days overdue',
                    style: TextStyle(
                      fontSize: 12,
                      color: priorityColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            // Actions
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: Icon(LucideIcons.phone, color: Colors.grey[600]),
                  onPressed: onCall,
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.grey[100],
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: Icon(LucideIcons.calendar, color: Colors.grey[600]),
                  onPressed: onReschedule,
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.grey[100],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _getPriorityColor(MissedVisitPriority priority) {
    switch (priority) {
      case MissedVisitPriority.high:
        return const Color(0xFFEF4444);
      case MissedVisitPriority.medium:
        return const Color(0xFFF59E0B);
      case MissedVisitPriority.low:
        return const Color(0xFF3B82F6);
    }
  }
}
```

**Step 2: Verify file compiles**

Run: `cd mobile/imu_flutter && flutter analyze lib/features/visits/presentation/pages/missed_visits_page.dart`
Expected: No errors

**Step 3: Commit**

```bash
cd mobile/imu_flutter
git add lib/features/visits/presentation/pages/missed_visits_page.dart
git commit -m "feat(visits): add MissedVisitsPage with filter and actions"
```

---

### Task 4.2: Add Route and Navigation

**Files:**
- Modify: `lib/core/router/app_router.dart`
- Modify: `lib/features/home/presentation/pages/home_page.dart`

**Step 1: Add import to app_router.dart**

Add after the targets import:
```dart
import '../../features/visits/presentation/pages/missed_visits_page.dart';
```

**Step 2: Add route before targets route**

Add before targets route:
```dart
// Missed visits route
GoRoute(
  path: '/visits',
  builder: (context, state) => const MissedVisitsPage(),
),
```

**Step 3: Update home_page.dart navigation**

In `_handleNavigation` method, replace the visits case:
```dart
case 'visits':
  context.push('/visits');
  break;
```

**Step 4: Verify app compiles**

Run: `cd mobile/imu_flutter && flutter analyze`
Expected: No errors

**Step 5: Test navigation**

Run: `cd mobile/imu_flutter && flutter run`
- Navigate to home screen
- Tap "Missed Visits"
- Verify page loads

**Step 6: Commit**

```bash
cd mobile/imu_flutter
git add lib/core/router/app_router.dart lib/features/home/presentation/pages/home_page.dart
git commit -m "feat(visits): add route and enable navigation from home"
```

---

## Slice 5: Final Testing & Polish

**Duration:** ~1 hour
**Deliverable:** Verified working features with proper error handling

### Task 5.1: Run Full Analysis

**Step 1: Run Flutter analyze**

Run: `cd mobile/imu_flutter && flutter analyze`
Expected: No issues found

**Step 2: Fix any issues**

If issues found, fix them and re-run.

**Step 3: Run the app**

Run: `cd mobile/imu_flutter && flutter run`

**Step 4: Manual testing checklist**

- [ ] Home page shows My Targets and Missed Visits icons
- [ ] Tapping My Targets navigates to targets page
- [ ] Period selector (Daily/Weekly/Monthly) works
- [ ] Progress displays correctly with color coding
- [ ] Tapping Missed Visits navigates to missed visits page
- [ ] Filter chips work correctly
- [ ] Call button launches phone dialer
- [ ] Reschedule button shows date picker
- [ ] Tapping a card navigates to client detail

**Step 5: Commit**

```bash
cd mobile/imu_flutter
git add -A
git commit -m "feat: complete My Targets and Missed Visits features"
```

---

## Summary

| Slice | Description | Duration |
|-------|-------------|----------|
| 1 | Target data model & providers | 1 hour |
| 2 | Targets page UI & navigation | 1.5 hours |
| 3 | Missed visit data model & providers | 1 hour |
| 4 | Missed visits page UI & navigation | 1.5 hours |
| 5 | Final testing & polish | 1 hour |
| **Total** | | **6 hours** |

## Files Created

```
lib/features/
├── targets/
│   ├── data/models/
│   │   └── target_model.dart
│   └── presentation/pages/
│       └── targets_page.dart
│
└── visits/
    ├── data/models/
    │   └── missed_visit_model.dart
    └── presentation/pages/
        └── missed_visits_page.dart
```

## Files Modified

- `lib/shared/providers/app_providers.dart` - Added target and missed visit providers
- `lib/core/router/app_router.dart` - Added routes
- `lib/features/home/presentation/pages/home_page.dart` - Enabled navigation
