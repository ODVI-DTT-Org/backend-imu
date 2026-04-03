# IMU Vue Admin - Missing Pages Design

> **Created:** 2024-03-04
> **Status:** Approved
> **Implementation:** See `vertical-slices-missing-features.md`

---

## Overview

This document captures the design for 5 missing pages in the IMU Vue Admin Dashboard:
1. Rename Agents → Caravan
2. Itineraries
3. Groups
4. Reports
5. Audit Trail

---

## 1. Rename Agents → Caravan

### Scope
- Rename PocketBase collection: `agents` → `caravans`
- Update all frontend references (routes, components, stores, types)
- Update sidebar navigation label

### Routes
```
/caravan          → Caravan list
/caravan/new      → Create caravan
/caravan/:id      → Caravan detail
/caravan/:id/edit → Edit caravan
```

### Files to Update
- `pocketbase/pb_migrations/` - migration to rename collection
- `src/stores/agents.ts` → `src/stores/caravans.ts`
- `src/types/index.ts` - Agent → Caravan
- `src/views/agents/` → `src/views/caravan/`
- `src/router/index.ts`
- `src/components/shared/Sidebar.vue`
- `src/validations/agent.ts` → `src/validations/caravan.ts`

---

## 2. Itineraries

### Purpose
Admins schedule and assign client visits to Caravans.

### Data Model
```typescript
interface Itinerary {
  id: string;
  title?: string;
  caravan_id: string;          // Assigned Caravan (relation)
  client_id: string;           // Client to visit (relation)
  scheduled_date: Date;
  scheduled_time?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high';
  notes?: string;
  is_recurring: boolean;
  recurring_pattern?: string;  // Future: 'daily' | 'weekly' | 'monthly'
  created: Date;
  updated: Date;
  created_by: string;
}
```

### Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/itineraries` | ItinerariesListView.vue | List all itineraries |
| `/itineraries/new` | ItineraryFormView.vue | Create itinerary |
| `/itineraries/:id` | ItineraryDetailView.vue | View details |
| `/itineraries/:id/edit` | ItineraryFormView.vue | Edit itinerary |

### Features
- Search by client name
- Date range filter
- Filter by Caravan, Status
- Priority assignment
- Notes field
- Bulk reassign (future)

---

## 3. Groups (Caravan Teams)

### Purpose
Organize Caravans into teams for better management.

### Data Model
```typescript
interface Group {
  id: string;
  name: string;
  description?: string;
  leader_id?: string;          // Optional team leader
  members: string[];           // Caravan IDs (many-to-many)
  status: 'active' | 'inactive';
  created: Date;
  updated: Date;
}
```

### Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/groups` | GroupsListView.vue | List all groups |
| `/groups/new` | GroupFormView.vue | Create group |
| `/groups/:id` | GroupDetailView.vue | View + manage members |
| `/groups/:id/edit` | GroupFormView.vue | Edit group |

### Features
- Multi-select member assignment
- Team leader designation
- Add/remove members from detail page
- View group's recent itineraries

### PocketBase Collections
- `groups` - Group records
- `group_members` - Junction table (many-to-many)

---

## 4. Reports

### Purpose
Analytics and reporting dashboard with tabbed views.

### Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/reports` | ReportsView.vue | Reports with tabs |

### Tabs
| Tab | Description | Key Metrics |
|-----|-------------|-------------|
| Caravans | Caravan performance | Visits, clients, touchpoints |
| Clients | Client statistics | New, converted, by type |
| Itineraries | Completion analytics | Status breakdown, rates |
| Performance | Overall KPIs | Summary cards, trends |

### Features
- Tab navigation
- Filters per tab
- Date range selection
- Export to CSV
- Summary cards with trends

---

## 5. Audit Trail

### Purpose
System activity log tracking Create, Update, Delete operations.

### Data Model
```typescript
interface AuditLog {
  id: string;
  timestamp: Date;

  // Who
  user_id: string;
  user_name: string;
  user_role: string;

  // What
  action: 'create' | 'update' | 'delete';
  entity_type: string;        // 'client', 'caravan', 'group', 'itinerary', 'user'
  entity_id: string;
  entity_name: string;
  description: string;

  // Change details
  old_values?: object;
  new_values?: object;

  // Context
  ip_address?: string;
  user_agent?: string;
  session_id?: string;

  // Related entity
  related_entity?: {
    type: string;
    id: string;
    name: string;
  };
}
```

### Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/audit-trail` | AuditTrailView.vue | Audit log list |

### Features
- Color coding: 🟢 Create, 🟡 Update, 🔴 Delete
- Relative time display
- Quick filters: 24h, 7d, 30d
- Entity type filter
- Action type filter
- Custom date range
- Detail modal with old/new values
- Click entity to navigate to record
- Export to CSV

### Logged Actions
| Collection | Create | Update | Delete |
|------------|--------|--------|--------|
| clients | ✅ | ✅ | ✅ |
| caravans | ✅ | ✅ | ✅ |
| groups | ✅ | ✅ | ✅ |
| itineraries | ✅ | ✅ | ✅ |
| users | ✅ | ✅ | ✅ |

---

## Updated Sidebar Navigation

```
Dashboard
Clients
Caravan          ← renamed from Agents
Groups           ← new
Itineraries      ← new
Reports          ← new
Audit Trail      ← new
Users
Settings
```

---

## Technical Stack

- **Runtime:** Bun (switched from pnpm)
- **Framework:** Vue 3 + TypeScript + Vite
- **State:** Pinia
- **UI:** HeadlessUI + Tailwind CSS
- **Tables:** TanStack Vue Table
- **Backend:** PocketBase
- **Validation:** Zod

---

## Implementation Order

1. Rename Agents → Caravan (Phase 1)
2. Itineraries (Phase 2)
3. Groups (Phase 3)
4. Reports (Phase 4)
5. Audit Trail (Phase 5)

See `vertical-slices-missing-features.md` for detailed slice breakdown.

---

## Deferred Items

| Item | Reason |
|------|--------|
| Approvals page | No business context yet |
| Recurring itineraries logic | Schema ready, logic later |
| Calendar view for itineraries | Future enhancement |

---

*Design Document - IMU Vue Admin Missing Pages*
