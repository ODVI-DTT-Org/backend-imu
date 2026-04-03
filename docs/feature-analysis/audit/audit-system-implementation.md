# Audit System Implementation

**Date:** 2025-03-26
**Status:** ✅ COMPLETE

---

## Overview

Implemented a comprehensive audit logging system for the IMU backend API. The audit system tracks all CRUD operations, authentication events, and system actions for compliance and debugging purposes.

---

## Database Schema

### audit_logs Table

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                    -- User who performed the action
  action TEXT NOT NULL,             -- Action type (create, update, delete, etc.)
  entity TEXT NOT NULL,             -- Entity type (user, client, caravan, etc.)
  entity_id UUID,                   -- ID of the affected entity
  old_values JSONB,                 -- Previous values for update/delete
  new_values JSONB,                 -- New values for create/update
  ip_address TEXT,                  -- Client IP address
  user_agent TEXT,                  -- Client user agent string
  metadata JSONB,                   -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

- `idx_audit_logs_user_id` - User-based queries
- `idx_audit_logs_entity` - Entity-based queries
- `idx_audit_logs_entity_id` - Entity ID lookups
- `idx_audit_logs_action` - Action filtering
- `idx_audit_logs_created_at` - Time-based queries
- `idx_audit_logs_user_created` - User activity over time
- `idx_audit_logs_entity_created` - Entity changes over time

---

## Audit Actions

| Action | Description |
|--------|-------------|
| `create` | Entity creation |
| `update` | Entity modification |
| `delete` | Entity deletion |
| `login` | User authentication |
| `logout` | User logout |
| `password_reset` | Password reset via token |
| `password_change` | Password change by user |
| `approve` | Approval granted |
| `reject` | Approval rejected |
| `export` | Data export |
| `import` | Data import |

## Audit Entities

| Entity | Description |
|--------|-------------|
| `user` | User accounts |
| `client` | Client records |
| `caravan` | Field agents/caravans |
| `agency` | Agencies |
| `touchpoint` | Touchpoint records |
| `itinerary` | Itinerary items |
| `group` | Groups |
| `target` | Performance targets |
| `attendance` | Attendance records |
| `approval` | Approval requests |
| `file` | File uploads |
| `auth` | Authentication events |

---

## Implementation Details

### 1. Audit Middleware (`backend/src/middleware/audit.ts`)

**Key Features:**
- Automatic table creation with schema validation
- Auto-detection and recreation of outdated schemas
- Sensitive field filtering (password, password_hash, token)
- Helper functions for common audit scenarios

**Helper Functions:**
```typescript
// Auth events
auditAuth.login(userId, ipAddress, userAgent, success)
auditAuth.logout(userId, ipAddress, userAgent)
auditAuth.passwordReset(userId, ipAddress)
auditAuth.passwordChange(userId, ipAddress)

// Approval events
auditApproval.approve(userId, approvalId, clientId, notes)
auditApproval.reject(userId, approvalId, clientId, reason)

// General logging
auditLog({
  userId,
  action,
  entity,
  entityId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
  metadata
})
```

### 2. Routes with Audit Middleware

**All CRUD operations now include automatic audit logging:**

| Route | POST | PUT | DELETE |
|-------|------|-----|--------|
| `/api/users` | ✅ | ✅ | ✅ |
| `/api/clients` | ✅ | ✅ | ✅ |
| `/api/caravans` | ✅ | ✅ | ✅ |
| `/api/groups` | ✅ | ✅ | ✅ |
| `/api/agencies` | ✅ | ✅ | ✅ |
| `/api/touchpoints` | ✅ | ✅ | ✅ |
| `/api/itineraries` | ✅ | ✅ | ✅ |
| `/api/targets` | ✅ | N/A | ✅ |
| `/api/attendance/check-in` | ✅ | N/A | N/A |
| `/api/attendance/check-out` | ✅ | N/A | N/A |

### 3. Authentication Events

**Login:**
- ✅ Successful login attempts (with userId)
- ✅ Failed login attempts (with userId when password invalid)

**Logout:**
- ✅ All logout events

**Password Management:**
- ✅ Password changes via `/api/users/:id/change-password`
- ✅ Password resets via `/api/auth/reset-password`

---

## API Endpoints

### GET /api/audit-logs

List audit logs with filtering (admin/staff only).

**Query Parameters:**
- `page` - Page number (default: 1)
- `perPage` - Items per page (default: 50)
- `user_id` - Filter by user
- `entity` - Filter by entity type
- `entity_id` - Filter by specific entity
- `action` - Filter by action type
- `start_date` - Filter from date
- `end_date` - Filter to date

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "action": "create",
      "entity": "client",
      "entityId": "uuid",
      "oldValues": null,
      "newValues": {"name": "Client Name"},
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "metadata": null,
      "createdAt": "2025-03-26T10:00:00Z"
    }
  ],
  "page": 1,
  "perPage": 50,
  "totalItems": 100,
  "totalPages": 2
}
```

### GET /api/audit-logs/stats

Get audit statistics (admin only).

**Response:**
```json
{
  "actionStats": [
    {"action": "create", "count": 150},
    {"action": "update", "count": 89},
    {"action": "delete", "count": 12}
  ],
  "entityStats": [
    {"entity": "client", "count": 95},
    {"entity": "touchpoint", "count": 67},
    {"entity": "user", "count": 23}
  ],
  "topUsers": [
    {"id": "uuid", "firstName": "John", "lastName": "Doe", "email": "john@example.com", "actionCount": 45}
  ],
  "dailyTrend": [
    {"date": "2025-03-26", "count": 23},
    {"date": "2025-03-25", "count": 31}
  ]
}
```

### GET /api/audit-logs/entity/:entity/:id

Get audit history for a specific entity.

**Example:** `/api/audit-logs/entity/client/123e4567-e89b-12d3-a456-426614174000`

---

## Security Features

1. **Sensitive Data Filtering:**
   - Passwords are never logged
   - Tokens are filtered out
   - Only non-sensitive fields are captured

2. **Access Control:**
   - Audit logs are admin/staff only
   - Field agents can only see their own related logs
   - IP addresses and user agents are captured

3. **Data Integrity:**
   - Audit logs are immutable (no UPDATE/DELETE on audit_logs table)
   - All entries are timestamped
   - User attribution for all actions

---

## Testing

### Manual Testing Checklist

- ✅ Backend server starts successfully
- ✅ Audit table created with correct schema
- ✅ Login events are logged
- ✅ CRUD operations generate audit entries
- ✅ Failed login attempts are logged
- ✅ Password changes are logged
- ✅ API returns audit logs correctly

### Test Commands

```bash
# View recent audit logs
curl http://localhost:3000/api/audit-logs?page=1&perPage=10

# Get audit statistics
curl http://localhost:3000/api/audit-logs/stats

# Get audit history for a specific client
curl http://localhost:3000/api/audit-logs/entity/client/{client_id}

# Filter by user
curl http://localhost:3000/api/audit-logs?user_id={user_id}

# Filter by action
curl http://localhost:3000/api/audit-logs?action=create
```

---

## Migration Files

- `021_create_audit_logs_table.sql` - Creates/recreates audit_logs table with proper schema

---

## Performance Considerations

1. **Indexes:** All commonly queried columns are indexed
2. **JSONB:** Old/new values stored as JSONB for efficient storage
3. **Pagination:** Large result sets are paginated
4. **Async:** Audit logging is non-blocking (errors don't affect main operation)

---

## Future Enhancements

1. **Retention Policy:** Add automatic cleanup of old audit logs
2. **Export:** Add CSV/Excel export for audit reports
3. **Alerts:** Add real-time alerts for suspicious activities
4. **Dashboard:** Create frontend audit log viewer
5. **Archiving:** Implement cold storage for old logs

---

## Troubleshooting

### Issue: "column entity does not exist"

**Solution:** The audit middleware automatically detects and recreates the table with the correct schema. Restart the backend server.

### Issue: Audit logs not appearing

**Check:**
1. Verify audit_logs table exists: `\d audit_logs`
2. Check server logs for audit errors
3. Ensure middleware is applied to routes

### Issue: Performance degradation

**Solution:**
- Create appropriate indexes (already included)
- Implement data retention policy
- Archive old logs to cold storage

---

## Compliance

The audit system supports:
- **SOC 2:** Comprehensive activity logging
- **GDPR:** User data access tracking
- **HIPAA:** PHI access logging (if applicable)
- **ISO 27001:** Security monitoring

---

## Conclusion

The audit system is now fully operational and tracking all critical operations in the IMU backend. The system provides:
- Complete audit trail of all user actions
- Authentication event tracking
- Data change history
- Performance monitoring capabilities
- Security incident investigation support

All endpoints are now audited, and the system is ready for production use.
