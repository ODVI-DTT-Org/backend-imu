# Data Flows

> **IMU Data Flow Diagrams** - How data moves through the system

---

## Authentication Data Flow

### Login Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant API as Backend API
    participant DB as PostgreSQL

    FA->>MA: Enter email/password
    MA->>API: POST /auth/login
    API->>DB: Query user by email
    DB-->>API: User record
    API->>API: Verify password (bcrypt)
    API->>API: Generate JWT (RS256)
    API-->>MA: { access_token, user }
    MA->>MA: Store token securely
    MA-->>FA: Show PIN entry
```

### PIN Entry Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant LS as Local Storage

    FA->>MA: Enter 6-digit PIN
    MA->>LS: Verify stored PIN
    LS-->>MA: PIN valid
    MA->>MA: Load user session
    MA-->>FA: Show dashboard
```

---

## Permission Data Flow

### Permission Fetching Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant API as Backend API
    participant DB as PostgreSQL
    participant LS as Local Storage

    FA->>MA: Login with credentials
    MA->>API: POST /auth/login
    API->>DB: Query user and permissions
    DB-->>API: User record + permissions
    API-->>MA: { access_token, user, permissions_cookie }
    MA->>LS: Cache permissions locally
    MA->>MA: Store access token
    MA-->>FA: Show dashboard

    Note over MA,LS: Permissions cached for 1 hour
```

### Permission Check Flow

```mermaid
sequenceDiagram
    actor UI as UI Component
    participant MA as Mobile App
    participant LS as Local Storage
    participant API as Backend API

    UI->>MA: Request permission check
    MA->>LS: Check cached permissions
    LS-->>MA: Cached permissions
    MA->>MA: Validate permission locally

    alt Cache Valid
        MA-->>UI: Permission granted/denied
    else Cache Expired
        MA->>API: GET /auth/permissions
        API-->>MA: { permissions }
        MA->>LS: Update cache
        MA-->>UI: Permission granted/denied
    end
```

---

## Area Filter Data Flow

### User Locations Fetching Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant API as Backend API
    participant DB as PostgreSQL
    participant LS as Local Storage

    FA->>MA: Login successful
    MA->>API: GET /users/:id/locations
    API->>DB: Query user_locations table
    DB-->>API: Assigned municipalities
    API-->>MA: { locations }
    MA->>LS: Cache locations locally
    MA->>MA: Filter clients by municipality

    Note over MA,LS: Locations cached for 6 hours
```

### Area-Based Client Filtering

```mermaid
flowchart LR
    A[User Login] --> B[Fetch Locations]
    B --> C{Locations Found?}
    C -->|Yes| D[Cache Municipality IDs]
    C -->|No| E[Show All Clients]

    D --> F[Fetch Client List]
    F --> G[Filter by Municipality]
    G --> H[Display Filtered Clients]

    E --> I[Fetch Client List]
    I --> J[Display All Clients]
```

---

## Client Data Flow

### Client Sync Flow

```mermaid
flowchart LR
    A[Admin] -->|Import CSV| B[Web Admin]
    B -->|POST /clients/import| C[Backend API]
    C -->|Validate| D[PostgreSQL]
    D -->|Store| E[Clients Table]
    E -->|PowerSync Webhook| F[PowerSync Service]
    F -->|Sync| G[PowerSync SDK]
    G -->|Local DB| H[Mobile App]
```

### Client Creation Flow

```mermaid
sequenceDiagram
    actor A as Admin
    participant W as Web Admin
    participant API as Backend API
    participant DB as PostgreSQL
    participant PS as PowerSync Service

    A->>W: Create client form
    W->>API: POST /clients
    API->>API: Validate with Zod
    API->>DB: INSERT INTO clients
    DB-->>API: Client record
    API->>PS: Notify data changed
    PS-->>API: Acknowledgment
    API-->>W: { client }
    W-->>A: Show created client
```

---

## Touchpoint Data Flow

### Touchpoint Creation (Mobile - Online)

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant PS as PowerSync SDK
    participant PSS as PowerSync Service
    participant API as Backend API
    participant DB as PostgreSQL

    FA->>MA: Create touchpoint
    MA->>MA: Validate touchpoint
    MA->>PS: INSERT touchpoint (local)
    PS->>PSS: Sync change
    PSS->>API: Webhook with data
    API->>API: Validate data
    API->>DB: INSERT INTO touchpoints
    DB-->>API: Touchpoint record
    API-->>PSS: Acknowledgment
    PSS-->>PS: Sync complete
    PS-->>MA: Update local status
    MA-->>FA: Show synced
```

### Touchpoint Creation (Mobile - Offline)

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant PS as PowerSync SDK
    participant LS as Local Storage

    FA->>MA: Create touchpoint
    MA->>MA: Validate touchpoint
    MA->>PS: INSERT touchpoint (local)
    PS->>LS: Queue for sync
    LS-->>MA: Pending status
    MA-->>FA: Show pending

    Note over MA,LS: When internet available

    LS->>PS: Trigger sync
    PS->>PS: Upload queued changes
    PS-->>MA: Synced status
```

### Touchpoint Creation (Web - Tele)

```mermaid
sequenceDiagram
    actor TA as Tele Agent
    participant WA as Web Admin
    participant API as Backend API
    participant DB as PostgreSQL

    TA->>WA: Create call touchpoint
    WA->>API: POST /touchpoints
    API->>API: Validate (Tele role)
    API->>DB: INSERT INTO touchpoints
    DB-->>API: Touchpoint record
    API-->>WA: { touchpoint }
    WA-->>TA: Show created touchpoint
```

---

## Data Synchronization Flow

### Bidirectional Sync Flow

```mermaid
flowchart TD
    A[Mobile App] -->|Local Changes| B[PowerSync Local DB]
    B -->|Upload| C[PowerSync Service]
    C -->|Validate| D[Backend API]
    D -->|Persist| E[PostgreSQL]
    E -->|Query| F[Other Users Changes]
    F -->|Download| C
    C -->|Sync| B
    B -->|Update| A
```

### Sync Conflict Resolution

```mermaid
flowchart TD
    A[Conflict Detected] --> B{Same Record Modified}
    B --> C[Compare Timestamps]
    C --> D{Which is Newer?}
    D -->|Local Newer| E[Keep Local Version]
    D -->|Remote Newer| F[Keep Remote Version]
    D -->|Same Timestamp| G[Keep Remote Version]
    E --> H[Upload to Server]
    F --> I[Update Local]
    G --> I
    H --> J[Conflict Resolved]
    I --> J
```

---

## GPS Data Flow

### Location Capture Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant GPS as Geolocator Service
    participant MA as Mapbox API

    FA->>MA: Start visit
    MA->>GPS: Get current location
    GPS->>GPS: Acquire GPS fix
    GPS-->>MA: { lat, lng, accuracy }
    MA->>MA: Validate accuracy
    MA->>MA: Reverse geocode
    MA->>MA: Store location data
    MA-->>FA: Show location captured
```

### Geocoding Flow

```mermaid
flowchart LR
    A[GPS Coordinates] -->|Geocoding Request| B[Geocoding Service]
    B -->|Reverse Geocode| C[Address]
    C -->|Store| D[Touchpoint Record]
```

---

## File Upload Flow

### Image Upload Flow

```mermaid
sequenceDiagram
    actor FA as Field Agent
    participant MA as Mobile App
    participant API as Backend API
    participant S3 as S3/NAS Storage

    FA->>MA: Take photo
    MA->>MA: Compress image
    MA->>API: POST /upload/image
    API->>API: Validate file
    API->>S3: Upload image
    S3-->>API: Image URL
    API-->>MA: { url, filename }
    MA->>MA: Attach URL to touchpoint
    MA-->>FA: Show photo uploaded
```

---

## Analytics Data Flow

### Dashboard Data Aggregation

```mermaid
flowchart LR
    A[Touchpoints Data] -->|Aggregate| B[Backend API]
    B -->|Query| C[PostgreSQL]
    C -->|Return Metrics| D[Analytics Service]
    D -->|Calculate KPIs| E[Dashboard Data]
    E -->|Serve| F[Web Admin Dashboard]
    E -->|Serve| G[Mobile Dashboard]
```

### KPI Calculation Flow

```mermaid
flowchart TD
    A[Raw Touchpoint Data] --> B[Group by User]
    B --> C[Count Touchpoints]
    C --> D[Calculate Conversion Rate]
    D --> E[Identify Top Performers]
    E --> F[Generate Trend Data]
    F --> G[Dashboard KPIs]
```

---

## Real-time Data Flow

### WebSocket Communication (Planned)

```mermaid
flowchart LR
    A[Backend API] -->|WebSocket| B[Web Admin]
    A -->|PowerSync| C[Mobile App]
    A -->|Broadcast| D[Data Updates]
```

### Push Notification Flow (Planned)

```mermaid
flowchart LR
    A[Backend API] -->|Trigger| B[Notification Service]
    B -->|Send| C[Firebase Cloud Messaging]
    C -->|Deliver| D[Mobile App]
```

---

## Data Validation Flow

### Request Validation Flow

```mermaid
flowchart TD
    A[Incoming Request] --> B{Has Body?}
    B -->|Yes| C[Parse JSON]
    B -->|No| D[Query Params Only]
    C --> E[Zod Validation]
    D --> E
    E --> F{Valid?}
    F -->|Yes| G[Process Request]
    F -->|No| H[Return 400 Error]
```

### Touchpoint Validation Flow

```mermaid
flowchart TD
    A[Create Touchpoint Request] --> B{User Role?}
    B -->|Caravan| C{Touchpoint Type?}
    B -->|Tele| D{Touchpoint Type?}
    B -->|Admin| E[Allow All]
    C -->|Visit| F{Number in 1,4,7?}
    C -->|Call| G[Reject]
    D -->|Call| H{Number in 2,3,5,6?}
    D -->|Visit| I[Reject]
    F -->|Yes| J[Allow]
    F -->|No| G
    H -->|Yes| J
    H -->|No| I
    E --> K[Validate Other Fields]
    J --> K
    G --> L[Return 403 Error]
    I --> L
    K --> M{All Valid?}
    M -->|Yes| N[Create Touchpoint]
    M -->|No| O[Return 400 Error]
```

---

## Data Export Flow

### Report Generation Flow

```mermaid
sequenceDiagram
    actor A as Admin
    participant W as Web Admin
    participant API as Backend API
    participant DB as PostgreSQL

    A->>W: Request report
    W->>API: GET /reports/clients
    API->>DB: Query clients
    DB-->>API: Client data
    API->>API: Generate CSV
    API-->>W: CSV file
    W-->>A: Download report
```

---

## Data Caching Flow

### Mobile Caching Strategy

```mermaid
flowchart TD
    A[Request Data] --> B{In Local Cache?}
    B -->|Yes| C[Return Cached Data]
    B -->|No| D[Fetch from API]
    D --> E[Store in Cache]
    E --> F[Return Data]
    C --> G{Cache Expired?}
    G -->|Yes| D
    G -->|No| H[Use Cached Data]
```

### Web Admin Caching

```mermaid
flowchart TD
    A[Request Data] --> B{In Pinia Store?}
    B -->|Yes| C{Data Fresh?}
    B -->|No| D[Fetch from API]
    C -->|Yes| E[Return Store Data]
    C -->|No| D
    D --> F[Update Store]
    F --> G[Return Data]
```

---

## Data Integrity Flow

### Transaction Management

```mermaid
flowchart TD
    A[Begin Transaction] --> B[Execute Operations]
    B --> C{All Operations Success?}
    C -->|Yes| D[Commit Transaction]
    C -->|No| E[Rollback Transaction]
    D --> F[Data Persisted]
    E --> G[Changes Discarded]
```

### Audit Logging Flow

```mermaid
flowchart LR
    A[Data Change] -->|Log| B[Audit Middleware]
    B -->|Insert| C[Audit Logs Table]
    C -->|Query| D[Audit Reports]
```

---

## Data Migration Flow

### Client Import Flow

```mermaid
flowchart TD
    A[Upload CSV] --> B[Parse CSV]
    B --> C[Validate Data]
    C --> D{Valid?}
    D -->|No| E[Show Errors]
    D -->|Yes| F[Create Clients]
    F --> G[Assign to Agency]
    G --> H[Assign to Users]
    H --> I[Generate Itineraries]
    I --> J[Import Complete]
```

---

## Data Backup Flow

### Database Backup Flow

```mermaid
flowchart LR
    A[PostgreSQL] -->|Daily Backup| B[Backup Service]
    B -->|Store| C[S3 / NAS]
    C -->|Retention Policy| D[7 Days]
    D -->|Restore| E[Disaster Recovery]
```

---

**Last Updated:** 2026-04-02
