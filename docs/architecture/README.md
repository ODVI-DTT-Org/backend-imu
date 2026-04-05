# IMU Architecture Documentation

> **Generated:** 2026-04-04
> **Project:** IMU (Itinerary Manager Uniformed)
> **Version:** 2.1 (RBAC System + Error Handling)

---

## Overview

IMU is a mobile-first field agent management system with three parallel implementations:

1. **Flutter Mobile App** - Field agent interface for client visits and touchpoints
2. **Vue Web Admin** - Administrative dashboard for management and reporting
3. **Hono Backend API** - RESTful API with PostgreSQL database and PowerSync integration

**Target Users:** Field agents (Caravan role) managing client visits for retired police personnel (PNP retirees).

---

## System Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Mobile App** | Flutter 3.2+ | Cross-platform mobile app (iOS + Android) |
| **State Management** | Riverpod 2.0 | Reactive state management |
| **Navigation** | go_router 13.0 | Declarative routing |
| **Local Storage** | Hive + PowerSync | Offline-first data storage |
| **Web Admin** | Vue 3 + TypeScript | Admin dashboard |
| **State** | Pinia 2.2 | Vue state management |
| **UI** | HeadlessUI + Tailwind | Component library |
| **Backend** | Hono 4.6 | Lightweight web framework |
| **Database** | PostgreSQL 15 | Primary data store |
| **Auth** | JWT (RS256) | JSON Web Token authentication |
| **Sync** | PowerSync 1.15 | Offline-first synchronization |
| **Maps** | Mapbox + Geolocator | Location services |
| **Testing** | Vitest, Flutter Test | Unit and integration tests |

---

## Documentation Structure

```
docs/architecture/
├── README.md                    # This file - architecture overview
├── c4-context.md                # System context diagram
├── c4-containers.md             # Container diagram
├── c4-components.md             # Component diagrams
├── state-machines.md            # State machines and flows
├── user-flows.md                # User journey flows
├── data-flows.md                # Data flow diagrams
├── api-contracts.md             # API endpoint documentation
├── testing-strategy.md          # Testing approach
├── pre-mortem.md                # Risk assessment
├── roles-permissions.md         # RBAC system documentation (NEW)
└── VALIDATION_SUMMARY.md        # Documentation validation

docs/
└── RBAC_MIGRATION_GUIDE.md      # RBAC system implementation guide (NEW)
```

---

## Quick Links

### Architecture Views
- **[System Context](c4-context.md)** - IMU in the wider organizational context
- **[Containers](c4-containers.md)** - Major system components and interactions
- **[Components](c4-components.md)** - Detailed component breakdown

### Dynamic Behavior
- **[State Machines](state-machines.md)** - Authentication, touchpoint, and sync states
- **[User Flows](user-flows.md)** - Login, client visit, touchpoint creation
- **[Data Flows](data-flows.md)** - Data synchronization and API communication

### Technical Details
- **[API Contracts](api-contracts.md)** - All REST endpoints with schemas
- **[Testing Strategy](testing-strategy.md)** - Unit, integration, and E2E testing
- **[Roles & Permissions](roles-permissions.md)** - Complete RBAC system documentation
- **[RBAC Migration Guide](../RBAC_MIGRATION_GUIDE.md)** - Implementation guide for new permission system

### System Features
- **[Error Handling System](../superpowers/specs/2026-04-02-error-handling-system-design.md)** - Comprehensive error handling with request tracking, database logging, and admin dashboard
  - **[Implementation Plan](../superpowers/plans/2026-04-02-error-handling-system-implementation.md)** - Detailed implementation guide with 37 tasks

### Risk Assessment
- **[Pre-Mortem](pre-mortem.md)** - Known risks and mitigation strategies

---

## System Boundaries

### External Systems

| System | Integration | Purpose |
|--------|-------------|---------|
| **PowerSync Service** | RS256 JWT | Offline-first sync engine |
| **PostgreSQL Database** | TypeORM/JDBC | Primary data persistence |
| **Mapbox API** | REST API | Map display and geocoding |
| **Google Maps** | Deep Links | Navigation (external app) |
| **Email Service** | SMTP | Notifications and reports |

### Internal Systems

| System | Responsibility | Technology |
|--------|---------------|------------|
| **Flutter Mobile** | Field agent operations | Flutter + Riverpod |
| **Vue Web Admin** | Administrative tasks | Vue 3 + Pinia |
| **Hono Backend** | Business logic & API | Hono + PostgreSQL |
| **PowerSync** | Data synchronization | PowerSync SDK |

---

## Key Design Decisions

| ID | Decision | Impact | Date |
|----|----------|--------|------|
| D001 | Flutter over React Native | Native performance, single iOS/Android codebase | 2024-01-15 |
| D002 | Email+Password → PIN auth | Better UX for field agents | 2024-01-20 |
| D003 | Mapbox display, Google Maps navigation | Cost-effective, familiar UX | 2024-02-01 |
| D004 | Offline-first with assigned area only | Reduced storage, faster sync | 2024-02-15 |
| D005 | PowerSync for offline sync | Robust sync with conflict resolution | 2024-03-01 |
| D006 | JWT with RS256 for auth | More secure than HS256 | 2024-03-15 |
| D007 | Hono over Express for backend | Lightweight, modern, TypeScript-first | 2025-01-10 |
| D008 | Fine-grained RBAC system | Flexible permission-based access control | 2026-04-02 |
| D009 | Profile page with 5-tab navigation | Centralized user info access, logout in dedicated location | 2026-04-03 |
| D010 | Sync status overlay positioning | Non-intrusive sync visibility across all pages | 2026-04-03 |

---

## Communication Patterns

### API Communication
- **Flutter → Backend:** REST API with JWT auth (RS256)
- **Vue Web → Backend:** REST API with JWT auth (RS256)
- **Flutter → PowerSync:** PowerSync SDK with JWT auth
- **Backend → Database:** Direct PostgreSQL connection
- **Backend → PowerSync:** RS256 JWT for sync tokens

### Data Flow
```
[Field Agent] → [Flutter App] → [PowerSync] → [PostgreSQL]
                                              ↑
[Admin] → [Vue Web] → [Hono API] ─────────────┘
```

---

## State Management

### Flutter (Riverpod)
- **Providers:** StateNotifierProvider for async state
- **AsyncValue:** Loading, data, error states
- **Providers:** Global app providers, feature-specific providers

### Vue Web (Pinia)
- **Stores:** auth, users, clients, dashboard, agencies
- **Actions:** Async operations with loading states
- **Getters:** Computed derived state

---

## Development Commands

### Backend (Hono)
```bash
cd backend
pnpm install          # Install dependencies
pnpm dev             # Start dev server (tsx watch)
pnpm build           # Compile TypeScript
pnpm test            # Run Vitest tests
pnpm test:ui         # Run tests with UI
```

### Vue Web Admin
```bash
cd imu-web-vue
pnpm install          # Install dependencies
pnpm dev             # Start dev server (http://localhost:4002)
pnpm build           # Build for production
pnpm preview         # Preview production build
```

### Flutter Mobile
```bash
cd mobile/imu_flutter
flutter pub get      # Install dependencies
flutter run          # Run on connected device
flutter build apk    # Build Android APK
flutter build ios    # Build iOS app
flutter test         # Run tests
flutter analyze      # Analyze code
```

---

## Environment Variables

### Backend (.env)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/imu
JWT_SECRET=your-secret-key
POWERSYNC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
...
POWERSYNC_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
...
POWERSYNC_KEY_ID=imu-production-key-20260401
MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

### Vue Web (.env)
```bash
VITE_API_URL=http://localhost:4000
VITE_MAPBOX_TOKEN=your-mapbox-token
```

### Flutter (.env.dev/.env.prod)
```bash
API_BASE_URL=http://localhost:4000
POWERSYNC_URL=https://xxx.powersync.journeyapps.com
MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

---

## Known Issues & Limitations

See `debug-log.md` for detailed issues and solutions.

### Current Blockers
None currently.

### Known Limitations
- PowerSync attachments client unavailable on pub.dev (temporarily disabled)
- Firebase features disabled for web compatibility
- Mapbox requires valid access token for maps to display

---

## Authorization & Security

### Role-Based Access Control (RBAC)

IMU implements a comprehensive RBAC system with 5 predefined roles across all platforms:

| Role | Level | Description | Key Permissions |
|------|-------|-------------|-----------------|
| **Admin** | 100 | Full system access | All permissions |
| **Area Manager** | 50 | Regional oversight | Full area access, user management |
| **Assistant Area Manager** | 40 | Area support | Limited area access, client management |
| **Caravan** | 20 | Field agents | Client management, Visit touchpoints only |
| **Tele** | 15 | Telemarketers | Call touchpoints only, read-only clients |

**Documentation:**
- **[Roles & Permissions](roles-permissions.md)** - Complete role definitions, permission matrix, usage patterns
- **[RBAC Migration Guide](../RBAC_MIGRATION_GUIDE.md)** - Implementation guide for migrating to new permission system

**Backend Implementation:**
- Migration: `backend/src/migrations/033_add_rbac_system.sql`
- Middleware: `backend/src/middleware/permissions.ts`
- Types: `backend/src/types/rbac.ts`
- API Routes: `backend/src/routes/permissions.ts`
- Tests: `backend/src/tests/permissions.test.ts`

**Mobile Implementation (Flutter):**
- UserRole enum: `mobile/imu_flutter/lib/core/models/user_role.dart`
- PermissionService: `mobile/imu_flutter/lib/services/permissions/permission_service.dart`
- RemotePermissionService: `mobile/imu_flutter/lib/services/permissions/remote_permission_service.dart`
- Permission guards: `mobile/imu_flutter/lib/services/permissions/permission_guards.dart`
- Permission widgets: `mobile/imu_flutter/lib/shared/widgets/permission_widgets.dart`
- Ownership service: `mobile/imu_flutter/lib/services/ownership/ownership_service.dart`
- Area filter service: `mobile/imu_flutter/lib/services/area/area_filter_service.dart`
- Navigation guards: `mobile/imu_flutter/lib/services/navigation/permission_navigation_guard.dart`
- Providers: `mobile/imu_flutter/lib/shared/providers/permission_providers.dart`
- Tests: `mobile/imu_flutter/test/unit/models/user_role_test.dart`, `mobile/imu_flutter/test/unit/services/permission_service_test.dart`

**Mobile RBAC Features:**
- ✅ Local permission checking (no API calls needed)
- ✅ Remote permission fetching from backend
- ✅ Permission caching with 1-hour expiry
- ✅ Permission-aware UI widgets (PermissionWidget, PermissionGuard)
- ✅ Ownership validation for resources
- ✅ Area-based filtering for assigned municipalities
- ✅ Navigation guards for protected routes
- ✅ Automatic permission refresh on token refresh
- ✅ Tele role support for call touchpoints
- ✅ 32 unit tests covering all RBAC functionality

### Touchpoint Type Restrictions

**Caravan Role:** Can ONLY create Visit touchpoints (numbers 1, 4, 7)
**Tele Role:** Can ONLY create Call touchpoints (numbers 2, 3, 5, 6)
**Manager Roles:** Can create both Visit and Call touchpoints

**Implementation:**
- Backend: `backend/src/middleware/permissions.ts`
- Mobile: `mobile/imu_flutter/lib/services/permissions/permission_service.dart`
- Legacy: `mobile/imu_flutter/lib/services/touchpoint/touchpoint_validation_service.dart` (deprecated)

---

---

## Mobile Navigation Structure

### Bottom Navigation (5 Tabs)

The Flutter app uses a 5-tab bottom navigation bar:

| Tab | Route | Icon | Description |
|-----|-------|------|-------------|
| **Home** | `/home` | Home | Dashboard with quick actions and 6-icon grid |
| **My Day** | `/my-day` | Calendar | Today's tasks and visits |
| **Itinerary** | `/itinerary` | MapPin | Scheduled visits by date |
| **Clients** | `/clients` | Users | Client list and search |
| **Profile** | `/profile` | User | User profile with logout button |

**Implementation:** `mobile/imu_flutter/lib/shared/widgets/main_shell.dart:65-162`

### Sync Status Overlay

A sync status indicator appears in the top-right corner on all pages as an overlay using Flutter Stack layout.

**Features:**
- Tapping the indicator shows the sync status bottom sheet
- Shows pending sync count badge when there are pending changes
- Color changes based on sync status (green=synced, yellow=syncing, red=error)
- Non-intrusive positioning doesn't affect main content layout

**Implementation:** `mobile/imu_flutter/lib/shared/widgets/main_shell.dart:40-63`

### Profile Page

The Profile page (`/profile`) displays user information and provides logout functionality.

**Displayed Information:**
- Circular avatar with user's first initial
- User's full name
- User's email address
- Color-coded role badge (Admin=red, Manager=blue, Caravan=green, Tele=orange)
- Logout button with confirmation dialog

**Implementation:** `mobile/imu_flutter/lib/features/profile/presentation/pages/profile_page.dart`

---

**Last Updated:** 2026-04-04
**Documentation Version:** 1.2
