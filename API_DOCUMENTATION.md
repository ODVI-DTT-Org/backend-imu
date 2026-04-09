# Addresses & Phone Numbers API Documentation

## Base URL
```
/api/clients/:id
```

---

## Rate Limiting

All API endpoints are protected by rate limiting to prevent abuse and ensure fair usage.

### Rate Limit Headers
Every response includes rate limit information in the headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45
```

### Rate Limits
- **Standard endpoints**: 100 requests per minute per user
- Rate limit is tracked by: IP address + User ID (if authenticated)
- When exceeded: Returns `429 Too Many Requests` with `Retry-After` header

### Rate Limit Error Response
```json
{
  "message": "Too many requests, please try again later.",
  "retryAfter": 45
}
```

---

## Caching

GET endpoints for addresses and phone numbers use Redis caching to improve performance.

### Cache Behavior
- **Cache Duration**: 5 minutes (300 seconds) for list endpoints
- **Cache Key**: Based on client ID, page, and limit parameters
- **Invalidation**: Automatic on POST/PUT/DELETE operations
- **Fallback**: If Redis is unavailable, requests fall back to database

### Cache Headers
Responses may include cache status information (visible in development mode):
- Hit: Data served from cache (faster response)
- Miss: Data fetched from database and cached

### Admin Cache Statistics
Admin users can access cache statistics:
- **GET /api/cache/stats** - Detailed cache metrics (admin only)
- **GET /api/cache/stats/summary** - Simplified cache overview (admin only)
- **DELETE /api/cache** - Flush all cache (admin only, use with caution)

---

## Addresses Endpoints

### GET /api/clients/:id/addresses
List all addresses for a specific client with pagination.

**Parameters:**
- `id` (path) - Client ID (UUID)
- `page` (query, optional) - Page number (default: 1, min: 1)
- `limit` (query, optional) - Items per page (default: 50, min: 1, max: 100)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "psgc_id": 123,
      "label": "Home",
      "street_address": "123 Main St",
      "postal_code": "1234",
      "latitude": 14.5995,
      "longitude": 120.9842,
      "is_primary": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "psgc": {
        "id": 123,
        "code": "013750000",
        "region": "National Capital Region (NCR)",
        "province": "Metro Manila",
        "municipality": "Quezon City",
        "barangay": "Barangay 123"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalCount": 100,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Error Responses:**
- `404` - Client not found or access denied
- `400` - Invalid pagination parameters

---

### POST /api/clients/:id/addresses
Create a new address for a client.

**Parameters:**
- `id` (path) - Client ID (UUID)

**Request Body:**
```json
{
  "psgc_id": 123,
  "label": "Home",
  "street_address": "123 Main St",
  "postal_code": "1234",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "is_primary": false
}
```

**Fields:**
- `psgc_id` (required, integer) - PSGC ID from PSGC table
- `label` (required, enum) - "Home", "Work", "Relative", or "Other"
- `street_address` (required, string, max 500) - Street address
- `postal_code` (optional, string, max 10) - Postal/ZIP code
- `latitude` (optional, number, -90 to 90) - GPS latitude
- `longitude` (optional, number, -180 to 180) - GPS longitude
- `is_primary` (optional, boolean) - Set as primary address (default: false)

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "client_id": "uuid",
    "psgc_id": 123,
    "label": "Home",
    "street_address": "123 Main St",
    "postal_code": "1234",
    "latitude": 14.5995,
    "longitude": 120.9842,
    "is_primary": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "psgc": { ... }
  }
}
```

**Behavior:**
- First address is automatically set as primary
- Only one address per label per client (unique constraint)
- PSGC ID must exist in PSGC table

**Error Responses:**
- `400` - Invalid PSGC ID or validation failure
- `404` - Client not found

---

### GET /api/clients/:id/addresses/:addressId
Get a single address by ID.

**Parameters:**
- `id` (path) - Client ID (UUID)
- `addressId` (path) - Address ID (UUID)

**Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Responses:**
- `404` - Address not found or access denied

---

### PUT /api/clients/:id/addresses/:addressId
Update an existing address.

**Parameters:**
- `id` (path) - Client ID (UUID)
- `addressId` (path) - Address ID (UUID)

**Request Body:**
```json
{
  "label": "Work",
  "street_address": "456 New St",
  "postal_code": "5678",
  "latitude": 14.6000,
  "longitude": 120.9900,
  "is_primary": true
}
```

**Allowed Fields:**
- `label` - Address label
- `street_address` - Street address
- `postal_code` - Postal code
- `latitude` - GPS latitude
- `longitude` - GPS longitude
- `is_primary` - Primary flag

**Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Behavior:**
- Only whitelisted fields can be updated
- Setting `is_primary` to true unsets all other addresses via trigger
- Cannot update `psgc_id`, `client_id`, or timestamps

**Error Responses:**
- `400` - Validation failure or no fields to update
- `404` - Address not found

---

### DELETE /api/clients/:id/addresses/:addressId
Soft delete an address (sets deleted_at timestamp).

**Parameters:**
- `id` (path) - Client ID (UUID)
- `addressId` (path) - Address ID (UUID)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

**Behavior:**
- Soft delete preserves data for recovery
- Address won't appear in API responses
- Can be restored by setting deleted_at to NULL

**Error Responses:**
- `404` - Address not found

---

### PATCH /api/clients/:id/addresses/:addressId/primary
Set an address as the primary address.

**Parameters:**
- `id` (path) - Client ID (UUID)
- `addressId` (path) - Address ID to set as primary

**Response (200 OK):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Behavior:**
- Database trigger automatically unsets is_primary on all other addresses
- Only one primary address per client

**Error Responses:**
- `404` - Client not found, access denied, or address not found

---

## Phone Numbers Endpoints

### GET /api/clients/:id/phone-numbers
List all phone numbers for a specific client with pagination.

**Parameters:**
- `id` (path) - Client ID (UUID)
- `page` (query, optional) - Page number (default: 1)
- `limit` (query, optional) - Items per page (default: 50, max: 100)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "label": "Mobile",
      "number": "09171234567",
      "is_primary": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

---

### POST /api/clients/:id/phone-numbers
Create a new phone number for a client.

**Request Body:**
```json
{
  "label": "Mobile",
  "number": "09171234567",
  "is_primary": false
}
```

**Fields:**
- `label` (required, enum) - "Mobile", "Home", or "Work"
- `number` (required, string) - Philippine phone number format:
  - Mobile: `09XX XXX XXXX` (11 digits)
  - International: `+639XX XXX XXXX` (12 digits)
  - Landline: Area code + 7-8 digit number
- `is_primary` (optional, boolean) - Set as primary (default: false)

**Validation:**
- Must match Philippine phone number format
- Must be unique per client

**Response (201 Created):**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### PUT /api/clients/:id/phone-numbers/:phoneId
Update an existing phone number.

**Allowed Fields:**
- `label` - Phone label
- `number` - Phone number (must remain unique)
- `is_primary` - Primary flag

---

### DELETE /api/clients/:id/phone-numbers/:phoneId
Soft delete a phone number.

---

### PATCH /api/clients/:id/phone-numbers/:phoneId/primary
Set a phone number as primary.

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "type": "ERROR_TYPE",
    "details": { ... }
  }
}
```

**Error Types:**
- `NOT_FOUND` - Resource not found (404)
- `VALIDATION_ERROR` - Invalid input (400)
- `UNAUTHORIZED` - Not authenticated (401)
- `FORBIDDEN` - Access denied (403)
- `CONFLICT` - Resource conflict (409)
- `INTERNAL_ERROR` - Server error (500)

---

## Rate Limiting

All POST/PUT/PATCH/DELETE endpoints are rate limited:
- Maximum: 10 requests per minute per user
- Response: `429 Too Many Requests`
- Retry-After header indicates seconds to wait

---

## Authentication

All endpoints require valid JWT authentication:
```
Authorization: Bearer <token>
```

---

## Pagination

List endpoints support pagination:
- `page` - Page number (default: 1, min: 1)
- `limit` - Items per page (default: 50, min: 1, max: 100)

Response includes pagination metadata:
```json
{
  "page": 1,
  "limit": 50,
  "totalCount": 100,
  "totalPages": 2,
  "hasNext": true,
  "hasPrev": false
}
```

---

## Soft Delete

Both addresses and phone numbers use soft delete:
- `deleted_at` timestamp is set instead of permanent deletion
- Deleted records are excluded from API responses
- Can be restored by setting `deleted_at` to NULL

---

## PSGC Integration

Addresses reference the PSGC (Philippine Standard Geographic Code) table:
- `psgc_id` is a foreign key to `psgc.id`
- PSGC data is included in responses via LEFT JOIN
- PSGC fields: region, province, municipality, barangay

**PSGC Table Structure:**
```sql
CREATE TABLE psgc (
  id INTEGER PRIMARY KEY,
  code VARCHAR(20),
  region VARCHAR(100),
  province VARCHAR(100),
  municipality VARCHAR(100),
  barangay VARCHAR(100)
);
```

---

## PowerSync Integration

Mobile app syncs data via PowerSync:
- Addresses table: `powersync_addresses` publication
- Phone numbers table: `powersync_phone_numbers` publication
- PSGC table: `powersync_psgc` publication
- Only active records synced (`deleted_at IS NULL`)
