# Backend Debug Log

> **AI Agent Usage:** Check this file FIRST when debugging backend issues.
>
> **📚 Full Documentation:** Complete debug log is documented in the root IMU/debug-log.md

---

## Metadata

| Field | Value |
|-------|-------|
| **Last Updated** | 2026-04-07 |
| **Active Issues** | 0 |
| **Resolved This Month** | 53 |

---

## Recent Backend Issues (Last 7 Days)

| Issue | Date | Quick Fix |
|-------|------|-----------|
| Assigned Clients API 500 Error | 2026-04-07 | Remove duplicate WHERE clause in SQL |
| Touchpoint badge progress bug | 2026-04-07 | PowerSync batch queries with caching (mobile) |
| Session persistence fails | 2026-04-06 | Remove nested mounted checks (mobile) |
| Photo upload bug | 2026-04-06 | Add missing hash column to files table |

**See:** [../../debug-log.md](../../debug-log.md) for complete issue details.

---

## Backend-Specific Issues

### Database Issues
- Schema mismatches between code and database
- Migration failures
- SSL certificate errors (DigitalOcean)
- Connection pool exhaustion

### API Issues
- 500 errors from SQL syntax errors
- Malformed request/response handling
- JWT validation failures
- Permission check failures

### PowerSync Issues
- Sync configuration validation errors
- JWT signing failures
- Row limit exceeded (1000 rows per stream)
- Database connection failures

---

## Quick Fixes (Backend)

### Database Issues
```bash
# Check migrations
ls -la src/migrations/

# Run migration
npx tsx src/scripts/run-migration.ts src/migrations/XXX.sql

# Verify schema
psql $DATABASE_URL -c "\d table_name"
```

### API Issues
```bash
# Check logs
pnpm dev

# Run tests
pnpm test

# Check API endpoints
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/health
```

### PowerSync Issues
```bash
# Verify PowerSync JWT
# Check src/routes/auth.js for RS256 signing

# Check sync configuration
cat powersync/sync-config.yaml

# Deploy sync config
powersync deploy sync-config --instance-id XXX --project-id XXX
```

---

## Common Error Messages

### Database Errors
```
column "xxx" does not exist
→ Run migration to add column

syntax error at or near "WHERE"
→ Check for duplicate WHERE clauses in query construction

relation "xxx" does not exist
→ Run migration to create table
```

### API Errors
```
JWT verification failed
→ Check JWT secret and signing method

401 Unauthorized
→ Check token refresh logic

500 Internal Server Error
→ Check backend logs for stack trace
```

### PowerSync Errors
```
SyncResponseException: 500
→ Check PowerSync JWT and database connection

Too many parameter query results
→ Reduce result set with WHERE clause

Unknown function
→ Simplify sync configuration query
```

---

## Documentation Links

| Topic | Location |
|-------|----------|
| **Complete Debug Log** | [../../debug-log.md](../../debug-log.md) |
| **Backend Learnings** | [learnings.md](learnings.md) |
| **API Documentation** | [../../docs/architecture/api-contracts.md](../../docs/architecture/api-contracts.md) |
| **Environment Variables** | [../../docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md) |

---

## How to Update

When you fix or discover a backend issue:

1. **Add to root debug-log.md** (if it affects multiple platforms)
2. **Add to backend-specific notes** (if backend-only)
3. **Update metadata** (date, active issues count)
4. **Commit** with descriptive message

---

**Last Updated:** 2026-04-07
**Backend Stack:** Hono + PostgreSQL + PowerSync
**Full Documentation:** [../../debug-log.md](../../debug-log.md)
