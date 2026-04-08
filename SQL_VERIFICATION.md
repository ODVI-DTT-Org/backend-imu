# SQL Verification Checklist

## Table Creation Verification

### Visits Table
- [ ] All columns have correct data types
- [ ] Foreign keys reference existing tables (clients, users)
- [ ] CHECK constraint on type column has correct values
- [ ] Default value for type is 'regular_visit'
- [ ] All indexes have correct syntax

### Calls Table
- [ ] All columns have correct data types
- [ ] Foreign keys reference existing tables (clients, users)
- [ ] phone_number is NOT NULL (required field)
- [ ] All indexes have correct syntax

### Releases Table
- [ ] All columns have correct data types
- [ ] Foreign keys reference existing tables (clients, users, visits)
- [ ] visit_id is NOT NULL and required
- [ ] CHECK constraints have correct enum values
- [ ] Default status is 'pending'
- [ ] amount is NUMERIC type (for currency)
- [ ] All indexes have correct syntax

### Touchpoints Table Update
- [ ] New columns (visit_id, call_id) are nullable
- [ ] Foreign keys reference new tables (visits, calls)
- [ ] Constraint name is unique: touchpoint_has_record
- [ ] CHECK constraint logic is correct (visit_id OR call_id must be NOT NULL)
- [ ] Indexes use WHERE clause correctly for partial indexes

## PowerSync Publication Verification
- [ ] All new tables included in publication
- [ ] No duplicate table names
- [ ] Publication name matches existing: powersync

## RBAC Verification
- [ ] Permission names follow convention: resource_action
- [ ] Constraint names match existing pattern (own, area, all)
- [ ] Role assignments use correct JOIN conditions
- [ ] ON CONFLICT clauses prevent duplicate errors

## Cross-Table Relationships Verification
- [ ] releases.visit_id → visits.id (required FK)
- [ ] touchpoints.visit_id → visits.id (optional FK)
- [ ] touchpoints.call_id → calls.id (optional FK)
- [ ] CASCADE rules are correct:
  - clients ON DELETE CASCADE → touchpoints, visits, calls, releases
  - visits ON DELETE CASCADE → releases
  - users ON DELETE SET NULL → all tables

## Digital Ocean QA Query Test Results

### Test 2.1: Insert test visit
- Status: ✓ PASSED
- Result: Successfully inserted visit with GPS and odometer data

### Test 2.2: Insert test call
- Status: ✓ PASSED
- Result: Successfully inserted call with phone number and duration

### Test 2.3: Insert test release (requires visit)
- Status: ✓ PASSED
- Result: Successfully inserted release linked to visit

### Test 2.4: Insert touchpoint with visit
- Status: ✓ PASSED
- Result: Successfully inserted touchpoint with visit_id FK

### Test 2.5: Insert touchpoint with call
- Status: ✓ PASSED
- Result: Successfully inserted touchpoint with call_id FK

### Test 2.6: Verify CHECK constraint (should fail)
- Status: ✓ PASSED
- Result: Correctly rejected touchpoint without visit_id OR call_id

### Test 2.7: Verify foreign key CASCADE (delete client)
- Status: ✓ PASSED
- Result: CASCADE deletes working (visits: 0, releases: 0, touchpoints: 0)

### Test 2.8: Verify releases.visit_id required FK
- Status: ✓ PASSED
- Result: Correctly rejected release without visit_id

### Test 2.9: Test JOIN queries (verify relationships)
- Status: ✓ PASSED
- Result: JOIN queries return correct visit/call details

### Test 2.10: Test aggregate queries (for PowerSync batch operations)
- Status: ✓ PASSED
- Result: Aggregate COUNT queries working correctly

### Test 2.11: Clean up test data
- Status: ✓ PASSED
- Result: All test data removed successfully
