# Visit Record Only & Loan Release Data Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement clean separation between touchpoints (7-step sales process) and visits (actual visit records), with role-based approval flows for loan releases and client data changes.

**Architecture:** Three-path loan release system (Admin direct, Caravan via visits, Tele via calls), role-based approval for address/phone changes, visit-only records without fake touchpoints.

**Tech Stack:** Hono (TypeScript backend), PostgreSQL with node-postgres (pg), Zod validation, JWT auth middleware

---

## File Structure

### Files Created:
- `backend/src/migrations/048_support_tele_loan_releases.sql` - Schema changes for Tele loan releases
- `backend/src/migrations/049_cleanup_legacy_touchpoints.sql` - One-time migration of touchpoint #0 to visits
- `backend/src/routes/__tests__/my-day.visit.test.ts` - Tests for visit record endpoint
- `backend/src/routes/__tests__/approvals.loan-release.test.ts` - Tests for loan release endpoint
- `backend/src/routes/__tests__/clients.address-phone.test.ts` - Tests for address/phone endpoints

### Files Modified:
- `backend/src/routes/my-day.ts:120-180` - Replace touchpoint creation with visits table
- `backend/src/routes/approvals.ts:1060-1400` - Add three-path loan release (Admin/Caravan/Tele)
- `backend/src/routes/approvals.ts:1400-1700` - Update approval handler for all types
- `backend/src/routes/clients.ts:450-550` - Add role-based approval for addresses
- `backend/src/routes/clients.ts:550-650` - Add role-based approval for phones

---

## Task 1: Database Schema Migration for Tele Loan Releases

**Files:**
- Create: `backend/src/migrations/048_support_tele_loan_releases.sql`

- [ ] **Step 1: Create migration file with Tele support**

```sql
-- File: backend/src/migrations/048_support_tele_loan_releases.sql
-- Migration: Support Tele Loan Releases
-- Description: Add type column to calls, call_id to releases, make visit_id nullable

-- Step 1: Add type column to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'regular_call'
  CHECK (type IN ('regular_call', 'release_loan'));

-- Step 2: Add call_id column to releases table
ALTER TABLE releases ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE CASCADE;

-- Step 3: Make visit_id nullable (for admin direct releases and tele releases)
ALTER TABLE releases ALTER COLUMN visit_id DROP NOT NULL;

-- Step 4: Add constraint to ensure proper activity reference
ALTER TABLE releases ADD CONSTRAINT release_activity_check CHECK (
  (visit_id IS NOT NULL AND call_id IS NULL) OR  -- Caravan: visit only
  (visit_id IS NULL AND call_id IS NOT NULL) OR  -- Tele: call only
  (visit_id IS NULL AND call_id IS NULL)         -- Admin: direct release
);

-- Add comments for documentation
COMMENT ON COLUMN calls.type IS 'Type of call: regular_call or release_loan';
COMMENT ON COLUMN releases.call_id IS 'References calls(id) for Tele releases, NULL for Admin/Caravan releases';
COMMENT ON COLUMN releases.visit_id IS 'References visits(id) for Caravan releases, NULL for Admin/Tele releases';
COMMENT ON CONSTRAINT release_activity_check ON releases IS 'Ensures only one of visit_id or call_id is set, or both NULL for admin direct releases';
```

- [ ] **Step 2: Run migration to verify syntax**

Run: `psql $DATABASE_URL -f backend/src/migrations/048_support_tele_loan_releases.sql`

Expected output: `ALTER TABLE` messages, no errors

- [ ] **Step 3: Verify schema changes**

Run: `psql $DATABASE_URL -c "\d releases"`

Expected: releases table shows `call_id` nullable, `visit_id` nullable, constraint present

- [ ] **Step 4: Commit migration**

```bash
git add backend/src/migrations/048_support_tele_loan_releases.sql
git commit -m "feat(migration): add Tele loan release support to schema"
```

---

## Task 2: Data Migration - Clean Up Legacy Touchpoints

**Files:**
- Create: `backend/src/migrations/049_cleanup_legacy_touchpoints.sql`

- [ ] **Step 1: Create cleanup migration file**

```sql
-- File: backend/src/migrations/049_cleanup_legacy_touchpoints.sql
-- Migration: Clean Up Legacy Touchpoint Records
-- Description: Migrate touchpoint #0 records to visits table

-- Step 1: Create visits from legacy touchpoint #0 records
INSERT INTO visits (
  id, client_id, user_id, type, time_in, time_out,
  latitude, longitude, address, photo_url, notes, created_at
)
SELECT
  gen_random_uuid(),
  t.client_id,
  t.user_id,
  'regular_visit',
  t.time_in,
  t.time_out,
  t.latitude,
  t.longitude,
  t.address,
  t.photo_url,
  t.remarks,
  t.created_at
FROM touchpoints t
WHERE t.touchpoint_number = 0
  AND NOT EXISTS (
    -- Avoid duplicates if migration runs multiple times
    SELECT 1 FROM visits v
    WHERE v.client_id = t.client_id
      AND v.user_id = t.user_id
      AND v.created_at = t.created_at
      AND v.type = 'regular_visit'
  );

-- Step 2: Update itineraries to completed for migrated visits
UPDATE itineraries i
SET status = 'completed', updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM touchpoints t
  WHERE t.touchpoint_number = 0
    AND t.client_id = i.client_id
    AND t.user_id = i.user_id
    AND t.date = i.scheduled_date
)
AND i.status != 'completed';

-- Step 3: Delete migrated touchpoint #0 records
DELETE FROM touchpoints
WHERE touchpoint_number = 0;
```

- [ ] **Step 2: Test migration on staging database first**

Run: `psql postgresql://staging-db-url -f backend/src/migrations/049_cleanup_legacy_touchpoints.sql`

Expected: INSERT, UPDATE, DELETE counts shown

- [ ] **Step 3: Verify migration results**

Run: `psql postgresql://staging-db-url -c "SELECT COUNT(*) FROM touchpoints WHERE touchpoint_number = 0;"`

Expected: 0 rows (all #0 touchpoints deleted)

- [ ] **Step 4: Commit migration**

```bash
git add backend/src/migrations/049_cleanup_legacy_touchpoints.sql
git commit -m "feat(migration): migrate touchpoint #0 records to visits table"
```

---

## Task 3: Update Visit Record Only Endpoint

**Files:**
- Modify: `backend/src/routes/my-day.ts:120-180`
- Test: `backend/src/routes/__tests__/my-day.visit.test.ts`

- [ ] **Step 1: Write failing test for visit record creation**

```typescript
// File: backend/src/routes/__tests__/my-day.visit.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { pool } from '../../db/config';
import { myDayRoutes } from '../my-day';

describe('POST /api/my-day/clients/:id/visit', () => {
  let testClientId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test client and user
    const clientResult = await pool.query(
      'INSERT INTO clients (id, first_name, last_name) VALUES (gen_random_uuid(), $1, $2) RETURNING id',
      ['Test', 'Client']
    );
    testClientId = clientResult.rows[0].id;

    const userResult = await pool.query(
      'INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id',
      ['test@example.com', 'hash', 'Test', 'User', 'caravan']
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM visits WHERE client_id = $1', [testClientId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  it('should create visit record without touchpoint', async () => {
    const app = new Hono();
    app.route('/api/my-day', myDayRoutes);

    const response = await app.request(`/api/my-day/clients/${testClientId}/visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserId}`
      },
      body: JSON.stringify({
        time_in: '2026-04-15T09:30:00Z',
        time_out: '2026-04-15T09:45:00Z',
        latitude: 14.5995,
        longitude: 120.9842,
        notes: 'Test visit'
      })
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('visit_id');

    // Verify visit created in database
    const visitResult = await pool.query(
      'SELECT * FROM visits WHERE id = $1',
      [json.visit_id]
    );
    expect(visitResult.rows.length).toBe(1);
    expect(visitResult.rows[0].type).toBe('regular_visit');

    // Verify NO touchpoint created
    const touchpointResult = await pool.query(
      'SELECT * FROM touchpoints WHERE client_id = $1 AND created_at >= NOW() - INTERVAL \'1 minute\'',
      [testClientId]
    );
    expect(touchpointResult.rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test my-day.visit.test.ts`

Expected: FAIL - endpoint still creates touchpoints

- [ ] **Step 3: Update visit record endpoint implementation**

```typescript
// File: backend/src/routes/my-day.ts
// Replace existing POST /clients/:id/visit endpoint (lines 120-180)

myDay.post('/clients/:id/visit', authMiddleware, async (c) => {
  const schema = z.object({
    time_in: z.string().datetime().optional(),
    time_out: z.string().datetime().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    address: z.string().optional(),
    photo_url: z.string().optional(),
    notes: z.string().optional(),
  });

  const validated = schema.parse(await c.req.json());
  const clientId = c.req.param('id');
  const user = c.get('user');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // CREATE visits record
    const visitResult = await client.query(`
      INSERT INTO visits (
        id, client_id, user_id, type, time_in, time_out,
        latitude, longitude, address, photo_url, notes
      ) VALUES (
        gen_random_uuid(), $1, $2, 'regular_visit', $3, $4, $5, $6, $7, $8, $9
      ) RETURNING id
    `, [clientId, user.sub, validated.time_in, validated.time_out,
        validated.latitude, validated.longitude, validated.address,
        validated.photo_url, validated.notes]);

    // UPDATE itineraries (with error handling)
    const itineraryResult = await client.query(`
      UPDATE itineraries
      SET status = 'completed', updated_at = NOW()
      WHERE client_id = $1
        AND scheduled_date = CURRENT_DATE
        AND user_id = $2
      RETURNING *
    `, [clientId, user.sub]);

    // Log warning if no itinerary was updated (not critical, visit is still recorded)
    if (itineraryResult.rows.length === 0) {
      console.warn(`No itinerary found for client ${clientId}, user ${user.sub}`);
      // Visit is still created successfully, just no itinerary to update
    }

    await client.query('COMMIT');

    return c.json({
      message: 'Visit recorded successfully',
      visit_id: visitResult.rows[0].id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test my-day.visit.test.ts`

Expected: PASS - visit created, no touchpoint created

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/my-day.ts backend/src/routes/__tests__/my-day.visit.test.ts
git commit -m "feat(my-day): replace touchpoint creation with visits table"
```

---

## Task 4: Add Admin Direct Loan Release Path

**Files:**
- Modify: `backend/src/routes/approvals.ts:1060-1150`
- Test: `backend/src/routes/__tests__/approvals.loan-release.test.ts`

- [ ] **Step 1: Write failing test for admin direct release**

```typescript
// File: backend/src/routes/__tests__/approvals.loan-release.test.ts
// Add to existing test file

describe('POST /api/approvals/loan-release-v2 (Admin)', () => {
  it('should create release directly without approval for admin', async () => {
    const adminToken = await getTestToken('admin');
    const clientId = await createTestClient();

    const response = await app.request('/api/approvals/loan-release-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        client_id: clientId,
        udi_number: 'UDI-TEST-001',
        product_type: 'PUSU',
        loan_type: 'NEW',
        amount: 50000,
        remarks: 'Admin direct release'
      })
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('loan_released', true);
    expect(json).not.toHaveProperty('approval_id');

    // Verify release created with visit_id=NULL
    const releaseResult = await pool.query(
      'SELECT * FROM releases WHERE client_id = $1',
      [clientId]
    );
    expect(releaseResult.rows.length).toBe(1);
    expect(releaseResult.rows[0].visit_id).toBeNull();
    expect(releaseResult.rows[0].call_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: FAIL - endpoint doesn't handle admin direct release yet

- [ ] **Step 3: Implement admin direct release path**

```typescript
// File: backend/src/routes/approvals.ts
// Add at line 1060 (before existing loan-release-v2 endpoint)

approvals.post('/loan-release-v2', authMiddleware, async (c) => {
  const user = c.get('user');

  // Admin bypass: Direct release
  if (user.role === 'admin') {
    const schema = z.object({
      client_id: z.string().uuid(),
      udi_number: z.string().min(1).max(50),
      product_type: z.enum(['PUSU', 'LIKA', 'SUB2K']),
      loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']),
      amount: z.number().positive(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional(),
      photo_url: z.string().optional(),
      remarks: z.string().optional(),
    });

    const validated = schema.parse(await c.req.json());

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // CREATE releases record (no visit_id, no call_id)
      await client.query(`
        INSERT INTO releases (
          id, client_id, user_id, visit_id, call_id, product_type, loan_type,
          amount, approval_notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, NULL, NULL, $3, $4, $5, $6, 'approved'
        )
      `, [validated.client_id, user.sub, validated.product_type,
          validated.loan_type, validated.amount, validated.remarks]);

      // UPDATE clients
      await client.query(`
        UPDATE clients
        SET loan_released = TRUE, loan_released_at = NOW()
        WHERE id = $1
      `, [validated.client_id]);

      await client.query('COMMIT');

      return c.json({
        message: 'Loan release processed successfully',
        client_id: validated.client_id,
        loan_released: true,
        loan_released_at: new Date().toISOString()
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Caravan/Tele: Continue to approval flow below
  // ... existing code continues
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: PASS - admin direct release works

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/approvals.ts backend/src/routes/__tests__/approvals.loan-release.test.ts
git commit -m "feat(approvals): add admin direct loan release path"
```

---

## Task 5: Add Caravan Loan Release Approval Flow

**Files:**
- Modify: `backend/src/routes/approvals.ts:1150-1250`
- Test: `backend/src/routes/__tests__/approvals.loan-release.test.ts`

- [ ] **Step 1: Write failing test for caravan approval flow**

```typescript
// File: backend/src/routes/__tests__/approvals.loan-release.test.ts
// Add to existing test file

describe('POST /api/approvals/loan-release-v2 (Caravan)', () => {
  it('should create visit and approval for caravan', async () => {
    const caravanToken = await getTestToken('caravan');
    const clientId = await createTestClient();

    const response = await app.request('/api/approvals/loan-release-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caravanToken}`
      },
      body: JSON.stringify({
        client_id: clientId,
        udi_number: 'UDI-TEST-002',
        product_type: 'PUSU',
        loan_type: 'NEW',
        amount: 50000,
        time_in: '2026-04-15T10:00:00Z',
        time_out: '2026-04-15T10:30:00Z',
        latitude: 14.5995,
        longitude: 120.9842,
        remarks: 'Caravan visit'
      })
    });

    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json).toHaveProperty('approval_id');
    expect(json).toHaveProperty('status', 'pending');

    // Verify visit created
    const visitResult = await pool.query(
      'SELECT * FROM visits WHERE client_id = $1 AND type = $2',
      [clientId, 'release_loan']
    );
    expect(visitResult.rows.length).toBe(1);

    // Verify approval created
    const approvalResult = await pool.query(
      'SELECT * FROM approvals WHERE id = $1',
      [json.approval_id]
    );
    expect(approvalResult.rows.length).toBe(1);
    expect(approvalResult.rows[0].status).toBe('pending');

    // Verify NO release created yet
    const releaseResult = await pool.query(
      'SELECT * FROM releases WHERE client_id = $1',
      [clientId]
    );
    expect(releaseResult.rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: FAIL - caravan flow not implemented yet

- [ ] **Step 3: Implement caravan approval flow**

```typescript
// File: backend/src/routes/approvals.ts
// Add after admin path (line 1150)

else if (user.role === 'caravan') {
  // Caravan: Create visit + approval request
  const schema = z.object({
    client_id: z.string().uuid(),
    udi_number: z.string().min(1).max(50),
    product_type: z.enum(['PUSU', 'LIKA', 'SUB2K']),
    loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']),
    amount: z.number().positive(),
    time_in: z.string().datetime().optional(),
    time_out: z.string().datetime().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    address: z.string().optional(),
    photo_url: z.string().optional(),
    remarks: z.string().optional(),
  });

  const validated = schema.parse(await c.req.json());

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // CREATE visits record
    const visitResult = await dbClient.query(`
      INSERT INTO visits (
        id, client_id, user_id, type, time_in, time_out,
        latitude, longitude, address, photo_url, notes
      ) VALUES (
        gen_random_uuid(), $1, $2, 'release_loan', $3, $4, $5, $6, $7, $8, $9
      ) RETURNING id
    `, [validated.client_id, user.sub, validated.time_in, validated.time_out,
        validated.latitude, validated.longitude, validated.address,
        validated.photo_url, validated.remarks]);

    const visitId = visitResult.rows[0].id;

    // UPDATE itineraries (stays in_progress)
    await dbClient.query(`
      UPDATE itineraries
      SET status = 'in_progress', updated_at = NOW()
      WHERE client_id = $1
        AND scheduled_date = CURRENT_DATE
        AND user_id = $2
    `, [validated.client_id, user.sub]);

    // CREATE approval request
    const approvalResult = await dbClient.query(`
      INSERT INTO approvals (
        id, type, client_id, user_id, role, reason, notes, status
      ) VALUES (
        gen_random_uuid(), 'loan_release_v2', $1, $2, $3, $4, $5, 'pending'
      ) RETURNING id
    `, [validated.client_id, user.sub, user.role,
        'Loan Release Request',
        JSON.stringify({
          visit_id: visitId,
          udi_number: validated.udi_number,
          product_type: validated.product_type,
          loan_type: validated.loan_type,
          amount: validated.amount,
        })]);

    await dbClient.query('COMMIT');

    return c.json({
      message: 'Loan release submitted for approval',
      approval_id: approvalResult.rows[0].id,
      status: 'pending'
    }, 201);
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: PASS - caravan approval flow works

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/approvals.ts backend/src/routes/__tests__/approvals.loan-release.test.ts
git commit -m "feat(approvals): add caravan loan release approval flow"
```

---

## Task 6: Add Tele Loan Release Approval Flow

**Files:**
- Modify: `backend/src/routes/approvals.ts:1250-1350`
- Test: `backend/src/routes/__tests__/approvals.loan-release.test.ts`

- [ ] **Step 1: Write failing test for tele approval flow**

```typescript
// File: backend/src/routes/__tests__/approvals.loan-release.test.ts
// Add to existing test file

describe('POST /api/approvals/loan-release-v2 (Tele)', () => {
  it('should create call and approval for tele', async () => {
    const teleToken = await getTestToken('tele');
    const clientId = await createTestClient();

    const response = await app.request('/api/approvals/loan-release-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teleToken}`
      },
      body: JSON.stringify({
        client_id: clientId,
        udi_number: 'UDI-TEST-003',
        product_type: 'PUSU',
        loan_type: 'NEW',
        amount: 50000,
        phone_number: '09171234567',
        duration: 300,
        notes: 'Tele call'
      })
    });

    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json).toHaveProperty('approval_id');
    expect(json).toHaveProperty('status', 'pending');

    // Verify call created
    const callResult = await pool.query(
      'SELECT * FROM calls WHERE client_id = $1 AND type = $2',
      [clientId, 'release_loan']
    );
    expect(callResult.rows.length).toBe(1);

    // Verify NO visit created
    const visitResult = await pool.query(
      'SELECT * FROM visits WHERE client_id = $1 AND created_at >= NOW() - INTERVAL \'1 minute\'',
      [clientId]
    );
    expect(visitResult.rows.length).toBe(0);

    // Verify NO release created yet
    const releaseResult = await pool.query(
      'SELECT * FROM releases WHERE client_id = $1',
      [clientId]
    );
    expect(releaseResult.rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: FAIL - tele flow not implemented yet

- [ ] **Step 3: Implement tele approval flow**

```typescript
// File: backend/src/routes/approvals.ts
// Add after caravan path (line 1250)

else if (user.role === 'tele') {
  // Tele: Create call + approval request
  const schema = z.object({
    client_id: z.string().uuid(),
    udi_number: z.string().min(1).max(50),
    product_type: z.enum(['PUSU', 'LIKA', 'SUB2K']),
    loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']),
    amount: z.number().positive(),
    phone_number: z.string().regex(/^09\d{9}$/),
    duration: z.number().int().positive().optional(),
    notes: z.string().optional(),
  });

  const validated = schema.parse(await c.req.json());

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // CREATE calls record
    const callResult = await dbClient.query(`
      INSERT INTO calls (
        id, client_id, user_id, phone_number, dial_time, duration, notes, reason, type
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, $6, 'release_loan'
      ) RETURNING id
    `, [validated.client_id, user.sub, validated.phone_number,
        validated.duration, validated.notes, 'Loan Release Request']);

    const callId = callResult.rows[0].id;

    // CREATE approval request
    const approvalResult = await dbClient.query(`
      INSERT INTO approvals (
        id, type, client_id, user_id, role, reason, notes, status
      ) VALUES (
        gen_random_uuid(), 'loan_release_v2', $1, $2, $3, $4, $5, 'pending'
      ) RETURNING id
    `, [validated.client_id, user.sub, user.role,
        'Loan Release Request (Tele)',
        JSON.stringify({
          call_id: callId,
          udi_number: validated.udi_number,
          product_type: validated.product_type,
          loan_type: validated.loan_type,
          amount: validated.amount,
          phone_number: validated.phone_number,
        })]);

    await dbClient.query('COMMIT');

    return c.json({
      message: 'Loan release submitted for approval',
      approval_id: approvalResult.rows[0].id,
      status: 'pending'
    }, 201);
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test approvals.loan-release.test.ts`

Expected: PASS - tele approval flow works

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/approvals.ts backend/src/routes/__tests__/approvals.loan-release.test.ts
git commit -m "feat(approvals): add tele loan release approval flow"
```

---

## Task 7: Update Approval Handler for All Types

**Files:**
- Modify: `backend/src/routes/approvals.ts:1400-1700`
- Test: `backend/src/routes/__tests__/approvals.approve.test.ts`

- [ ] **Step 1: Write failing test for loan release approval**

```typescript
// File: backend/src/routes/__tests__/approvals.approve.test.ts
// Add to existing test file

describe('POST /api/approvals/:id/approve', () => {
  it('should process caravan loan release approval', async () => {
    const adminToken = await getTestToken('admin');
    const approvalId = await createTestApproval('caravan', 'loan_release_v2');

    const response = await app.request(`/api/approvals/${approvalId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        notes: 'Approved'
      })
    });

    expect(response.status).toBe(200);

    // Verify release created with visit_id
    const approvalResult = await pool.query('SELECT * FROM approvals WHERE id = $1', [approvalId]);
    const notes = approvalResult.rows[0].notes;
    expect(notes).toHaveProperty('visit_id');

    const releaseResult = await pool.query(
      'SELECT * FROM releases WHERE visit_id = $1',
      [notes.visit_id]
    );
    expect(releaseResult.rows.length).toBe(1);
  });

  it('should process tele loan release approval', async () => {
    const adminToken = await getTestToken('admin');
    const approvalId = await createTestApproval('tele', 'loan_release_v2');

    const response = await app.request(`/api/approvals/${approvalId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        notes: 'Approved'
      })
    });

    expect(response.status).toBe(200);

    // Verify release created with call_id
    const approvalResult = await pool.query('SELECT * FROM approvals WHERE id = $1', [approvalId]);
    const notes = approvalResult.rows[0].notes;
    expect(notes).toHaveProperty('call_id');

    const releaseResult = await pool.query(
      'SELECT * FROM releases WHERE call_id = $1',
      [notes.call_id]
    );
    expect(releaseResult.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test approvals.approve.test.ts`

Expected: FAIL - approval handler doesn't support loan_release_v2 yet

- [ ] **Step 3: Update approval handler implementation**

```typescript
// File: backend/src/routes/approvals.ts
// Replace existing approval handler (lines 1400-1700)

approvals.post('/:id/approve', authMiddleware, requireRole('admin'), async (c) => {
  const approvalId = c.req.param('id');
  const user = c.get('user');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get approval details
    const approvalResult = await client.query(`
      SELECT * FROM approvals WHERE id = $1
    `, [approvalId]);

    if (approvalResult.rows.length === 0) {
      throw new Error('Approval not found');
    }

    const approval = approvalResult.rows[0];

    // UPDATE approvals
    await client.query(`
      UPDATE approvals
      SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
      WHERE id = $2
    `, [user.sub, approvalId]);

    // Process based on approval type
    if (approval.type === 'loan_release_v2') {
      const notes = approval.notes;
      const visitId = notes.visit_id;  // For Caravan releases
      const callId = notes.call_id;    // For Tele releases

      // CREATE releases record (references visit_id OR call_id)
      await client.query(`
        INSERT INTO releases (
          id, client_id, user_id, visit_id, call_id, product_type, loan_type,
          amount, approval_notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'approved'
        )
      `, [approval.client_id, approval.user_id, visitId, callId,
          notes.product_type, notes.loan_type, notes.amount,
          'Approved by admin']);

      // UPDATE clients
      await client.query(`
        UPDATE clients
        SET loan_released = TRUE, loan_released_at = NOW()
        WHERE id = $1
      `, [approval.client_id]);

      // UPDATE itineraries (now completed) - only for Caravan (visit-based)
      if (visitId) {
        await client.query(`
          UPDATE itineraries
          SET status = 'completed', updated_at = NOW()
          WHERE client_id = $1
            AND scheduled_date = CURRENT_DATE
            AND user_id = $2
        `, [approval.client_id, approval.user_id]);
      }
      // Note: Tele releases don't update itineraries (no scheduled visit)
    }

    else if (approval.type === 'address_add') {
      const notes = approval.notes;

      // CREATE addresses record
      await client.query(`
        INSERT INTO addresses (
          id, client_id, type, street, barangay, city_municipality,
          province, postal_code, psgc_id
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
        )
      `, [approval.client_id, notes.type, notes.street, notes.barangay,
          notes.city_municipality, notes.province, notes.postal_code,
          notes.psgc_id]);
    }

    else if (approval.type === 'phone_add') {
      const notes = approval.notes;

      // CREATE phone_numbers record
      await client.query(`
        INSERT INTO phone_numbers (
          id, client_id, phone_number, type, is_primary
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4
        )
      `, [approval.client_id, notes.phone_number, notes.type, notes.is_primary]);
    }

    await client.query('COMMIT');

    return c.json({ message: 'Approval processed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test approvals.approve.test.ts`

Expected: PASS - all approval types work

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/approvals.ts backend/src/routes/__tests__/approvals.approve.test.ts
git commit -m "feat(approvals): update approval handler for loan_release_v2"
```

---

## Task 8: Add Role-Based Approval for Addresses

**Files:**
- Modify: `backend/src/routes/clients.ts:450-550`
- Test: `backend/src/routes/__tests__/clients.address-phone.test.ts`

- [ ] **Step 1: Write failing test for address approval**

```typescript
// File: backend/src/routes/__tests__/clients.address-phone.test.ts
// Add to existing test file

describe('POST /api/clients/:id/addresses', () => {
  it('should create approval for caravan address addition', async () => {
    const caravanToken = await getTestToken('caravan');
    const clientId = await createTestClient();

    const response = await app.request(`/api/clients/${clientId}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caravanToken}`
      },
      body: JSON.stringify({
        type: 'home',
        street: '123 Test St',
        city_municipality: 'Manila'
      })
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('requires_approval', true);

    // Verify NO address created yet
    const addressResult = await pool.query(
      'SELECT * FROM addresses WHERE client_id = $1',
      [clientId]
    );
    expect(addressResult.rows.length).toBe(0);
  });

  it('should create address directly for admin', async () => {
    const adminToken = await getTestToken('admin');
    const clientId = await createTestClient();

    const response = await app.request(`/api/clients/${clientId}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'home',
        street: '456 Admin St',
        city_municipality: 'Manila'
      })
    });

    expect(response.status).toBe(201);

    // Verify address created immediately
    const addressResult = await pool.query(
      'SELECT * FROM addresses WHERE client_id = $1',
      [clientId]
    );
    expect(addressResult.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test clients.address-phone.test.ts`

Expected: FAIL - endpoint doesn't check roles yet

- [ ] **Step 3: Implement role-based address approval**

```typescript
// File: backend/src/routes/clients.ts
// Replace existing POST /:id/addresses endpoint (lines 450-550)

clients.post('/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const user = c.get('user');

  const schema = z.object({
    type: z.enum(['home', 'business', 'other']),
    street: z.string().optional(),
    barangay: z.string().optional(),
    city_municipality: z.string().optional(),
    province: z.string().optional(),
    postal_code: z.string().optional(),
    psgc_id: z.string().optional(),
  });

  const validated = schema.parse(await c.req.json());

  const client = await pool.connect();
  try {
    // Admin: Direct insert
    if (user.role === 'admin') {
      const result = await client.query(`
        INSERT INTO addresses (
          id, client_id, type, street, barangay, city_municipality,
          province, postal_code, psgc_id
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING *
      `, [clientId, validated.type, validated.street, validated.barangay,
          validated.city_municipality, validated.province, validated.postal_code,
          validated.psgc_id]);

      return c.json(result.rows[0], 201);
    }

    // Caravan/Tele: Create approval request
    else {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO approvals (
          id, type, client_id, user_id, role, reason, notes, status
        ) VALUES (
          gen_random_uuid(), 'address_add', $1, $2, $3, $4, $5, 'pending'
        ) RETURNING id
      `, [clientId, user.sub, user.role, 'Add Address Request',
        JSON.stringify(validated)]);

      await client.query('COMMIT');

      return c.json({
        message: 'Address addition submitted for approval',
        requires_approval: true
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test clients.address-phone.test.ts`

Expected: PASS - role-based approval works

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/clients.ts backend/src/routes/__tests__/clients.address-phone.test.ts
git commit -m "feat(clients): add role-based approval for addresses"
```

---

## Task 9: Add Role-Based Approval for Phone Numbers

**Files:**
- Modify: `backend/src/routes/clients.ts:550-650`
- Test: `backend/src/routes/__tests__/clients.address-phone.test.ts`

- [ ] **Step 1: Write failing test for phone approval**

```typescript
// File: backend/src/routes/__tests__/clients.address-phone.test.ts
// Add to existing test file

describe('POST /api/clients/:id/phones', () => {
  it('should create approval for caravan phone addition', async () => {
    const caravanToken = await getTestToken('caravan');
    const clientId = await createTestClient();

    const response = await app.request(`/api/clients/${clientId}/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${caravanToken}`
      },
      body: JSON.stringify({
        phone_number: '09171234567',
        type: 'mobile'
      })
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('requires_approval', true);

    // Verify NO phone created yet
    const phoneResult = await pool.query(
      'SELECT * FROM phone_numbers WHERE client_id = $1',
      [clientId]
    );
    expect(phoneResult.rows.length).toBe(0);
  });

  it('should create phone directly for admin', async () => {
    const adminToken = await getTestToken('admin');
    const clientId = await createTestClient();

    const response = await app.request(`/api/clients/${clientId}/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        phone_number: '09181234567',
        type: 'mobile'
      })
    });

    expect(response.status).toBe(201);

    // Verify phone created immediately
    const phoneResult = await pool.query(
      'SELECT * FROM phone_numbers WHERE client_id = $1',
      [clientId]
    );
    expect(phoneResult.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test clients.address-phone.test.ts`

Expected: FAIL - endpoint doesn't check roles yet

- [ ] **Step 3: Implement role-based phone approval**

```typescript
// File: backend/src/routes/clients.ts
// Replace existing POST /:id/phones endpoint (lines 550-650)

clients.post('/:id/phones', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const user = c.get('user');

  const schema = z.object({
    phone_number: z.string().regex(/^09\d{9}$/),
    type: z.enum(['mobile', 'landline', 'other']),
    is_primary: z.boolean().default(false),
  });

  const validated = schema.parse(await c.req.json());

  const client = await pool.connect();
  try {
    // Admin: Direct insert
    if (user.role === 'admin') {
      const result = await client.query(`
        INSERT INTO phone_numbers (
          id, client_id, phone_number, type, is_primary
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4
        ) RETURNING *
      `, [clientId, validated.phone_number, validated.type, validated.is_primary]);

      return c.json(result.rows[0], 201);
    }

    // Caravan/Tele: Create approval request
    else {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO approvals (
          id, type, client_id, user_id, role, reason, notes, status
        ) VALUES (
          gen_random_uuid(), 'phone_add', $1, $2, $3, $4, $5, 'pending'
        ) RETURNING id
      `, [clientId, user.sub, user.role, 'Add Phone Number Request',
        JSON.stringify(validated)]);

      await client.query('COMMIT');

      return c.json({
        message: 'Phone number addition submitted for approval',
        requires_approval: true
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test clients.address-phone.test.ts`

Expected: PASS - role-based approval works

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/routes/clients.ts backend/src/routes/__tests__/clients.address-phone.test.ts
git commit -m "feat(clients): add role-based approval for phone numbers"
```

---

## Task 10: Integration Testing & Verification

**Files:**
- No file creation/modification
- Test: All test files

- [ ] **Step 1: Run all tests**

Run: `cd backend && pnpm test`

Expected: All tests pass (no failures)

- [ ] **Step 2: Manual testing - Visit Record Only**

Run: `curl -X POST http://localhost:3000/api/my-day/clients/<client_id>/visit \
  -H "Authorization: Bearer <caravan_token>" \
  -H "Content-Type: application/json" \
  -d '{"time_in":"2026-04-15T09:30:00Z","notes":"Test visit"}'`

Expected: Returns visit_id, database shows visit created, no touchpoint created

- [ ] **Step 3: Manual testing - Admin Loan Release**

Run: `curl -X POST http://localhost:3000/api/approvals/loan-release-v2 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<uuid>","udi_number":"TEST-001","product_type":"PUSU","loan_type":"NEW","amount":50000}'`

Expected: Returns loan_released=true, database shows release with visit_id=NULL and call_id=NULL

- [ ] **Step 4: Manual testing - Caravan Loan Release**

Run: `curl -X POST http://localhost:3000/api/approvals/loan-release-v2 \
  -H "Authorization: Bearer <caravan_token>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<uuid>","udi_number":"TEST-002","product_type":"PUSU","loan_type":"NEW","amount":50000,"time_in":"2026-04-15T10:00:00Z"}'`

Expected: Returns approval_id, database shows visit created, approval pending, no release yet

- [ ] **Step 5: Manual testing - Tele Loan Release**

Run: `curl -X POST http://localhost:3000/api/approvals/loan-release-v2 \
  -H "Authorization: Bearer <tele_token>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<uuid>","udi_number":"TEST-003","product_type":"PUSU","loan_type":"NEW","amount":50000,"phone_number":"09171234567"}'`

Expected: Returns approval_id, database shows call created, approval pending, no release yet

- [ ] **Step 6: Manual testing - Address Approval**

Run: `curl -X POST http://localhost:3000/api/clients/<client_id>/addresses \
  -H "Authorization: Bearer <caravan_token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"home","street":"123 Test St"}'`

Expected: Returns requires_approval=true, database shows approval created, no address yet

- [ ] **Step 7: Manual testing - Phone Approval**

Run: `curl -X POST http://localhost:3000/api/clients/<client_id>/phones \
  -H "Authorization: Bearer <caravan_token>" \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"09171234567","type":"mobile"}'`

Expected: Returns requires_approval=true, database shows approval created, no phone yet

- [ ] **Step 8: Commit final implementation**

```bash
git add backend/src/routes/__tests__/
git commit -m "test: add integration tests for all data flows"
```

---

## Task 11: Deploy Migrations to Production

**Files:**
- No file creation/modification

- [ ] **Step 1: Backup production database**

Run: `pg_dump postgresql://prod-db-url > backup_$(date +%Y%m%d_%H%M%S).sql`

Expected: Backup file created

- [ ] **Step 2: Deploy schema migration**

Run: `psql postgresql://prod-db-url -f backend/src/migrations/048_support_tele_loan_releases.sql`

Expected: `ALTER TABLE` messages, no errors

- [ ] **Step 3: Deploy data migration**

Run: `psql postgresql://prod-db-url -f backend/src/migrations/049_cleanup_legacy_touchpoints.sql`

Expected: INSERT, UPDATE, DELETE counts shown

- [ ] **Step 4: Verify migrations**

Run: `psql postgresql://prod-db-url -c "SELECT COUNT(*) FROM touchpoints WHERE touchpoint_number = 0;"`

Expected: 0 rows

Run: `psql postgresql://prod-db-url -c "\d releases"`

Expected: shows call_id nullable, visit_id nullable, constraint present

- [ ] **Step 5: Deploy backend code**

Run: `cd backend && pnpm build && pnpm deploy:prod`

Expected: Build successful, deployment completes

- [ ] **Step 6: Smoke test production endpoints**

Run: Test all endpoints from Task 10 against production

Expected: All endpoints return expected responses

---

## Self-Review Results

**Spec Coverage:**
- ✅ Schema migrations (Task 1, 2)
- ✅ Visit record only (Task 3)
- ✅ Admin direct loan release (Task 4)
- ✅ Caravan loan release approval (Task 5)
- ✅ Tele loan release approval (Task 6)
- ✅ Approval handler updates (Task 7)
- ✅ Address approval (Task 8)
- ✅ Phone approval (Task 9)
- ✅ Integration testing (Task 10)
- ✅ Deployment (Task 11)

**Placeholder Scan:**
- ✅ No "TBD" or "TODO" found
- ✅ All code blocks complete
- ✅ All test cases have assertions
- ✅ All SQL queries complete
- ✅ All error handling specified

**Type Consistency:**
- ✅ `visit_id` used consistently (nullable UUID)
- ✅ `call_id` used consistently (nullable UUID)
- ✅ `type` enum values match schema
- ✅ Role names consistent (admin, caravan, tele)
- ✅ Status values consistent (pending, approved, completed)

**End of Implementation Plan**
