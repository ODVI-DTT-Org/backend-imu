# IMU Production Schema - Quick Reference

**Total Tables:** 27
**Total Foreign Keys:** 50+ (after fixes)
**Total Indexes:** 160 (after applying all migrations)
**Database:** PostgreSQL 14+

**Migration Order:**
1. `999_production_schema.sql` - Base schema (88 indexes)
2. `1000_production_schema_fixes.sql` - Critical fixes (16 indexes)
3. `1001_production_missing_indexes.sql` - Missing QA2 indexes (56 indexes)

---

## 📊 Table Categories

### 🔐 Authentication & Authorization (4 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | id, email, password_hash, role, is_active |
| `roles` | User roles | id, name, slug, level, is_system |
| `permissions` | RBAC permissions | id, resource, action, constraint_name |
| `user_roles` | Role assignments | id, user_id, role_id, is_active, expires_at |

### 👥 Client Management (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `clients` | Client database | id, full_name*, client_type, is_starred, psgc_id |
| `addresses` | Multiple addresses | id, client_id, label, is_primary, deleted_at |
| `phone_numbers` | Multiple phones | id, client_id, number, label, is_primary, deleted_at |

### 📍 Database Normalization (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `visits` | Physical visits | id, client_id, user_id, time_arrival, photo_url*, GPS |
| `calls` | Phone calls | id, client_id, user_id, phone_number, duration, dial_time |
| `releases` | Loan releases | id, client_id, user_id, visit_id, amount, status, approved_by |

### 📋 Itinerary & Touchpoints (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `itineraries` | Scheduled visits | id, user_id, client_id, scheduled_date, status, priority |
| `touchpoints` | Touchpoint records | id, client_id, user_id, touchpoint_number, type, visit_id, call_id |
| `approvals` | Approval workflow | id, type, status, client_id, approved_by, approved_at |

### 👥 Groups (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `groups` | Field groups | id, name, area_manager_id, caravan_id |
| `group_members` | Group membership | id, group_id, client_id, joined_at |
| `group_municipalities` | Group coverage | id, group_id, province, municipality |

### 📊 Monitoring & Reporting (4 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `attendance` | Staff attendance | id, user_id, date, time_in, time_out, location |
| `audit_logs` | Audit trail | id, user_id, action, entity, old_values, new_values |
| `error_logs` | Error tracking | id, request_id, code, message, stack_trace, resolved |
| `report_jobs` | Report generation | id, report_type, status, result, file_url |

### 🗂️ Files (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `files` | File storage | id, filename, mime_type, size, url, uploaded_by |

### 🎯 Performance (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `targets` | User targets | id, user_id, period, target_clients, target_touchpoints |

### 🔧 System (3 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `feature_flags` | Feature toggles | id, name, enabled, percentage, user_whitelist |
| `touchpoint_reasons` | Touchpoint reasons | id, reason_code, label, touchpoint_type, role |
| `user_locations` | Area assignments | id, user_id, province, municipality, deleted_at |

### 🏢 Reference Data (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `agencies` | Agency reference | id, name, code, address |
| `psgc` | PSGC codes | id, region, province, mun_city, barangay |

### 📝 Approvals (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `approvals` | Data change approvals | id, type, status, client_id, approved_by, rejected_by |

### 📅 Scheduling (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `scheduled_reports` | Report scheduling | id, name, report_type, frequency, is_active |

### ⚙️ Background Jobs (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `background_jobs` | Async jobs | id, type, status, params, result, error |

---

## 🔗 Primary Relationships

### Central Hub: `clients` table
```
clients (1) ──────────► (N) addresses
clients (1) ──────────► (N) phone_numbers
clients (1) ──────────► (N) visits
clients (1) ──────────► (N) calls
clients (1) ──────────► (N) releases
clients (1) ──────────► (N) touchpoints
clients (1) ──────────► (N) itineraries
```

### Central Hub: `users` table
```
users (1) ──────────► (N) visits
users (1) ──────────► (N) calls
users (1) ──────────► (N) releases
users (1) ──────────► (N) touchpoints
users (1) ──────────► (N) itineraries
users (1) ──────────► (N) user_roles
```

### Cascade Relationships
```
visits (1) ──────────► (N) releases
visits (1) ──────────► (N) touchpoints
calls (1) ──────────► (N) touchpoints
groups (1) ──────────► (N) group_members
roles (1) ──────────► (N) user_roles
roles (1) ──────────► (N) role_permissions
```

---

## 📋 Table Statistics

| Category | Tables | Primary Keys | Foreign Keys | Indexes |
|----------|-------|--------------|--------------|---------|
| Auth | 4 | 4 | 2 | 10+ |
| Clients | 3 | 3 | 2 | 15+ |
| Normalization | 3 | 3 | 6 | 12+ |
| Itinerary | 3 | 3 | 7 | 8+ |
| Groups | 3 | 3 | 4 | 4+ |
| Monitoring | 4 | 4 | 2 | 10+ |
| Files | 1 | 1 | 1 | 2 |
| Performance | 1 | 1 | 2 | 3 |
| System | 3 | 3 | 2 | 5+ |
| Reference | 2 | 2 | 0 | 5+ |
| Approvals | 1 | 1 | 4 | 4+ |
| Scheduling | 1 | 1 | 1 | 2+ |
| Jobs | 1 | 1 | 1 | 1 |
| **TOTAL** | **27** | **27** | **50+** | **70+** |

---

## 🔑 Key Constraints

### Unique Constraints (UQ)
- `users.email`
- `roles.slug`, `roles.name`
- `permissions.resource + action + constraint_name`
- `user_roles.user_id + role_id`
- `role_permissions.role_id + permission_id`
- `addresses.client_id + label` (when deleted_at IS NULL)
- `phone_numbers.client_id + label` (when deleted_at IS NULL)
- `touchpoints.client_id + touchpoint_number`
- `error_logs.request_id`
- `feature_flags.name`
- `agencies.code`
- `group_members.group_id + client_id`

### Required Fields (NOT NULL)
- All `id` fields (Primary Keys)
- `users.email`, `users.password_hash`
- `visits.photo_url`
- `releases.amount`
- `addresses.label`
- `phone_numbers.number`, `phone_numbers.label`

### Generated Columns
- `clients.full_name` (computed from first_name, last_name, middle_name)

---

## 📊 Data Volume Estimates

| Table | Expected Rows | Growth Rate | Retention |
|-------|--------------|-------------|----------|
| users | 1,000+ | 10/month | Indefinite |
| clients | 50,000+ | 500/month | Indefinite |
| visits | 500,000+ | 5,000/day | 1 year |
| calls | 300,000+ | 3,000/day | 1 year |
| releases | 50,000+ | 500/day | Indefinite |
| touchpoints | 1,000,000+ | 10,000/day | Indefinite |
| audit_logs | 10M+ | 100K/day | 90 days |
| error_logs | 100K+ | 1K/day | 30 days |

---

## 🎯 Feature Implementation Status

| Feature | Tables | Status | Notes |
|---------|-------|--------|-------|
| RBAC | 4 tables | ✅ Complete | Hierarchical roles |
| Database Normalization | 3 tables | ✅ Complete | Visits, Calls, Releases |
| Multiple Addresses | 1 table | ✅ Complete | With soft delete |
| Multiple Phones | 1 table | ✅ Complete | With soft delete |
| Fuzzy Search | - | ✅ Complete | Full-text indexes on clients |
| Touchpoints | 1 table | ✅ Complete | 7-step sequence |
| Itineraries | 1 table | ✅ Complete | Date-based scheduling |
| Approvals | 1 table | ✅ Complete | Workflow with audit trail |
| Groups | 3 tables | ✅ Complete | Area-based grouping |

---

## 🚀 Quick Lookup: Find the Right Table

**Need to...**
- Store user credentials? → `users`
- Track physical visits? → `visits`
- Log phone calls? → `calls`
- Manage releases? → `releases`
- Add multiple addresses? → `addresses`
- Add multiple phones? → `phone_numbers`
- Schedule visits? → `itineraries`
- Track touchpoints? → `touchpoints`
- Approve changes? → `approvals`
- Manage roles? → `roles`, `permissions`, `user_roles`
- Group clients? → `groups`, `group_members`
- Track attendance? → `attendance`
- Audit actions? → `audit_logs`
- Monitor errors? → `error_logs`
- Generate reports? → `report_jobs`, `scheduled_reports`
- Store files? → `files`
- Set targets? → `targets`
- Toggle features? → `feature_flags`
- Assign areas? → `user_locations`

---

**Last Updated:** 2026-04-10
**Schema Version:** 1.0.1 (with fixes)
**Status:** ✅ Ready for Production (after applying fixes)
