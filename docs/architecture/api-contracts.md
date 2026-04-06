# API Contracts

> **IMU Backend API** - Complete API endpoint documentation

---

## Base URL

**Development:** `http://localhost:4000`
**Production:** `https://imu-api.cfbtools.app`

**All endpoints use:** `Content-Type: application/json`

---

## Authentication

### JWT Authentication (RS256)

**Login Endpoint:**
```
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 28800,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "caravan",
    "firstName": "Juan",
    "lastName": "Dela Cruz"
  }
}
```

**Token Format:**
- Algorithm: RS256
- Expiration: 8 hours (28800 seconds)
- Claims: `user_id`, `email`, `role`, `exp`

### Protected Endpoints

All endpoints (except `/auth/login`) require:

**Header:**
```
Authorization: Bearer <access_token>
```

**Middleware:**
1. Token validation (RS256 signature)
2. Expiration check
3. User lookup
4. Role-based authorization

---

## API Routes

### Authentication (`/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | User login | No |
| POST | `/auth/refresh` | Refresh access token | Yes |
| POST | `/auth/logout` | User logout | Yes |
| POST | `/auth/verify-token` | Verify PowerSync token | Yes |
| POST | `/auth/powersync-token` | Get PowerSync JWT | Yes |
| GET | `/auth/permissions` | Get current user permissions | Yes |

#### Get User Permissions
```
GET /auth/permissions
```

**Response:**
```json
{
  "permissions": [
    {
      "resource": "clients",
      "action": "create",
      "constraint_name": null,
      "role_slug": "caravan"
    },
    {
      "resource": "touchpoints",
      "action": "create",
      "constraint_name": "visit",
      "role_slug": "caravan"
    }
  ]
}
```

**Permission Format:** `resource.action[:constraint]`
- Example: `clients.create`, `touchpoints.create:visit`
- Constraints: `own` (own resources only), `area` (assigned area), `all` (no restriction)

#### PowerSync Token
```
POST /auth/powersync-token
```

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "user_id": "uuid",
  "expires_at": "2026-04-03T10:00:00Z"
}
```

---

### Users (`/users`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/users` | List all users | Admin, Manager |
| GET | `/users/:id` | Get user by ID | Admin, Manager |
| POST | `/users` | Create new user | Admin, Manager |
| PUT | `/users/:id` | Update user | Admin, Manager |
| DELETE | `/users/:id` | Delete user | Admin |
| GET | `/users/me` | Get current user | Yes |
| GET | `/users/:id/locations` | Get user's assigned municipalities | Yes |

#### Get User Locations (Area-Based Filtering)
```
GET /users/:id/locations
```

**Response:**
```json
{
  "locations": [
    {
      "user_id": "uuid",
      "municipality_id": "uuid",
      "municipality_name": "Manila",
      "assigned_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**Mobile Usage:**
- Fetches assigned municipalities on login
- Caches for 6 hours
- Filters clients by assigned areas
- Used for territory-based data display

#### Get Users (Paginated)
```
GET /users?page=1&limit=50&role=caravan
```

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "Juan",
      "lastName": "Dela Cruz",
      "role": "caravan",
      "agencyId": "uuid",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

---

### Clients (`/clients`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/clients` | List clients (paginated) | Yes |
| GET | `/clients/:id` | Get client by ID | Yes |
| POST | `/clients` | Create new client | Admin, Manager |
| PUT | `/clients/:id` | Update client | Admin, Manager |
| DELETE | `/clients/:id` | Delete client | Admin |
| GET | `/clients/search` | Search clients | Yes |
| POST | `/clients/import` | Import clients from CSV | Admin, Manager |

#### Get Clients (Paginated)
```
GET /clients?page=1&limit=50&search=Juan&status=interested
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)
- `search`: Search term (name, address)
- `status`: Filter by status (interested, undecided, not_interested, completed)
- `agencyId`: Filter by agency
- `assignedTo`: Filter by assigned user

**Response:**
```json
{
  "clients": [
    {
      "id": "uuid",
      "firstName": "Juan",
      "lastName": "Dela Cruz",
      "middleName": "Santos",
      "clientType": "EXISTING",
      "productType": "TRADITIONAL",
      "marketType": "METRO_MANILA",
      "pensionType": "SSS",
      "status": "interested",
      "addresses": [
        {
          "id": "uuid",
          "street": "123 Main St",
          "barangay": "Barangay 123",
          "cityMunicipality": "Manila",
          "province": "Metro Manila",
          "region": "NCR",
          "postalCode": "1000"
        }
      ],
      "phoneNumbers": [
        {
          "id": "uuid",
          "type": "mobile",
          "number": "09171234567",
          "isPrimary": true
        }
      ],
      "assignedTo": "uuid",
      "agencyId": "uuid",
      "touchpointCount": 3,
      "lastTouchpointDate": "2026-04-01T10:00:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 500,
    "pages": 10
  }
}
```

---

### Touchpoints (`/touchpoints`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/touchpoints` | List touchpoints | Yes |
| GET | `/touchpoints/:id` | Get touchpoint by ID | Yes |
| POST | `/touchpoints` | Create touchpoint | Caravan, Tele, Admin |
| PUT | `/touchpoints/:id` | Update touchpoint | Admin, Owner |
| DELETE | `/touchpoints/:id` | Delete touchpoint | Admin |
| GET | `/touchpoints/client/:clientId` | Get client touchpoints | Yes |
| GET | `/touchpoints/analytics` | Get touchpoint analytics | Admin, Manager |

#### Create Touchpoint
```
POST /touchpoints
```

**Request (Caravan - Visit):**
```json
{
  "clientId": "uuid",
  "touchpointNumber": 1,
  "type": "visit",
  "reason": "initial_visit",
  "status": "interested",
  "date": "2026-04-02T10:00:00Z",
  "photoPath": "/uploads/touchpoints/uuid.jpg",
  "audioPath": "/uploads/touchpoints/uuid.m4a",
  "locationData": {
    "latitude": 14.5995,
    "longitude": 120.9842,
    "accuracy": 10.5
  },
  "timeIn": "2026-04-02T10:00:00Z",
  "timeInGpsLat": 14.5995,
  "timeInGpsLng": 120.9842,
  "timeInGpsAddress": "123 Main St, Manila",
  "timeOut": "2026-04-02T11:00:00Z",
  "timeOutGpsLat": 14.5995,
  "timeOutGpsLng": 120.9842,
  "timeOutGpsAddress": "123 Main St, Manila"
}
```

**Request (Tele - Call):**
```json
{
  "clientId": "uuid",
  "touchpointNumber": 2,
  "type": "call",
  "reason": "follow_up_call",
  "status": "interested",
  "date": "2026-04-02T14:00:00Z",
  "callDuration": 300,
  "callOutcome": "reached"
}
```

**Touchpoint Number Validation:**
- **Caravan Role:** Can only create visit touchpoints (numbers: 1, 4, 7)
- **Tele Role:** Can only create call touchpoints (numbers: 2, 3, 5, 6)
- **Admin/Manager:** Can create any touchpoint

**Response:**
```json
{
  "id": "uuid",
  "clientId": "uuid",
  "userId": "uuid",
  "touchpointNumber": 1,
  "type": "visit",
  "reason": "initial_visit",
  "status": "interested",
  "date": "2026-04-02T10:00:00Z",
  "photoPath": "/uploads/touchpoints/uuid.jpg",
  "audioPath": "/uploads/touchpoints/uuid.m4a",
  "locationData": {
    "latitude": 14.5995,
    "longitude": 120.9842,
    "accuracy": 10.5
  },
  "createdAt": "2026-04-02T10:00:00Z"
}
```

---

### Itineraries (`/itineraries`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/itineraries` | List itineraries | Yes |
| GET | `/itineraries/:id` | Get itinerary by ID | Yes |
| GET | `/itineraries/user/:userId` | Get user itinerary | Yes |
| GET | `/itineraries/user/:userId/date/:date` | Get daily itinerary | Yes |
| POST | `/itineraries` | Create itinerary | Admin, Manager |
| PUT | `/itineraries/:id` | Update itinerary | Admin, Manager |
| DELETE | `/itineraries/:id` | Delete itinerary | Admin |

#### Get Daily Itinerary
```
GET /itineraries/user/:userId/date/:date
```

**Response:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "date": "2026-04-02",
  "clients": [
    {
      "clientId": "uuid",
      "clientName": "Juan Dela Cruz",
      "sequence": 1,
      "status": "pending",
      "address": "123 Main St, Manila",
      "latitude": 14.5995,
      "longitude": 120.9842
    }
  ],
  "totalClients": 10,
  "completedClients": 5,
  "createdAt": "2026-04-01T00:00:00Z"
}
```

---

### My Day (`/api/my-day`)

Field agent daily task and visit management endpoints.

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| POST | `/api/my-day/add-client` | Add client to today's itinerary | Caravan, Tele |
| DELETE | `/api/my-day/remove-client/:id` | Remove client from today's itinerary | Caravan, Tele |
| GET | `/api/my-day/status/:clientId` | Check if client is in today's itinerary | Yes |
| GET | `/api/my-day/tasks` | Get today's tasks and touchpoints | Yes |
| POST | `/api/my-day/tasks/:id/start` | Start a task | Caravan, Tele |
| POST | `/api/my-day/tasks/:id/complete` | Complete a task | Caravan, Tele |
| POST | `/api/my-day/clients/:id/time-in` | Record time-in for client visit | Caravan |
| POST | `/api/my-day/clients/:id/time-out` | Record time-out for client visit | Caravan |
| POST | `/api/my-day/visits` | Submit complete visit form | Caravan, Tele |
| GET | `/api/my-day/stats` | Get performance statistics | Yes |

#### Add Client to My Day
```http
POST /api/my-day/add-client
Authorization: Bearer <token>
```

**Request:**
```json
{
  "client_id": "uuid",
  "scheduled_time": "09:00",
  "priority": 5,
  "notes": "First visit"
}
```

**Response:**
```json
{
  "message": "Client added to My Day",
  "itinerary": {
    "id": "uuid",
    "client_id": "uuid",
    "scheduled_date": "2026-04-02",
    "status": "pending"
  }
}
```

#### Record Time-In
```http
POST /api/my-day/clients/:id/time-in
Authorization: Bearer <token>
```

**Request:**
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842
}
```

**Response:**
```json
{
  "message": "Time-in recorded",
  "time_in": "09:15:30",
  "touchpoint": {
    "id": "uuid",
    "client_id": "uuid",
    "time_arrival": "09:15:30",
    "latitude": 14.5995,
    "longitude": 120.9842
  }
}
```

#### Record Time-Out ⭐ NEW
```http
POST /api/my-day/clients/:id/time-out
Authorization: Bearer <token>
```

**Request:**
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "123 Main St, Manila"
}
```

**Response:**
```json
{
  "message": "Time-out recorded",
  "time_out": "10:30:45",
  "touchpoint": {
    "id": "uuid",
    "time_departure": "10:30:45",
    "time_out_gps_lat": 14.5995,
    "time_out_gps_lng": 120.9842,
    "time_out_gps_address": "123 Main St, Manila"
  }
}
```

**GPS Tracking Fields:**
- `time_out` - Timestamp when visit ended
- `time_out_gps_lat` - Latitude of time-out location
- `time_out_gps_lng` - Longitude of time-out location
- `time_out_gps_address` - Reverse geocoded address (optional)

**Notes:**
- Updates existing touchpoint for today's date
- If no touchpoint exists, returns 404 (record time-in first)
- Requires caravan role (field agents only)

#### Get Today's Tasks
```http
GET /api/my-day/tasks
Authorization: Bearer <token>
```

**Query Parameters:**
- `user_id` (optional) - Admin can specify caravan ID

**Response:**
```json
{
  "date": "2026-04-02",
  "summary": {
    "total": 10,
    "completed": 5,
    "pending": 3,
    "in_progress": 2,
    "completion_rate": 50
  },
  "tasks": [...],
  "completed_touchpoints": [...]
}
```

---

### Agencies (`/agencies`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/agencies` | List all agencies | Yes |
| GET | `/agencies/:id` | Get agency by ID | Yes |
| POST | `/agencies` | Create agency | Admin |
| PUT | `/agencies/:id` | Update agency | Admin |
| DELETE | `/agencies/:id` | Delete agency | Admin |

---

### Dashboard (`/dashboard`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/dashboard/target-progress` | Get target progress for current user | Yes |
| GET | `/dashboard/team-performance` | Get team performance metrics | Admin, Manager |
| GET | `/dashboard/action-items` | Get action items (overdue visits, follow-ups) | Yes |

#### Target Progress
```
GET /dashboard/target-progress?period=weekly
```

**Query Parameters:**
- `period` (optional): `daily` | `weekly` | `monthly` | `quarterly` (default: user's default period)

**Response:**
```json
{
  "success": true,
  "data": {
    "target": {
      "id": "uuid",
      "userId": "uuid",
      "period": "weekly",
      "targetClients": 50,
      "targetTouchpoints": 100,
      "targetConversions": 10
    },
    "progress": {
      "clientsCount": 35,
      "touchpointsCount": 72,
      "conversionsCount": 7,
      "clientsPercentage": 70,
      "touchpointsPercentage": 72,
      "conversionsPercentage": 70
    },
    "period": {
      "start": "2026-04-01T00:00:00Z",
      "end": "2026-04-07T23:59:59Z",
      "current": true
    }
  }
}
```

#### Team Performance
```
GET /dashboard/team-performance?period=weekly
```

**Query Parameters:**
- `period` (optional): `daily` | `weekly` | `monthly` | `quarterly` (default: `weekly`)
- `limit` (optional): Number of records (default: 10)
- `role` (optional): Filter by role (admin, area_manager, assistant_area_manager, caravan, tele)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "firstName": "Juan",
      "lastName": "Dela Cruz",
      "role": "caravan",
      "target": {
        "targetClients": 50,
        "targetTouchpoints": 100,
        "targetConversions": 10
      },
      "progress": {
        "clientsCount": 35,
        "touchpointsCount": 72,
        "conversionsCount": 7,
        "clientsPercentage": 70,
        "touchpointsPercentage": 72,
        "conversionsPercentage": 70
      }
    }
  ]
}
```

#### Action Items
```
GET /dashboard/action-items?limit=20
```

**Query Parameters:**
- `limit` (optional): Number of items (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "overdue_visit",
      "clientId": "uuid",
      "clientName": "Juan Dela Cruz",
      "itineraryId": "uuid",
      "scheduledDate": "2026-04-05",
      "daysOverdue": 2,
      "priority": "high"
    },
    {
      "type": "follow_up",
      "clientId": "uuid",
      "clientName": "Maria Santos",
      "touchpointId": "uuid",
      "lastTouchpointDate": "2026-04-01",
      "daysSinceLastTouchpoint": 5,
      "nextTouchpointType": "Call",
      "priority": "medium"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0
  }
}
```

---

### Feature Flags (`/feature-flags`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/feature-flags` | List all feature flags | Yes |
| GET | `/feature-flags/check/:name` | Check if feature is enabled for user | Yes |
| POST | `/feature-flags` | Create feature flag | Admin |
| PUT | `/feature-flags/:name` | Update feature flag | Admin |
| DELETE | `/feature-flags/:name` | Delete feature flag | Admin |

#### Check Feature Flag
```
GET /feature-flags/check/new_dashboard
```

**Response:**
```json
{
  "success": true,
  "enabled": true,
  "feature": {
    "name": "new_dashboard",
    "description": "Redesigned dashboard with improved metrics",
    "enabled": true,
    "rolloutPercentage": 100
  }
}
```

#### Create Feature Flag
```
POST /feature-flags
Content-Type: application/json
```

**Request:**
```json
{
  "name": "new_dashboard",
  "description": "Redesigned dashboard with improved metrics",
  "enabled": true,
  "environments": ["production", "staging"],
  "roles": ["admin", "area_manager"],
  "rolloutPercentage": 50,
  "userIds": ["uuid-1", "uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "new_dashboard",
    "description": "Redesigned dashboard with improved metrics",
    "enabled": true,
    "environments": ["production", "staging"],
    "roles": ["admin", "area_manager"],
    "rolloutPercentage": 50,
    "userIds": ["uuid-1", "uuid-2"],
    "createdAt": "2026-04-07T00:00:00Z"
  }
}
```

---

### Upload (`/upload`)

| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| POST | `/upload/image` | Upload image | Yes |
| POST | `/upload/audio` | Upload audio | Yes |
| POST | `/upload/document` | Upload document | Yes |

#### Upload Image
```
POST /upload/image
Content-Type: multipart/form-data
```

**Request:**
```
file: <binary data>
type: touchpoint_photo
clientId: uuid
```

**Response:**
```json
{
  "url": "https://cdn.example.com/uploads/uuid.jpg",
  "filename": "uuid.jpg",
  "size": 102400,
  "mimeType": "image/jpeg"
}
```

---

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

**Default Limits:**
- 100 requests per minute per IP
- 1000 requests per hour per user

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1648900000
```

---

## Pagination

Standard pagination for list endpoints:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 500,
    "pages": 10
  }
}
```

---

## Webhooks

### PowerSync Webhook

**Endpoint:** `/webhooks/powersync`
**Method:** POST
**Authentication:** Signature verification

**Payload:**
```json
{
  "event": "sync_completed",
  "user_id": "uuid",
  "timestamp": "2026-04-02T10:00:00Z"
}
```

---

## SDK Examples

### JavaScript/TypeScript
```typescript
import { Hono } from 'hono'

const app = new Hono()

// Login
const login = async (email: string, password: string) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  return response.json()
}

// Get clients
const getClients = async (token: string, page: number) => {
  const response = await fetch(
    `${API_URL}/clients?page=${page}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  return response.json()
}
```

### Flutter (Dart)
```dart
import 'package:dio/dio.dart';

class ApiService {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: 'https://imu-api.cfbtools.app',
  ));

  Future<String> login(String email, String password) async {
    final response = await _dio.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    return response.data['access_token'];
  }

  Future<List<Client>> getClients(String token, int page) async {
    final response = await _dio.get(
      '/clients',
      queryParameters: {'page': page},
      options: Options(
        headers: {'Authorization': 'Bearer $token'},
      ),
    );
    return (response.data['clients'] as List)
        .map((e) => Client.fromJson(e))
        .toList();
  }
}
```

---

**Last Updated:** 2026-04-02
**API Version:** 1.0.0
