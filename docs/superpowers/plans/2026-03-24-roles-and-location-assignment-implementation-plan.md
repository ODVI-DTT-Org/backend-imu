# Roles and Location Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 4-role system (Admin, Area Manager, Assistant Area Manager, Caravan) with flexible, location-based filtering for all roles can visit any client regardless of municipality assignment
**Architecture:** Replace `caravan_id` with `municipality_id` on clients, create `user_municipalities_simple` table for user-municipality assignments with soft deletes. Use single `manager_id` field instead of separate `team_leader_id` and `assistant_area_manager_id` fields. Update sync rules with role-based parameters, simplified queries instead of nested joins. **Tech Stack:** PostgreSQL, Flutter, Riverpod, PowerSync, Node.js backend (Express), Drizzle ORM

---

## File Structure

### Backend (Node.js/Express)
- `backend/src/db/migrations/20260324_add_user_municipalities_simple.sql` - Migration for new table
- `backend/src/db/migrations/20260324_add_manager_fields.sql` - Migration for manager fields on user_profiles
- `backend/src/db/migrations/20260324_rename_group_fields.sql` - Migration to rename team_leader_id to area_manager_id in groups
- `backend/src/db/migrations/20260324_update_role_enum.sql` - Migration to update role enum
- `backend/src/routes/caravans.ts` - Municipality assignment endpoints
- `backend/src/routes/users.ts` - User creation with role constraints
- `docs/powersync-sync-rules.yaml` - Updated sync rules with role parameters

### Flutter Mobile App
- `mobile/imu_flutter/lib/features/profile/data/models/user_profile.dart` - UserProfile model with role enum and manager fields
- `mobile/imu_flutter/lib/features/territ/data/models/user_municipalities_simple.dart` - New model for user-municipality assignments
- `mobile/imu_flutter/lib/features/territ/repositories/user_municipalities_simple_repository.dart` - Repository for new model
- `mobile/imu_flutter/lib/features/territ/providers/filter_providers.dart` - Filter state management
- `mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart` - Filter toggle UI
- `mobile/imu_flutter/lib/features/clients/presentation/pages/clients_list_page.dart` - Filter toggle UI

---

## Tasks

### Task 1: Database Migration - Create user_municipalities_simple Table
**Files:**
- Create: `backend/src/db/migrations/20260324_add_user_municipalities_simple.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/src/db/migrations/20260324_add_user_municipalities_simple.sql
CREATE TABLE user_municipalities_simple (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    municipality_id TEXT NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    assigned_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_user_municipalities_user ON user_municipalities_simple(user_id);
CREATE INDEX idx_user_municipalities_municipality ON user_municipalities_simple(municipality_id);
```

- [ ] **Step 2: Run migration**

```bash
cd backend
npx drizzle-kit push
npx run src/db/migrations/20260324_add_user_municipalities_simple.sql
```
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/20260324_add_user_municipalities_simple.sql
git commit -m "feat(db): add user_municipalities_simple table"
```
---

### Task 2: Database Migration - Add Manager Fields to user_profiles
**Files:**
- Create: `backend/src/db/migrations/20260324_add_manager_fields.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/src/db/migrations/20260324_add_manager_fields.sql
ALTER TABLE user_profiles
    ADD COLUMN area_manager_id UUID REFERENCES user_profiles(id) ON DELETE SET null,
    ADD COLUMN assistant_area_manager_id UUID REFERENCES user_profiles(id) ON DELETE SET null;
CREATE INDEX idx_user_profiles_area_manager ON user_profiles(area_manager_id);
Create INDEX idx_user_profiles_assistant_area_manager ON user_profiles(assistant_area_manager_id);
```

- [ ] **Step 2: Run migration**

```bash
cd backend
npx drizzle-kit push
npx run src/db/migrations/20260324_add_manager_fields.sql
```
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/20260324_add_manager_fields.sql
git commit -m "feat(db): add manager fields to user_profiles"
```
---

### Task 3: Database Migration - Rename group fields
**Files:**
- Create: `backend/src/db/migrations/20260324_rename_group_fields.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/src/db/migrations/20260324_rename_group_fields.sql
ALTER TABLE groups
    RENAME COLUMN team_leader_id TO area_manager_id;
```

- [ ] **Step 2: Run migration**

```bash
cd backend
npx drizzle-kit push
npx run src/db/migrations/20260324_rename_group_fields.sql
```
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/20260324_rename_group_fields.sql
git commit -m "feat(db): rename team_leader_id to area_manager_id in groups"
```
---

### Task 4: Database Migration - Update Role Enum
**Files:**
- Create: `backend/src/db/migrations/20260324_update_role_enum.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/src/db/migrations/20260324_update_role_enum.sql
ALTER TABLE user_profiles
    DROP CONSTRAINT IF EXISTS role_check;

ALTER TABLE user_profiles
    ADD COLUMN role TEXT NOT NULL DEFAULT 'caravan'
        CHECK (role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan'));
```

- [ ] **Step 2: Run migration**

```bash
cd backend
npx drizzle-kit push
npx run src/db/migrations/20260324_update_role_enum.sql
```
Expected: Migration successful

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/20260324_update_role_enum.sql
git commit -m "feat(db): update role enum to include new roles"
```
---

### Task 5: Backend - Update Caravans Routes for Municipality Assignments
**Files:**
- Modify: `backend/src/routes/caravans.ts`

- [ ] **Step 1: Update municipality assignment endpoints**

Replace existing `caravan_municipalities` references with `user_municipalities_simple`:
Add endpoints:
- `GET /api/v1/caravans/:id/municipalities` - Get assigned municipalities
- `POST /api/v1/caravans/:id/municipalities` - Assign municipalities (Area Manager only)
- `DELETE /api/v1/caravans/:id/municipalities/:municipalityId` - Unassign municipality (soft delete)

Update validation to ensure only Area Managers can assign municipalities within their Groups' regions.

- [ ] **Step 2: Test with different roles**

Write unit tests for each role type:
Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/caravans.ts
git commit -m "feat(caravans): update municipality assignment endpoints for new roles"
```
---

### Task 6: Backend - Update Users routes for Handle New Roles
**Files:**
- Modify: `backend/src/routes/users.ts`

- [ ] **Step 1: Update user creation to handle new roles**

Add role validation constraints:
- Caravan: requires `areaManagerId` OR `assistantAreaManagerId`
- Assistant Area Manager: requires `areaManagerId`
- Area Manager: cannot have `areaManagerId` or `assistantAreaManagerId`

- [ ] **Step 2: Test user creation**

Write unit tests for user creation with different roles
Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/users.ts
git commit -m "feat(users): add role constraints for new roles"
```
---

### Task 7: Backend - Update Sync Rules for role-based filtering
**Files:**
- Modify: `docs/powersync-sync-rules.yaml`

- [ ] **Step 1: Update sync rules with role parameters and simplified queries**

Replace the existing sync rules with role-based parameterized streams:
- `global` - Global data (regions, municipalities, groups, group_regions) synced to all
- `admin_full_access` - Admin sees all data
- `area_manager_access` - Area Manager sees all clients in their Groups' regions
- `assistant_area_manager_access` - Same as Area Manager (sees all in area_manager's Groups' regions)
- `caravan_access` - Caravan sees only clients in their assigned municipalities

Key changes:
- Use `user_municipalities_simple` instead of `caravan_municipalities`
- Simplified queries without nested subqueries where possible
- Role-based filtering with `where` clause using parameters

- [ ] **Step 2: Verify sync rules syntax**

```bash
# Check YAML syntax
cat docs/powersync-sync-rules.yaml
```
Expected: Valid YAML

- [ ] **Step 3: Commit**

```bash
git add docs/powersync-sync-rules.yaml
git commit -m "feat(powersync): update sync rules for role-based filtering"
```
---

### Task 8: Flutter - Update UserProfile Model
**Files:**
- Modify: `mobile/imu_flutter/lib/features/profile/data/models/user_profile.dart`

- [ ] **Step 1: Add role enum and manager fields**

```dart
// mobile/imu_flutter/lib/features/profile/data/models/user_profile.dart
enum UserRole { admin, areaManager, assistantAreaManager, caravan }

class UserProfile {
  final String id;
  final String email;
  final String name;
  final UserRole role;
  final String? areaManagerId;
  final String? assistantAreaManagerId;
  // ... existing fields

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String,
      role: UserRole.values.firstWhere((e) => e.name == json['role']),
      areaManagerId: json['area_manager_id'] as String?,
      assistantAreaManagerId: json['assistant_area_manager_id'] as String?,
      // ... existing fields
    );
  }
}
```

- [ ] **Step 2: Test UserProfile model**

Write unit tests for UserProfile model
Run: `flutter test test/features/profile/data/models/user_profile_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/profile/data/models/user_profile.dart
git commit -m "feat(profile): add role enum and manager fields"
```
---

### Task 9: Flutter - Create UserMunicipalitiesSimple Model
**Files:**
- Create: `mobile/imu_flutter/lib/features/territ/data/models/user_municipalities_simple.dart`

- [ ] **Step 1: Write the model**

```dart
// mobile/imu_flutter/lib/features/territ/data/models/user_municipalities_simple.dart
import 'package:hive/hive.dart';
import 'package:json_annotation/json_annotation.dart';

part 'user_municipalities_simple.g.dart';

@HiveType(typeId: 4)
class UserMunicipalitySimple extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String userId;

  @HiveField(2)
  final String municipalityId;

  @HiveField(3)
  final DateTime assignedAt;

  @HiveField(4)
  final String? assignedBy;

  @HiveField(5)
  final DateTime? deletedAt;

  UserMunicipalitySimple({
    required this.id,
    required this.userId,
    required this.municipalityId,
    required this.assignedAt,
    this.assignedBy,
    this.deletedAt,
  });

  factory UserMunicipalitySimple.fromJson(Map<String, dynamic> json) {
    return UserMunicipalitySimple(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      municipalityId: json['municipality_id'] as String,
      assignedAt: DateTime.parse(json['assigned_at']),
      assignedBy: json['assigned_by'] as String?,
      deletedAt: json['deleted_at'] != null ? DateTime.parse(json['deleted_at']) : null,
    );
  }
}
```

- [ ] **Step 2: Run build_runner**

```bash
cd mobile/imu_flutter
dart run build_runner build --delete-conflicting-outputs
```
Expected: Build successful with generated files

- [ ] **Step 3: Test UserMunicipalitySimple model**

Write unit tests for the model
Run: `flutter test test/features/territ/data/models/user_municipalities_simple_test.dart`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add mobile/imu_flutter/lib/features/territ/data/models/user_municipalities_simple.dart \
    mobile/imu_flutter/lib/features/territ/data/models/user_municipalities_simple.g.dart
git commit -m "feat(territory): add UserMunicipalitySimple model"
```
---

### Task 10: Flutter - Create UserMunicipalitiesSimple Repository
**Files:**
- Create: `mobile/imu_flutter/lib/features/territ/repositories/user_municipalities_simple_repository.dart`

- [ ] **Step 1: Write the repository**

```dart
// mobile/imu_flutter/lib/features/territ/repositories/user_municipalities_simple_repository.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../data/models/user_municipalities_simple.dart';
import '../../../core/providers/powersync_provider.dart';

class UserMunicipalitiesSimpleRepository {
  final Ref _ref;

  UserMunicipalitiesSimpleRepository(this._ref);

  Future<List<UserMunicipalitySimple>> getUserMunicipalities(String userId) async {
    final db = await _ref.read(powersyncServiceProvider.notifier).$db;
    final results = await db.query(
      'SELECT * FROM user_municipalities_simple WHERE user_id = ? AND deleted_at IS NULL',
      [userId],
    );
    return results.map((map) => UserMunicipalitySimple.fromJson(map)).toList();
  }

  Future<void> assignMunicipality(
    String userId,
    String municipalityId,
    String assignedBy,
  ) async {
    final db = await _ref.read(powersyncServiceProvider.notifier).$db;
    final id = const Uuid().v4();
    await db.execute(
      'INSERT INTO user_municipalities_simple (id, user_id, municipality_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?, ?)',
      [id, userId, municipalityId, DateTime.now().toIso8601String(), assignedBy],
    );
  }

  Future<void> unassignMunicipality(String userId, String municipalityId) async {
    final db = await _ref.read(powersyncServiceProvider.notifier).$db;
    await db.execute(
      'UPDATE user_municipalities_simple SET deleted_at = ? WHERE user_id = ? AND municipality_id = ? AND deleted_at IS NULL',
      [DateTime.now().toIso8601String(), userId, municipalityId],
    );
  }

  Future<List<String>> getAssignedMunicipalityIds(String userId) async {
    final assignments = await getUserMunicipalities(userId);
    return assignments.map((a) => a.municipalityId).toList();
  }
}

final userMunicipalitiesSimpleRepositoryProvider = Provider((ref) {
  return UserMunicipalitiesSimpleRepository(ref);
});
```

- [ ] **Step 2: Test repository**

Write unit tests for the repository
Run: `flutter test test/features/territ/repositories/user_municipalities_simple_repository_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/territ/repositories/user_municipalities_simple_repository.dart
git commit -m "feat(territory): add UserMunicipalitiesSimpleRepository"
```
---

### Task 11: Flutter - Create Filter Providers
**Files:**
- Create: `mobile/imu_flutter/lib/features/territ/providers/filter_providers.dart`

- [ ] **Step 1: Write filter providers**

```dart
// mobile/imu_flutter/lib/features/territ/providers/filter_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum FilterMode { all, myAssigned, unassigned }

final filterModeProvider = StateNotifierProvider<FilterMode>((ref) {
  return FilterMode.all;
});

final userMunicipalitiesSimpleRepositoryProvider = Provider((ref) {
  return UserMunicipalitiesSimpleRepository(ref);
});
```

- [ ] **Step 2: Test filter providers**

Write unit tests for the providers
Run: `flutter test test/features/territ/providers/filter_providers_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/territ/providers/filter_providers.dart
git commit -m "feat(territory): add filter providers for client list filtering"
```
---

### Task 12: Flutter - Update My Day Page with Filter Toggle
**Files:**
- Modify: `mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart`

- [ ] **Step 1: Add filter toggle UI**

Add `FilterModeDropdown` widget to the app bar
Add `ref.watch(filterModeProvider)` to rebuild filter logic based on current filter mode
Add `ref.read(userMunicipalitiesSimpleRepositoryProvider)` to fetch assigned municipalities
Update client list to filter based on selected mode

- [ ] **Step 2: Test My Day page filter**

Write widget tests for the filter functionality
Run: `flutter test test/features/my_day/presentation/pages/my_day_page_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/my_day/presentation/pages/my_day_page.dart
git commit -m "feat(my_day): add filter toggle UI for client list"
```
---

### Task 13: Flutter - Update Clients List Page with Filter Toggle
**Files:**
- Modify: `mobile/imu_flutter/lib/features/clients/presentation/pages/clients_list_page.dart`

- [ ] **Step 1: Add filter toggle to app bar**

Add `FilterModeDropdown` widget similar to My Day page
Update filter logic based on filter mode

- [ ] **Step 2: Test Clients list page filter**

Write widget tests for the filter functionality
Run: `flutter test test/features/clients/presentation/pages/clients_list_page_test.dart`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add mobile/imu_flutter/lib/features/clients/presentation/pages/clients_list_page.dart
git commit -m "feat(clients): add filter toggle UI for client list"
```
---

### Task 14: Cleanup - Delete deprecated files
**Files:**
- Delete: `mobile/imu_flutter/lib/features/territ/data/models/caravan_municipalities.dart`
- Delete: `mobile/imu_flutter/lib/features/territ/data/repositories/caravan_municipalities_repository.dart`
- Delete: `mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart`

- [ ] **Step 1: Delete deprecated files**

```bash
rm mobile/imu_flutter/lib/features/territ/data/models/caravan_municipalities.dart
rm mobile/imu_flutter/lib/features/territ/data/repositories/caravan_municipalities_repository.dart
rm mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart
```
Expected: Files deleted successfully

- [ ] **Step 2: Commit**

```bash
git add -A mobile/imu_flutter/lib/features/territ/data/models/caravan_municipalities.dart \
               mobile/imu_flutter/lib/features/territ/data/repositories/caravan_municipalities_repository.dart \
               mobile/imu_flutter/lib/features/my_day/presentation/widgets/time_in_bottom_sheet.dart
git commit -m "chore: remove deprecated territory assignment files"
```
---

### Task 15: Update documentation
**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/deep-analysis-on-project.md`
- Modify: `docs/powersync-sync-rules.yaml`

- [ ] **Step 1: Update documentation**

Add references to the new role system
Update architecture diagrams with the new roles and location assignment, flow
Update data model sections with the new roles and locations assignment, etc.

- [ ] **Step 2: Commit documentation**

```bash
git add CLAUDE.md docs/deep-analysis-on-project.md docs/powersync-sync-rules.yaml
git commit -m "docs: update documentation for new roles and location assignment"
```
---

### Task 16: Write migration tests
**Files:**
- Create: `backend/src/db/migrations/tests/migration_test.ts`

- [ ] **Step 1: Write migration tests**

```typescript
// backend/src/db/migrations/tests/migration_test.ts
import { describe, test } from 'bun:test';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../schema';
import { db } from '../../db';

describe('Roles and Location Assignment Migrations', () => {
  test('user_municipalities_simple table exists', async () => {
    await migrate([schema.userMunicipalitiesSimple]);
    const result = await db.select().from('user_municipalities_simple').limit(1);
    expect(result).toBeDefined();
  });

  test('user_profiles has manager fields', async () => {
    await migrate([schema.userProfiles]);
    const result = await db.select()
      .column_name
      .from('information_schema.columns')
      .where('table_name', 'user_profiles')
      .and('column_name IN ('area_manager_id', 'assistant_area_manager_id'));
    expect(result.rows).toHaveLength(2);
  });

  test('groups table has area_manager_id', async () => {
    await migrate([schema.groups]);
    const result = await db.select()
      .column_name
      .from('information_schema.columns')
      .where('table_name', 'groups')
      .and('column_name', 'area_manager_id');
    expect(result.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run migration tests**

```bash
cd backend
npm test
```
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/tests/migration_test.ts
git commit -m "test: add migration tests for roles and location assignment"
```
---

## Acceptance Criteria
- ✅ All 5 database migrations run successfully
- ✅ user_profiles has role enum with 4 values and manager fields
- ✅ user_municipalities_simple table exists
- ✅ groups.area_manager_id field replaces team_leader_id
- ✅ Sync rules use role parameters and simplified queries
- ✅ Backend routes handle new role constraints
- ✅ Mobile app shows filter toggle in client list
- ✅ All deprecated files removed
- ✅ Documentation updated
- ✅ All tests pass
