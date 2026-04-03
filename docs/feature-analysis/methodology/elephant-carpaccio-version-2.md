# Elephant Carpaccio v2.0 - Enhanced Slicing Methodology

## What is Elephant Carpaccio?

**Elephant Carpaccio** is a software development technique that breaks large projects into **thin, vertical slices** - like slicing an elephant razor-thin. Each slice is:
- **Implementable** in under 1 day (ideally 2-4 hours)
- **Demonstrable** - produces visible, working output
- **Valuable** - delivers more value than the previous slice
- **Vertical** - cuts through ALL layers (UI → API → Data)

The methodology was popularized by Alistair Cockburn and is the foundation of iterative, incremental development.

---

## v2.0 Enhancements

This version 2.0 builds on the original with additional techniques learned from real-world application:

### New Slicing Techniques

1. **Zero-One-Many**: Start with empty states, then exactly one item/hardcoded case, then collections
2. **Hardcoded to Dynamic**: Begin with static/hardcoded logic before moving to dynamic Maps/Objects
3. **ZOMBIES (Happy Path First)**: Implement "Simple" and "Interface" logic before "Boundary" or "Exceptions"
4. **Input/Data Slicing**: Increment complexity by data inputs. Don't work with the whole schema if not yet needed
5. **Walking Skeleton to Meat to Skin**: Connect the data flow first (Skeleton), then the business rules (Meat), then the UI polish (Skin)
6. **Operation Slicing (CRUD)**: Implement one action at a time (Create, then Read, then Update, then Delete)

### v2.0 Additions

7. **Test-First Slice**: Write the test for the slice before implementing
8. **Permission Slicing**: Implement open access first, then add role restrictions
9. **Error Slicing**: Implement happy path first, then add error handling
10. **Performance Slicing**: Make it work, then make it fast
11. **Internationalization Slicing**: Hardcode strings first, then extract to i18n

---

## Slice Validation Rules

Every slice MUST satisfy:

1. **Time Box**: Implementable in under 1 day (ideally 2-4 hours)
2. **Observable**: Noticeably different from the last slice (demonstrable change)
3. **Valuable**: More valuable to the user than the last slice
4. **Complete**: NOT just UI mockup, data structure, or test only
5. **Vertical**: Cuts through ALL layers (UI → API → Data)
6. **Reversible**: Can be rolled back without breaking the system
7. **Testable**: Can be verified that it works

---

## The Slicing Protocol

### Phase 1: Deconstruction (Planning)

```
1. Start with the full feature/epic
2. Identify the smallest vertical slice possible
3. Ask: "What is the LEAST I can build that STILL provides value?"
4. Continue slicing until each piece meets validation rules
5. Order slices by value delivery (highest value first)
```

### Phase 2: Execution (Implementation)

```
For each slice:
  1. Write acceptance criteria (GIVEN-WHEN-THEN format)
  2. Create test (if doing TDD)
  3. Implement the slice
  4. Verify it works
  5. Demo to stakeholder
  6. Get feedback
  7. Adjust next slices if needed
```

### Sublices (When There Is a Bug in a Slice)

When a **bug** is found in a slice that was already marked complete (or in progress), treat the fix as a **sublice** of that slice. Do not reopen the whole slice; keep the fix small and trackable.

**Instructions:**

1. **Identify the slice** where the bug occurs and treat the fix as a sublice of that slice (e.g. *Slice 3 – User Search: sublice 3a – Fix search when query is empty*).

2. **Define the sublice** with a short description and acceptance criteria (e.g. *GIVEN the user clears the search box, WHEN they submit, THEN the list shows all users again*).

3. **Implement the fix** as a single, vertical change (UI → API → data as needed). Keep it within the same time box (ideally under a few hours).

4. **Re-verify the slice** after the fix: run existing tests and a quick smoke check so the original slice behavior is still correct.

5. **Track sublices** in your progress overview or backlog (e.g. "Slice 3 ✅ + 3a ✅" or a separate row "3a: Fix empty search") so bugs don’t get lost and progress stays visible.

6. **Avoid turning a sublice into a new feature**—if the fix grows beyond a small, focused change, split it into a new slice and re-estimate.

---

## Progress Overview

When applying this methodology to a feature or project, track slice completion in one place. Update the bars and counts as each slice is implemented and demoed.

**Example** (based on the User Management feature below):

```
Phase 1: Skeleton & List    [████████████████████████] 100%  2/2 slices ✅
Phase 2: Search & Detail    [████████████████████████] 100%  2/2 slices ✅
Phase 3: Create & Edit      [████████████████████████] 100%  2/2 slices ✅
Phase 4: Deactivate & Auth [████████████████████████] 100%  2/2 slices ✅
Phase 5: Pagination & Export [██████████████████████░░]  50%  1/2 slices 📊

TOTAL: 9/10 slices complete (90%)
```

### Legend

| Status       | Symbol   | Description                    |
|-------------|----------|--------------------------------|
| Complete    | `✅`     | Slice implemented and verified |
| In progress | `📊`     | Currently being worked on      |
| Not started | `[░░░░]` | Not yet started                |

### Blockers & Issues

| ID | Slice | Issue | Raised By | Date | Status |
|----|-------|-------|-----------|------|--------|
| - | - | No active blockers | - | - | - |

### Decision Log

| ID | Decision | Impact | Date | Made By |
|----|----------|--------|------|---------|
| - | - | - | - | - |

---

## Slice Patterns (Template Library)

### Pattern 1: The Walking Skeleton
**Purpose**: Prove the architecture works
**Time**: 30 minutes - 1 hour
**Example**: Hello World that connects to all layers

```
Acceptance Criteria:
- [ ] System starts without errors
- [ ] Can make a request through all layers
- [ ] Response returns from backend
- [ ] Database connection verified
```

### Pattern 2: The First Real Data
**Purpose**: Get real data flowing
**Time**: 1-2 hours
**Example**: First collection with one hardcoded record

```
Acceptance Criteria:
- [ ] Database table/collection exists
- [ ] Can create one record via API/admin
- [ ] Record displays in UI
- [ ] Fields are correctly mapped
```

### Pattern 3: Permissioned Access
**Purpose**: Add security to a working feature
**Time**: 1 hour
**Example**: Add role-based access to existing page

```
Acceptance Criteria:
- [ ] Unauthenticated users redirected to login
- [ ] Unauthorized users see access denied
- [ ] Authorized users can access
- [ ] Permission check is server-side
```

### Pattern 4: CRUD Operations
**Purpose**: Build full data operations
**Break into 4 slices**:
1. Create (POST) - 2 hours
2. Read/List (GET) - 2 hours
3. Update (PUT/PATCH) - 2 hours
4. Delete (DELETE) - 1 hour

### Pattern 5: Cascading Complexity
**Purpose**: Handle dependent data
**Example**: Location dropdowns (Region → Province → Municipality)

```
Slice 1: Region dropdown (hardcoded options)
Slice 2: Region dropdown (from database)
Slice 3: Province dropdown (filtered by selected region)
Slice 4: Municipality dropdown (filtered by selected province)
Slice 5: Validation (all required)
```

### Pattern 6: Search and Filter
**Purpose**: Add data discovery
**Break into**:
1. Simple search (single field, contains) - 1 hour
2. Multiple field search (OR logic) - 1 hour
3. Advanced filters (AND/OR logic) - 2 hours
4. Saved searches - 2 hours

### Pattern 7: Form Validation
**Purpose**: Ensure data quality
**Break into**:
1. Required field validation (client-side) - 30 minutes
2. Required field validation (server-side) - 1 hour
3. Format validation (email, phone, etc.) - 1 hour
4. Business rule validation - 2 hours
5. Custom validation messages - 1 hour

---

## Common Anti-Patterns (What NOT to Do)

### Horizontal Slicing (Bad)
```
Phase 1: Build all database tables
Phase 2: Build all API endpoints
Phase 3: Build all UI components
```
**Why it fails**: No working software until Phase 3 completes

### Big Bang Release (Bad)
```
Build everything, then release all at once
```
**Why it fails**: Huge risk, delayed feedback, late discovery of issues

### Mock-First Development (Risky)
```
Build UI with mock data, then connect to real API later
```
**Why it fails**: Mock data often doesn't match real data structure, late integration pain

### Infrastructure-First (Risky)
```
Build all infrastructure, pipelines, monitoring before any feature
```
**Why it fails**: Delayed value delivery, over-engineering before understanding needs

---

## Slice Estimation Guidelines

| Complexity | Description | Example Time |
|------------|-------------|--------------|
| Trivial | Copy-paste, config change | 15-30 min |
| Simple | Existing pattern, minor variation | 1-2 hours |
| Moderate | New pattern, some complexity | 2-4 hours |
| Complex | Multiple integrations, unknowns | 4-8 hours |
| Too Big | Requires further slicing | Slice it down! |

**If a slice is estimated > 1 day, slice it further.**

---

## Example: Complete Feature Breakdown

### Feature: User Management

```
Slice 1: Walking Skeleton (30 min)
- Users table exists
- Can create user via admin UI
- User displays in list

Slice 2: User List Page (2 hours)
- Page at /users
- Shows table of users
- Columns: Name, Email, Role, Status
- Empty state handling

Slice 3: User Search (1 hour)
- Search input filters by name
- Real-time as you type

Slice 4: User Detail Page (1.5 hours)
- Click user → see details
- All fields displayed
- Back button returns to list

Slice 5: Create User Form (2 hours)
- Form with all required fields
- Validation on submit
- Success/error messages

Slice 6: Edit User Form (1.5 hours)
- Pre-filled with existing data
- Same validation as create
- Updates user record

Slice 7: User Deactivation (1 hour)
- Deactivate button on detail
- Sets status to inactive
- User cannot log in

Slice 8: Role-Based Access (1 hour)
- Only admin can access user pages
- Permission check on server
- Redirect if unauthorized

Slice 9: User Pagination (1 hour)
- 20 users per page
- Prev/Next buttons

Slice 10: User Export (1.5 hours)
- Export to CSV button
- Downloads user list
```

**Total: ~15 hours, 10 demonstrable milestones**

---

## Integration with Development Practices

### Pair Programming with Carpaccio
- One person drives, one navigates
- Switch after each slice
- Review each slice before moving on

### Test-Driven Development with Carpaccio
1. Write test for slice (failing)
2. Write code to pass test
3. Refactor
4. Move to next slice

### Code Review with Carpaccio
- Review slices, not sprints
- Smaller PRs = faster reviews
- Easier to identify issues

### CI/CD with Carpaccio
- Each slice merges to main
- Continuous deployment to staging
- Production releases when feature complete

---

## Metrics and Tracking

### Track These Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Slice Duration | < 4 hours | Maintain momentum |
| Slice Success Rate | > 95% | Quality slices |
| Demo Frequency | After each slice | Continuous feedback |
| Stakeholder Feedback | < 24h response | Fast iteration |
| Slice Completeness | 100% vertical | No partial slices |

### Anti-Metrics (Warning Signs)

- Number of slices completed alone (not validated)
- Lines of code per slice (gaming the system)
- Speed of completion (at expense of quality)

---

## Decision Tree: Is This a Good Slice?

```
START
  │
  ├─ Can this be deployed independently?
  │   ├─ NO → Slice further
  │   └─ YES → Continue
  │
  ├─ Does this deliver user value?
  │   ├─ NO → Reconsider scope
  │   └─ YES → Continue
  │
  ├─ Can this be completed in < 1 day?
  │   ├─ NO → Slice further
  │   └─ YES → Continue
  │
  ├─ Does this cut through ALL layers?
  │   ├─ NO → Make it vertical
  │   └─ YES → Continue
  │
  └─ GOOD SLICE! Implement it.
```

---

## Quick Reference: Slice Naming Convention

Use this format for clarity:
```
Slice #[number]: [Feature] - [Action/Component]
```

Examples:
- `Slice #1: Users - Database Collection`
- `Slice #2: Users - List Page`
- `Slice #3: Users - Create Form`
- `Slice #4: Users - Permission Check`

---

## Version 2.0 Summary

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Core Principle | Thin vertical slices | Same + 5 new techniques |
| Validation Rules | 5 rules | 7 rules (added reversibility, testability) |
| Patterns | 6 basic patterns | 7 patterns + anti-patterns |
| Estimation | Time-based | Complexity-based |
| Integration | Not specified | Pairing, TDD, CI/CD guides |

---

## Further Reading

- Original Elephant Carpaccio: Alistair Cockburn
- Vertical Slicing: Martin Fowler
- Feature Slicing: Gojko Adzic
- Iterative Development: Kent Beck

---

*Elephant Carpaccio v2.0 - Enhanced methodology for incremental, value-driven development*
