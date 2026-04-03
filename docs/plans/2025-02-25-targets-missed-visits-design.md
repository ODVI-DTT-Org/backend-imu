# Design Document: My Targets & Missed Visits Features

**Date:** 2025-02-25
**Status:** Approved
**Author:** Claude Code

## Overview

This document defines the design for implementing two features in the IMU Flutter mobile app:

1. **My Targets** - Performance tracking dashboard for field agents
2. **Missed Visits** - Follow-up management for overdue client interactions

## Feature Specifications

### My Targets

**Purpose:** Allow field agents to track their performance against assigned targets.

**Key Metrics:**
- Client visits completed vs. target
- Touchpoints completed vs. target
- New clients added vs. target
- Overall progress percentage

**UI Components:**
- Period selector (daily/weekly/monthly)
- Circular progress indicator for overall progress
- Linear progress bars for individual metrics
- Color-coded status (green=on-track, yellow=at-risk, red=behind)

### Missed Visits

**Purpose:** Help field agents identify and follow up on missed/overdue client visits.

**Key Data:**
- Client name and contact info
- Which touchpoint was missed (1-7)
- Days overdue count
- Priority level (high/medium/low based on days overdue)

**UI Components:**
- Filterable list of missed visits
- Client card with quick actions (Call, Reschedule)
- Priority indicators (color-coded)
- Sort by days overdue or priority

## Data Models

### Target Model

```dart
// lib/features/targets/data/models/target_model.dart

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

  double get overallProgress {
    final total = clientVisitsTarget + touchpointsTarget + newClientsTarget;
    if (total == 0) return 0;
    final completed = clientVisitsCompleted + touchpointsCompleted + newClientsAdded;
    return completed / total;
  }

  TargetStatus get status {
    final progress = overallProgress;
    final elapsed = DateTime.now().difference(periodStart).inDays;
    final total = periodEnd.difference(periodStart).inDays;
    final expected = total > 0 ? elapsed / total : 0;

    if (progress >= expected) return TargetStatus.onTrack;
    if (progress >= expected * 0.8) return TargetStatus.atRisk;
    return TargetStatus.behind;
  }
}

enum TargetPeriod { daily, weekly, monthly }

enum TargetStatus { onTrack, atRisk, behind }
```

### Missed Visit Model

```dart
// lib/features/visits/data/models/missed_visit_model.dart

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

  int get daysOverdue {
    return DateTime.now().difference(scheduledDate).inDays;
  }

  MissedVisitPriority get priority {
    if (daysOverdue >= 7) return MissedVisitPriority.high;
    if (daysOverdue >= 3) return MissedVisitPriority.medium;
    return MissedVisitPriority.low;
  }
}

enum MissedVisitPriority { high, medium, low }
```

## File Structure

```
lib/features/
├── targets/
│   ├── data/
│   │   ├── models/
│   │   │   └── target_model.dart
│   │   └── repositories/
│   │       └── target_repository.dart
│   └── presentation/
│       ├── pages/
│       │   └── targets_page.dart
│       ├── widgets/
│       │   ├── overall_progress_card.dart
│       │   └── metric_progress_bar.dart
│       └── providers/
│           └── targets_provider.dart
│
├── visits/
│   ├── data/
│   │   ├── models/
│   │   │   └── missed_visit_model.dart
│   │   └── repositories/
│   │       └── missed_visit_repository.dart
│   └── presentation/
│       ├── pages/
│       │   └── missed_visits_page.dart
│       ├── widgets/
│       │   └── missed_visit_card.dart
│       └── providers/
│           └── missed_visits_provider.dart
```

## Architecture Decisions

### State Management
- Use Riverpod StateNotifierProvider pattern (consistent with existing codebase)
- Providers in `presentation/providers/` directory
- State notifiers handle business logic and state updates

### Data Persistence
- Hive for local storage (offline-first architecture)
- Models include `toJson()` and `fromJson()` for serialization
- Repository pattern abstracts data access

### Navigation
- Add routes to `app_router.dart`
- Access via home page menu items (already defined in `home_page.dart`)

### UI Patterns
- Follow existing patterns from `clients` feature
- Use Material 3 design system
- Inter font family
- Consistent padding/margins with existing pages

## Color Scheme

| Status | Color | Hex |
|--------|-------|-----|
| On Track | Green | #22C55E |
| At Risk | Yellow/Orange | #F59E0B |
| Behind | Red | #EF4444 |
| High Priority | Red | #EF4444 |
| Medium Priority | Orange | #F59E0B |
| Low Priority | Blue | #3B82F6 |

## Dependencies

All dependencies already exist in the project:
- `flutter_riverpod` - State management
- `go_router` - Navigation
- `hive` - Local storage
- `lucide_icons` - Icons

## Testing Strategy

- Unit tests for data models and calculations
- Widget tests for UI components
- Integration tests for user flows

## Success Criteria

1. Users can view their performance targets with progress indicators
2. Users can see a list of missed visits sorted by priority
3. Users can quickly call or reschedule missed visits
4. Data persists locally and works offline
5. UI matches existing IMU design patterns
