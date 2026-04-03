# Migration Notes - Error Logs Table

## Issue: Two Different Migration 038 Files

There are two different migration files with the same number (038) but different schemas:

### File 1: `migrations/038_add_error_handling_system.sql`
- Uses `uuid_generate_v4()` (requires uuid-ossp extension)
- `request_id UUID` type
- More comprehensive with better indexes
- Located in `migrations/` folder

### File 2: `src/migrations/038_create_error_logs_table.sql`
- Uses `gen_random_uuid()` (PostgreSQL built-in)
- `request_id VARCHAR(36)` type
- More compatible with current errorLogger service
- Has foreign key constraints to users table
- Located in `src/migrations/` folder

## Recommendation

Use `src/migrations/038_create_error_logs_table.sql` because:
1. Compatible with current errorLogger service (expects request_id as string)
2. Uses built-in PostgreSQL functions (no extensions required)
3. Has proper foreign key constraints
4. More aligned with current codebase patterns

## Action Required

1. Remove duplicate migration file: `migrations/038_add_error_handling_system.sql`
2. Ensure `src/migrations/038_create_error_logs_table.sql` is run in production
3. Update migration sequence to avoid conflicts

## Current Status

- ✅ Error logging code is deployed and working
- ⏳ Migration needs to be run in production
- ⏳ Duplicate migration file needs to be removed
