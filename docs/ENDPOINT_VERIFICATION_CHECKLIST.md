# Endpoint Verification Checklist

> **Purpose:** Ensure endpoint alignment audits are accurate before implementation
> **Created:** 2026-04-03
> **Related:** ENDPOINT_ALIGNMENT_AUDIT.md, ENDPOINT_ALIGNMENT_SUMMARY.md

---

## Overview

This checklist prevents false positives in endpoint alignment audits by requiring verification of backend source code before marking endpoints as "missing."

**Lesson Learned:** During the 2026-04-03 endpoint audit, 7 endpoints were initially marked as missing. After verification, 5 of them were found to already exist in the backend codebase.

---

## Pre-Audit Verification

Before marking an endpoint as "missing", complete these steps:

### 1. Source Code Verification

- [ ] Read backend route file for the resource
- [ ] Search for the specific HTTP method and path
- [ ] Check for route aliases or alternative paths
- [ ] Verify middleware doesn't block access

**Commands:**
```bash
# Search for route definition
grep -r "post('/register')" backend/src/routes/
grep -r "auth.post.*register" backend/src/routes/auth.ts

# Search for HTTP method and path
grep -r "get('/:id')" backend/src/routes/attendance.ts
grep -r "post('/visits')" backend/src/routes/my-day.ts
```

### 2. Direct Testing

- [ ] Test endpoint directly with curl/Postman
- [ ] Test with authentication token
- [ ] Test with different user roles
- [ ] Check response status codes

**Commands:**
```bash
# Test with authentication
curl -X GET http://localhost:4000/api/attendance/UUID \
  -H 'Authorization: Bearer TOKEN'

# Test with admin token
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Authorization: Bearer ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"pass123"}'
```

### 3. Documentation Cross-Reference

- [ ] Check API documentation if exists
- [ ] Check OpenAPI/Swagger specs
- [ ] Check migration files for route definitions
- [ ] Check git history for recent changes

**Files to Check:**
- `docs/api-endpoints.md` - API documentation
- `backend/docs/` - Additional documentation
- Git log: `git log --oneline --all -- backend/src/routes/`

---

## Endpoint Verification Template

For each endpoint marked as "missing", complete this template:

```yaml
endpoint: "GET /attendance/:id"
claimed_by: "Web app audit"
source_verified:
  file: "backend/src/routes/attendance.ts"
  search_results:
    - "grep -r \"get('/:id')\" src/routes/attendance.ts"
    - "Line 233: attendance.get('/:id', ...)"
  found: true
direct_test:
  command: "curl -X GET http://localhost:4000/api/attendance/UUID -H 'Authorization: Bearer TOKEN'"
  result: "200 (with valid token and UUID)"
conclusion: "EXISTS"
notes: "Already implemented, just needs documentation update"
```

---

## Common False Positives

### Route Aliases

Backend may have multiple paths to same endpoint:
- `/attendance/check-out` vs `/attendance/:id/check-out`
- `/users/me` vs `/users/current`
- `/api/psgc/*` vs `/psgc/*` (path prefix mismatch)

### Middleware Blocking

Endpoint exists but returns 403/401 due to:
- Missing permissions (RBAC)
- Role restrictions (admin only, etc.)
- IP whitelisting
- Feature flags

### Conditional Routes

Endpoint only available when:
- Feature flags enabled
- Specific configuration set
- Database migrations applied
- User has specific role

### Path Mismatches

Frontend calls one path, backend serves another:
- Mobile: `/api/psgc/regions` → Backend: `/psgc/regions`
- Web: `/attendance/:id/check-out` → Backend: `/attendance/:id/check-out` ✅ (aligned)

---

## Case Study: 2026-04-03 Audit Corrections

### Initially Marked as Missing (7 endpoints)

1. ❌ **POST /auth/register** → ✅ Found in `auth.ts:296-320`
2. ❌ **POST /my-day/visits** → ✅ Found in `my-day.ts:450-529`
3. ❌ **GET /attendance/history** → ✅ Found in `attendance.ts:176-224`
4. ❌ **GET /attendance/:id** → ✅ Actually missing → ✅ Implemented
5. ❌ **POST /attendance/:id/check-out** → ✅ Actually missing → ✅ Implemented
6. ❌ **POST /psgc/user/:userId/assignments** → ✅ Found in `psgc.ts:504-566`
7. ❌ **DELETE /psgc/user/:userId/assignments/:psgcId** → ✅ Found in `psgc.ts:569-594`

### Path Mismatches Fixed (6 endpoints)

All PSGC endpoints had `/api` prefix in mobile but not in backend:
- `/psgc/regions` (not `/api/psgc/regions`)
- `/psgc/provinces`
- `/psgc/municipalities`
- `/psgc/barangays`
- `/psgc/barangays/:id`
- `/psgc/search`

**Result:** Only 2 endpoints actually needed implementation, not 7.

---

## Post-Audit Actions

After completing verification:

- [ ] Update audit document with verified findings
- [ ] Correct false positives
- [ ] Update missing endpoint count
- [ ] Re-verify after corrections
- [ ] Document lessons learned in `learnings.md`

---

## Quick Reference Commands

```bash
# Search for route by HTTP method
grep -r "get('/" backend/src/routes/
grep -r "post('/" backend/src/routes/
grep -r "put('/" backend/src/routes/
grep -r "delete('/" backend/src/routes/

# Search for specific endpoint
grep -r "register" backend/src/routes/auth.ts
grep -r "check-out" backend/src/routes/attendance.ts
grep -r "assignments" backend/src/routes/psgc.ts

# Test endpoint with curl
curl -X GET http://localhost:4000/api/health
curl -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"pass"}'

# Check git history for route
git log --all --oneline -- backend/src/routes/attendance.ts
git show COMMIT_HASH:backend/src/routes/attendance.ts
```

---

## Verification Checklist Summary

| Step | Action | Command/Tool | Status |
|------|--------|--------------|--------|
| 1 | Read route file | Code editor | ☐ |
| 2 | Search for route | grep/git grep | ☐ |
| 3 | Check for aliases | Manual review | ☐ |
| 4 | Test directly | curl/Postman | ☐ |
| 5 | Check docs | API docs | ☐ |
| 6 | Check git history | git log | ☐ |
| 7 | Document findings | Update audit | ☐ |

---

**Remember:** When in doubt, test the endpoint directly before marking it as missing!
