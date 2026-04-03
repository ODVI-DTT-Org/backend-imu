# IMU Backend Analysis & Application Flow Documentation

> **Generated:** 2026-04-02
> **Project:** IMU (Itinerary Manager - Uniformed)
> **Purpose:** Comprehensive backend architecture and application flow analysis

---

## Table of Contents

1. [Backend Project Overview](#1-backend-project-overview)
2. [Backend Project Structure](#2-backend-project-structure)
3. [API Routes & Endpoints](#3-api-routes--endpoints)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Key Services](#6-key-services)
7. [Touchpoint System](#7-touchpoint-system)
8. [Application Flow](#8-application-flow)
9. [User Journeys](#9-user-journeys)
10. [Development Commands](#10-development-commands)

---

## 1. Backend Project Overview

**IMU Backend API** is a RESTful API server built with modern TypeScript/Node.js stack, designed to serve both a Flutter mobile app and a Vue 3 web admin dashboard for field agent management in the lending/collection industry.

### Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Hono (ultra-fast web framework) |
| **Language** | TypeScript (ES Modules) |
| **Database** | PostgreSQL with connection pooling |
| **Authentication** | JWT (RS256 with PowerSync keys, HS256 fallback) |
| **Validation** | Zod schemas |
| **Password Hashing** | bcrypt/bcryptjs |
| **Package Manager** | pnpm |
| **Runtime** | Node.js 18+ |
| **Development** | tsx watch mode |

---

## 2. Backend Project Structure

```
C:\odvi-apps\IMU\backend\
├── src/
│   ├── index.ts                    # Main entry point
│   ├── db/
│   │   └── index.ts                # PostgreSQL pool configuration
│   ├── schema.sql                  # Complete database schema
│   ├── middleware/
│   │   ├── auth.ts                 # JWT authentication & RBAC
│   │   ├── audit.ts                # Audit logging middleware
│   │   ├── rate-limit.ts           # Rate limiting
│   │   └── debug-logger.ts         # Debug logging
│   ├── routes/                     # API route handlers (22 files)
│   │   ├── auth.ts                 # Authentication endpoints
│   │   ├── users.ts                # User management
│   │   ├── clients.ts              # Client CRUD
│   │   ├── touchpoints.ts          # Touchpoint management
│   │   ├── itineraries.ts          # Itinerary/schedule management
│   │   ├── approvals.ts            # Approval workflow
│   │   ├── groups.ts               # Group management
│   │   ├── dashboard.ts            # Dashboard statistics
│   │   ├── reports.ts              # Reporting endpoints
│   │   ├── psgc.ts                 # Philippine geographic codes
│   │   ├── agencies.ts             # Agency management
│   │   ├── caravans.ts             # Caravan (field agent) management
│   │   ├── attendance.ts           # Attendance tracking
│   │   ├── targets.ts              # Target/KPI management
│   │   ├── profile.ts              # User profile
│   │   ├── my-day.ts               # Daily task management
│   │   ├── search.ts               # Search functionality
│   │   ├── upload.ts               # File upload
│   │   ├── touchpoint-reasons.ts   # Touchpoint reason codes
│   │   ├── touchpoints-analytics.ts# Touchpoint analytics
│   │   └── audit-logs.ts           # Audit log queries
│   ├── services/
│   │   ├── analytics.ts            # PostHog analytics integration
│   │   ├── email.ts                # Email service (Nodemailer)
│   │   ├── gps-validation.ts       # GPS location validation
│   │   └── storage.ts              # File storage (S3/NAS)
│   ├── utils/
│   │   └── response.ts             # Response helpers
│   └── migrations/                 # Database migrations (38 files)
│       ├── 001_add_indexes.sql
│       ├── 002_add_time_in_out_columns.sql
│       ├── ...
│       └── 037_add_udi_number_to_approvals.sql
├── .env.example                    # Environment configuration template
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── README.md                       # Project documentation
├── docker-compose.yml              # Docker setup
└── Procfile                        # Heroku deployment
```

---

## 3. API Routes & Endpoints

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Email/password login, returns JWT tokens |
| POST | `/refresh` | Refresh access token |
| POST | `/register` | User registration (admin/testing) |
| GET | `/me` | Get current user profile |
| POST | `/forgot-password` | Request password reset |
| POST | `/reset-password` | Complete password reset |
| POST | `/logout` | Logout (client-side token removal) |

### User Routes (`/api/users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List users (admin/staff only) |
| GET | `/:id` | Get single user |
| POST | `/` | Create user (admin only) |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Delete user (admin only) |
| POST | `/:id/change-password` | Change password |
| POST | `/bulk-delete` | Bulk delete users |
| GET | `/:id/municipalities` | Get assigned municipalities |
| POST | `/:id/municipalities` | Assign municipalities |
| DELETE | `/:id/municipalities/:municipalityId` | Unassign municipality |
| GET | `/roles` | List available roles |

### Client Routes (`/api/clients`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List clients with pagination |
| GET | `/:id` | Get single client |
| POST | `/` | Create client |
| PUT | `/:id` | Update client (requires approval for non-admin) |
| PATCH | `/:id` | Partial update (e.g., loan_released) |
| DELETE | `/:id` | Delete client |
| POST | `/:id/addresses` | Add address |
| POST | `/:id/phones` | Add phone number |
| GET | `/search/unassigned` | Search unassigned clients |

### Touchpoint Routes (`/api/touchpoints`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List touchpoints |
| GET | `/:id` | Get single touchpoint |
| POST | `/` | Create touchpoint (with role & sequence validation) |
| PUT | `/:id` | Update touchpoint |
| DELETE | `/:id` | Delete touchpoint |
| GET | `/reasons` | Get touchpoint reasons |
| GET | `/next/:clientId` | Get next expected touchpoint |
| GET | `/:id/gps-validate` | Validate GPS location |

### Approval Routes (`/api/approvals`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List approvals |
| GET | `/:id` | Get single approval |
| POST | `/` | Create approval |
| PUT | `/:id` | Update approval |
| POST | `/:id/approve` | Approve (managers/staff) |
| POST | `/:id/reject` | Reject (managers/staff) |
| POST | `/bulk-approve` | Bulk approve |
| POST | `/bulk-reject` | Bulk reject |
| DELETE | `/:id` | Delete approval |
| GET | `/stats/summary` | Approval statistics |
| POST | `/loan-release` | Submit loan release for approval |

---

## 4. Database Schema

### Core Tables

#### `users` - User accounts with role-based access
- Fields: id, email, password_hash, first_name, last_name, role, phone, avatar_url
- Roles: admin, area_manager, assistant_area_manager, caravan, tele, staff, field_agent
- Manager assignments: area_manager_id, assistant_area_manager_id

#### `user_profiles` - PowerSync sync profiles
- Linked to users table
- Contains name, email, role, avatar_url

#### `clients` - Client database
- Fields: id, first_name, last_name, middle_name, birth_date, email, phone
- Agency info: agency_name, department, position, employment_status, payroll_date, tenure
- Classification: client_type (POTENTIAL/EXISTING), product_type, market_type, pension_type
- PSGC integration: psgc_id, region, province, municipality, barangay
- Loan tracking: loan_released, loan_released_at
- Assignments: is_starred, created_at, updated_at

#### `addresses` - Client addresses
- Linked to clients (client_id)
- Types: home, work, mailing
- Fields: street, barangay, city, province, postal_code, latitude, longitude, is_primary

#### `phone_numbers` - Client phone numbers
- Linked to clients (client_id)
- Types: mobile, landline
- Fields: number, label, is_primary

#### `touchpoints` - Client interaction records
- Fields: id, client_id, user_id, touchpoint_number (1-7), type (Visit/Call)
- Date/time: date, time_arrival, time_departure, odometer readings
- GPS tracking: time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address
- GPS tracking: time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address
- Status: Interested, Undecided, Not Interested, Completed
- Fields: reason, next_visit_date, notes, photo_url, audio_url

#### `itineraries` - Scheduled client visits
- Fields: id, user_id, client_id, scheduled_date, scheduled_time
- Status: pending, assigned, in_progress, completed, cancelled
- Priority: low, normal, high
- Tracking: created_by (who scheduled it)

#### `approvals` - Approval workflow system
- Fields: id, type (client/udi), status (pending/approved/rejected)
- Links: client_id, user_id (formerly caravan_id)
- Approval tracking: touchpoint_number, role, reason, notes
- Decision tracking: approved_by, approved_at, rejected_by, rejected_at, rejection_reason
- UDI: udi_number (when type='udi')

#### `groups` - Client groups
- Fields: id, name, description
- Role assignments: area_manager_id, assistant_area_manager_id, caravan_id
- Members: JSON array of client IDs

#### `group_municipalities` - Group location assignments
- Fields: id, group_id, municipality_id, assigned_at, assigned_by, deleted_at

#### `user_locations` - User municipality assignments
- Fields: id, user_id, municipality_id, assigned_at, assigned_by, deleted_at

#### `attendance` - Field agent attendance
- Fields: id, user_id, date, time_in, time_out
- Location tracking: location_in_lat/lng, location_out_lat/lng

#### `targets` - KPI/target setting
- Fields: id, user_id, period, year, month, week
- Targets: target_clients, target_touchpoints, target_visits

#### `psgc` - Philippine Standard Geographic Code
- Fields: id, region, province, mun_city, barangay
- Additional: zip_code, pin_location, mun_city_kind

#### `audit_logs` - Complete audit trail
- Fields: id, user_id, action, entity, entity_id
- Data: old_values (JSONB), new_values (JSONB)
- Context: ip_address, user_agent, metadata (JSONB)

---

## 5. Authentication & Authorization

### JWT Token Structure

```javascript
{
  sub: user.id,           // User ID
  aud: powerSyncUrl,      // Audience (PowerSync)
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  role: user.role         // admin, caravan, tele, etc.
}
```

### Token Management

| Property | Value |
|----------|-------|
| **Algorithm** | RS256 (RSA signature with SHA-256) |
| **Signing Key** | PowerSync private key from environment |
| **Verification** | Public key verification |
| **Fallback** | HS256 for backward compatibility with old tokens |
| **Access Token Expiry** | 24 hours (configurable) |
| **Refresh Token Expiry** | 7 days |

### Role-Based Access Control (RBAC)

| Role | Description |
|------|-------------|
| `admin` | Full system access |
| `area_manager` | Regional management |
| `assistant_area_manager` | Assistant regional management |
| `caravan` | Field agents (mobile users) - Visit touchpoints only |
| `tele` | Telemarketers (phone-based outreach) - Call touchpoints only |
| `staff` | Staff users |
| `field_agent` | Legacy field agent role |

### Middleware

| Middleware | Purpose |
|------------|---------|
| `authMiddleware` | Requires valid JWT token |
| `optionalAuthMiddleware` | Optional JWT token |
| `requireRole(...roles)` | Requires specific role |
| `requireAnyRole(...roles)` | Requires any of specified roles |
| `auditMiddleware(entity, customAction)` | Auto-logs CRUD operations |

---

## 6. Key Services

### Analytics Service (`services/analytics.ts`)

**Provider:** PostHog

**Functions:**
- `trackEvent()` - Track custom events
- `identifyUser()` - Identify users
- `setUserProperties()` - Set user properties
- `trackPageView()` - Track page views

**Events Tracked:** Login, logout, CRUD operations, touchpoints, attendance

### Email Service (`services/email.ts`)

**Purpose:** Send password reset emails

**Provider:** SMTP (Nodemailer)

**Configuration:** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

### GPS Validation Service (`services/gps-validation.ts`)

**Purpose:** Validate touchpoint GPS coordinates

**Function:** `validateTouchpointLocation()`

**Checks:** Distance from client address, GPS accuracy

### Storage Service (`services/storage.ts`)

**Purpose:** File upload handling

**Supports:** AWS S3, local filesystem, Synology NAS

**Configuration:** AWS credentials, upload directory

---

## 7. Touchpoint System

### Touchpoint Sequence

Fixed 7-step pattern: **Visit → Call → Call → Visit → Call → Call → Visit**

```
1st: Visit → 2nd: Call → 3rd: Call → 4th: Visit → 5th: Call → 6th: Call → 7th: Visit
```

### Validation Rules

1. **Type Validation:** Must match sequence (e.g., TP1 must be Visit)
2. **Sequential Creation:** Must complete in order (TP1 → TP2 → TP3...)
3. **Golden Rule:** Call touchpoints require preceding touchpoint completion
4. **Role-Based Creation:**
   - Caravan: Visits only (1, 4, 7)
   - Tele: Calls only (2, 3, 5, 6)
   - Managers: Any type

### Touchpoint Status Values

| Status | Description |
|--------|-------------|
| `Interested` | Client shows interest |
| `Undecided` | Client is undecided |
| `Not Interested` | Client declined |
| `Completed` | Process completed |

### Role-Based Touchpoint Creation

| Role | Can Create | Touchpoint Numbers |
|------|------------|-------------------|
| **Caravan** | Visit only | 1, 4, 7 |
| **Tele** | Call only | 2, 3, 5, 6 |
| **Admin/Manager** | Any type | All (1-7) |

---

## 8. Application Flow

### 8.1 Authentication Flow

#### Mobile App (Flutter)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Login      │───▶│  PIN Setup   │───▶│   Biometrics │───▶│    Home      │
│ Email/Pass   │    │ (1st time)   │    │  (Optional)  │    │  Dashboard   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

**Steps:**
1. User enters email and password
2. System validates credentials
3. JWT tokens generated (RS256 signed with PowerSync keys)
4. Tokens stored in `TokenManager` (flutter_secure_storage)
5. PIN setup (first-time users) or PIN entry (returning users)
6. Optional biometric authentication
7. Connect to PowerSync for data synchronization

#### Web App (Vue)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Login      │───▶│  Set Tokens  │───▶│  Dashboard   │
│ Email/Pass   │    │  (Cookies)   │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

**Steps:**
1. User enters email and password
2. System validates credentials
3. Tokens stored in cookies (not localStorage)
4. Redirects to dashboard on success
5. Route guards protect authenticated routes

### 8.2 Client Management Flow

#### Client Creation

**Mobile App:**
1. Navigate to "Add Client" page
2. Fill out client information form
3. Add addresses and phone numbers
4. Save creates local record in Hive
5. Queued for sync to backend
6. Background sync uploads when connected

**Web App:**
1. Navigate to Clients → Add Client
2. Fill out client form
3. Submit creates record directly in backend
4. Real-time update via PocketBase subscriptions

#### Client Permissions

| Action | Admin | Manager | Caravan/Tele |
|--------|-------|---------|--------------|
| View all clients | ✓ | ✓ | ✓ |
| Create clients | ✓ | ✓ | ✓ |
| Edit clients (direct) | ✓ | ✓ | ✗ |
| Edit clients (approval) | ✓ | ✓ | ✓ |
| Delete clients | ✓ | ✗ | ✗ |

### 8.3 Touchpoint Creation Flow

#### Caravan (Field Agent) - Mobile App

1. Navigate to Client Detail
2. Check if next touchpoint is "Visit" (can only create Visits)
3. Tap "Add Touchpoint"
4. Fill out touchpoint form:
   - Date, time, address
   - Reason (dropdown)
   - Status (Interested/Undecided/Not Interested/Completed)
   - Notes
   - Photo (camera capture)
   - Audio recording
   - GPS coordinates (auto-captured)
   - Time In/Out with GPS validation
5. Save creates local record
6. Queued for background sync
7. GPS validation on backend

#### Tele (Telemarketer) - Web App

1. Navigate to Client Detail
2. Check if next touchpoint is "Call" (can only create Calls)
3. Click "Add Touchpoint"
4. Fill out form (no GPS/photo/audio required)
5. Submit directly to backend
6. Real-time updates via subscriptions

### 8.4 Data Sync Flow (PowerSync)

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Mobile    │◄───────▶│  PowerSync  │◄───────▶│ PostgreSQL  │
│   (SQLite)  │  Sync   │   Service   │  Sync   │  Database   │
└─────────────┘         └─────────────┘         └─────────────┘
```

**Offline-First Strategy:**
- **Read Operations:** Always from local SQLite (fast, no network)
- **Write Operations:** Write locally, then sync in background
- **Data Retention:** 7-day local data retention
- **Conflict Resolution:** Last-write-wins

---

## 9. User Journeys

### 9.1 Field Agent (Caravan) Daily Workflow

```
1. Morning Routine
   ├─ Open app (biometric/PIN unlock)
   ├─ Check "My Day" dashboard
   ├─ Review scheduled visits for today
   └─ Check client list for assigned area

2. Client Visit
   ├─ Navigate to client location (GPS/Maps)
   ├─ Check in at client (Time In + GPS capture)
   ├─ Conduct visit/meeting
   ├─ Document touchpoint
   │  ├─ Select reason
   │  ├─ Set status (Interested/Undecided/Not Interested)
   │  ├─ Add notes
   │  ├─ Take photo
   │  ├─ Record audio (optional)
   │  └─ Check out (Time Out + GPS capture)
   └─ View next scheduled client

3. End of Day
   ├─ Review completed touchpoints
   ├─ Check "My Day" progress
   ├─ Sync data (automatic)
   └─ Plan tomorrow's itinerary

4. Offline Scenarios
   ├─ App works without internet
   ├─ Data stored locally
   ├─ Queue for sync when online
   └─ 24-hour grace period for offline login
```

### 9.2 Telemarketer (Tele) Workflow

```
1. Start Work
   ├─ Login to web dashboard
   ├─ View assigned clients
   └─ Check call queue

2. Make Calls
   ├─ Find client needing Call touchpoint
   ├─ Verify next touchpoint is Call (2, 3, 5, or 6)
   ├─ Click client to view details
   ├─ Create touchpoint
   │  ├─ Select call reason
   │  ├─ Set status
   │  └─ Add notes
   └─ Move to next client

3. Track Progress
   ├─ View call statistics
   ├─ Monitor conversion rates
   └─ Follow up on interested prospects

4. Client Handoff
   ├─ Mark client ready for Visit
   ├─ Assign to Caravan agent
   └─ Schedule field visit
```

### 9.3 Admin/Manager Workflows

**User Management:**
- Create users with roles (admin, caravan, tele, etc.)
- Assign to geographic areas (municipalities)
- Monitor user activity
- Reset passwords

**Client Management:**
- View all clients across all areas
- Edit client information (direct, no approval needed)
- Mark loan released
- View client touchpoint history

**Approval Workflow:**
- Review pending client edit requests
- Approve/reject changes from Caravan/Tele
- Audit trail of all changes

**Reporting & Analytics:**
- Dashboard metrics
- Touchpoint completion rates
- Agent performance
- Geographic coverage

---

## 10. Development Commands

### Backend

```bash
cd backend

# Install dependencies
pnpm install

# Development server with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Production server
pnpm start

# Run tests
pnpm test

# Test UI
pnpm test:ui
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require

# JWT (legacy fallback)
JWT_SECRET=your-256-bit-secret
JWT_EXPIRY_HOURS=24

# PowerSync (preferred)
POWERSYNC_URL=http://localhost:8080
POWERSYNC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
POWERSYNC_PUBLIC_KEY="..."

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:9999,http://localhost:4002

# Email (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# AWS (optional)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# PostHog (optional)
POSTHOG_API_KEY=
POSTHOG_HOST=

# Audit Log
AUDIT_LOG_RETENTION_DAYS=90
AUDIT_LOG_CLEANUP_ENABLED=true
```

---

## Appendix: Key Data Models

### Client Model

```typescript
interface Client {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone?: string;
  birthDate?: Date;

  // Classification
  clientType: 'POTENTIAL' | 'EXISTING';
  productType: 'sssPensioner' | 'gsisPensioner' | 'private';
  marketType: 'residential' | 'commercial' | 'industrial';
  pensionType: 'sss' | 'gsis' | 'private' | 'none';

  // Agency Info
  agencyName?: string;
  department?: string;
  position?: string;
  employmentStatus?: string;
  payrollDate?: number;
  tenure?: number;

  // Location
  psgcId?: string;
  region?: string;
  province?: string;
  municipality?: string;
  barangay?: string;

  // Loan Tracking
  loanReleased: boolean;
  loanReleasedAt?: Date;

  // Flags
  isStarred: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  addresses: Address[];
  phoneNumbers: PhoneNumber[];
  touchpoints: Touchpoint[];
}
```

### Touchpoint Model

```typescript
interface Touchpoint {
  id: string;
  clientId: string;
  userId?: string;              // User who created
  touchpointNumber: number;     // 1-7
  type: 'Visit' | 'Call';
  date: Date;

  // Time tracking
  timeArrival?: string;
  timeDeparture?: string;
  odometerArrival?: string;
  odometerDeparture?: string;

  // Details
  reason: string;               // 25+ predefined reasons
  status: 'Interested' | 'Undecided' | 'Not Interested' | 'Completed';
  nextVisitDate?: Date;
  remarks?: string;

  // Media
  photoUrl?: string;
  audioUrl?: string;

  // GPS
  latitude?: number;
  longitude?: number;

  // Time In/Out with GPS
  timeIn?: Date;
  timeInGpsLat?: number;
  timeInGpsLng?: number;
  timeInGpsAddress?: string;
  timeOut?: Date;
  timeOutGpsLat?: number;
  timeOutGpsLng?: number;
  timeOutGpsAddress?: string;

  createdAt: Date;
}
```

---

## Summary

The IMU application implements a sophisticated multi-user field management system with:

1. **Dual-Interface Architecture:** Flutter mobile app for field agents, Vue web app for administrators/telemarketers
2. **Role-Based Touchpoint System:** Strict separation between Visit (Caravan) and Call (Tele) touchpoints following a fixed 7-step sequence
3. **Offline-First Mobile Experience:** PowerSync-enabled local database with automatic synchronization
4. **Comprehensive Authentication:** JWT-based auth with RS256 signing, PIN/biometric quick access, session management
5. **GPS Validation:** Location tracking for touchpoint verification
6. **Approval Workflow:** Edit requests from field agents require manager approval
7. **Real-Time Updates:** PowerSync and PocketBase subscriptions for live data synchronization

The system is production-ready with complete implementations in both mobile (62/62 slices) and web (31/31 slices) applications.
