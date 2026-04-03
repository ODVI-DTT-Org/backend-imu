# RBAC Resource Alignment Document

> **Purpose**: Align all backend routes with proper RBAC permissions
> **Status**: DRAFT - Pending Review
> **Date**: 2026-04-03

---

## Current State

### Existing Resources (from migration 039)

From `backend/src/migrations/039_add_rbac_system.sql`:

| Resource | Actions | Constraints | Description |
|----------|---------|-------------|-------------|
| **users** | create, read, update, delete, assign_role, assign_area | NULL | User management |
| **clients** | create, read, update, delete, assign | own, area, all | Client management |
| **touchpoints** | create, read, update, delete | own, area, all, visit, call, any | Touchpoint management |
| **itineraries** | create, read, update, delete | own, area | Itinerary management |
| **reports** | read, export | own, area, all | Report viewing/export |
| **agencies** | read, create, update, delete | NULL | Agency management |
| **groups** | read, create, update, delete, manage_members | NULL | Group management |
| **targets** | read, set | own, area | Target management |
| **attendance** | create, read | own, area, all | Attendance tracking |
| **audit_logs** | read | own, area, all | Audit log viewing |
| **system** | configure | NULL | System configuration |

---

## Missing Resources (Identified from Routes)

These resources are **used in routes but missing from RBAC**:

### 1. **dashboard**

**Routes using it:**
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/dashboard/performance` - Performance metrics
- `GET /api/my-day/stats` - My Day statistics

**Current Permission Check:**
```typescript
requirePermission('dashboard', 'read')
```

**Proposed Permissions:**
| Action | Constraint | Description |
|--------|------------|-------------|
| read | NULL | View dashboard statistics |
| read_performance | NULL | View performance metrics |

**Proposed Role Assignments:**
| Role | Access Level |
|------|--------------|
| Admin | All dashboard permissions |
| Area Manager | All dashboard permissions |
| Assistant Area Manager | read only |
| Caravan | read only (own stats) |
| Tele | read only (own stats) |

---

### 2. **approvals**

**Routes using it:**
- `GET /api/approvals` - List approvals
- `POST /api/approvals` - Create approval request
- `PUT /api/approvals/:id` - Update approval
- `POST /api/approvals/:id/approve` - Approve request
- `POST /api/approvals/:id/reject` - Reject request
- `DELETE /api/approvals/:id` - Delete approval
- `POST /api/approvals/bulk-approve` - Bulk approve
- `POST /api/approvals/bulk-reject` - Bulk reject

**Current Permission Check:**
```typescript
requirePermission('approvals', 'read')
requirePermission('approvals', 'create')
requirePermission('approvals', 'update')
requirePermission('approvals', 'delete')
```

**Proposed Permissions:**
| Action | Constraint | Description |
|--------|------------|-------------|
| read | own, area, all | View approval requests |
| create | NULL | Create approval requests |
| approve | area, all | Approve requests |
| reject | area, all | Reject requests |
| update | NULL | Update approval details |
| delete | all | Delete approval requests |

**Proposed Role Assignments:**
| Role | Access Level |
|------|--------------|
| Admin | All permissions |
| Area Manager | read (area/all), create, approve (area), reject (area), update |
| Assistant Area Manager | read (area), create, approve (area), reject (area), update |
| Caravan | read (own), create |
| Tele | read (own), create |

---

### 3. **error_logs** (or error-logs)

**Routes using it:**
- `GET /api/error-logs` - List error logs
- `GET /api/error-logs/:id` - Get error log details
- `PUT /api/error-logs/:id/resolve` - Resolve error log
- `DELETE /api/error-logs/:id` - Delete error log

**Current Permission Check:**
```typescript
requirePermission('error_logs', 'read')
requireRole('admin', 'area_manager', 'assistant_area_manager')
```

**Proposed Permissions:**
| Action | Constraint | Description |
|--------|------------|-------------|
| read | own, area, all | View error logs |
| resolve | area, all | Mark error logs as resolved |
| delete | all | Delete error logs |

**Proposed Role Assignments:**
| Role | Access Level |
|------|--------------|
| Admin | All permissions |
| Area Manager | read (area/all), resolve (area) |
| Assistant Area Manager | read (area), resolve (area) |
| Caravan | read (own) |
| Tele | read (own) |

---

## Other Routes (May Not Need Permissions)

These routes exist but may not need RBAC permissions:

| Route | Resource | Permission Needed? | Notes |
|-------|----------|-------------------|-------|
| `/api/auth/*` | auth | ❌ No | Public endpoints |
| `/api/upload` | upload | ⚠️ Maybe | File upload - consider rate limiting instead |
| `/api/profile/*` | profile | ❌ No | Uses `users` permissions already |
| `/api/psgc/*` | psgc | ❌ No | Public reference data |
| `/api/touchpoint-reasons/*` | touchpoint_reasons | ❌ No | Public reference data |
| `/api/touchpoints/analytics` | touchpoints_analytics | ⚠️ Maybe | Could use `touchpoints` or `reports` |
| `/api/search` | search | ⚠️ Maybe | Could use resource-specific permissions |
| `/api/debug-audit/*` | debug_audit | ❌ No | Admin-only via requireRole |
| `/api/health/*` | health | ❌ No | Public health check |

---

## Proposed Migration

**File:** `backend/src/migrations/040_add_missing_rbac_resources.sql`

This migration would add:
1. **dashboard** resource with 2 permissions
2. **approvals** resource with 6 permissions
3. **error_logs** resource with 3 permissions

**Total New Permissions:** 11
**Total New Role Permissions:** ~25 (across all 5 roles)

---

## ✅ DECIDED: Alignment Decisions

### Dashboard Access
- ✅ **Admin**: Full access (read, read_performance)
- ✅ **Area Manager**: Full access (read, read_performance)
- ❌ **Assistant Area Manager**: NO access
- ❌ **Caravan**: NO access
- ❌ **Tele**: NO access

### Approvals Access (UDI and Client)
- ✅ **Admin**: Full access (read, create, approve, reject, update, delete)
- ❌ **Area Manager**: NO access
- ❌ **Assistant Area Manager**: NO access
- ❌ **Caravan**: NO access
- ❌ **Tele**: NO access

### Error Logs Access
- ✅ **Admin**: Full access (read, resolve, delete)
- ❌ **Area Manager**: NO access
- ❌ **Assistant Area Manager**: NO access
- ❌ **Caravan**: NO access
- ❌ **Tele**: NO access

---

## ✅ FINAL DECISIONS APPROVED

### Dashboard: Admin + Area Manager Only
| Role | read | read_performance |
|------|------|------------------|
| Admin | ✅ | ✅ |
| Area Manager | ✅ | ✅ |
| Assistant Area Manager | ❌ | ❌ |
| Caravan | ❌ | ❌ |
| Tele | ❌ | ❌ |

### Approvals: Admin Only
| Role | read | create | approve | reject | update | delete |
|------|------|--------|---------|--------|--------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Area Manager | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Assistant Area Manager | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Caravan | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tele | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Error Logs: Admin Only
| Role | read | resolve | delete |
|------|------|---------|--------|
| Admin | ✅ | ✅ | ✅ |
| Area Manager | ❌ | ❌ | ❌ |
| Assistant Area Manager | ❌ | ❌ | ❌ |
| Caravan | ❌ | ❌ | ❌ |
| Tele | ❌ | ❌ | ❌ |

---

## Migration Ready

**File:** `backend/src/migrations/040_add_missing_rbac_resources.sql`

**Changes:**
- ✅ Adds 2 dashboard permissions (Admin + Area Manager)
- ✅ Adds 6 approvals permissions (Admin only)
- ✅ Adds 3 error_logs permissions (Admin only)
- ✅ Total: 11 new permissions, ~10 role permissions

---

## Next Steps

1. ⏳ Run migration 040 on QA database
2. ⏳ Test permissions with Admin user
3. ⏳ Verify Area Manager can access dashboard
4. ⏳ Verify other roles CANNOT access these resources
5. ⏳ Update frontend to hide menu items based on permissions
