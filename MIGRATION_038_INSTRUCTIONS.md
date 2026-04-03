# Migration 038: Error Logs Table

## Overview

Creates the `error_logs` table for centralized error tracking and debugging.

## What This Migration Does

1. **Creates error_logs table** with comprehensive schema:
   - Request identification (request_id, timestamp)
   - Error details (code, message, status_code)
   - Request context (path, method, user_id, ip_address, user_agent)
   - Error context (details, errors, stack_trace as JSONB)
   - Resolution tracking (resolved, resolved_at, resolved_by, resolution_notes)
   - Metadata (created_at, updated_at)

2. **Creates performance indexes** for common queries:
   - idx_error_logs_request_id
   - idx_error_logs_timestamp
   - idx_error_logs_code
   - idx_error_logs_resolved
   - idx_error_logs_user_id
   - idx_error_logs_resolved_timestamp

3. **Creates trigger function** for automatic updated_at timestamp

## How to Run

### Option 1: Via API Endpoint (Recommended for Production)

1. Get admin auth token:
```bash
curl -X POST https://imu-api.cfbtools.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
```

2. Call migrate endpoint:
```bash
curl -X GET https://imu-api.cfbtools.app/api/migrate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Option 2: Via Script (Direct Database Access)

```bash
cd backend
chmod +x scripts/migrate-038-error-logs.sh
./scripts/migrate-038-error-logs.sh
```

### Option 3: Via psql (Direct Database Access)

```bash
psql $DATABASE_URL -f src/migrations/038_create_error_logs_table.sql
```

### Option 4: Via DigitalOcean Dashboard

1. Go to DigitalOcean Dashboard
2. Navigate to your App
3. Click "Console" button
4. Run the migration script in the console

## Verification

After running the migration, verify the table was created:

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'error_logs'
);

-- Check table structure
\d error_logs

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'error_logs';

-- Check trigger
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%error_logs%';
```

## Rollback

If needed, rollback this migration:

```sql
DROP TABLE IF EXISTS error_logs CASCADE;
DROP FUNCTION IF EXISTS update_error_logs_updated_at();
```

## Related Files

- Migration SQL: `src/migrations/038_create_error_logs_table.sql`
- Migration Script: `scripts/migrate-038-error-logs.sh`
- Error Logger Service: `src/services/errorLogger.ts`
- Error Handler Middleware: `src/middleware/errorHandler.ts`
- API Endpoint: `src/index.ts` (line 183 - /api/migrate)

## Status

- ✅ Migration SQL created
- ✅ Migration script created
- ✅ Added to /api/migrate endpoint
- ⏳ Pending: Run in production

## Next Steps

1. Run migration in production (choose one option above)
2. Verify error_logs table exists
3. Test error logging by triggering an error
4. Check error_logs table for new entries
5. Verify error logging is working correctly

---
**Created:** 2026-04-03
**Migration Number:** 038
