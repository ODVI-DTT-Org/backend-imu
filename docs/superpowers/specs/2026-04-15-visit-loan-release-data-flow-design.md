# Visit Record Only & Loan Release Data Flow Design

**Date:** 2026-04-15
**Status:** Approved for Implementation
**Author:** Claude Code (Brainstorming Session)

---

## Executive Summary

This document outlines the approved design changes to critical data flows in the IMU system:

1. **Visit Record Only**: Redesigned to use `visits` table instead of creating fake touchpoints
2. **Loan Release**: Two-path design - Admin direct release vs Caravan field visit with approval
3. **Add Address/Phone**: Role-based approval flow for Caravan/Tele, direct insert for Admin
4. **Touchpoint Creation**: Unchanged - continues to use touchpoints + visits + itineraries

**Design Decision Summary:**
- Clean separation: `touchpoints` = 7-step sales process, `visits` = actual visit records, `itineraries` = scheduled visits
- Admin bypass: Admin users can directly insert without approval (address, phone, loan release)
- Caravan/Tele approval: Field agents require approval for client data changes and loan releases
- No more fake touchpoint records (#0 or #7)

---

## Background

### Current Implementation Problems

**Visit Record Only:**
- Currently creates a touchpoint with `touchpoint_number=0` (hacky workaround)
- Touchpoints table is meant for the 7-step sales process, not general visits
- Confuses the "completed touchpoints" count on client cards

**Loan Release:**
- Currently creates Touchpoint #7 (Visit type) with status "Completed"
- This is semantically incorrect - loan release is not the same as completing the sales process
- Creates confusion in reporting and analytics

**Add Address/Phone:**
- Currently bypasses approval system for Caravan/Tele users
- Client data changes should require admin oversight

### Business Requirements

**User Requirements (as stated):**
1. "visit record only should not create touchpoint, but a visit record only"
2. "loan release should be different for admin vs caravan"
3. "add address and add phone should require approval for caravan/tele"

**Approval Rules:**
- **Loan Release (Caravan)**: Requires admin approval, creates visit record
- **Loan Release (Admin)**: No approval required, direct release processing
- **Add Address/Phone (Caravan/Tele)**: Requires admin approval
- **Add Address/Phone (Admin)**: No approval required, direct insert
- **Visit Record Only**: No approval required
- **Touchpoint Creation**: No approval required

---

## Database Schema Overview

Based on `COMPLETE_SCHEMA.sql`, the relevant tables are:

### Key Tables

**itineraries** - Scheduled/planned visits
```sql
CREATE TABLE itineraries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  client_id UUID REFERENCES clients(id),
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed'
  priority TEXT DEFAULT 'normal',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**visits** - Actual completed visits
```sql
CREATE TABLE visits (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'regular_visit'
    CHECK (type IN ('regular_visit', 'release_loan')),
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  odometer_arrival TEXT,
  odometer_departure TEXT,
  photo_url TEXT,
  notes TEXT,
  reason TEXT,
  status TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**releases** - Loan release records
```sql
CREATE TABLE releases (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL
    CHECK (product_type IN ('PUSU', 'LIKA', 'SUB2K')),
  loan_type TEXT NOT NULL
    CHECK (loan_type IN ('NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM')),
  amount NUMERIC NOT NULL,
  approval_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**approvals** - Approval workflow storage
```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  user_id UUID REFERENCES users(id),
  role TEXT,
  reason TEXT,
  notes JSONB,
  status TEXT DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**addresses** - Client addresses
```sql
CREATE TABLE addresses (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  street TEXT,
  barangay TEXT,
  city_municipality TEXT,
  province TEXT,
  postal_code TEXT,
  psgc_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**phone_numbers** - Client phone numbers
```sql
CREATE TABLE phone_numbers (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  type TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**touchpoints** - Sales process tracking (unchanged)
```sql
CREATE TABLE touchpoints (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  touchpoint_number INTEGER NOT NULL
    CHECK (touchpoint_number BETWEEN 1 AND 7),
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('Interested', 'Undecided', 'Not Interested', 'Completed')),
  date DATE NOT NULL,
  -- ... other fields
);
```

**clients** - Client records
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY,
  -- ... other fields
  loan_released BOOLEAN DEFAULT FALSE,
  loan_released_at TIMESTAMPTZ,
  -- ... other fields
);
```

---

## Approved Design Changes

### Change 1: Visit Record Only (Visits Table Approach)

**Current Behavior:**
```
POST /api/my-day/clients/:id/visit
→ Creates touchpoint with touchpoint_number=0 (HACK)
→ Creates/updates itinerary record
```

**New Behavior:**
```
POST /api/my-day/clients/:id/visit
→ CREATE visits record (type='regular_visit')
→ UPDATE itineraries (status='completed')
→ NO touchpoint creation
```

**Rationale:**
- Clean separation: touchpoints = 7-step sales process, visits = actual visit records
- Eliminates the `touchpoint_number=0` hack
- Better reflects the actual business activity (general visit vs sales touchpoint)

### Change 2: Loan Release (Two-Path Approach)

**Path A: Admin Direct Release (NEW)**
```
POST /api/approvals/loan-release-v2 (Admin)
→ CREATE releases record (visit_id=NULL)
→ UPDATE clients (loan_released=TRUE)
→ NO approval, NO visit, NO itinerary update
```

**Path B: Caravan Field Visit with Approval (UPDATED)**
```
POST /api/approvals/loan-release-v2 (Caravan)
→ CREATE visits record (type='release_loan')
→ UPDATE itineraries (status='in_progress')
→ CREATE approval request (status='pending')

On Admin Approval:
→ CREATE releases record (visit_id=<visit_id>)
→ UPDATE clients (loan_released=TRUE)
→ UPDATE itineraries (status='completed')
```

**Rationale:**
- Admin: Direct release processing (backend office, not at client location)
- Caravan: Field visit requires approval (at client location, needs authorization)
- No more fake Touchpoint #7 creation
- Proper audit trail via visits + releases tables

### Change 3: Add Address/Phone (Role-Based Approval)

**Current Behavior:**
```
POST /api/clients/:id/addresses or /phones
→ Direct insert for all users
→ NO approval workflow
```

**New Behavior:**
```
POST /api/clients/:id/addresses or /phones

IF user.role == 'admin':
  → Direct insert (no approval)

IF user.role == 'caravan' OR user.role == 'tele':
  → CREATE approval request (status='pending')

  On Admin Approval:
    → CREATE address/phone record
```

**Rationale:**
- Admin bypass: Trusted users can directly update client data
- Caravan/Tele approval: Field agent changes require admin oversight
- Maintains data integrity while allowing flexibility

---

## Architecture Changes

### 1. Backend API Changes

#### 1.1 Visit Record Only Endpoint

**File:** `backend/src/routes/my-day.ts`

**Current Implementation:**
```typescript
myDay.post('/clients/:id/visit', authMiddleware, async (c) => {
  // Currently creates touchpoint with touchpoint_number=0
  await client.query(`
    INSERT INTO touchpoints (
      id, client_id, user_id, touchpoint_number, type, reason, status, date
    ) VALUES (
      gen_random_uuid(), $1, $2, 0, 'Visit', 'Visit Only', 'Completed', CURRENT_DATE
    )
  `, [clientId, userId]);

  // Creates/updates itinerary
  await client.query(`INSERT INTO itineraries ...`);
});
```

**New Implementation:**
```typescript
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

    // UPDATE itineraries
    await client.query(`
      UPDATE itineraries
      SET status = 'completed', updated_at = NOW()
      WHERE client_id = $1
        AND scheduled_date = CURRENT_DATE
        AND user_id = $2
    `, [clientId, user.sub]);

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

**Key Changes:**
- Removed touchpoint creation entirely
- Added visits record creation (type='regular_visit')
- Updated itineraries status to 'completed'

#### 1.2 Loan Release Endpoint (Two Paths)

**File:** `backend/src/routes/approvals.ts`

**Path A: Admin Direct Release (NEW)**
```typescript
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

      // CREATE releases record (no visit_id)
      await client.query(`
        INSERT INTO releases (
          id, client_id, user_id, visit_id, product_type, loan_type,
          amount, approval_notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, NULL, $3, $4, $5, $6, 'approved'
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

  // Caravan/Tele: Requires approval (see Path B below)
  // ...
});
```

**Path B: Caravan/Tele Approval Flow (UPDATED)**
```typescript
// Inside the same endpoint, after admin check:
else {
  // Caravan/Tele: Create visit + approval request
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
          // ... other fields
        })]);

    await dbClient.query('COMMIT');

    return c.json({
      message: 'Loan release submitted for approval',
      approval_id: approvalResult.rows[0].id,
      status: 'pending'
    }), 201;
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}
```

**Approval Handler (UPDATED):**
```typescript
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
      const visitId = notes.visit_id;

      // CREATE releases record (references visit_id)
      await client.query(`
        INSERT INTO releases (
          id, client_id, user_id, visit_id, product_type, loan_type,
          amount, approval_notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'approved'
        )
      `, [approval.client_id, approval.user_id, visitId,
          notes.product_type, notes.loan_type, notes.amount,
          'Approved by admin']);

      // UPDATE clients
      await client.query(`
        UPDATE clients
        SET loan_released = TRUE, loan_released_at = NOW()
        WHERE id = $1
      `, [approval.client_id]);

      // UPDATE itineraries (now completed)
      await client.query(`
        UPDATE itineraries
        SET status = 'completed', updated_at = NOW()
        WHERE client_id = $1
          AND scheduled_date = CURRENT_DATE
          AND user_id = $2
      `, [approval.client_id, approval.user_id]);
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

#### 1.3 Add Address Endpoint (Role-Based)

**File:** `backend/src/routes/clients.ts`

**New Implementation:**
```typescript
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

#### 1.4 Add Phone Endpoint (Role-Based)

**File:** `backend/src/routes/clients.ts`

**New Implementation:**
```typescript
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

---

## Data Flow Diagrams

### Flow 1: Visit Record Only

```
┌─────────────────────────────────────────────────────────────────┐
│  FIELD AGENT records a visit                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/my-day/clients/:id/visit
        { time_in, time_out, latitude, longitude, address, photo_url, notes }
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND:                                                       │
│  1. CREATE visits (type='regular_visit')                       │
│  2. UPDATE itineraries (status='completed')                     │
│  3. ❌ NO touchpoint creation                                   │
│  4. ❌ NO approval needed                                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE:                                                      │
│  visits: NEW record (regular_visit) ✅                          │
│  itineraries: status='completed' ✅                             │
│  touchpoints: NO CHANGES ✅                                     │
│  approvals: NO CHANGES ✅                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Touchpoint Record (UNCHANGED)

```
┌─────────────────────────────────────────────────────────────────┐
│  FIELD AGENT creates touchpoint                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/touchpoints
        { touchpoint_number, type, reason, status, ... }
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND:                                                       │
│  1. CREATE touchpoints (number 1-7)                            │
│  2. CREATE visits (type='regular_visit')                       │
│  3. UPDATE itineraries (status='completed')                     │
│  4. ❌ NO approval needed                                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE:                                                      │
│  touchpoints: NEW record (1-7) ✅                              │
│  visits: NEW record (regular_visit) ✅                         │
│  itineraries: status='completed' ✅                             │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3A: Loan Release (Admin - Direct)

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN submits loan release                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/approvals/loan-release-v2
        Authorization: Bearer <admin_jwt_token>
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND:                                                       │
│  1. CREATE releases (visit_id=NULL)                            │
│  2. UPDATE clients (loan_released=TRUE)                         │
│  3. ❌ NO approval needed (admin bypass)                        │
│  4. ❌ NO visit created                                         │
│  5. ❌ NO itinerary update                                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE:                                                      │
│  releases: NEW record (visit_id=NULL) ✅                        │
│  clients: loan_released=TRUE ✅                                 │
│  visits: NO CHANGES ✅                                          │
│  itineraries: NO CHANGES ✅                                     │
│  approvals: NO CHANGES ✅                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3B: Loan Release (Caravan - With Approval)

```
┌─────────────────────────────────────────────────────────────────┐
│  CARAVAN submits loan release at client location                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/approvals/loan-release-v2
        Authorization: Bearer <caravan_jwt_token>
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Submit):                                              │
│  1. CREATE visits (type='release_loan')                        │
│  2. UPDATE itineraries (status='in_progress')                   │
│  3. CREATE approvals (status='pending')                         │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Pending):                                            │
│  visits: NEW record (release_loan) ✅                          │
│  itineraries: status='in_progress' ⏳                          │
│  approvals: status='pending' ⏳                                 │
│  clients: loan_released=FALSE (unchanged)                      │
│  releases: (empty)                                             │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN APPROVES                                                 │
│  POST /api/approvals/:id/approve                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Approve):                                             │
│  1. UPDATE approvals (status='approved')                        │
│  2. CREATE releases (visit_id=<visit_id>)                      │
│  3. UPDATE clients (loan_released=TRUE)                         │
│  4. UPDATE itineraries (status='completed')                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Approved):                                           │
│  releases: NEW record (visit_id=<visit_id>) ✅                 │
│  clients: loan_released=TRUE ✅                                 │
│  approvals: status='approved' ✅                                │
│  visits: (already created) ✅                                  │
│  itineraries: status='completed' ✅                             │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 4A: Add Address (Caravan/Tele - Approval)

```
┌─────────────────────────────────────────────────────────────────┐
│  FIELD AGENT adds address                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/clients/:id/addresses
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Submit):                                              │
│  1. CREATE approvals (type='address_add', status='pending')     │
│  2. ❌ NO address record yet                                   │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Pending):                                            │
│  approvals: NEW record (pending) ⏳                             │
│  addresses: NO CHANGES (awaiting approval)                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN APPROVES                                                 │
│  POST /api/approvals/:id/approve                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Approve):                                             │
│  1. UPDATE approvals (status='approved')                        │
│  2. CREATE addresses                                           │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Approved):                                           │
│  addresses: NEW record ✅                                       │
│  approvals: status='approved' ✅                                │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 4B: Add Address (Admin - Direct)

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN adds address                                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/clients/:id/addresses
        Authorization: Bearer <admin_jwt_token>
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND:                                                       │
│  1. CREATE addresses                                           │
│  2. ❌ NO approval needed (admin bypass)                        │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE:                                                      │
│  addresses: NEW record ✅                                       │
│  approvals: NO CHANGES ✅                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 5A: Add Phone (Caravan/Tele - Approval)

```
┌─────────────────────────────────────────────────────────────────┐
│  FIELD AGENT adds phone number                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/clients/:id/phones
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Submit):                                              │
│  1. CREATE approvals (type='phone_add', status='pending')       │
│  2. ❌ NO phone record yet                                     │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Pending):                                            │
│  approvals: NEW record (pending) ⏳                             │
│  phone_numbers: NO CHANGES (awaiting approval)                  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN APPROVES                                                 │
│  POST /api/approvals/:id/approve                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Approve):                                             │
│  1. UPDATE approvals (status='approved')                        │
│  2. CREATE phone_numbers                                       │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Approved):                                           │
│  phone_numbers: NEW record ✅                                  │
│  approvals: status='approved' ✅                                │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 5B: Add Phone (Admin - Direct)

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN adds phone number                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        POST /api/clients/:id/phones
        Authorization: Bearer <admin_jwt_token>
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND:                                                       │
│  1. CREATE phone_numbers                                       │
│  2. ❌ NO approval needed (admin bypass)                        │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE:                                                      │
│  phone_numbers: NEW record ✅                                  │
│  approvals: NO CHANGES ✅                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Plan

### Phase 1: No Database Schema Changes Required

**Note:** The `visits`, `releases`, `itineraries`, `approvals`, `addresses`, and `phone_numbers` tables already exist in `COMPLETE_SCHEMA.sql`. No schema migration is needed.

**Data Migration (One-time cleanup):**

**Migration File:** `backend/src/migrations/048_cleanup_legacy_touchpoints.sql`

```sql
-- ============================================================
-- Migration 048: Clean Up Legacy Touchpoint Records
-- ============================================================

-- Migrate existing touchpoint_number=0 records to visits
-- This converts old "Visit Only" touchpoints to proper visit records

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

-- Log migration results
DO $$
DECLARE
  migrated_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM visits
  WHERE type = 'regular_visit'
    AND created_at <= NOW();  -- Approximate check

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Migration 048 completed: Visits created, Touchpoint #0 records deleted.';
END $$;
```

**Rollback Script:**
```sql
-- Rollback Migration 048 (Emergency only)

-- Note: This rollback is for emergency use only
-- In production, manually verify data before rolling back

-- If rollback needed, you would need to:
-- 1. Manually recreate touchpoint #0 records from visits
-- 2. Delete the created visits records
-- 3. Update itineraries back to previous status

-- This is intentionally complex to prevent accidental rollbacks
```

### Phase 2: Backend API Updates

**Order of Operations:**
1. Deploy data migration (Phase 1)
2. Update visit record endpoint (`my-day.ts`)
3. Update loan release endpoint (`approvals.ts`) - Two-path implementation
4. Update add address endpoint (`clients.ts`) - Role-based approval
5. Update add phone endpoint (`clients.ts`) - Role-based approval
6. Update approval handler (`approvals.ts`) - Support for all approval types
7. Run integration tests
8. Deploy to staging

### Phase 3: Testing & Verification

**Integration Tests:**
- Test visit record only creates visit + updates itinerary, no touchpoint
- Test loan release (admin) creates release directly, no visit/approval
- Test loan release (caravan) creates visit + approval, on approval creates release
- Test add address (admin) direct insert
- Test add address (caravan) creates approval, on approval creates address
- Test add phone (admin) direct insert
- Test add phone (caravan) creates approval, on approval creates phone
- Test rollback scenarios

**Manual Testing Checklist:**
1. **Visit Record Only:**
   - [ ] Create visit from mobile app
   - [ ] Verify visits record created with type='regular_visit'
   - [ ] Verify itinerary marked completed
   - [ ] Verify NO touchpoint created

2. **Loan Release (Admin):**
   - [ ] Submit loan release as admin
   - [ ] Verify releases record created (visit_id=NULL)
   - [ ] Verify client marked loan_released=TRUE
   - [ ] Verify NO visit created
   - [ ] Verify NO approval created

3. **Loan Release (Caravan):**
   - [ ] Submit loan release as caravan
   - [ ] Verify visits record created (type='release_loan')
   - [ ] Verify itinerary status='in_progress'
   - [ ] Verify approval created (status='pending')
   - [ ] Approve as admin
   - [ ] Verify releases record created (visit_id populated)
   - [ ] Verify client marked loan_released=TRUE
   - [ ] Verify itinerary status='completed'
   - [ ] Verify NO touchpoint created

4. **Add Address (Admin):**
   - [ ] Add address as admin
   - [ ] Verify address created immediately
   - [ ] Verify NO approval created

5. **Add Address (Caravan):**
   - [ ] Add address as caravan
   - [ ] Verify approval created (status='pending')
   - [ ] Verify NO address created yet
   - [ ] Approve as admin
   - [ ] Verify address created

6. **Add Phone (Admin):**
   - [ ] Add phone as admin
   - [ ] Verify phone created immediately
   - [ ] Verify NO approval created

7. **Add Phone (Caravan):**
   - [ ] Add phone as caravan
   - [ ] Verify approval created (status='pending')
   - [ ] Verify NO phone created yet
   - [ ] Approve as admin
   - [ ] Verify phone created

---

## API Contract Examples

### Visit Record Only

**Request:**
```http
POST /api/my-day/clients/123e4567-e89b-12d3-a456-426614174000/visit
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "time_in": "2026-04-15T09:30:00Z",
  "time_out": "2026-04-15T09:45:00Z",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "Manila, Philippines",
  "photo_url": "https://s3.amazonaws.com/bucket/photo.jpg",
  "notes": "Client not available"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Visit recorded successfully",
  "visit_id": "987fcdeb-51a2-43f1-a456-426614174000"
}
```

### Loan Release (Admin - Direct)

**Request:**
```http
POST /api/approvals/loan-release-v2
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "udi_number": "UDI-2026-001234",
  "product_type": "PUSU",
  "loan_type": "NEW",
  "amount": 50000,
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "Manila, Philippines",
  "photo_url": "https://s3.amazonaws.com/bucket/photo.jpg",
  "remarks": "Admin direct release"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Loan release processed successfully",
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "loan_released": true,
  "loan_released_at": "2026-04-15T10:00:00Z"
}
```

### Loan Release (Caravan - With Approval)

**Request (Submit):**
```http
POST /api/approvals/loan-release-v2
Authorization: Bearer <caravan_jwt_token>
Content-Type: application/json

{
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "udi_number": "UDI-2026-001234",
  "product_type": "PUSU",
  "loan_type": "NEW",
  "amount": 50000,
  "time_in": "2026-04-15T10:00:00Z",
  "time_out": "2026-04-15T10:30:00Z",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "Manila, Philippines",
  "photo_url": "https://s3.amazonaws.com/bucket/photo.jpg",
  "remarks": "Client signed documents"
}
```

**Response (Pending):**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "message": "Loan release submitted for approval",
  "approval_id": "456e7890-e89b-12d3-a456-426614174000",
  "status": "pending"
}
```

**Request (Approve):**
```http
POST /api/approvals/456e7890-e89b-12d3-a456-426614174000/approve
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "notes": "Approved - all documents verified"
}
```

**Response (Approved):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Approval processed successfully"
}
```

### Add Address (Caravan - With Approval)

**Request (Submit):**
```http
POST /api/clients/123e4567-e89b-12d3-a456-426614174000/addresses
Authorization: Bearer <caravan_jwt_token>
Content-Type: application/json

{
  "type": "home",
  "street": "123 New Street",
  "barangay": "Barangay 123",
  "city_municipality": "Manila",
  "province": "Metro Manila",
  "postal_code": "1000",
  "psgc_id": "psgc-12345"
}
```

**Response (Pending):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Address addition submitted for approval",
  "requires_approval": true
}
```

**Response (Admin - Direct):**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "78901234-e89b-12d3-a456-426614174000",
  "client_id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "home",
  "street": "456 Admin Street",
  "barangay": "Barangay 456",
  "city_municipality": "Quezon City",
  "province": "Metro Manila",
  "postal_code": "1100",
  "psgc_id": "psgc-67890",
  "created_at": "2026-04-15T10:00:00Z"
}
```

---

## Summary Table: All Data Flows

| Feature | Who Submits | Approval? | Creates Visit? | Creates Release? | Creates Touchpoint? |
|---------|-------------|-----------|----------------|------------------|-------------------|
| **Visit Record Only** | Caravan/Tele | ❌ No | ✅ Yes (regular_visit) | ❌ No | ❌ No |
| **Touchpoint Record** | Caravan/Tele | ❌ No | ✅ Yes (regular_visit) | ❌ No | ✅ Yes (1-7) |
| **Loan Release** | Admin | ❌ No | ❌ No | ✅ Yes (direct) | ❌ No |
| **Loan Release** | Caravan | ✅ Yes | ✅ Yes (release_loan) | ✅ Yes (after approval) | ❌ No |
| **Add Address** | Admin | ❌ No | ❌ No | N/A | ❌ No |
| **Add Address** | Caravan/Tele | ✅ Yes | ❌ No | N/A | ❌ No |
| **Add Phone** | Admin | ❌ No | ❌ No | N/A | ❌ No |
| **Add Phone** | Caravan/Tele | ✅ Yes | ❌ No | N/A | ❌ No |

---

## Sign-Off

**Design Approved By:** User (via "yes, correct!")
**Date:** 2026-04-15
**Next Step:** Invoke writing-plans skill to create implementation plan

---

**End of Design Document**
