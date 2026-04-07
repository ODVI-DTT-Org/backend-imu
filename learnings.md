# Backend Project Learnings

> **AI Agent Usage:** Import with `@learnings.md` before starting tasks to avoid repeating past mistakes.
>
> **📚 Full Documentation:** Backend-specific learnings are documented in the root IMU/learnings.md

---

## Metadata

| Field | Value |
|-------|-------|
| **Last Updated** | 2026-04-07 |
| **Contributors** | IMU Development Team |
| **Project Phase** | Active Development |

---

## Backend-Specific Architecture Decisions

| ID | Decision | Impact |
|----|----------|--------|
| D007 | Hono over Express for backend | Lightweight, modern, TypeScript-first |
| D025 | Error logging integration to sync services | Centralized error tracking |
| D026 | Simplified PowerSync sync configuration | Fixed validation errors and 500 sync failures |
| D027 | DigitalOcean PostgreSQL SSL compatibility | Added `uselibpqcompat=true` flag |
| D028 | Enhanced error logs UI/UX for bug reporting | Platform identification, copy-to-clipboard |
| D029 | Database schema alignment verification | Systematic verification of migrations |
| D030 | Dashboard with materialized views | < 200ms query performance |
| D031 | Target progress tracking system | Period-based goals with computed progress |
| D032 | Cron-based action items refresh | Automated hourly refresh |

**See:** [../../learnings.md](../../learnings.md) for complete project learnings.

---

## Backend-Specific Patterns

### Error Handling Pattern
```typescript
class AppError extends Error {
  code: ErrorCode
  statusCode: number
  suggestions: string[]
  addDetail(key: string, value: any): this
}
```

### PowerSync JWT Pattern
```javascript
const token = jwt.sign({
  user_id: user.id,
}, privateKey, {
  algorithm: 'RS256',
  keyid: 'imu-production-key-20260401',
  expiresIn: '24h',
});
```

### Database Migration Pattern
```typescript
// Run migration
npx tsx src/scripts/run-migration.ts src/migrations/045_add_column.sql

// Verify schema
psql $DATABASE_URL -c "\d table_name"
```

---

## Backend Quick Commands

| Task | Command |
|------|---------|
| **Development** | `pnpm dev` |
| **Build** | `pnpm build` |
| **Test** | `pnpm test` |
| **Lint** | `pnpm lint` |
| **Run Migration** | `npx tsx src/scripts/run-migration.ts src/migrations/XXX.sql` |

---

## Integration Gotchas

### PowerSync JWT
- Keys loaded from environment variables with escaped newlines
- Use `.replace(/\\n/g, '\n')` to handle DigitalOcean format

### Database SSL
- Add `uselibpqcompat=true` flag for DigitalOcean PostgreSQL
- Required for self-signed certificates in certificate chain

### Error Logging
- POST /api/errors endpoint receives errors from all platforms
- SHA-256 fingerprint for deduplication
- Rate limiting: 100 errors per minute per IP

---

## Documentation Links

| Topic | Location |
|-------|----------|
| **Complete Learnings** | [../../learnings.md](../../learnings.md) |
| **Backend Debug Log** | [debug-log.md](debug-log.md) |
| **API Documentation** | [../../docs/architecture/api-contracts.md](../../docs/architecture/api-contracts.md) |
| **Environment Variables** | [../../docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md) |

---

## How to Update

When you learn something new about the backend:

1. **Add to root learnings.md** (if it's a general project learning)
2. **Add to backend-specific documentation** (if backend-only)
3. **Update metadata** (date, version)
4. **Commit** with descriptive message

---

**Last Updated:** 2026-04-07
**Backend Stack:** Hono + PostgreSQL + PowerSync
