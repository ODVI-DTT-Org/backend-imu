# RBAC UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate RBAC permissions into mobile app UI with role-based access control, ownership checks, and permission feedback.

**Architecture:** Three-layer permission system (UI widgets, service checks, backend validation) with clear separation from approval workflows.

**Tech Stack:** Flutter 3.2+, Dart 3.0+, Riverpod 2.0, go_router 13.0

---

## Task 1: Create Generic Permission Dialog

**Files:**
- Create: `lib/shared/widgets/permission_dialog.dart`
- Test: `test/widget/permission_dialog_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/widget/permission_dialog_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/shared/widgets/permission_dialog.dart';

void main() {
  group('PermissionDeniedDialog', () {
    testWidgets('shows dialog with correct message', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => PermissionDeniedDialog.show(context),
              child: const Text('Show'),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(find.text('Access Denied'), findsOneWidget);
      expect(find.text("You don't have permission to perform this action"), findsOneWidget);
      expect(find.text('OK'), findsOneWidget);
    });

    testWidgets('dismisses when OK tapped', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () => PermissionDeniedDialog.show(context),
              child: const Text('Show'),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      expect(find.text('Access Denied'), findsNothing);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/widget/permission_dialog_test.dart`
Expected: FAIL with "PermissionDeniedDialog not found"

- [ ] **Step 3: Write minimal implementation**

```dart
// lib/shared/widgets/permission_dialog.dart
import 'package:flutter/material.dart';

class PermissionDeniedDialog extends StatelessWidget {
  const PermissionDeniedDialog({super.key});

  static void show(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => const PermissionDeniedDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Access Denied'),
      content: const Text(
        "You don't have permission to perform this action",
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OK'),
        ),
      ],
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/widget/permission_dialog_test.dart`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/shared/widgets/permission_dialog.dart test/widget/permission_dialog_test.dart
git commit -m "feat: add generic permission denied dialog

- Shows consistent error message for permission failures
- Widget tests for dialog display and dismissal"
```

---

## Task 2: Create Permission Helper Utilities

**Files:**
- Create: `lib/shared/utils/permission_helpers.dart`
- Test: `test/unit/utils/permission_helpers_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// test/unit/utils/permission_helpers_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/shared/utils/permission_helpers.dart';
import 'package:imu_flutter/core/models/user_role.dart';

void main() {
  group('showPermissionDenied', () {
    test('returns correct permission denied message', () {
      expect(getPermissionDeniedMessage(), "You don't have permission to perform this action");
    });
  });

  group('getValidTouchpointNumbers', () {
    test('returns visit numbers for caravan role', () {
      expect(getValidTouchpointNumbers(UserRole.caravan), [1, 4, 7]);
    });

    test('returns call numbers for tele role', () {
      expect(getValidTouchpointNumbers(UserRole.tele), [2, 3, 5, 6]);
    });

    test('returns all numbers for admin role', () {
      expect(getValidTouchpointNumbers(UserRole.admin), [1, 2, 3, 4, 5, 6, 7]);
    });

    test('returns all numbers for area manager role', () {
      expect(getValidTouchpointNumbers(UserRole.areaManager), [1, 2, 3, 4, 5, 6, 7]);
    });

    test('returns all numbers for assistant area manager role', () {
      expect(getValidTouchpointNumbers(UserRole.assistantAreaManager), [1, 2, 3, 4, 5, 6, 7]);
    });
  });

  group('isValidTouchpointNumberForRole', () {
    test('returns true for valid visit number with caravan role', () {
      expect(isValidTouchpointNumberForRole(1, UserRole.caravan), true);
      expect(isValidTouchpointNumberForRole(4, UserRole.caravan), true);
      expect(isValidTouchpointNumberForRole(7, UserRole.caravan), true);
    });

    test('returns false for invalid visit number with caravan role', () {
      expect(isValidTouchpointNumberForRole(2, UserRole.caravan), false);
      expect(isValidTouchpointNumberForRole(3, UserRole.caravan), false);
    });

    test('returns true for valid call number with tele role', () {
      expect(isValidTouchpointNumberForRole(2, UserRole.tele), true);
      expect(isValidTouchpointNumberForRole(3, UserRole.tele), true);
      expect(isValidTouchpointNumberForRole(5, UserRole.tele), true);
      expect(isValidTouchpointNumberForRole(6, UserRole.tele), true);
    });

    test('returns false for invalid call number with tele role', () {
      expect(isValidTouchpointNumberForRole(1, UserRole.tele), false);
      expect(isValidTouchpointNumberForRole(4, UserRole.tele), false);
      expect(isValidTouchpointNumberForRole(7, UserRole.tele), false);
    });

    test('returns true for all numbers with admin role', () {
      for (int i = 1; i <= 7; i++) {
        expect(isValidTouchpointNumberForRole(i, UserRole.admin), true);
      }
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/unit/utils/permission_helpers_test.dart`
Expected: FAIL with "functions not found"

- [ ] **Step 3: Write minimal implementation**

```dart
// lib/shared/utils/permission_helpers.dart
import '../core/models/user_role.dart';

/// Returns the generic permission denied message
String getPermissionDeniedMessage() {
  return "You don't have permission to perform this action";
}

/// Returns valid touchpoint numbers for the given role
List<int> getValidTouchpointNumbers(UserRole role) {
  if (role.isManager) {
    return [1, 2, 3, 4, 5, 6, 7];
  }

  if (role == UserRole.caravan) {
    return [1, 4, 7]; // Visit touchpoints only
  }

  if (role == UserRole.tele) {
    return [2, 3, 5, 6]; // Call touchpoints only
  }

  return [1, 2, 3, 4, 5, 6, 7]; // Default to all
}

/// Checks if the touchpoint number is valid for the given role
bool isValidTouchpointNumberForRole(int number, UserRole role) {
  final validNumbers = getValidTouchpointNumbers(role);
  return validNumbers.contains(number);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/unit/utils/permission_helpers_test.dart`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/shared/utils/permission_helpers.dart test/unit/utils/permission_helpers_test.dart
git commit -m "feat: add permission helper utilities

- getPermissionDeniedMessage for consistent error text
- getValidTouchpointNumbers for role-based filtering
- isValidTouchpointNumberForRole for validation"
```

---

## Task 3: Wrap Client Delete Button with Permission Check

**Files:**
- Modify: `lib/features/clients/presentation/pages/client_detail_page.dart`

- [ ] **Step 1: Add import for permission widgets**

Add to imports at top of file:
```dart
import '../../../../shared/widgets/permission_widgets.dart';
import '../../../../shared/widgets/permission_dialog.dart';
```

- [ ] **Step 2: Find the delete button in client_detail_page.dart**

Search for delete button implementation (usually in actions or a trailing widget)

- [ ] **Step 3: Wrap delete button with PermissionDeleter**

Replace the delete button (likely an IconButton or similar) with:

```dart
PermissionDeleter(
  resource: 'clients',
  child: IconButton(
    icon: const Icon(Icons.delete),
    onPressed: () {
      // Existing delete logic
    },
  ),
  fallback: IconButton(
    icon: const Icon(Icons.delete),
    onPressed: () {
      PermissionDeniedDialog.show(context);
    },
  ),
)
```

- [ ] **Step 4: Run widget tests to verify**

Run: `flutter test test/widget/clients_page_test.dart`
Expected: PASS (existing tests still pass)

- [ ] **Step 5: Manual verification**

Run: `flutter run`
Manual test: Open client detail, tap delete as non-admin user
Expected: Permission dialog shows

- [ ] **Step 6: Commit**

```bash
git add lib/features/clients/presentation/pages/client_detail_page.dart
git commit -m "feat: add permission check to client delete button

- Wrapped delete button in PermissionDeleter
- Shows permission dialog for non-admin users
- Edit button remains unwrapped (approval workflow handles it)"
```

---

## Task 4: Filter Touchpoint Numbers by Role

**Files:**
- Modify: `lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`
- Test: `test/widget/touchpoint_form_test.dart` (create if not exists)

- [ ] **Step 1: Add imports for permission helpers**

Add to imports:
```dart
import '../../../../shared/utils/permission_helpers.dart';
import '../../../../shared/providers/app_providers.dart' show currentUserProvider;
```

- [ ] **Step 2: Find touchpoint number selector**

Search for the touchpoint number dropdown/selector in the form

- [ ] **Step 3: Make number selector role-aware**

Modify the number options to be filtered by user role. Replace static list with:

```dart
// In the widget build method, get current user
final currentUser = ref.watch(currentUserProvider);
final userRole = currentUser?.role ?? UserRole.caravan; // Default fallback

// Get valid numbers based on role
final validNumbers = getValidTouchpointNumbers(userRole);

// Use validNumbers to build dropdown items
DropdownButton<int>(
  value: selectedNumber,
  items: validNumbers.map((number) {
    return DropdownMenuItem<int>(
      value: number,
      child: Text('Touchpoint $number'),
    );
  }).toList(),
  onChanged: (value) {
    setState(() {
      selectedNumber = value;
      // Auto-select type based on number
      if (value != null) {
        selectedType = [1, 4, 7].contains(value) ? TouchpointType.visit : TouchpointType.call;
      }
    });
  },
)
```

- [ ] **Step 4: Write test for number filtering**

```dart
// test/widget/touchpoint_form_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:imu_flutter/features/touchpoints/presentation/widgets/touchpoint_form.dart';
import 'package:imu_flutter/core/models/user_role.dart';

void main() {
  group('TouchpointForm number filtering', () {
    testWidgets('shows only visit numbers for caravan role', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWith((ref) => mockUser(role: UserRole.caravan)),
          ],
          child: const MaterialApp(home: TouchpointForm()),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Touchpoint 1'), findsOneWidget);
      expect(find.text('Touchpoint 4'), findsOneWidget);
      expect(find.text('Touchpoint 7'), findsOneWidget);
      expect(find.text('Touchpoint 2'), findsNothing);
      expect(find.text('Touchpoint 3'), findsNothing);
    });

    testWidgets('shows only call numbers for tele role', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWith((ref) => mockUser(role: UserRole.tele)),
          ],
          child: const MaterialApp(home: TouchpointForm()),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Touchpoint 2'), findsOneWidget);
      expect(find.text('Touchpoint 3'), findsOneWidget);
      expect(find.text('Touchpoint 5'), findsOneWidget);
      expect(find.text('Touchpoint 6'), findsOneWidget);
      expect(find.text('Touchpoint 1'), findsNothing);
      expect(find.text('Touchpoint 4'), findsNothing);
    });

    testWidgets('shows all numbers for admin role', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            currentUserProvider.overrideWith((ref) => mockUser(role: UserRole.admin)),
          ],
          child: const MaterialApp(home: TouchpointForm()),
        ),
      );

      await tester.pumpAndSettle();

      for (int i = 1; i <= 7; i++) {
        expect(find.text('Touchpoint $i'), findsOneWidget);
      }
    });
  });
}
```

- [ ] **Step 5: Run tests to verify**

Run: `flutter test test/widget/touchpoint_form_test.dart`
Expected: PASS (3 new tests)

- [ ] **Step 6: Commit**

```bash
git add lib/features/touchpoints/presentation/widgets/touchpoint_form.dart test/widget/touchpoint_form_test.dart
git commit -m "feat: filter touchpoint numbers by user role

- Caravan: 1, 4, 7 (visit only)
- Tele: 2, 3, 5, 6 (call only)
- Managers: All numbers
- Auto-selects type based on number"
```

---

## Task 5: Add Permission Wrappers to Home Page Icons

**Files:**
- Modify: `lib/features/home/presentation/pages/home_page.dart`

- [ ] **Step 1: Add imports for permission widgets**

```dart
import '../../../../shared/widgets/permission_widgets.dart';
import '../../../../shared/widgets/permission_dialog.dart';
import '../../../../shared/providers/permission_providers.dart';
```

- [ ] **Step 2: Find the icon grid in home_page.dart**

Search for the icon grid implementation (likely in a build method)

- [ ] **Step 3: Wrap Reports icon with PermissionWidget**

Find the Reports icon and wrap it:

```dart
PermissionWidget(
  resource: 'reports',
  action: 'read',
  child: _buildIconGridItem(
    id: 'reports',
    icon: LucideIcons.barChart3,
    label: 'Reports',
  ),
  fallback: _buildIconGridItem(
    id: 'reports',
    icon: LucideIcons.barChart3,
    label: 'Reports',
    onTap: () => PermissionDeniedDialog.show(context),
  ),
)
```

- [ ] **Step 4: Wrap Debug icon with PermissionWidget**

Find the Debug icon and wrap it:

```dart
PermissionWidget(
  resource: 'system',
  action: 'read',
  child: _buildIconGridItem(
    id: 'debug',
    icon: LucideIcons.bug,
    label: 'Debug',
  ),
  fallback: const SizedBox.shrink(), // Hide completely
)
```

- [ ] **Step 5: Verify other icons don't need wrapping**

Targets, Settings, Attendance, etc. should remain unwrapped (all users can access)

- [ ] **Step 6: Manual verification**

Run: `flutter run`
Manual test: Check which icons appear for different roles

- [ ] **Step 7: Commit**

```bash
git add lib/features/home/presentation/pages/home_page.dart
git commit -m "feat: add permission wrappers to home page icons

- Reports icon: Managers only
- Debug icon: Admin only, hidden for others
- Other icons: No change (all users)
- Shows permission dialog when unauthorized"
```

---

## Task 6: Filter Bottom Navigation by Role

**Files:**
- Modify: `lib/shared/widgets/main_shell.dart`

- [ ] **Step 1: Add imports for permission navigation guard**

```dart
import '../../services/navigation/permission_navigation_guard.dart';
import '../../services/auth/auth_service.dart';
```

- [ ] **Step 2: Find the bottom navigation bar implementation**

Search for BottomNavigationBar or similar in main_shell.dart

- [ ] **Step 3: Modify navigation items to be role-based**

Replace static navigation items with dynamic filtering:

```dart
// In MainShell build method
final authService = AuthService.instance;
final userRole = authService.currentUserRole;

final navigationItems = await PermissionNavigationGuard.getNavigationItems(
  userRole: userRole,
);

// Use navigationItems to build BottomNavigationBar
BottomNavigationBar(
  items: navigationItems.map((item) {
    return BottomNavigationBarItem(
      icon: Icon(item.icon),
      label: item.label,
    );
  }).toList(),
  onTap: (index) {
    final destination = navigationItems[index].route;
    if (navigationItems[index].enabled) {
      // Navigate
      context.go(destination);
    } else {
      // Show permission dialog
      PermissionDeniedDialog.show(context);
    }
  },
)
```

- [ ] **Step 4: Add Reports navigation item for managers**

Update PermissionNavigationGuard to include Reports (if not already there)

- [ ] **Step 5: Manual verification**

Run: `flutter run`
Manual test: Check navigation for different roles

- [ ] **Step 6: Commit**

```bash
git add lib/shared/widgets/main_shell.dart lib/services/navigation/permission_navigation_guard.dart
git commit -m "feat: filter bottom navigation by role

- Uses PermissionNavigationGuard for dynamic items
- Reports tab shows for managers only
- Disabled items show permission dialog on tap"
```

---

## Task 7: Wrap Settings Admin Sections

**Files:**
- Modify: `lib/features/settings/presentation/pages/settings_page.dart`

- [ ] **Step 1: Add imports for permission widgets**

```dart
import '../../../../shared/widgets/permission_widgets.dart';
import '../../../../shared/widgets/permission_dialog.dart';
```

- [ ] **Step 2: Find admin-only sections**

Search for "User Management", "System Settings", or similar admin sections

- [ ] **Step 3: Wrap User Management section**

```dart
PermissionWidget(
  resource: 'users',
  action: 'update',
  child: _buildSettingsSection(
    title: 'User Management',
    // ... section content
  ),
  fallback: _buildSettingsSection(
    title: 'User Management',
    enabled: false,
    onTap: () => PermissionDeniedDialog.show(context),
  ),
)
```

- [ ] **Step 4: Wrap other admin sections**

Wrap System Settings, Agency Settings, etc. similarly

- [ ] **Step 5: Leave general settings unwrapped**

Profile, App Settings, Logout should remain accessible to all

- [ ] **Step 6: Manual verification**

Run: `flutter run`
Manual test: Check settings as different user roles

- [ ] **Step 7: Commit**

```bash
git add lib/features/settings/presentation/pages/settings_page.dart
git commit -m "feat: wrap admin sections in settings page

- User Management: Managers only
- System Settings: Admin only
- General settings: No change (all users)
- Shows permission dialog for unauthorized access"
```

---

## Task 8: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `flutter test`
Expected: All tests pass (including new permission tests)

- [ ] **Step 2: Run widget tests specifically**

Run: `flutter test test/widget/`
Expected: All widget tests pass

- [ ] **Step 3: Check for any broken tests**

If any tests fail, investigate and fix

- [ ] **Step 4: Commit any test fixes**

```bash
git add .
git commit -m "test: fix broken tests from RBAC integration"
```

---

## Task 9: Manual Testing Checklist

- [ ] **Step 1: Test as Admin user**
- Can delete clients
- Can see all touchpoint numbers
- Can access Reports
- Can access Debug
- Can see all settings sections

- [ ] **Step 2: Test as Manager user**
- Cannot delete clients (shows dialog)
- Can see all touchpoint numbers
- Can access Reports
- Cannot access Debug
- Can see user management settings

- [ ] **Step 3: Test as Caravan user**
- Cannot delete clients (shows dialog)
- Can only see touchpoint numbers 1, 4, 7
- Cannot access Reports
- Cannot access Debug
- Cannot see admin settings

- [ ] **Step 4: Test as Tele user**
- Cannot delete clients (shows dialog)
- Can only see touchpoint numbers 2, 3, 5, 6
- Cannot access Reports
- Cannot access Debug
- Cannot see admin settings

- [ ] **Step 5: Test approval workflow separation**
- Can add client (no permission check)
- Can edit client (no permission check, goes to approval)
- Cannot delete without admin permission

- [ ] **Step 6: Document any issues found**

Create notes for any bugs or UX issues discovered

---

## Task 10: Update Documentation

- [ ] **Step 1: Update CLAUDE.md with RBAC UI integration**

Add section about permission widgets and their usage

- [ ] **Step 2: Update ARCHITECTURE docs if needed**

Document the three-layer permission approach

- [ ] **Step 3: Commit documentation**

```bash
git add CLAUDE.md docs/architecture/
git commit -m "docs: update documentation for RBAC UI integration

- Added permission widget usage examples
- Documented three-layer permission approach
- Updated role-based access patterns"
```

---

## Final Verification

- [ ] **All tests pass**: `flutter test`
- [ ] **No lint errors**: `flutter analyze`
- [ ] **Code compiles**: `flutter build apk --debug`
- [ ] **Manual testing complete**: All roles tested
- [ ] **Documentation updated**: CLAUDE.md and architecture docs

---

**Total Estimated Time:** 3-4 hours

**Dependencies:** Requires RBAC services to be already implemented (Tasks 19-26 completed)

**Rollback Plan:** If issues arise, individual commits can be reverted. The changes are isolated to UI layer and don't affect business logic or data models.
