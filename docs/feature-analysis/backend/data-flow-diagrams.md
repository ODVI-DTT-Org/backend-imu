# IMU Data Flow Diagrams

## 1. CARAVAN CREATING A TOUCHPOINT (Visit)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        CARAVAN TOUCHPOINT CREATION FLOW                             │
│                         (Touchpoint #1, #4, or #7 - Visit)                          │
└─────────────────────────────────────────────────────────────────────────────────────┘

MOBILE APP (Flutter)                    BACKEND (Hono/PostgreSQL)                     DATABASE
      │                                         │                                         │
      │  1. User fills touchpoint form             │                                         │
      │     - Client: Juan dela Cruz               │                                         │
      │     - Touchpoint #1                       │                                         │
      │     - Type: Visit (pre-selected)           │                                         │
      │     - Date: Today                         │                                         │
      │     - Time In: GPS capture                │                                         │
      │     - Reason: "Initial visit"              │                                         │
      │     - Status: Interested                  │                                         │
      │                                         │                                         │
      │  2. POST /api/touchpoints                 │                                         │
      │────────────────────────────────────────▶  │                                         │
      │                                         │  3. authMiddleware                          │
      │                                         │     ├─ Verify JWT token                     │
      │                                         │     ├─ Extract user.id                      │
      │                                         │     └─ Check role = 'caravan'              │
      │                                         │                                         │
      │                                         │  4. auditMiddleware('touchpoint')          │
      │                                         │     ├─ Capture request body                │
      │                                         │     ├─ Store for audit log                 │
      │                                         │     └─ Continue to handler                │
      │                                         │                                         │
      │                                         │  5. Role Validation                        │
      │                                         │     ├─ canCreateTouchpoint(                 │
      │                                         │     │   caravan, #1, Visit) = true ✓        │
      │                                         │     └─ Caravan only allowed Visit           │
      │                                         │                                         │
      │                                         │  6. Sequence Validation                    │
      │                                         │     ├─ validateTouchpointSequence(#1)       │
      │                                         │     │   Expected: Visit ✓                   │
      │                                         │     ├─ getNextTouchpointNumber(client_id)   │
      │                                         │     │   Returns: 1 ✓                        │
      │                                         │     └─ Check TP#1 doesn't exist yet         │
      │                                         │                                         │
      │                                         │  7. INSERT INTO touchpoints                │
      │                                         │     ├─ id: gen_random_uuid()               │
      │                                         │     ├─ client_id: client_id                │
      │                                         │     ├─ user_id: caravan_user_id            │
      │                                         │     ├─ touchpoint_number: 1                │
      │                                         │     ├─ type: 'Visit'                        │
      │                                         │     ├─ date: '2026-03-27'                 │
      │                                         │     ├─ time_in: '2026-03-27T08:00:00Z'     │
      │                                         │     ├─ time_in_gps_lat: 14.5995           │
      │                                         │     ├─ time_in_gps_lng: 120.9842          │
      │                                         │     ├─ reason: 'Initial visit'             │
      │                                         │     ├─ status: 'Interested'                │
      │                                         │     └─ created_at: NOW()                  │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 8. Store touchpoint
      │                                        │                                         │    record
      │                                         │                                         │
      │  9. Response: 201 Created               │                                         │
      │◀────────────────────────────────────────│                                         │
      │     {                                   │                                         │
      │       id: "uuid-123",                   │                                         │
      │       touchpoint_number: 1,             │                                         │
      │       type: "Visit",                    │                                         │
      │       status: "Interested",             │                                         │
      │       message: "Touchpoint submitted"   │                                         │
      │     }                                   │                                         │
      │                                         │  10. auditLog()                            │
      │                                         │      ├─ action: 'create'                  │
      │                                         │      ├─ entity: 'touchpoint'             │
      │                                         │      ├─ entity_id: touchpoint.id         │
      │                                         │      ├─ user_id: caravan_user.id          │
      │                                         │      ├─ newValues: { ... }                │
      │                                         │      ├─ ip_address, user_agent           │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 11. Store audit log
      │                                         │                                         │    entry
      │                                         │                                         │
      ▼                                         ▼                                         ▼

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TOUCHPOINT SEQUENCE RULES                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Touchpoint #1: Visit  ──►  Caravan ONLY  ──►  Must be first                       │
│  Touchpoint #2: Call   ──►  Tele ONLY     ──►  Requires TP#1 completed              │
│  Touchpoint #3: Call   ──►  Tele ONLY     ──►  Requires TP#2 completed              │
│  Touchpoint #4: Visit  ──►  Caravan ONLY  ──►  Requires TP#3 completed              │
│  Touchpoint #5: Call   ──►  Tele ONLY     ──►  Requires TP#4 completed              │
│  Touchpoint #6: Call   ──►  Tele ONLY     ──►  Requires TP#5 completed              │
│  Touchpoint #7: Visit  ──►  Caravan ONLY  ──►  Requires TP#6 completed              │
└─────────────────────────────────────────────────────────────────────────────────────┘

KEY VALIDATION POINTS:
  ├─ Role Check: Caravan can ONLY create Visit touchpoints
  ├─ Sequence Check: Must be next in sequence (1→2→3→4→5→6→7)
  ├─ Type Check: Type must match sequence (TP#1 = Visit, TP#2 = Call, etc.)
  ├─ Preceding Check: Call touchpoints require previous touchpoint completed
  └─ Time Check: time_out must be after time_in (if both provided)
```

---

## 2. TELE CREATING A TOUCHPOINT (Call)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          TELE TOUCHPOINT CREATION FLOW                               │
│                       (Touchpoint #2, #3, #5, or #6 - Call)                          │
└─────────────────────────────────────────────────────────────────────────────────────┘

WEB ADMIN (Vue)                       BACKEND (Hono/PostgreSQL)                     DATABASE
      │                                         │                                         │
      │  1. Tele user selects client             │                                         │
      │     - Client: Maria Santos               │                                         │
      │     - Touchpoint #2 (next in sequence)   │                                         │
      │     - Type: Call (pre-selected)           │                                         │
      │     - Date: Today                         │                                         │
      │     - Reason: "Follow-up call"            │                                         │
      │     - Status: Interested                  │                                         │
      │                                         │                                         │
      │  2. POST /api/touchpoints                 │                                         │
      │────────────────────────────────────────▶  │                                         │
      │                                         │  3. authMiddleware                          │
      │                                         │     ├─ Verify JWT token                     │
      │                                         │     ├─ Extract user.id                      │
      │                                         │     └─ Check role = 'tele'                 │
      │                                         │                                         │
      │                                         │  4. auditMiddleware('touchpoint')          │
      │                                         │     ├─ Capture request body                │
      │                                         │     ├─ Store for audit log                 │
      │                                         │     └─ Continue to handler                │
      │                                         │                                         │
      │                                         │  5. Role Validation                        │
      │                                         │     ├─ canCreateTouchpoint(                 │
      │                                         │     │   tele, #2, Call) = true ✓            │
      │                                         │     └─ Tele only allowed Call              │
      │                                         │                                         │
      │                                         │  6. Sequence Validation                    │
      │                                         │     ├─ validateTouchpointSequence(#2)       │
      │                                         │     │   Expected: Call ✓                    │
      │                                         │     ├─ getNextTouchpointNumber(client_id)   │
      │                                         │     │   Returns: 2 ✓                        │
      │                                         │     ├─ Check TP#1 exists (preceding)        │
      │                                         │     │   SELECT COUNT(*) FROM touchpoints    │
      │                                         │     │   WHERE client_id = $1 AND            │
      │                                         │     │   touchpoint_number = 1               │
      │                                         │     │   Found: 1 record ✓                   │
      │                                         │     └─ Check TP#2 doesn't exist yet         │
      │                                         │                                         │
      │                                         │  7. INSERT INTO touchpoints                │
      │                                         │     ├─ id: gen_random_uuid()               │
      │                                         │     ├─ client_id: client_id                │
      │                                         │     ├─ user_id: tele_user_id               │
      │                                         │     ├─ touchpoint_number: 2                │
      │                                         │     ├─ type: 'Call'                         │
      │                                         │     ├─ date: '2026-03-27'                 │
      │                                         │     ├─ reason: 'Follow-up call'             │
      │                                         │     ├─ status: 'Interested'                │
      │                                         │     └─ created_at: NOW()                  │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 8. Store touchpoint
      │                                        │                                         │    record
      │                                         │                                         │
      │  9. Response: 201 Created               │                                         │
      │◀────────────────────────────────────────│                                         │
      │     {                                   │                                         │
      │       id: "uuid-456",                   │                                         │
      │       touchpoint_number: 2,             │                                         │
      │       type: "Call",                     │                                         │
      │       status: "Interested",             │                                         │
      │       message: "Touchpoint submitted"   │                                         │
      │     }                                   │                                         │
      │                                         │  10. auditLog()                            │
      │                                         │      ├─ action: 'create'                  │
      │                                         │      ├─ entity: 'touchpoint'             │
      │                                         │      ├─ entity_id: touchpoint.id         │
      │                                         │      ├─ user_id: tele_user.id             │
      │                                         │      ├─ newValues: { ... }                │
      │                                         │      ├─ ip_address, user_agent           │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 11. Store audit log
      │                                         │                                         │    entry
      │                                         │                                         │
      ▼                                         ▼                                         ▼

TELE-SPECIFIC VALIDATION:
  ├─ Role Check: Tele can ONLY create Call touchpoints
  ├─ Preceding TP Check: Call touchpoints require previous touchpoint completed
  │  └─ TP#2 (Call) requires TP#1 (Visit) completed
  │  └─ TP#3 (Call) requires TP#2 (Call) completed
  │  └─ TP#5 (Call) requires TP#4 (Visit) completed
  │  └─ TP#6 (Call) requires TP#5 (Call) completed
  ├─ Cannot create Visit touchpoints (#1, #4, #7)
  └─ Sequence must be followed (can't skip)
```

---

## 3. EDITING A CLIENT (with Approval Workflow)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT EDIT WITH APPROVAL FLOW                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

WEB ADMIN (Vue)                       BACKEND (Hono/PostgreSQL)                     DATABASE
      │                                         │                                         │
      │  1. Admin/Staff edits client              │                                         │
      │     - Navigate to Client Detail           │                                         │
      │     - Click "Edit" button                 │                                         │
      │     - Modify fields:                      │                                         │
      │       * first_name: "Juan" → "Jose"       │                                         │
      │       * last_name: "Dela Cruz"            │                                         │
      │       * email: "juan@email.com"           │                                         │
      │       * phone: "+639171234567"            │                                         │
      │                                         │                                         │
      │  2. POST /api/approvals                   │                                         │
      │     {                                     │                                         │
      │       type: "client",                     │                                         │
      │       client_id: "client-uuid",           │                                         │
      │       reason: "Client Edit Request",      │                                         │
      │       notes: {                            │                                         │
      │         first_name: "Jose",               │                                         │
      │         last_name: "Dela Cruz",           │                                         │
      │         email: "juan@email.com",          │                                         │
      │         phone: "+639171234567"            │                                         │
      │       }                                    │                                         │
      │     }                                     │                                         │
      │────────────────────────────────────────▶  │                                         │
      │                                         │  3. authMiddleware                          │
      │                                         │     ├─ Verify JWT token                     │
      │                                         │     ├─ Extract user.id                      │
      │                                         │     └─ Check role = admin/staff           │
      │                                         │                                         │
      │                                         │  4. auditMiddleware('approval')           │
      │                                         │     ├─ Capture request body                │
      │                                         │     ├─ Store for audit log                 │
      │                                         │     └─ Continue to handler                │
      │                                         │                                         │
      │                                         │  5. Create Approval Record                │
      │                                         │     INSERT INTO approvals                  │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 6. Store approval
      │                                        │                                         │    record
      │                                        │                                         │    (status: pending)
      │                                         │                                         │
      │  7. Response: 201 Created               │                                         │
      │◀────────────────────────────────────────│                                         │
      │     {                                   │                                         │
      │       id: "approval-uuid",               │                                         │
      │       type: "client",                   │                                         │
      │       status: "pending",                 │                                         │
      │       message: "Approval created"        │                                         │
      │     }                                   │                                         │
      │                                         │  8. auditLog()                            │
      │                                         │      ├─ action: 'create'                  │
      │                                         │      ├─ entity: 'approval'                │
      │                                         │      ├─ entity_id: approval.id            │
      │                                         │      ├─ user_id: admin.id                 │
      │                                         │      ├─ newValues: { changes }            │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 9. Store audit log
      │                                         │                                         │
      │                                         │                                         │
      │                                         │  ╔══════════════════════════════════════════════════════════════╗
      │                                         │  ║  MANAGER REVIEWS & APPROVES                                     ║
      │                                         │  ╚══════════════════════════════════════════════════════════════╝
      │                                         │                                         │
      │  10. Manager approves                   │                                         │
      │      POST /api/approvals/{id}/approve   │                                         │
      │────────────────────────────────────────▶│                                         │
      │                                         │  11. authMiddleware + requireRole          │
      │                                         │      └─ Check role = admin/staff/manager   │
      │                                         │                                         │
      │                                         │  12. BEGIN TRANSACTION                   │
      │                                         │                                         │
      │                                         │  13. Parse notes from approval            │
      │                                         │      { first_name: "Jose", ... }          │
      │                                         │                                         │
      │                                         │  14. UPDATE clients table                 │
      │                                         │      UPDATE clients                       │
      │                                         │      SET first_name = 'Jose',            │
      │                                         │          last_name = 'Dela Cruz',        │
      │                                         │          email = 'juan@email.com',       │
      │                                         │          phone = '+639171234567'          │
      │                                         │      WHERE id = client_id                │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 15. Update client
      │                                         │                                         │    record
      │                                         │                                         │
      │                                         │  16. UPDATE approvals table               │
      │                                         │      SET status = 'approved',            │
      │                                         │          approved_by = manager.id,       │
      │                                         │          approved_at = NOW()             │
      │                                         │      WHERE id = approval_id              │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 17. Update approval
      │                                         │                                         │    record
      │                                         │                                         │
      │                                         │  18. COMMIT TRANSACTION                  │
      │                                         │                                         │
      │  19. Response: 200 OK                   │                                         │
      │◀────────────────────────────────────────│                                         │
      │      {                                   │                                         │
      │        message: "Approval approved",     │                                         │
      │        approval: { ... }                 │                                         │
      │      }                                   │                                         │
      │                                         │  20. auditLog()                           │
      │                                         │       ├─ action: 'approve'                │
      │                                         │       ├─ entity: 'approval'               │
      │                                         │       ├─ entity_id: approval.id           │
      │                                         │       ├─ user_id: manager.id              │
      │                                         │       ├─ metadata: {                      │
      │                                         │       │   client_id, original_user_id,     │
      │                                         │       │   reason, touchpoint_number        │
      │                                         │       │ }                                 │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 21. Store audit log
      │                                         │                                         │
      ▼                                         ▼                                         ▼

CLIENT EDIT APPROVAL WORKFLOW:
  1. Admin/Staff creates approval request with client changes
  2. Approval stored in approvals table (status: pending)
  3. Manager reviews and approves
  4. ON APPROVE:
     ├─ Parse changes from approval.notes
     ├─ Update clients table with new values
     ├─ Update approval status to 'approved'
     └─ Set approved_by, approved_at timestamps
  5. Both create and approve actions are audited

ALTERNATIVE: Direct Edit (Admin Only)
  - If user.role = 'admin', can bypass approval
  - PUT /api/clients/:id directly updates clients table
  - Still creates audit log with oldValues/newValues
```

---

## 4. LOAN RELEASE REQUEST

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            LOAN RELEASE REQUEST FLOW                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

MOBILE/WEB (Any User)                  BACKEND (Hono/PostgreSQL)                     DATABASE
      │                                         │                                         │
      │  1. User requests loan release             │                                         │
      │     - Navigate to Client Detail           │                                         │
      │     - Click "Release Loan" button         │                                         │
      │     - Select client: Juan dela Cruz       │                                         │
      │     - Add notes (optional)                │                                         │
      │                                         │                                         │
      │  2. POST /api/approvals/loan-release       │                                         │
      │     {                                     │                                         │
      │       client_id: "client-uuid",           │                                         │
      │       notes: "Client completed all TP"    │                                         │
      │     }                                     │                                         │
      │────────────────────────────────────────▶  │                                         │
      │                                         │  3. authMiddleware                          │
      │                                         │     ├─ Verify JWT token                     │
      │                                         │     ├─ Extract user.id, role               │
      │                                         │     └─ Check role ∈ [admin,caravan,tele]  │
      │                                         │                                         │
      │                                         │  4. auditMiddleware('approval')           │
      │                                         │     ├─ Capture request body                │
      │                                         │     ├─ Store for audit log                 │
      │                                         │     └─ Continue to handler                │
      │                                         │                                         │
      │                                         │  5. BEGIN TRANSACTION                   │
      │                                         │                                         │
      │                                         │  6. Check if loan already released         │
      │                                         │      SELECT loan_released                  │
      │                                         │      FROM clients                         │
      │                                         │      WHERE id = $1                         │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 7. Return loan status
      │                                        │                                         │
      │                                         │  8. Get existing touchpoints              │
      │                                         │      SELECT touchpoint_number             │
      │                                         │      FROM touchpoints                     │
      │                                         │      WHERE client_id = $1                 │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 9. Return existing TPs
      │                                        │                                         │
      │                                         │  10. Complete all 7 touchpoints            │
      │                                         │      For each TP #1-7:                     │
      │                                         │      IF exists:                           │
      │                                         │        UPDATE touchpoints                  │
      │                                         │        SET status = 'Completed'          │
      │                                         │      ELSE:                                 │
      │                                         │        INSERT touchpoints                  │
      │                                         │        (TP #1,4,7 = Visit)                  │
      │                                         │        (TP #2,3,5,6 = Call)               │
      │                                         │        status = 'Completed'               │
      │                                         │        reason = 'Loan released'           │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 11. Create/complete
      │                                         │                                         │    all 7 touchpoints
      │                                         │                                         │
      │                                         │  12. Mark client as loan released         │
      │                                         │       UPDATE clients                      │
      │                                         │       SET loan_released = TRUE,            │
      │                                         │           loan_released_at = NOW()         │
      │                                         │       WHERE id = $1                       │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 13. Update client
      │                                         │                                         │    record
      │                                         │                                         │
      │                                         │  14. Create UDI approval                  │
      │                                         │       INSERT INTO approvals                │
      │                                         │       (type='udi',                        │
      │                                         │        reason='Loan Release Request')     │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 15. Store approval
      │                                        │                                         │    record
      │                                        │                                         │    (status: pending)
      │                                        │                                         │
      │                                         │  16. COMMIT TRANSACTION                  │
      │                                         │                                         │
      │  17. Response: 201 Created              │                                         │
      │◀────────────────────────────────────────│                                         │
      │      {                                   │                                         │
      │        message: "Loan release submitted",│                                         │
      │        approval: {                       │                                         │
      │          id: "udi-approval-uuid",         │                                         │
      │          type: "udi",                     │                                         │
      │          status: "pending",               │                                         │
      │          client: { ... }                  │                                         │
      │        }                                  │                                         │
      │      }                                    │                                         │
      │                                         │  18. auditLog()                           │
      │                                         │       ├─ action: 'create'                  │
      │                                         │       ├─ entity: 'approval'                │
      │                                         │       ├─ entity_id: approval.id            │
      │                                         │       ├─ user_id: requester.id            │
      │                                         │       ├─ newValues: { ... }                │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 19. Store audit log
      │                                         │                                         │
      │                                         │  ╔══════════════════════════════════════════════════════════════╗
      │                                         │  ║  MANAGER REVIEWS & APPROVES UDI APPROVAL                        ║
      │                                         │  ╚══════════════════════════════════════════════════════════════╝
      │                                         │                                         │
      │  20. Manager approves UDI                │                                         │
      │      POST /api/approvals/{id}/approve   │                                         │
      │────────────────────────────────────────▶│                                         │
      │                                         │  21. Update approval status                │
      │                                         │      SET status = 'approved',            │
      │                                         │          approved_by = manager.id,       │
      │                                         │          approved_at = NOW()             │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 22. Update approval
      │                                         │                                         │    record
      │                                         │                                         │
      │  23. Response: 200 OK                   │                                         │
      │◀────────────────────────────────────────│                                         │
      │      {                                   │                                         │
      │        message: "Loan release approved"  │                                         │
      │      }                                   │                                         │
      │                                         │  24. auditLog()                           │
      │                                         │       ├─ action: 'approve'                │
      │                                         │       ├─ entity: 'approval'                │
      │                                         │       ├─ user_id: manager.id              │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 25. Store audit log
      │                                         │                                         │
      ▼                                         ▼                                         ▼

LOAN RELEASE PROCESS:
  1. Admin/Caravan/Tele initiates loan release
  2. Backend checks if loan already released
  3. Auto-completes all 7 touchpoints (creates missing ones as 'Completed')
  4. Marks client.loan_released = TRUE
  5. Creates UDI approval for manager review
  6. Manager approves UDI approval
  7. All actions audited (create, approve)

IMPORTANT NOTES:
  - Loan release can only be done ONCE per client
  - All 7 touchpoints are auto-created as 'Completed'
  - Touchpoints follow sequence: Visit→Call→Call→Visit→Call→Call→Visit
  - UDI approval required for final approval
  - Client marked with loan_released_at timestamp
```

---

## 5. ADDING A NEW CLIENT

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            NEW CLIENT CREATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

MOBILE/WEB (Any User)                  BACKEND (Hono/PostgreSQL)                     DATABASE
      │                                         │                                         │
      │  1. User fills client form                │                                         │
      │     - First Name: Pedro                  │                                         │
      │     - Last Name: Reyes                   │                                         │
      │     - Client Type: POTENTIAL             │                                         │
      │     - Product Type: Pension              │                                         │
      │     - Market Type: Urban                 │                                         │
      │     - Municipality: "Manila"             │                                         │
      │     - Barangay: "Tondo"                  │                                         │
      │     - Phone: "+639181234567"             │                                         │
      │     - Email: "pedro@email.com"           │                                         │
      │                                         │                                         │
      │  2. POST /api/clients                     │                                         │
      │────────────────────────────────────────▶  │                                         │
      │                                         │  3. authMiddleware                          │
      │                                         │     ├─ Verify JWT token                     │
      │                                         │     ├─ Extract user.id, role               │
      │                                         │     └─ Allow all authenticated users       │
      │                                         │                                         │
      │                                         │  4. auditMiddleware('client')             │
      │                                         │     ├─ Capture request body                │
      │                                         │     ├─ Store for audit log                 │
      │                                         │     └─ Continue to handler                │
      │                                         │                                         │
      │                                         │  5. Validate Input                         │
      │                                         │     ├─ createClientSchema.parse()           │
      │                                         │     ├─ Required fields:                    │
      │                                         │     │   * first_name                        │
      │                                         │     │   * last_name                         │
      │                                         │     │   * client_type                       │
      │                                         │     │   * product_type                      │
      │                                         │     │   * market_type                       │
      │                                         │     │   * municipality                      │
      │                                         │     │   * barangay                          │
      │                                         │     └─ Optional: phone, email, etc.        │
      │                                         │                                         │
      │                                         │  6. Additional Validations                │
      │                                         │     ├─ Validate municipality exists        │
      │                                         │     │   (if PSGC enabled)                  │
      │                                         │     ├─ Check for duplicate client          │
      │                                         │     │   (same name + phone)                │
      │                                         │     └─ Validate phone format               │
      │                                         │                                         │
      │                                         │  7. Insert Client                          │
      │                                         │     INSERT INTO clients                   │
      │                                         │     (                                     │
      │                                         │       id: gen_random_uuid(),              │
      │                                         │       first_name: 'Pedro',                │
      │                                         │       last_name: 'Reyes',                 │
      │                                         │       client_type: 'POTENTIAL',           │
      │                                         │       product_type: 'Pension',            │
      │                                         │       market_type: 'Urban',               │
      │                                         │       municipality: 'Manila',            │
      │                                         │       barangay: 'Tondo',                 │
      │                                         │       phone: '+639181234567',             │
      │                                         │       email: 'pedro@email.com',           │
      │                                         │       created_at: NOW(),                 │
      │                                         │       updated_at: NOW()                  │
      │                                         │     )                                     │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 8. Store client
      │                                        │                                         │    record
      │                                        │                                         │
      │  9. Response: 201 Created               │                                         │
      │◀────────────────────────────────────────│                                         │
      │     {                                   │                                         │
      │       id: "client-uuid",                 │                                         │
      │       first_name: "Pedro",               │                                         │
      │       last_name: "Reyes",                │                                         │
      │       client_type: "POTENTIAL",           │                                         │
      │       status: "ACTIVE",                  │                                         │
      │       created: "2026-03-27T08:00:00Z",   │                                         │
      │       message: "Client created"          │                                         │
      │     }                                   │                                         │
      │                                         │  10. auditLog()                            │
      │                                         │       ├─ action: 'create'                  │
      │                                         │       ├─ entity: 'client'                 │
      │                                         │       ├─ entity_id: client.id              │
      │                                         │       ├─ user_id: creator.id               │
      │                                         │       ├─ newValues: { all client data }   │
      │                                         │       ├─ ip_address, user_agent           │
      │                                         │─────────────────────────────────────────▶ │
      │                                         │                                         │ 11. Store audit log
      │                                         │                                         │
      ▼                                         ▼                                         ▼

CLIENT CREATION VALIDATIONS:
  ├─ All authenticated users can create clients
  ├─ Required fields validated via Zod schema
  ├─ Municipality validated against PSGC (if enabled)
  ├─ Phone number format validation
  ├─ Email format validation (if provided)
  └─ Duplicate detection (same name + phone combination)

CLIENT STATUS VALUES:
  - POTENTIAL: New client, not yet converted
  - EXISTING: Already has existing product
  - ACTIVE: Currently being worked with
  - INACTIVE: No longer active

AUDIT TRAIL:
  - Every client creation is logged
  - Includes all field values in newValues
  - Tracks who created the client
  - Records IP address and user agent
  - Timestamp stored in created_at
```

---

## 6. DATA FLOW SUMMARY

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              COMMON PATTERNS                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

REQUEST FLOW (All Operations):
  1. Client sends request → 2. authMiddleware → 3. auditMiddleware → 4. Route Handler → 5. Database → 6. Response → 7. Audit Log

AUTHENTICATION & AUTHORIZATION:
  ├─ authMiddleware: Verifies JWT token, extracts user info
  ├─ requireRole: Checks if user has required role
  └─ Role-based access control enforced at each endpoint

AUDIT TRAIL (All Operations):
  ├─ Entity: What was affected (user, client, touchpoint, etc.)
  ├─ Action: What happened (create, update, delete, approve)
  ├─ Entity ID: ID of the affected record
  ├─ User ID: Who performed the action
  ├─ Old Values: Before state (for updates)
  ├─ New Values: After state (for creates/updates)
  ├─ IP Address: Client IP
  ├─ User Agent: Client browser/app
  └─ Timestamp: When it happened

DATABASE TRANSACTIONS:
  ├─ Multiple operations wrapped in BEGIN/COMMIT
  ├─ Rollback on error
  └─ Atomic updates for related records

VALIDATION LAYERS:
  1. Schema Validation (Zod)
  2. Business Logic Validation
  3. Role-Based Validation
  4. Sequence Validation (touchpoints)
  5. Reference Validation (foreign keys)
```

---

## 7. QUICK REFERENCE

```
ENDPOINT SUMMARY:

Touchpoints:
  POST   /api/touchpoints              Create touchpoint (Caravan=Visit, Tele=Call)
  GET    /api/touchpoints              List touchpoints (filtered by role)
  GET    /api/touchpoints/:id          Get single touchpoint
  PUT    /api/touchpoints/:id          Update touchpoint
  DELETE /api/touchpoints/:id          Delete touchpoint

Clients:
  POST   /api/clients                  Create client (all authenticated users)
  GET    /api/clients                  List clients
  GET    /api/clients/:id              Get single client
  PUT    /api/clients/:id              Update client (direct edit, admin only)
  DELETE /api/clients/:id              Delete client (admin only)

Approvals:
  POST   /api/approvals                Create approval request
  POST   /api/approvals/:id/approve   Approve request
  POST   /api/approvals/:id/reject    Reject request
  POST   /api/approvals/loan-release  Submit loan release
  GET    /api/approvals                List approvals

Audit Logs:
  GET    /api/audit-logs               View audit trail (admin/staff only)
  GET    /api/audit-logs/:id          Get single audit log

ROLE PERMISSIONS:
  admin:      Full access to all operations
  staff:      Can create approvals, view all data
  caravan:    Create Visit touchpoints (#1, #4, #7), manage own clients
  tele:       Create Call touchpoints (#2, #3, #5, #6), view all clients
  field_agent: View/edit own data only
```

---

Generated: 2026-03-27
IMU System - Data Flow Documentation
