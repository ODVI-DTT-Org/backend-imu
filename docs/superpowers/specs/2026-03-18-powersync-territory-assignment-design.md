# PowerSync Integration + Territory Assignment System

**Date:** 2026-03-18
**Status:** Approved
**Author:** Claude (Brainstorming Session)

---

## Overview

This design unifies two related features:
1. **PowerSync Integration** — Complete the backend + sync rules for offline-first data synchronization
2. **Territory Assignment System** — Role-based client visibility and municipality assignment for field agents

---

## Goals

1. Complete PowerSync backend integration for the Flutter mobile app
2. Implement territory assignment based on Region → Municipality hierarchy
3. Enable role-based data visibility (Admin, Team Leader, Caravan)
4. Allow Team Leaders to assign municipalities to Caravans
5. Allow Admins to manage organizational structure (Groups, Team Leaders, Regions)

---

## Non-Goals

- Barangay-level assignment (municipality level is sufficient)
- Real-time push notifications (5-minute sync tolerance is acceptable)
- Deleting Regions or Municipalities (reference data, read-only)

---

## Data Model

### Entity Relationship Diagram

```
PSGC (reference) ──derives──► Region ◄────────────────────────┐
                                  │                            │
                                  │ has many                   │
                                  ▼                            │
                           Municipality ◄─────────────────────┤
                                  │                            │
                                  │ has many                   │ assigned to
                                  ▼                            │
                               Client                          │
                                                               │
Admin ──manages──► Team Leader ◄──belongs to── Group ──has──► Group_Regions
                         │                         │
                         │ manages                 │ has
                         ▼                         ▼
                      Caravan ───────────► Caravan_Municipalities ──► Municipality
```

### PostgreSQL Tables

#### New Tables

```sql
-- PSGC Reference Table (seeded manually by admin)
CREATE TABLE psgc (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    mun_city_kind VARCHAR(50) NOT NULL,
    mun_city VARCHAR(100) NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    pin_location JSONB NULL,
    zip_code VARCHAR(4) NULL
);

-- Indexes for PSGC
CREATE INDEX idx_psgc_barangay ON psgc USING btree (barangay);
CREATE INDEX idx_psgc_barangay_trgm ON psgc USING gin (barangay gin_trgm_ops);
CREATE INDEX idx_psgc_composite ON psgc USING btree (province, mun_city, barangay);
CREATE INDEX idx_psgc_mun_city ON psgc USING btree (mun_city);
CREATE INDEX idx_psgc_mun_city_trgm ON psgc USING gin (mun_city gin_trgm_ops);
CREATE INDEX idx_psgc_province ON psgc USING btree (province);
CREATE INDEX idx_psgc_province_trgm ON psgc USING gin (province gin_trgm_ops);
CREATE INDEX idx_psgc_zip_code ON psgc USING btree (zip_code) WHERE (zip_code IS NOT NULL);

-- Regions (derived from PSGC, read-only)
CREATE TABLE regions (
    id TEXT PRIMARY KEY,  -- e.g., 'NCR', 'REGION-3'
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Municipalities (derived from PSGC, read-only)
CREATE TABLE municipalities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    region_id TEXT NOT NULL REFERENCES regions(id),
    province TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, region_id, province)
);
CREATE INDEX idx_municipalities_region ON municipalities(region_id);

-- Groups (teams of caravans)
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team_leader_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_groups_team_leader ON groups(team_leader_id);

-- Group-Region junction (many-to-many)
CREATE TABLE group_regions (
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, region_id)
);

-- Caravan-Municipality junction (many-to-many with soft delete)
CREATE TABLE caravan_municipalities (
    caravan_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    municipality_id TEXT REFERENCES municipalities(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (caravan_id, municipality_id)
);
CREATE INDEX idx_caravan_municipalities_caravan ON caravan_municipalities(caravan_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_caravan_municipalities_municipality ON caravan_municipalities(municipality_id);
```

#### Modified Tables

```sql
-- User Profiles: Add role enum and team_leader relationship
ALTER TABLE user_profiles
    ADD COLUMN role TEXT NOT NULL DEFAULT 'CARAVAN'
        CHECK (role IN ('ADMIN', 'TEAM_LEADER', 'CARAVAN')),
    ADD COLUMN team_leader_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_team_leader ON user_profiles(team_leader_id);

-- Clients: Add municipality_id, remove caravan_id
ALTER TABLE clients
    ADD COLUMN municipality_id TEXT REFERENCES municipalities(id);

CREATE INDEX idx_clients_municipality ON clients(municipality_id);

-- Migration: Drop caravan_id after municipality assignment is complete
-- ALTER TABLE clients DROP COLUMN caravan_id;

-- NOTE: touchpoints.caravan_id is KEPT for audit trail (who performed the touchpoint)
```

---

## Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| **ADMIN** | System administrator | Full access to all data. Can manage Users, Groups, Regions, Municipalities. Can see clients with NULL municipality_id. |
| **TEAM_LEADER** | Manages a team of Caravans | Can view all clients in their Groups' regions. Can assign municipalities to Caravans. Cannot delete/modify Groups or Regions. |
| **CARAVAN** | Field agent | Can only view clients in their assigned municipalities. Can create/edit touchpoints for assigned clients. |

---

## Assignment Rules

### Admin Assignments

| Action | Description |
|--------|-------------|
| Assign Team Leader to Group | Sets `groups.team_leader_id` |
| Assign Caravan to Team Leader | Sets `user_profiles.team_leader_id` (required for Caravans) |
| Assign Region to Group | Creates row in `group_regions` |

### Team Leader Assignments

| Action | Description |
|--------|-------------|
| Assign Municipality to Caravan | Creates row in `caravan_municipalities` (must be within Group's regions) |
| Unassign Municipality from Caravan | Sets `deleted_at` on `caravan_municipalities` row (soft delete) |

### Assignment Validation

- A Caravan can only be assigned municipalities from their Team Leader's Group's regions
- A Caravan MUST be assigned to a Team Leader when created
- Municipality assignments are validated on the backend
- A Group MUST have a Team Leader assigned (cannot be orphaned)
- When removing a Team Leader from a Group, must assign a new Team Leader first

---

## Visibility Rules

| Role | Clients Visible |
|------|-----------------|
| **Admin** | All clients (including NULL municipality_id) |
| **Team Leader** | All clients in their Groups' regions |
| **Caravan** | Only clients in their actively assigned municipalities |

### Sync Rules Implementation

```yaml
# PowerSync Sync Rules for IMU Territory Assignment

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

  # Role-based data sync
  by_role:
    auto_subscribe: true
    queries:
      # User profiles - sync own profile + team members
      - |
        SELECT * FROM user_profiles
        WHERE user_id = auth.user_id()
        OR team_leader_id = auth.user_id()
        OR user_id IN (
          SELECT up.user_id FROM user_profiles up
          INNER JOIN groups g ON g.team_leader_id = auth.user_id()
          WHERE up.team_leader_id = g.team_leader_id
        )

  # Admin - sees everything
  admin_full_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role = 'ADMIN'
    queries:
      - SELECT * FROM clients
      - SELECT * FROM touchpoints
      - SELECT * FROM addresses
      - SELECT * FROM phone_numbers
      - SELECT * FROM caravan_municipalities
      - SELECT * FROM itineraries

  # Team Leader - sees all clients in their groups' regions
  team_leader_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role = 'TEAM_LEADER'
    queries:
      - |
        SELECT c.* FROM clients c
        WHERE c.municipality_id IN (
          SELECT m.id FROM municipalities m
          WHERE m.region_id IN (
            SELECT gr.region_id FROM group_regions gr
            WHERE gr.group_id IN (
              SELECT g.id FROM groups g WHERE g.team_leader_id = auth.user_id()
            )
          )
        )
      - |
        SELECT t.* FROM touchpoints t
        INNER JOIN clients c ON t.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT m.id FROM municipalities m
          WHERE m.region_id IN (
            SELECT gr.region_id FROM group_regions gr
            WHERE gr.group_id IN (
              SELECT g.id FROM groups g WHERE g.team_leader_id = auth.user_id()
            )
          )
        )
      - |
        SELECT a.* FROM addresses a
        INNER JOIN clients c ON a.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT m.id FROM municipalities m
          WHERE m.region_id IN (
            SELECT gr.region_id FROM group_regions gr
            WHERE gr.group_id IN (
              SELECT g.id FROM groups g WHERE g.team_leader_id = auth.user_id()
            )
          )
        )
      - |
        SELECT p.* FROM phone_numbers p
        INNER JOIN clients c ON p.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT m.id FROM municipalities m
          WHERE m.region_id IN (
            SELECT gr.region_id FROM group_regions gr
            WHERE gr.group_id IN (
              SELECT g.id FROM groups g WHERE g.team_leader_id = auth.user_id()
            )
          )
        )
      - |
        SELECT * FROM caravan_municipalities WHERE caravan_id IN (
          SELECT user_id FROM user_profiles WHERE team_leader_id = auth.user_id()
        )

  # Caravan - sees only clients in assigned municipalities
  caravan_access:
    parameters: SELECT role FROM user_profiles WHERE user_id = auth.user_id()
    where: role = 'CARAVAN'
    queries:
      - |
        SELECT c.* FROM clients c
        WHERE c.municipality_id IN (
          SELECT cm.municipality_id FROM caravan_municipalities cm
          WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - |
        SELECT t.* FROM touchpoints t
        INNER JOIN clients c ON t.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT cm.municipality_id FROM caravan_municipalities cm
          WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - |
        SELECT a.* FROM addresses a
        INNER JOIN clients c ON a.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT cm.municipality_id FROM caravan_municipalities cm
          WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - |
        SELECT p.* FROM phone_numbers p
        INNER JOIN clients c ON p.client_id = c.id
        WHERE c.municipality_id IN (
          SELECT cm.municipality_id FROM caravan_municipalities cm
          WHERE cm.caravan_id = auth.user_id() AND cm.deleted_at IS NULL
        )
      - SELECT * FROM caravan_municipalities WHERE caravan_id = auth.user_id()
```

---

## Invariants

### Role Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| R1 | A user has exactly ONE role | CHECK constraint on `role` |
| R2 | `team_leader_id` must be NULL for Admin and Team Leader roles | Application logic |
| R3 | `team_leader_id` must NOT be NULL for Caravan role | Application logic (required field) |
| R4 | A Caravan's `team_leader_id` must reference a user with `role='TEAM_LEADER'` | FK + application validation |

### Assignment Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| A1 | A Caravan can only be assigned municipalities from their Team Leader's Group's regions | Backend validation on assignment |
| A2 | A Group must have at least one region before Caravans can be added | Application logic |
| A3 | One caravan cannot have duplicate ACTIVE assignments to the same municipality | PRIMARY KEY + soft delete |
| A4 | A municipality belongs to exactly one region | FK constraint |

### Visibility Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| V1 | Caravan sees ONLY clients in their active assigned municipalities | Sync rules |
| V2 | Team Leader sees ALL clients in their Groups' regions | Sync rules |
| V3 | Admin sees ALL clients including NULL municipality_id | Sync rules |
| V4 | Soft-deleted assignments do NOT grant visibility | Sync rules (`deleted_at IS NULL`) |

### Deletion Constraints

| ID | Constraint |
|----|------------|
| D1 | Team Leader cannot be deleted if they have Caravans |
| D2 | Group cannot be deleted if its Team Leader has Caravans |
| D3 | Region cannot be deleted (reference data) |
| D4 | Municipality cannot be deleted (reference data) |

---

## Business Rules

### Role Transitions

| Scenario | Action |
|----------|--------|
| Caravan promoted to Team Leader | Clear their `caravan_municipalities` assignments |
| Team Leader demoted to Caravan | Delete their Groups |
| Team Leader moved to different Group | Old Group stays, Caravans stay with old Group, Admin must reassign new Team Leader to old Group |

### Assignment Changes

| Scenario | Action |
|----------|--------|
| Caravan reassigned to different Team Leader | Clear their `caravan_municipalities` assignments |
| Municipality unassigned from Caravan | Soft delete (set `deleted_at`) |
| Client's municipality changed | Update only, no notification needed |

### Sync Behavior

| Scenario | Behavior |
|----------|----------|
| New municipality assigned to Caravan | Sync within 5 minutes |
| Team Leader creates new Group without regions | Caravans in that Group see no clients |
| Client created without municipality_id | Only Admin can see it |

---

## API Endpoints

### Region & Municipality (Read-only for Admin/Team Leader)

```
GET    /api/v1/regions                    # List all regions
GET    /api/v1/regions/:id/municipalities # List municipalities in region
```

### Groups (Admin only)

```
GET    /api/v1/groups                     # List all groups
POST   /api/v1/groups                     # Create group
PUT    /api/v1/groups/:id                 # Update group
DELETE /api/v1/groups/:id                 # Delete group (blocked if has caravans)
POST   /api/v1/groups/:id/regions         # Assign region(s) to group
DELETE /api/v1/groups/:id/regions/:regionId # Remove region from group
```

### User Management (Admin only)

```
GET    /api/v1/users                      # List all users (with role filter)
POST   /api/v1/users                      # Create user (role + team_leader_id required for Caravan)
PUT    /api/v1/users/:id                  # Update user
DELETE /api/v1/users/:id                  # Delete user (blocked if Team Leader with Caravans)
```

### Municipality Assignment (Team Leader only)

```
GET    /api/v1/caravans                   # List caravans under Team Leader
GET    /api/v1/caravans/:id/municipalities # Get caravan's assigned municipalities
POST   /api/v1/caravans/:id/municipalities # Assign municipality to caravan (validated against group regions)
DELETE /api/v1/caravans/:id/municipalities/:municipalityId # Unassign (soft delete)
```

### Client Management (all roles, filtered by sync rules)

```
GET    /api/v1/clients                    # List clients (filtered by role visibility)
POST   /api/v1/clients                    # Create client (municipality_id optional for Admin)
PUT    /api/v1/clients/:id                # Update client
GET    /api/v1/clients/:id                # Get client detail
```

### Unassigned Clients (Admin only)

```
GET    /api/v1/clients/unassigned         # List clients with NULL municipality_id
POST   /api/v1/clients/bulk-assign        # Assign multiple clients to a municipality
```

---

## Flutter Changes

### New Models

```
lib/features/territory/
├── data/
│   ├── models/
│   │   ├── region.dart
│   │   ├── municipality.dart
│   │   ├── caravan_group.dart
│   │   └── caravan_municipality.dart
│   └── repositories/
│       └── territory_repository.dart
├── presentation/
│   ├── pages/
│   │   └── territory_assignment_page.dart
│   └── widgets/
│       ├── caravan_list_tile.dart
│       └── municipality_selector.dart
└── providers/
    └── territory_providers.dart
```

### Updated Models

- `UserProfile` — Add `role` enum, `teamLeaderId`
- `Client` — Add `municipalityId`, remove `caravanId`

### PowerSync Schema Update

Add new tables to `powersync_service.dart`:
- `regions`
- `municipalities`
- `groups`
- `group_regions`
- `caravan_municipalities`

---

## Vue Web Admin Changes

### User Management Updates

- Add role selector (Admin, Team Leader, Caravan)
- When Caravan selected, show Team Leader dropdown (required)
- Add group assignment for Team Leaders

### Group Management Updates

- Add Region assignment (multi-select)
- Show linked Team Leader
- Show member Caravans count

### Client Management Updates

- Add Municipality dropdown (populated from municipalities table)
- Add "Unassigned Clients" view for Admin

### New Features

- Bulk client assignment to municipality
- Assignment statistics dashboard

---

## Migration Strategy

### Slice 1: Caravan Visibility (Backend + Data Model)

1. Create PostgreSQL tables: `regions`, `municipalities`, `groups`, `group_regions`, `caravan_municipalities`
2. Update `user_profiles`: add `role`, `team_leader_id`
3. Update `clients`: add `municipality_id`
4. Seed `regions` and `municipalities` from PSGC (manual)
5. Update PowerSync schema
6. Deploy sync rules
7. Update Flutter models and repositories
8. Test Caravan visibility

### Slice 2: Team Leader Assignment UI (Mobile)

1. Create territory assignment page in Flutter
2. Implement municipality assignment API
3. Add validation (municipality must be in group's regions)
4. Test assignment flow

### Slice 3: Admin Management UI (Web)

1. Update Vue web admin user management
2. Update Vue web admin group management
3. Add client municipality selector
4. Add unassigned clients view
5. Test full organizational flow

---

## Open Questions / Future Considerations

1. **Audit logging** — Track who made what assignment and when (currently only `assigned_by` and `assigned_at`)
2. **Assignment history** — Full history table for compliance (currently soft delete only)
3. **Bulk operations** — Assign multiple municipalities to multiple caravans at once
4. **Geolocation** — Use PSGC `pin_location` for map-based assignment
5. **Notification** — Alert Caravan when new municipality is assigned

---

## Appendix: Decision Log

| ID | Decision | Rationale |
|----|----------|-----------|
| D001 | Municipality-level assignment (not barangay) | Simpler, sufficient for territory management |
| D002 | Soft delete for municipality assignments | Preserve history, enable re-assignment tracking |
| D003 | Caravan must be assigned to Team Leader immediately | Prevent orphaned caravans |
| D004 | Clear assignments on Caravan reassignment | Fresh start with new Team Leader |
| D005 | Clear assignments on Caravan promotion | Team Leader sees all region clients |
| D006 | Delete Groups when Team Leader demoted | Clean up organizational structure |
| D007 | Regions/Municipalities cannot be deleted | Reference data integrity |
| D008 | 5-minute sync tolerance | Acceptable for field operations |
| D009 | Admin-only for clients with NULL municipality | Controlled access to unassigned data |
