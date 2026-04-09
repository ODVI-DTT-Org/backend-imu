# Migration Guide: Legacy Phone to Multiple Phone Numbers

This guide explains how to migrate existing client phone numbers from the legacy `clients.phone` field to the new `phone_numbers` table.

---

## Overview

**Legacy Structure:**
- Single phone number per client stored in `clients.phone`
- No labeling (mobile/home/work)
- No primary designation

**New Structure:**
- Multiple phone numbers per client in `phone_numbers` table
- Labeled numbers (Mobile/Home/Work)
- Primary designation for default number

---

## Migration Strategy

### Option 1: Automatic Migration (Recommended)

Create a migration script that automatically migrates existing phone numbers.

**Migration File: `060_migrate_legacy_phones.sql`**
```sql
-- Migration: Migrate legacy client phones to phone_numbers table
-- Description: Copy existing phone numbers from clients.phone to phone_numbers table

-- First, migrate all existing phone numbers as primary mobile numbers
INSERT INTO phone_numbers (id, client_id, label, number, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid(),  -- New UUID for phone number
  id as client_id,    -- Client ID
  'Mobile' as label,  -- Default to Mobile label
  phone as number,    -- Legacy phone number
  true as is_primary, -- Set as primary (only number)
  created_at,        -- Preserve created timestamp
  CURRENT_TIMESTAMP as updated_at
FROM clients
WHERE phone IS NOT NULL
  AND phone != ''
  AND deleted_at IS NULL;

-- Verification: Count migrated phone numbers
DO $$
DECLARE
  client_count INTEGER;
  phone_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO client_count FROM clients WHERE phone IS NOT NULL AND phone != '' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO phone_count FROM phone_numbers;

  RAISE NOTICE 'Migrated % phone numbers from % clients', phone_count, client_count;

  IF phone_count != client_count THEN
    RAISE EXCEPTION 'Migration count mismatch: expected %, got %', client_count, phone_count;
  END IF;
END $$;

-- Add comment to document migration
COMMENT ON TABLE phone_numbers IS 'Migrated from clients.phone on 2024-04-08';
```

**Rollback:**
```sql
-- To rollback this migration (CAUTION: will lose migrated data)
DELETE FROM phone_numbers WHERE created_at = CURRENT_DATE;
```

---

### Option 2: Manual Migration via API

For controlled migration, use the API endpoint:

**Step 1: Fetch all clients with phone numbers**
```bash
GET /api/clients?filter=has_phone
```

**Step 2: For each client, create phone number via API**
```bash
POST /api/clients/{client_id}/phone-numbers
{
  "label": "Mobile",
  "number": "{legacy_phone}",
  "is_primary": true
}
```

**Step 3: Verify migration**
```bash
GET /api/clients/{client_id}/phone-numbers
```

**Step 4: (Optional) Remove legacy phone field**
```sql
-- After verification, drop the legacy column
ALTER TABLE clients DROP COLUMN phone;
```

---

## Data Validation

Before migration, validate your data:

**Check for empty/null phones:**
```sql
SELECT COUNT(*) as clients_without_phones
FROM clients
WHERE phone IS NULL OR phone = '';
```

**Check for invalid phone formats:**
```sql
SELECT id, first_name, last_name, phone
FROM clients
WHERE phone IS NOT NULL
  AND phone != ''
  AND phone !~ '^(09\d{9}|\+639\d{9}|(0\d{1,4})?\d{7,8})$';
```

**Check for duplicate phone numbers:**
```sql
SELECT phone, COUNT(*) as count
FROM clients
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1;
```

---

## Post-Migration Verification

**1. Verify count:**
```sql
-- Before migration
SELECT COUNT(*) FROM clients WHERE phone IS NOT NULL AND phone != '';

-- After migration
SELECT COUNT(*) FROM phone_numbers;
-- Both counts should match
```

**2. Verify data integrity:**
```sql
-- Check that all migrated clients have a primary phone
SELECT c.id, c.first_name, c.last_name
FROM clients c
LEFT JOIN phone_numbers p ON c.id = p.client_id AND p.is_primary = true
WHERE c.phone IS NOT NULL
  AND c.phone != ''
  AND p.id IS NULL;
-- Should return 0 rows
```

**3. Test API endpoints:**
```bash
# Fetch phone numbers for a migrated client
GET /api/clients/{client_id}/phone-numbers

# Should return the migrated phone number
```

---

## Address Migration (Future)

Similarly, migrate legacy address fields:

**Legacy Structure:**
- `clients.address` - Single text field
- `clients.barangay`, `clients.city`, `clients.province` - Separate fields

**New Structure:**
- `addresses` table with PSGC foreign key
- Multiple addresses per client
- Labeled addresses (Home/Work/Relative/Other)

**Migration Script:**
```sql
-- TODO: Create migration script for addresses
-- Requires PSGC ID lookup for each legacy address
```

---

## Rollback Plan

If migration fails:

**1. Stop all services**
```bash
# Stop backend API
# Stop mobile app sync
```

**2. Assess damage**
```sql
-- Check what was migrated
SELECT COUNT(*) FROM phone_numbers WHERE created_at = CURRENT_DATE;
```

**3. Rollback if needed**
```sql
-- Option A: Delete migrated records
DELETE FROM phone_numbers WHERE created_at = CURRENT_DATE;

-- Option B: Restore from backup
-- pg_restore --clean --dbname imu_db backup.dump
```

**4. Investigate failure**
- Check logs for errors
- Verify data constraints
- Test with small batch first

---

## Testing Migration

**Test Migration Process:**

1. **Backup database**
   ```bash
   pg_dump imu_db > backup_before_migration.sql
   ```

2. **Test on staging**
   ```sql
   -- Run migration on staging database first
   \i 060_migrate_legacy_phones.sql
   ```

3. **Verify staging data**
   ```sql
   -- Run verification queries
   -- Test API endpoints
   ```

4. **Deploy to production**
   ```sql
   -- Run migration during maintenance window
   -- Monitor for errors
   ```

5. **Post-migration checks**
   - Verify all clients have phone numbers
   - Test mobile app sync
   - Check API responses
   - Monitor error logs

---

## Common Issues

### Issue 1: Invalid Phone Format

**Problem:** Legacy phone numbers don't match new validation.

**Solution:**
```sql
-- Find and fix invalid formats
UPDATE clients
SET phone = REGEXP_REPLACE(phone, '[^0-9+]', '')
WHERE phone ~ '[^0-9+]';
```

### Issue 2: Duplicate Phone Numbers

**Problem:** Multiple clients have the same phone number.

**Solution:**
```sql
-- Identify duplicates
SELECT phone, COUNT(*) as count, ARRAY_AGG(id) as client_ids
FROM clients
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(*) > 1;

-- Manual review required to resolve duplicates
```

### Issue 3: Missing PSGC Data

**Problem:** Addresses reference PSGC IDs that don't exist.

**Solution:**
```sql
-- Find addresses with invalid PSGC IDs
SELECT a.id, a.client_id, a.psgc_id
FROM addresses a
LEFT JOIN psgc p ON a.psgc_id = p.id
WHERE p.id IS NULL;

-- Update or mark for review
```

---

## Performance Considerations

**Migration Performance:**
- Large datasets: Migrate in batches (1000 records at a time)
- Indexes: Temporarily drop indexes before migration, recreate after
- Constraints: Disable triggers during migration, re-enable after
- Monitoring: Monitor database load during migration

**Example Batch Migration:**
```sql
-- Migrate 1000 records at a time
DO $$
DECLARE
  batch_size INTEGER := 1000;
  offset_val INTEGER := 0;
  total_migrated INTEGER := 0;
BEGIN
  LOOP
    INSERT INTO phone_numbers (id, client_id, label, number, is_primary, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      id,
      'Mobile',
      phone,
      true,
      created_at,
      CURRENT_TIMESTAMP
    FROM clients
    WHERE phone IS NOT NULL AND phone != '' AND deleted_at IS NULL
    ORDER BY id
    LIMIT batch_size OFFSET offset_val;

    total_migrated := total_migrated + SQL%ROWCOUNT;
    RAISE NOTICE 'Migrated % records (offset: %)', total_migrated, offset_val;

    EXIT WHEN SQL%ROWCOUNT < batch_size;
    offset_val := offset_val + batch_size;
  END LOOP;

  RAISE NOTICE 'Migration complete: % total records migrated', total_migrated;
END $$;
```

---

## Completion Checklist

- [ ] Create migration script
- [ ] Test migration on staging
- [ ] Backup production database
- [ ] Run migration during maintenance window
- [ ] Verify data integrity
- [ ] Test API endpoints
- [ ] Test mobile app sync
- [ ] Monitor error logs
- [ ] Remove legacy phone field (optional)
- [ ] Update documentation

---

## Support

For issues or questions:
- Check backend logs: `/var/log/backend/error.log`
- Check mobile app logs: PowerSync debug mode
- Database issues: Contact DBA team
- API issues: Check API documentation

---

**Last Updated:** 2024-04-08
**Version:** 1.0
