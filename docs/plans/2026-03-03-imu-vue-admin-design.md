# IMU Vue Admin Dashboard - Design Document

> **Created:** 2026-03-03
> **Status:** Approved
> **Author:** Claude (with user collaboration)

---

## 1. Overview

### 1.1 Purpose

Build a Vue 3 admin dashboard to replace the existing Piral-based `imu-web` prototype. The admin dashboard will provide complete administrative capabilities for managing the IMU (Itinerary Manager - Uniformed) system.

### 1.2 Target Users

| Role | Access Level | Description |
|------|--------------|-------------|
| **Admin** | Full access | System administrators with full CRUD permissions |
| **Staff** | Limited access | Staff members with read + limited edit permissions |

### 1.3 Key Features

- User & Role Management (RBAC)
- Agent Activity Monitoring
- Client & Data Management
- System Settings

---

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Vue 3 + TypeScript |
| **Build Tool** | Vite |
| **UI Library** | Tailwind CSS + HeadlessUI |
| **State Management** | Pinia |
| **Data Tables** | TanStack Table |
| **Form Validation** | Zod |
| **Routing** | Vue Router 4 |
| **Backend** | PocketBase |
| **Package Manager** | pnpm |

---

## 3. Design System

### 3.1 Color Palette (from Figma)

```css
colors: {
  primary: {
    500: '#F97316',  /* Orange accent - main brand color */
    600: '#EA580C',
    700: '#C2410C',
  },
  secondary: {
    500: '#1E40AF',  /* Dark blue - buttons */
    600: '#1E3A8A',
    700: '#1E3A8A',
  },
  neutral: {
    50: '#FAFAFA',   /* Background */
    500: '#71717A',
    900: '#18181B',  /* Text */
  }
}
```

### 3.2 Typography

```css
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
}
```

### 3.3 Component Variants

| Component | Variants |
|-----------|----------|
| **Button** | Primary (dark blue), Secondary (orange outline), Ghost, Danger |
| **Input** | Default, Focused, Error, Disabled |
| **Card** | Default (white), Bordered, Elevated |
| **Badge** | Success (green), Warning (yellow), Error (red), Info (blue) |
| **Table** | Striped rows, Hover highlight, Sortable headers |

---

## 4. Project Structure

```
imu-web-vue/
├── src/
│   ├── assets/
│   │   └── images/              # Logo, icons
│   ├── components/
│   │   ├── ui/                  # Reusable UI components
│   │   │   ├── Button.vue
│   │   │   ├── Input.vue
│   │   │   ├── Card.vue
│   │   │   ├── Modal.vue
│   │   │   ├── Dropdown.vue
│   │   │   ├── Badge.vue
│   │   │   ├── Avatar.vue
│   │   │   ├── EmptyState.vue
│   │   │   ├── LoadingSpinner.vue
│   │   │   └── DataTable.vue
│   │   └── shared/
│   │       ├── Sidebar.vue
│   │       ├── Header.vue
│   │       ├── PageHeader.vue
│   │       ├── ConfirmDialog.vue
│   │       ├── Toast.vue
│   │       ├── SearchInput.vue
│   │       └── FilterDropdown.vue
│   ├── layouts/
│   │   ├── AdminLayout.vue
│   │   └── AuthLayout.vue
│   ├── views/
│   │   ├── auth/
│   │   │   └── LoginView.vue
│   │   ├── dashboard/
│   │   │   └── DashboardView.vue
│   │   ├── users/
│   │   │   ├── UsersListView.vue
│   │   │   └── UserFormView.vue
│   │   ├── agents/
│   │   │   ├── AgentsListView.vue
│   │   │   └── AgentDetailView.vue
│   │   ├── clients/
│   │   │   ├── ClientsListView.vue
│   │   │   └── ClientDetailView.vue
│   │   └── settings/
│   │       └── SettingsView.vue
│   ├── stores/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── agents.ts
│   │   └── clients.ts
│   ├── lib/
│   │   ├── pocketbase.ts
│   │   └── utils.ts
│   ├── composables/
│   │   ├── useToast.ts
│   │   └── usePermission.ts
│   ├── validations/
│   │   ├── user.ts
│   │   ├── agent.ts
│   │   └── client.ts
│   ├── router/
│   │   └── index.ts
│   ├── styles/
│   │   └── main.css
│   ├── App.vue
│   └── main.ts
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env
```

---

## 5. Data Models

### 5.1 Users (PocketBase built-in auth)

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  avatar?: string;
  created: Date;
  updated: Date;
}
```

### 5.2 Agents

```typescript
interface Agent {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  assigned_area: string;
  status: 'active' | 'inactive';
  created: Date;
  updated: Date;
}
```

### 5.3 Clients

```typescript
interface Client {
  id: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  client_type: 'POTENTIAL' | 'EXISTING';
  product_type?: string;
  market_type?: string;
  pension_type?: string;
  agency_id?: string;
  agent_id?: string;
  is_starred: boolean;
  created: Date;
  updated: Date;
}
```

### 5.4 Supporting Collections

```typescript
interface Address {
  id: string;
  client_id: string;
  type: 'home' | 'work' | 'mailing';
  street: string;
  city: string;
  province: string;
  postal_code: string;
  is_primary: boolean;
}

interface PhoneNumber {
  id: string;
  client_id: string;
  type: 'mobile' | 'landline';
  number: string;
  is_primary: boolean;
}

interface Touchpoint {
  id: string;
  client_id: string;
  agent_id: string;
  touchpoint_number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  type: 'Visit' | 'Call';
  reason: string;
  status: 'Interested' | 'Undecided' | 'Not Interested' | 'Completed';
  notes?: string;
  photo_path?: string;
  audio_path?: string;
  location_data?: { latitude: number; longitude: number };
  created: Date;
}

interface Agency {
  id: string;
  name: string;
  code: string;
  region: string;
  address: string;
  status: 'active' | 'inactive';
}

interface Itinerary {
  id: string;
  agent_id: string;
  date: Date;
  status: 'pending' | 'in_progress' | 'completed';
}

interface ItineraryItem {
  id: string;
  itinerary_id: string;
  client_id: string;
  order: number;
  status: 'pending' | 'visited' | 'missed';
  time_in?: Date;
  time_out?: Date;
  notes?: string;
}
```

---

## 6. Routing

### 6.1 Route Structure

| Path | Component | Meta |
|------|-----------|------|
| `/login` | LoginView | guestOnly |
| `/` | redirect to /dashboard | requiresAuth |
| `/dashboard` | DashboardView | title: Dashboard |
| `/users` | UsersListView | title: Users, permission: view_users |
| `/users/new` | UserFormView | title: Add User, permission: create_users |
| `/users/:id/edit` | UserFormView | title: Edit User, permission: edit_users |
| `/agents` | AgentsListView | title: Agents |
| `/agents/:id` | AgentDetailView | title: Agent Details |
| `/clients` | ClientsListView | title: Clients |
| `/clients/:id` | ClientDetailView | title: Client Details |
| `/settings` | SettingsView | title: Settings |
| `/:pathMatch(.*)*` | NotFoundView | - |

### 6.2 Auth Guards

- Redirect logged-in users away from `/login`
- Require authentication for protected routes
- Check RBAC permissions for restricted actions

---

## 7. RBAC Permissions Matrix

| Feature | Admin | Staff |
|---------|-------|-------|
| View Dashboard | YES | YES |
| View Users | YES | YES |
| Create/Edit Users | YES | NO |
| Delete Users | YES | NO |
| View Agents | YES | YES |
| Create/Edit Agents | YES | YES |
| Delete Agents | YES | NO |
| View Clients | YES | YES |
| Create/Edit Clients | YES | YES |
| Delete Clients | YES | NO |
| View Settings | YES | YES |
| Modify Settings | YES | NO |

---

## 8. Views & Functionality

### 8.1 Authentication

- **Login**: Email/password form, "Forgot password" link, PocketBase auth

### 8.2 Dashboard

- Stats Cards: Total Agents, Total Clients, Today's Visits, Pending Tasks
- Recent Activity: Latest touchpoints table
- Quick Actions: "Add User", "View Reports" buttons

### 8.3 Users Management

- **Users List**: TanStack Table with search, filter by role, actions
- **Add/Edit User**: Form with Zod validation
- **Delete User**: Confirmation modal

### 8.4 Agents Management

- **Agents List**: Table with status/area filters
- **Agent Detail**: Profile + assigned clients + recent visits + stats
- **Add/Edit Agent**: Form with area assignment

### 8.5 Clients Management

- **Clients List**: Table with type/agency filters
- **Client Detail**: Personal info + addresses + phones + touchpoint history
- **Add/Edit Client**: Multi-step form

### 8.6 Settings

- Profile: Name, email, password change
- System: Application settings

---

## 9. Error Handling

| Error Type | Handling |
|------------|----------|
| Form Validation | Inline errors below fields (Zod) |
| API Errors | Toast notification |
| Network Errors | Toast with retry button |
| 401 Unauthorized | Auto-logout + redirect to login |
| 403 Forbidden | Toast "Permission denied" + redirect |
| 404 Not Found | NotFoundView page |
| 500 Server Error | Toast "Server error" |

---

## 10. Implementation Methodology

Implementation will follow **Elephant Carpaccio v3.0** methodology - see `elephant_carpaccio_v_3.md` for detailed slice breakdown.

### Phase Overview

| Phase | Focus | Slices |
|-------|-------|--------|
| 1 | Project Setup & Auth | 5 |
| 2 | Dashboard & Layout | 3 |
| 3 | Users CRUD | 6 |
| 4 | Agents CRUD | 6 |
| 5 | Clients CRUD | 7 |
| 6 | Polish & RBAC | 4 |

**Total: ~31 slices**

---

## 11. Success Criteria

- [ ] Admin can log in and see dashboard
- [ ] Admin can manage users (CRUD)
- [ ] Admin can view and manage agents
- [ ] Admin can view and manage clients
- [ ] Staff has limited access per RBAC matrix
- [ ] All forms have proper validation
- [ ] Error states are handled gracefully
- [ ] Design matches Figma brand guidelines

---

## 12. References

- Figma Design: https://www.figma.com/design/gfjGqsbXPHA01RAUsR105x/Wireframe--IMU-
- Elephant Carpaccio v2.0: `elephant-carpaccio-version-2.md`
- Implementation Slices: `elephant_carpaccio_v_3.md`
- Flutter App Reference: `mobile/imu_flutter/`

---

*Design Document v1.0 - IMU Vue Admin Dashboard*
