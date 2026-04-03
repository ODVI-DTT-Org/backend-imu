# Roles and Location Assignment System - Design Spec
**Date:** 2026-03-23
**Status:** Draft
**Author:** Claude (Brainstorming Session)

---

## Overview

This design updates the role definitions from 3 roles to 4 roles, refactors the location assignment system to support flexible filtering behavior.

    - This change supports the business requirement that some roles also have overlapping client assignments.
    - The keeps the existing organizational structure while making the hierarchy clearer and easier to manage.
    - Location assignment for no hard permission boundaries - filtering is for convenience only

- This design simplifies sync rules
- aims to minimize code duplication by maintain backward compatibility
- The implementation is easier to iterate on in future if needed

- Caravan-specific location assignments are fewer joins ( simpler sync rules
    - This keeps the organizational structure (Groups, group_regions) which is still useful for region assignment
    - The backend changes are straightforward and uses existing infrastructure
    - The mobile UI is intuitive to with clear filter controls
- The data model uses the single table instead of multiple tables
    - The sync rules are simpler and easier to understand and implement, and faster to develop
    - Less prone to bugs from complex sync rules

    - If requirements evolve, we new roles (REGION Manager, Area Manager) can be easily added
- The location assignment is for keeping the design simple and easy to understand
    - Implementation is straightforward
- The API changes are intuitive and The just role-based filtering endpoints, the filtering logic is similar to current spec
    - The frontend changes are straightforward and This is a the planning and development
    - Update user management UI for role and group assignment
    - Update client management UI for municipality selector
    - Add "unassigned clients" view for Admin
    - Update sync rules (no complex nested joins)
    - Simple region-based sync
    - Update Flutter models for new roles
        - Add `role` enum
        | Add `manager_id` field
        | Rename `team_leader_id` to `area_manager_id` (Manager)
        | Add `assistant_area_manager_id` field
        | Update role check constraint
    - Update sync rules to support all 4 roles
    - Update Hive adapters
    - Update backend routes
    - Add filter toggle UI
        | Remove old time in/out UI
    - Add migration script for data
    - Update tests
    - Update documentation

    - Maintenance checklist

    - Update CLAUDE.md
    - Update deep-analysis-on-project.md

---

## Non-Goals
- Barangay-level assignment (too granular for current needs)
- Real-time push notifications (out of scope)
- Deleting regions/municipalities (reference data, read-only)
    - Complex sync rules (not needed - this simplifies things)
    - Deleting `caravan_municipalities` table entirely (filter is on client side)
    - Multi-level role assignment (add complexity)
- Real-time notifications (handled outside PowerSync - just toggle filter visibility)
    - Soft delete when `caravan_municipalities` table (instead of just marking assignment as deleted)

    - Keep `groups` but `group_regions` tables for organizational structure
    - Introduce `user_municipalities_simple` table for simpler filtering
    - Soft delete on `caravan_municipalities` table (instead of just marking assignment as deleted)
    - Keep `user_municipalities` view for admin to see deleted assignments

---

## Goals
1. Complete the backend integration for the Flutter mobile app
2. Implement territory assignment based on Region → Municipality hierarchy
3. Enable role-based data visibility (Admin, Area Manager, Assistant Area Manager, Caravan)
4. Allow Area Managers and assign municipalities to Caravans (new role)
5. Allow Admins to manage organizational structure (Groups, Team Leaders, Regions, Municipalities)
6. Ensure data visibility rules are simple and intuitive
7. Minimize code duplication by maintaining backward compatibility
8. Provide clear migration path from existing tooling to new structure
9. Keep the design simple and focused on the actually delivers value

    - This change supports the business requirement that some roles also have overlapping client assignments
    - The keeps the existing organizational structure while making the hierarchy clearer and easier to manage
    - Location assignment is no hard permission boundaries - filtering is for convenience only

---

## Roles

| Role | Description |
|------|-------------|
| **Admin** | System administrator. Full access to all data. Can assign Area Managers to Groups, assign municipalities to Caravans. Can view/edit clients with NULL municipality_id. |
| **Area Manager** | Manages a group and Assistant Area Managers, and Caravans. Can view/edit all clients in their Groups' regions. Can toggle filter to "All" or "My Assigned". No municipality assignment (Admin only). |
| **Assistant Area Manager** | Reports to Area Manager. Can view/edit all clients in their Groups' regions. Can toggle filter to "All" or "My Assigned". No municipality assignment (Admin only). |
| **Caravan** | Field agent. Can view/edit clients in their assigned municipalities. Can toggle filter to "All" or "My Assigned". Yes municipality assignment (Area Manager only). |

## Permissions Matrix

| Action | Admin | Area Manager | Assistant Area Manager | Caravan |
|------|-------|---------------|---------------------------|--------|
| Create users | ✅ | ✅ | ✅ | ✅ |
| Edit users | ✅ | ✅ | ✅ | ✅ |
| Delete users | ✅ | ❌ (blocked if has caravans) | ❌ |
| Create groups | ✅ | ❌ | ✅ | ✅ |
| Edit groups | ✅ | ❌ | ✅ | ✅ |
| Delete groups | ❌ | ✅ | ✟ | ✅ |
| Assign regions to groups | ✅ | ❌ | ❌ |
| Assign municipalities to Caravans | ✅ | ❌ | ❌ |
| View all clients | ✅ | ✅ | ✅ | ✅ |
| Edit clients | ✅ | ✅ | ✅ | ✅ |
| Delete clients | ✅ | ❌ | ✅ | ✟ |
| Create touchpoints | ✅ | ✅ | ✅ | ✅ |
| Edit touchpoints | ✅ | ✅ | ✅ | ✟ |
| Delete touchpoints | ❌ | ✅ | ✟ | ✟ |

## Visibility Matrix
| Role | Clients Visible | Can Create Touchpoints | Notes |
|------|-----------------|----------------------|-------|
| Admin | All (including NULL municipality) | Yes | All regions, all municipalities |
| Area Manager | All in Groups' regions | Yes | All regions, all municipalities |
| Assistant Area Manager | All in Groups' regions | Yes | All regions, all municipalities |
| Caravan | Only in assigned municipalities | Yes | Assigned only | Assigned municipalities only |

## Data Model

### New Tables
None - all existing tables remain unchanged.

### Modified Tables

```sql
-- user_profiles table
ALTER TABLE user_profiles
    -- Change role enum from ('ADMIN', 'TEAM_LEADER', 'CARAVAN')
    -- to ('ADMIN', 'AREA_MANAGER', 'assistant_area_manager', 'caravan')
    -- Rename team_leader_id to area_manager_id
    ADD COLUMN assistant_area_manager_id UUID REFERENCES user_profiles(id) ON delete set null,
    -- Add CHECK constraint for valid role transitions
    ADD CONSTRAINT valid_role
        CHECK (
        (role IN ('caravan') AND assistant_area_manager_id IS NULL) OR
        (role IN ('assistant_area_manager') AND area_manager_id IS NOT NULL) OR
        (role IN ('area_manager') AND area_manager_id IS NULL)
        OR
        role = 'admin'
    );

-- groups table
ALTER TABLE groups
    -- Rename team_leader_id to area_manager_id;

-- clients table
-- Add municipality_id for filtering (existing)
-- Note: No access control - filtering only

-- Remove caravan_id column after migration

-- touchpoints table
-- No changes

-- caravan_municipalities table
-- No longer needed (filtering is now on client level)
-- All users can see any client regardless of assignment

```
-- Drop this table
-- A new approach will be introduced: user_municipalities_simple
-- Simpler approach: just manager_id relationship
```

-- Remove group_id column from caravan_municipalities
-- The makes sense because:
    1. It keeps the organizational structure (Groups, group_regions)
    2. It's much more flexible for future changes
    3. It's easier to implement without the complex group logic
    4. The sync rules are simpler and easier to debug
    5. Users can filter "All" to see everything, while Caravans only see their assigned areas
    6. Reduced code duplication
    7. Database queries are simpler (no complex joins,    8. Easier to maintain and test
```

## Sync Rules (Simplified)

```yaml
config:
  edition: 3

streams:
  # Global data - syncs to all users
  global:
    auto_subscribe: true
    queries:
      - SELECT * FROM regions
      - SELECT * FROM municipalities
      - SELECT * FROM groups
      - SELECT * FROM group_regions
      - SELECT * FROM user_municipalities_simple
      - SELECT * FROM user_profiles WHERE id = auth.user_id()
```

  # Admin full access - see all data
  admin_full_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role = 'ADMIN'
    queries:
      - SELECT * FROM clients
      - SELECT * FROM touchpoints
      - SELECT * FROM addresses
      - SELECT * FROM phone_numbers
      - SELECT * FROM user_municipalities_simple
```

  # Area Manager and sees all clients in their Groups' regions
  area_manager_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role IN ('area_manager', 'assistant_area_manager')
    queries:
      - SELECT c.* FROM clients c
        WHERE c.municipality_id IN (
            SELECT m.id FROM municipalities m
            WHERE m.region_id IN (
                SELECT gr.region_id FROM group_regions gr
                WHERE gr.group_id IN (
                    SELECT g.id FROM groups g
                    WHERE g.area_manager_id = auth.user_id()
                )
            )
        )
      - SELECT t.* FROM touchpoints t
        INNER JOIN clients c ON t.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT cm.municipality_id FROM user_municipalities_simple cm
            WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - SELECT * FROM addresses a
        INNER JOIN clients c ON addresses.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT municipality_id FROM user_municipalities_simple
            WHERE caravan_id = auth.user_id() AND deleted_at IS NULL
        )
      - SELECT p.* FROM phone_numbers p
        INNER JOIN clients c ON phone_numbers.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT municipality_id FROM user_municipalities_simple
            WHERE caravan_id = auth.user_id() AND deleted_at IS NULL
        )
```

  # Assistant Area Manager - same as Area Manager
  assistant_area_manager_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role IN ('area_manager', 'assistant_area_manager')
    queries:
      - Same as Area Manager queries (sees all clients in Area Manager's Groups' regions)
```

  # Caravan - sees only clients in their assigned municipalities
  caravan_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role = 'CARAVAN'
    queries:
      - SELECT c.* FROM clients c
        WHERE c.municipality_id IN (
            SELECT cm.municipality_id FROM user_municipalities_simple cm
            WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - SELECT t.* FROM touchpoints t
        INNER JOIN clients c ON t.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT municipality_id FROM user_municipalities_simple
            WHERE caravan_id = auth.user_id() AND deleted_at IS NULL
        )
      - SELECT a.* FROM addresses a
        INNER JOIN clients c ON addresses.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT municipality_id FROM user_municipalities_simple
            WHERE caravan_id = auth.user_id() AND deleted_at IS NULL
        )
      - SELECT p.* FROM phone_numbers p
        INNER JOIN clients c ON phone_numbers.client_id = c.id
        WHERE c.municipality_id IN (
            SELECT municipality_id FROM user_municipalities_simple
            WHERE caravan_id = auth.user_id() AND deleted_at IS NULL
        )
```

## API Endpoints

### Updated Endpoints
```
GET    /api/v1/users                              # List all users (Admin, Area Manager only)
POST   /api/v1/users/area-manager    # Create Area Manager (Admin only)
PUT    /api/v1/users/:id/area-manager  # Update Area Manager (Admin only)
DELETE /api/v1/users/:id               # Delete user (blocked if has Caravans)
GET    /api/v1/users/assistant-area-manager  # Create Assistant Area Manager (Admin only)
POST   /api/v1/users/:id/assistant-area-manager  # Update Assistant Area Manager (Admin only)
DELETE /api/v1/users/assistant-area-managers  # List Assistant Area Managers under Area Manager (Admin, Area Manager)
POST   /api/v1/users/assign-area-manager    # Assign Area Manager to user (Admin only)
DELETE /api/v1/users/assign-assistant-area-manager/:id # Unassign assistant area manager (Admin only)
```

### New Endpoints
```
GET    /api/v1/municipalities              # List municipalities with region_id filter
POST   /api/v1/municipalities/:id/assign-caravan  # Assign municipality to caravan
DELETE /api/v1/municipalities/:id/unassign-caravan/:id  # Unassign municipality from caravan
GET    /api/v1/caravans                   # List caravans with municipality filter (Area Manager, Admin)
POST   /api/v1/caravans                   # Create caravan (Admin, Area Manager)
PUT    /api/v1/caravans/:id               # Get caravan details
DELETE /api/v1/caravans/:id               # Delete caravan (blocked if has clients)
PUT    /api/v1/caravans/:id/municipalities  # Get caravan's assigned municipalities
POST   /api/v1/caravans/:id/municipalities/:municipality_id  # Assign municipality to caravan
DELETE /api/v1/caravans/:id/municipalities/:municipality_id  # Unassign municipality from caravan
```

### Unchanged Endpoints
```
GET    /api/v1/groups                # List groups (Admin only)
POST   /api/v1/groups                # Create group (Admin only)
PUT    /api/v1/groups/:id             # Get group details
DELETE /api/v1/groups/:id             # Delete group (Admin only)
PUT    /api/v1/groups/:id/regions     # Get group's regions
POST    /api/v1/groups/:id/regions/:region_id  # Assign region to group
DELETE /api/v1/groups/:id/regions/:region_id  # Remove region from group
```

### Clients Endpoints (unchanged - see existing spec)
```
GET    /api/v1/clients               # List clients
GET    /api/v1/clients/:id             # Get client details
POST    /api/v1/clients               # Create client
PUT    /api/v1/clients/:id             # Update client
DELETE /api/v1/clients/:id             # Delete client
GET    /api/v1/clients/unassigned    # List unassigned clients (Admin only)
POST   /api/v1/clients/bulk-assign  # Bulk assign municipalities to clients
```

### Touchpoints Endpoints (unchanged - see existing spec)
```
POST   /api/v1/touchpoints               # Create touchpoint
GET    /api/v1/touchpoints/:id             # Get touchpoint details
PUT    /api/v1/touchpoints/:id             # Update touchpoint
DELETE /api/v1/touchpoints/:id             # Delete touchpoint
```

## Flutter Changes

### New Models
```
lib/features/territ/data/models/region.dart
lib/features/territ/data/models/municipality.dart
lib/features/territ/data/models/group.dart (renamed)
lib/features/territ/data/models/user_municipality.dart (new - simpler)
```

### Updated Models
```
lib/features/auth/data/models/user_profile.dart
    - Add role enum: ADMIN, AREA_MANAGER, ASSISTANT_AREA_MANAGER, CARAVAN
    - Add areaManagerId field
    - Add assistantAreaManagerId field
```

### New Providers
```
lib/features/territ/providers/territ_providers.dart
    - Territory state management
    - Filter toggle state
```

### Updated Widgets
```
lib/features/my_day/presentation/widgets/my_day_client_card.dart
    - Add filter toggle (dropdown or switch)
    - Remove old time in button
    - Simplify to "Start Visit" button
```

### New Widgets
```
lib/features/territ/presentation/widgets/filter_toggle.dart
    - Simple dropdown with "All" / "My Assigned" / "Unassigned" options
```

## Mobile UI Changes
```
- Filter toggle in client list (dropdown in top right corner)
- Filter options: "All", "My Assigned", "Unassigned"
- Default filter based on user's municipality assignments
- Unassigned filter shows all clients with NULL municipality
```

## Web Admin Changes
```
- Update user management forms for add new roles
    - Add Assistant Area Manager role
    - Update role selection UI (checkbox to select Assistant Area Manager)
- Update group management forms for assign Team Leader to Area Manager
    - Update role check constraints
```

## Migration Strategy

### Slice 1: Database Migration
1. Add new columns to `user_profiles`
2. Update `groups` table
3. Create `user_municipalities_simple` table
4. Update sync rules
5. Update Hive adapters
6. Update Flutter models and providers
7. Add filter toggle UI to mobile app
8. Migration script for backfill data

9. Testing
10. Update documentation
11. Cleanup (remove deprecated code)
```

## Acceptance Criteria
1. ✅ Database migration runs successfully
2 - ✅ Sync rules deployed and all 4 roles sync correctly
        - Admin: sees everything
        - Area Manager: sees all in their Groups' regions
        - Assistant Area Manager: sees all in their Area Manager's Groups' regions
        - Caravan: Sees only clients in their assigned municipalities
    - ✅ Mobile app shows filter toggle in client list (All/My Assigned/Unassigned)
    - ✅ Web admin forms allow selecting Assistant Area Manager role
    - ✅ Admin can create Area Managers, Assistant Area Managers, and Caravans, assign municipalities to Caravans
    - ✅ All users can create touchpoints on any client regardless of assignment
    - ✅ Filtering works correctly (location assignment is just for filtering)
    - ✅ New roles work correctly with existing organizational structure
    - ✅ Backend changes are straightforward and use existing infrastructure
    - ✅ Data model is simple with clear separation of concerns
    - ✅ Sync rules are simpler with better performance
    - ✅ Implementation is straightforward
    - ✅ No complex nested joins - improved query performance
    - ✅ Clearer organization structure makes management more intuitive
    - ✅ Implementation doesn't break existing mobile app functionality

    - ✅ Removal of `caravan_municipalities` table reduces complexity
    - ✅ Soft delete on `caravan_municipalities` table makes unassignment reversible
    - ✅ Using `user_municipalities_simple` for filtering is more flexible
        - It keep it simple
        - Soft delete is easy
        - Can be backdated if needed
    - ✅ All roles can see any client regardless of assignment (filtering is for convenience)
    - ✅ The design maintains backward compatibility with existing data while simplifying the management

