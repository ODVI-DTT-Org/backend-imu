# Client Action & Form UX Improvements Design

**Date:** 2025-03-27
**Project:** IMU (Itinerary Manager - Uniformed)
**Scope:** Mobile app client interaction model and form UX improvements
**Status:** ✅ **APPROVED** (Review #3) + Backend Aligned

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-03-27 | 1.0 | Initial design |
| 2025-03-27 | 1.1 | Updated per spec review #1: Tap→Action menu, removed double-tap, added GPS error handling, real-time validation, Touchpoint Status migration, offline-first handling |
| 2025-03-27 | 1.2 | Updated per spec review #2: Added email validation, time input spec, action sheet dismiss behavior, multi-select Record Visit workflow, Release Loan action section, distinguished Add vs Edit client validation |
| 2025-03-27 | 1.3 | Added UDI Number field to Release Loan action (required, alphanumeric, 1-50 chars) |
| 2025-03-27 | 1.4 | Aligned Release Loan with web/tele: Submit for approval workflow, updated backend API, updated web app with UDI input |

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Issues](#current-issues)
3. [New Interaction Model](#new-interaction-model)
4. [Client Card Interactions](#client-card-interactions)
5. [Action Bottom Sheet](#action-bottom-sheet)
6. [Client Detail View](#client-detail-view)
7. [Touchpoint Form](#touchpoint-form)
8. [Add/Edit Client Form](#addedit-client-form)
9. [Multi-Select Mode](#multi-select-mode)
10. [Swipe Actions](#swipe-actions)
11. [Form Validation](#form-validation)
12. [GPS Error States](#gps-error-states)
13. [Offline-First Handling](#offline-first-handling)
14. [Loading & Feedback](#loading--feedback)
15. [Filtering Fixes](#filtering-fixes)
16. [Implementation Notes](#implementation-notes)
17. [Success Criteria](#success-criteria)

---

## Problem Statement

Field agents using the My Day and Itinerary tabs face UX issues with client interactions and forms:

1. **Clarity/Confusion** - Users don't know what options mean or what to do next
2. **Efficiency** - Too many taps/steps to complete common tasks
3. **Visual Hierarchy** - Can't tell what's important or what actions are available
4. **Form Issues** - Too many fields, unclear sections, oversized elements, confusing labels

All three actions (Record Visit, Release Loan, Edit Client) are used with equal frequency, requiring equal access.

---

## Current Issues

### Dialog Friction
- Current dialog adds extra tap for every action
- Generic "What would you like to do?" message
- No visual hierarchy or icons
- Text-only buttons

### Form Issues
- Touchpoint Form: Too many fields visible at once
- Add/Edit Client: Overwhelming single page
- Unclear required vs optional fields
- Oversized input fields
- No clear sections or organization
- No inline validation

---

## New Interaction Model

### Core Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Show Action Menu | Tap | Bottom sheet with 5 options (including View Client Details) |
| Multi-Select Mode | Long-press | Toolbar at top with bulk actions |
| Quick Record Visit | Swipe Right | Opens Touchpoint Form directly |
| Quick Remove | Swipe Left | Confirms and removes from list |

### Design Principles

1. **Equal Access** - All actions equally accessible (equal frequency)
2. **Progressive Disclosure** - Show options on demand, not always visible
3. **Clear Affordances** - Visual indicators for available actions
4. **Compact & Touch-Friendly** - 44px minimum touch targets, efficient space use
5. **Immediate Feedback** - Haptic, visual, and status updates

---

## Client Card Interactions

### Card Design

```
┌──────────────────────────────────────────────────┐
│  [📍]  Maria Garcia                    [⋯]     │
│        123 Main St, Manila                      │
│        1st Visit • Pending                       │
└──────────────────────────────────────────────────┘
```

### Interaction Matrix

| Gesture | Action | Visual Feedback |
|---------|--------|-----------------|
| Tap | Show Action Menu | Haptic: Light impact |
| Long-press | Enter Multi-Select | Haptic: Medium impact, blue border + background |
| Swipe Right | Quick Record Visit | Green background, "Record Visit" label |
| Swipe Left | Quick Remove | Red background, "Remove" label |

---

## Action Bottom Sheet

### Trigger: Tap on client card

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │ ← Handle
├─────────────────────────────────────────────────────────┤
│  Maria Garcia                                           │
│  What would you like to do?                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  📍  Record Visit                                  │  │
│  │     Log touchpoint with GPS & photo capture        │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  💰  Release Loan                                  │  │
│  │     Mark loan as released for this client         │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  ✏️  Edit Client                                   │  │
│  │     Update client information                     │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  👁️  View Client Details                          │  │
│  │     See full profile and touchpoint history        │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  🗑️  Remove from List                              │  │
│  │     Remove this client from today's itinerary      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Specs
- Full-width touch targets (min 44px height)
- Large icons (32px) for recognition
- Bold action labels
- Descriptive subtitles in lighter color
- Divider lines between options
- 5 total options (equal access to all actions)

### Dismiss Behavior
**How to close without selecting an action:**
1. **Swipe down** on the sheet handle - Closes the bottom sheet
2. **Tap outside** the sheet (on the dark scrim) - Closes the bottom sheet
3. **Press back button** - Closes the bottom sheet

No cancel button needed - use standard Material bottom sheet dismiss patterns.

---

## Client Detail View

### Trigger: Select "View Client Details" from Action menu (tap on card)

### Bottom Sheet Layout

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Maria Garcia                    [✏️ Edit] [✕ Close]    │
│  Existing Client • SSS Pensioner                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📍 LOCATION                                            │
│  123 Main Street, Manila                                 │
│  Metro Manila, NCR                                      │
│  [Open in Maps]                                         │
│                                                          │
│  📞 CONTACT                                              │
│  +63 912 345 6789                                        │
│  maria.garcia@email.com                                  │
│                                                          │
│  💼 PRODUCT INFO                                         │
│  Product: SSS Pension Loan                               │
│  Pension Type: SSS                                       │
│  Market: Residential                                     │
│                                                          │
│  ✓ LOAN STATUS                                          │
│  Loan: NOT RELEASED                                      │
│                                                          │
│  📍 TOUCHPOINT HISTORY                                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 1st Visit  •  Mar 25 • Interested             │    │
│  │ 2nd Call   •  Mar 26 • Interested             │    │
│  │ 3rd Call   •  Mar 27 • Undecided               │    │
│  │ 4th Visit  •  (Next)                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         [📍 Record Visit]  [💰 Release Loan]    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Sections
1. **Header** - Client name, type, Edit/Close buttons
2. **Location** - Address with Maps link
3. **Contact** - Phone, email
4. **Product Info** - Product type, pension, market
5. **Loan Status** - Current loan state
6. **Touchpoint History** - Timeline of past visits
7. **Quick Actions** - Record Visit, Release Loan buttons

---

## Release Loan Action

### When to Use
Release Loan action is available from:
- Action menu (5th option after View Client Details)
- Client Detail View quick actions
- NOT available in multi-select mode (requires individual confirmation)

### Approval Workflow
**IMPORTANT:** Release Loan submits for approval (same as web/tele app)
- Does NOT immediately release the loan
- Creates a UDI approval request
- Loan is marked as released but requires approval
- All 7 touchpoints are auto-completed
- Manager/Admin must approve the UDI number

### Release Loan Dialog

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Release Loan                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│          [💰]                                            │
│                                                          │
│  Submit loan release request for Maria Garcia?           │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ UDI Number *:                                   │    │
│  │ ┌─────────────────────────────────────────────┐ │    │
│  │ │ Enter UDI number...                         │ │    │
│  │ └─────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  This will submit a request for approval. The loan       │
│  will be marked as released and all touchpoints          │
│  will be completed. A manager must approve the UDI.      │
│                                                          │
│  ⚠️ This action requires approval and cannot be undone.  │
│                                                          │
│  Client: Maria Garcia                                    │
│  Product: SSS Pension Loan                               │
│  Request Date: March 27, 2026                            │
│                                                          │
│                      [Cancel]  [Submit Request]         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Data Captured
- **Client ID** - From context (no user input)
- **UDI Number** - User input (required field)
- **Request Date** - Automatically set to today's date
- **Requested By** - Current user ID (from session)

### Validation
- **UDI Number is REQUIRED** - Cannot submit without UDI number
- UDI Number can be alphanumeric (letters and numbers)
- Minimum length: 1 character
- Maximum length: 50 characters
- Confirmation dialog prevents accidental submissions

### Post-Release Behavior
1. Show success toast: "Loan release submitted for approval (UDI: XXXXX)"
2. Submit to backend API: `POST /api/approvals/loan-release`
3. Backend automatically:
   - Marks all 7 touchpoints as complete
   - Sets `loan_released = TRUE` and `loan_released_at = NOW()`
   - Creates UDI approval with the UDI number
   - Status: "pending" approval
4. Remove client from itinerary/my day list (filter: released loans)
5. Haptic feedback: Success pattern
6. Sync immediately if online, queue if offline

### Error Handling
- If UDI Number is empty: Show error "UDI Number is required", block submission
- If UDI Number exceeds 50 characters: Show error, block submission
- If API call fails: Show error dialog with "Retry" and "Cancel" buttons
- If offline: Queue action with UDI number, show "QUEUED" badge on client
- Preserve release intent and UDI number until successful sync

### Release Loan Confirmation (Alternative)

If additional verification is needed:

```
┌─────────────────────────────────────────────────────────┐
│  Confirm Release Loan Request                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ UDI Number *:                                   │    │
│  │ ┌─────────────────────────────────────────────┐ │    │
│  │ │ Enter UDI number...                         │ │    │
│  │ └─────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Before submitting, please verify:                       │
│                                                          │
│  ☐ Client has received loan amount                      │
│  ☐ Client has signed release documents                  │
│  ☐ All requirements met                                  │
│                                                          │
│  [I confirm all requirements are met]                    │
│                                                          │
│                      [Cancel]  [Submit Request]         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Note:** This additional verification is optional - use simple confirmation dialog unless business requirements mandate document verification. UDI Number is required in both dialog versions. Both submit for approval (not immediate release).

---

## Touchpoint Form

### Collapsible Sections Design

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Record Visit • 1st • Maria Garcia    [✕]             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ▼ TIME & LOCATION                           [▼] │    │
│  ├─────────────────────────────────────────────────┤    │
│  │███████████████████████████████████████████████  │    │
│  │  Time In:    [10:30 AM]  [📍 GPS]  ✓ Captured *│    │
│  │███████████████████████████████████████████████  │    │
│  │  Time Out:   [11:15 AM]  [📍 GPS]  ✓ Captured *│    │
│  │                                                  │    │
│  │███████████████████████████████████████████████  │    │
│  │  Address:    123 Main St, Manila               *│    │
│  │███████████████████████████████████████████████  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ▼ VISIT DETAILS                             [▼] │    │
│  ├─────────────────────────────────────────────────┤    │
│  │  Touchpoint Status *                          │    │
│  │    [🟢 Interested] [🟡 Undecided] [🔴 Not]    │    │
│  │    [🔵 Completed]                              │    │
│  │                                                  │    │
│  │  Visit Reason *:                               │    │
│  │    [Interested ▼]                              │    │
│  │                                                  │    │
│  │███████████████████████████████████████████████  │    │
│  │  Remarks *:                                    │    │
│  │  ┌─────────────────────────────────────────┐   │    │
│  │  │ Enter visit remarks...                 │   │    │
│  │  │                                       │   │    │
│  │  │                                       │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  │  █                             0/254              │    │
│  │███████████████████████████████████████████████  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ▼ ADDITIONAL INFO                           [▴] │    │
│  ├─────────────────────────────────────────────────┤    │
│  │  Odometer Arrival:  [_______] km                │    │
│  │  Odometer Departure: [_______] km                │    │
│  │  Next Visit Date:   [Select Date]               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ▼ PHOTO                                    [▴] │    │
│  ├─────────────────────────────────────────────────┤    │
│  │  [📷 Take Photo]                               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  * Required fields                                     │
│              [SAVE TOUCHPOINT]                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Improvements
- **Collapsible sections** - Only 2 expanded by default
- **Required field indicators** - Red border (████) + asterisk (*)
- **Inline validation** - Error messages below fields
- **Character counter** - For Remarks field (0/254, min 10)
- **Compact inputs** - 44px height (touch-friendly but not oversized)
- **Clear sections** - Time & Location, Visit Details, Additional, Photo

### Time Input Component

**Time Selection:**
- Use Material Design `showTimePicker` dialog
- 12-hour format with AM/PM selector
- Default to current time
- Visual picker with hour/minute scroll wheels
- Required field (cannot be empty)

**Time Capture Flow:**
1. Tap time field → Opens time picker dialog
2. User scrolls to select hour and minute
3. Tap "OK" to confirm or "Cancel" to dismiss
4. Selected time displays in field: "10:30 AM"
5. GPS capture happens automatically after time is set

### Touchpoint Status Field
**NEW FIELD** - Requires database migration:

```sql
-- Migration to add touchpoint_status field
ALTER TABLE touchpoints ADD COLUMN touchpoint_status VARCHAR(20) DEFAULT 'Interested';

-- Valid values: 'Interested', 'Undecided', 'Not Interested', 'Completed'
```

This field replaces the former interest level tracking and is now part of the core touchpoint data model.

### Removed
- Audio recording feature (removed as unnecessary - not needed for workflow)

---

## Add/Edit Client Form

### 3-Step Stepped Form

#### Step 1: Personal Information (1/3)

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Add Client                              1/3        [✕]│
│                                                          │
│  Personal Information                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  First *              Middle            Last *         │
│  ┌────────────┐     ┌────────────┐    ┌────────────┐ │
│  │ Maria      │     │             │    │ Garcia     │ │
│  └────────────┘     └────────────┘    └────────────┘ │
│  Height: 44px ✓      Height: 44px ✓     Height: 44px ✓│
│                                                          │
│  Birth *                                        Phone *   │
│  ┌──────────────────┐     ┌──────────────────────┐    │
│  │ [Select Date ▼]  │     │ +63 912 345 6789    │    │
│  └──────────────────┘     └──────────────────────┘    │
│  Height: 44px ✓                           Height: 44px ✓│
│                                                          │
│  Email *                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ maria.garcia@email.com                            │   │
│  └──────────────────────────────────────────────────┘   │
│  Height: 44px ✓                                          │
│                                                          │
│                      [Cancel]  [Next →]               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Step 2: Client Type & Product (2/3)

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Edit Client                             2/3  [< Back]│
│                                                          │
│  Client Type & Product                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Client Type *                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ ● Potential        ○ Existing                 │          │
│  └────────────────────────────────────────────┘          │
│  Height: 48px ✓                                          │
│                                                          │
│  Product * & Pension Type                               │
│  ┌────────────────────────────────────────────┐          │
│  │ ● SSS Pensioner  ○ GSIS  ○ Private              │          │
│  └────────────────────────────────────────────┘          │
│  Height: 48px ✓                                          │
│                                                          │
│  Market Type *:                                          │
│  ┌────────────────────────────────────────────┐          │
│  │ ● Res.     ○ Comm.     ○ Ind.                    │          │
│  └────────────────────────────────────────────┘          │
│  Height: 48px ✓                                          │
│                                                          │
│                      [< Back]  [Next →]               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Step 3: Address & Details (3/3)

```
┌─────────────────────────────────────────────────────────┐
│  ::::::::::                                         ::  │
├─────────────────────────────────────────────────────────┤
│  Edit Client                             3/3  [< Back]│
│                                                          │
│  Address & Employment                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Region *           Province *         Municipality *   │
│  ┌─────────────┐    ┌─────────────┐     ┌────────────┐ │
│  │ NCR ▼       │    │ Metro Mla ▼ │     │ Manila ▼   │ │
│  └─────────────┘    └─────────────┘     └────────────┘ │
│  H: 44px ✓          H: 44px ✓            H: 44px ✓      │
│                                                          │
│  Street Address *                                        │
│  ┌──────────────────────────────────────────────┐        │
│  │ 123 Main Street...                             │        │
│  └──────────────────────────────────────────────┘        │
│  Height: 44px ✓                                           │
│                                                          │
│  Agency Name              Remarks                        │
│  ┌──────────────────┐     ┌──────────────────────┐    │
│  │ [Enter agency]    │     │ [Optional notes]     │    │
│  └──────────────────┘     └──────────────────────┘    │
│  Height: 44px ✓              Height: 44px ✓               │
│                                                          │
│                      [< Back]  [Save Client]          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Improvements
- **3 steps** - Break overwhelming form into focused sections
- **Progress indicator** - "1/3", "2/3", "3/3" in header
- **Side-by-side fields** - Efficient space usage
- **Compact inputs** - 44px height (touch-friendly)
- **Combined Product/Pension** - Simplified selection
- **Removed Barangay** - As requested

### Step Validation (Add New Client Only)

**When Adding New Client:**
- Step validation blocks Next until current step is valid
- Required fields must be filled before proceeding
- Data preserved across steps (no data loss on back/next)
- Abandon warning if user navigates away with unsaved changes

**When Editing Existing Client:**
- NO step validation - can proceed with empty/partial data
- All Next buttons enabled regardless of field values
- Can skip steps or leave fields empty
- Save button always enabled

### Abandon Warning

Shows when user tries to navigate away with unsaved changes:

```
┌─────────────────────────────────────────────────────────┐
│  Discard Changes?                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  You have unsaved changes to this client.               │
│  Do you want to discard these changes?                  │
│                                                          │
                      [Keep Editing]  [Discard]          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Multi-Select Mode

### Trigger: Long-press on client card

### Active State

```
┌─────────────────────────────────────────────────────────┐
│ ← Done    Selected: 3    [📍 Record] [🗑️ Delete]      │ ← Toolbar
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ╔═══════════════════════════════════════════════════╗  │
│  ║███ Maria Garcia                    [⋯]           ║  │ ← Selected
│  ║███ 123 Main St, Manila                              ║  │
│  ║███ 1st Visit • Pending                              ║  │
│  ╚═══════════════════════════════════════════════════╝  │
│  Blue border + Light blue background                     │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [📍]  Juan Dela Cruz                 [⋯]       │  │
│  │        456 Oak St, Quezon City                     │  │
│  │        2nd Call • Interested                        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ╔═══════════════════════════════════════════════════╗  │
│  ║███ Jose Ramos                     [⋯]           ║  │
│  ║███ 789 Pine Ave, Makati                            ║  │
│  ║███ 3rd Call • Undecided                             ║  │
│  ╚═══════════════════════════════════════════════════╝  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Multi-Select Actions

**2 Action Buttons:**

**Record Visit** - Sequential touchpoint recording for all selected
- Opens Touchpoint Form for first selected client
- After submission, automatically opens form for next client
- Shows progress: "Recording touchpoint 2 of 3..."
- Each touchpoint gets its own GPS capture, photo, and remarks
- Completes when all clients have been recorded
- Haptic feedback: Light impact between each client
- Can cancel after any client (remaining clients stay selected)

**Delete** - Bulk remove from list
- Shows confirmation dialog: "Remove 3 clients from today's itinerary?"
- Confirms and removes all selected clients from list
- Haptic feedback: Heavy impact on confirmation

### Exiting Multi-Select
- Tap "Done" button
- Tap on empty space (areas outside client cards)
- Press back button

**Note:** "Tap on empty space" means tapping on any area of the screen that is not a client card, including the background, header area, or bottom padding areas.

### Visual Feedback
- **Haptic**: Medium impact on entry
- **Border**: 2px blue (#3B82F6)
- **Background**: Light blue (#EFF6FF)
- **Progress**: "Recording... 2/3 complete"

---

## Swipe Actions

### Swipe Right (Record Visit)

```
┌─────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────┐  │
│  │  [📍]  Maria Garcia                    [⋯]       │  │
│  │        123 Main St, Manila                         │  │
│  │        1st Visit • Pending                         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ← SWIPE RIGHT FOR RECORD VISIT →                      │
│                                                          │
│  [📍] Record Visit                                     │
│  Green background (#4CAF50)                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Swipe Left (Remove)

```
┌─────────────────────────────────────────────────────────┐
│  REMOVE FROM LIST  →  SWIPE LEFT                       │
│  Red background (#EF4444)                                │
│                                                          │
│  [🗑️] Remove                                           │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [📍]  Maria Garcia                    [⋯]       │  │
│  │        123 Main St, Manila                         │  │
│  │        1st Visit • Pending                         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Form Validation

### Real-Time Validation

**When to Validate:**
- **On field change** - Validate immediately as user types (for text fields)
- **On field blur** - Validate when user leaves a field
- **On selection change** - Validate immediately when dropdown/radio selection changes
- **Before form submission** - Final validation check

**Error Display:**
- Show error message below the field in red text
- Add red border to the field
- Disable submit button until all errors are resolved
- Show error count: "⚠️ Please fix 2 errors before saving"

### Inline Error Display

```
┌─────────────────────────────────────────────────────────┐
│  Time In:    [10:30 AM]  [📍 GPS]  ✓ Captured *    │
│  Time Out:   [____:____ AM]  [📍 GPS]  ✗ *        │
│                 └──────────────────────────────┘        │
│                 ⚠️ Time Out required                  │
│                                                          │
│  Remarks *:                                            │
│  ┌─────────────────────────────────────────┐           │
│  │ Enter visit remarks...                 │           │
│  └─────────────────────────────────────────┘           │
│  █                             0/254  (min 10)     │
│                └──────────────────────────────┘           │
│                ⚠️ Minimum 10 characters required    │
│                                                          │
│  ⚠️ Please fix 2 errors before saving                    │
│              [SAVE TOUCHPOINT] (disabled)               │
└─────────────────────────────────────────────────────────┘
```

### Validation Rules

**Touchpoint Form:**
- Time In: Required
- Time Out: Required
- Address: Required
- Touchpoint Status: Required
- Visit Reason: Required
- Remarks: Required, min 10 characters, max 254

**Client Form - Add New Client:**
- First Name: Required
- Last Name: Required
- Phone: Required, numeric format validation
- Email: Required, basic email format validation (must contain @ and domain)
- Birth Date: Required
- Region: Required
- Province: Required
- Municipality: Required
- Street Address: Required

**Client Form - Edit Existing Client:**
- **NO REQUIRED FIELDS** - Can save with empty or partial data
- Users can clear any field or make partial updates
- This allows flexibility when correcting client information
- No validation errors when editing

---

## GPS Error States

### Error Handling

When GPS capture fails or is unavailable, the form MUST block submission until resolved:

### GPS Unavailable

```
┌─────────────────────────────────────────────────────────┐
│  Time In:    [10:30 AM]  [📍 GPS]  ✗ Error *          │
│  Time Out:   [____:____ AM]  [📍 GPS]  ⚠️ Required *   │
│                 └──────────────────────────────┘        │
│                 ⚠️ GPS unavailable. Enable location     │
│                    services and try again.              │
│                                                          │
│  [📍 Enable GPS]                                        │
│                                                          │
│              [SAVE TOUCHPOINT] (disabled)               │
└─────────────────────────────────────────────────────────┘
```

### GPS Permission Denied

```
┌─────────────────────────────────────────────────────────┐
│  Time In:    [10:30 AM]  [📍 GPS]  ⚠️ Permission *     │
│  Time Out:   [____:____ AM]  [📍 GPS]  ✗ Blocked *     │
│                 └──────────────────────────────┘        │
│                 ⚠️ Location permission denied.           │
│                    Open settings to grant permission.    │
│                                                          │
│  [⚙️ Open Settings]                                      │
│                                                          │
│              [SAVE TOUCHPOINT] (disabled)               │
└─────────────────────────────────────────────────────────┘
```

### GPS Timeout

```
┌─────────────────────────────────────────────────────────┐
│  Time In:    [10:30 AM]  [📍 GPS]  ⏱️ Timeout *        │
│  Time Out:   [____:____ AM]  [📍 GPS]  ⚠️ Required *    │
│                 └──────────────────────────────┘        │
│                 ⚠️ GPS signal timeout. Try again.       │
│                                                          │
│  [🔄 Retry GPS]                                         │
│                                                          │
│              [SAVE TOUCHPOINT] (disabled)               │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Submit button remains disabled until GPS is successfully captured
- User can manually retry GPS capture
- Clear error messages guide user to resolution
- Haptic feedback: Medium impact on error, Success on GPS capture

---

## Offline-First Handling

### Queue Behavior

When offline, all actions are queued and synced when connection is restored:

### Queued Action Display

```
┌─────────────────────────────────────────────────────────┐
│  [📍]  Maria Garcia                    [⋯]       [QUEUED]│
│        123 Main St, Manila                              │
│        1st Visit • Pending                              │
└─────────────────────────────────────────────────────────┘
```

### Sync Indicator

```
┌─────────────────────────────────────────────────────────┐
│  🔄 3 actions queued. Syncing when connection available.│
│  [Sync Now]                                             │
└─────────────────────────────────────────────────────────┘
```

**Queue States:**
- **QUEUED** - Action waiting for connection
- **SYNCING** - Currently uploading
- **FAILED** - Sync failed (retry available)
- **SYNCED** - Successfully synced

**Sync Behavior:**
- Auto-sync when connection restored
- Manual sync available via "Sync Now" button
- Show progress: "Syncing... 2/3 complete"
- Error handling: Retry failed actions
- Conflict resolution: Last-write-wins

**Offline Actions Supported:**
- Record Visit
- Release Loan
- Edit Client
- Remove from List
- Multi-select bulk actions

---

## Loading & Feedback

### Loading State

```
┌─────────────────────────────────────────────────────────┐
│                    ═══════════════                      │
│                      ║  LOADING  ║                      │
│                      ║  PLEASE  ║                      │
│                      ║   WAIT   ║                      │
│                    ═══════════════                      │
│  Saving touchpoint...                                  │
└─────────────────────────────────────────────────────────┘
```

### Success Toast

```
┌─────────────────────────────────────────────────────────┐
│                    ┌─────────┐                          │
│                    │    ✓    │  Touchpoint saved!      │
│                    └─────────┘                          │
│  Maria Garcia • 1st Visit recorded                     │
└─────────────────────────────────────────────────────────┘
Auto-dismiss after 2 seconds
```

### Error State

```
┌─────────────────────────────────────────────────────────┐
│                    ┌─────────┐                          │
│                    │    ⚠    │  Failed to save          │
│                    └─────────┘                          │
│  Network error. Please try again.                       │
│                      [Retry]    [Dismiss]               │
└─────────────────────────────────────────────────────────┘
```

### Haptic Feedback

| Action | Feedback |
|--------|----------|
| Tap | Light impact |
| Long-press | Medium impact |
| Selection | Light impact |
| Delete/Error | Heavy impact |
| Success | Success pattern |

---

## Filtering Fixes

### 📌 POST-IMPLEMENTATION REMINDER

Two filtering issues need to be fixed after implementing actions:

1. **After Record Visit**
   - Remove client from itinerary/my day list
   - Filter: Clients with completed touchpoint for today

2. **After Release Loan**
   - Remove client from list if `release_loan` = true AND `release_loan_date` is set
   - Filter: Clients without released loans

---

## Implementation Notes

### Components to Modify

1. **Client Card Widget** (`client_card.dart`)
   - Add gesture detectors for tap, long-press, swipe
   - Remove double-tap gesture detector
   - Add visual states for selected mode

2. **My Day Page** (`my_day_page.dart`)
   - Replace current dialog with bottom sheet
   - Add multi-select toolbar
   - Add swipe action handlers
   - Update tap handler to show Action menu (not client details)

3. **Itinerary Page** (`itinerary_page.dart`)
   - Same changes as My Day Page

4. **Touchpoint Form** (`touchpoint_form.dart`)
   - Add collapsible sections
   - Add required field styling (red border)
   - Add real-time inline validation (on change/blur)
   - Add GPS error handling with block submission
   - Add Touchpoint Status field
   - Remove audio recording

5. **Client Form** (`edit_client_page.dart`)
   - Convert to 3-step form
   - Add progress indicator
   - Add step validation for Add New Client (block Next until valid)
   - NO step validation for Edit Existing Client (allow empty/partial data)
   - Add data preservation across steps
   - Add abandon warning if changes not saved
   - Compact field sizing
   - Distinguish between Add mode and Edit mode validation

### New Components to Create

1. **Action Bottom Sheet** - 5 options with icons and descriptions, swipe/tap-to-dismiss
2. **Client Detail Bottom Sheet** - Full profile + history (accessible from Action menu)
3. **Multi-Select Toolbar** - Top bar with count and actions
4. **Collapsible Section Widget** - Reusable form section
5. **GPS Error Handler** - GPS capture with error states and retry
6. **Offline Queue Manager** - Queue actions when offline, sync when online
7. **Release Loan Dialog** - Confirmation dialog with client info and release date
8. **Time Picker Dialog** - Material Design time picker for Time In/Out fields

### Database Migrations Required

**Touchpoint Status Field:**

```sql
-- Migration: Add touchpoint_status to touchpoints table
ALTER TABLE touchpoints ADD COLUMN touchpoint_status VARCHAR(20) DEFAULT 'Interested';

-- Add check constraint for valid values
ALTER TABLE touchpoints ADD CONSTRAINT check_touchpoint_status
  CHECK (touchpoint_status IN ('Interested', 'Undecided', 'Not Interested', 'Completed'));

-- Update existing records (set default for existing touchpoints)
UPDATE touchpoints SET touchpoint_status = 'Interested' WHERE touchpoint_status IS NULL;
```

**Migration Notes:**
- Run migration before deploying app updates
- Default value ensures backward compatibility
- Check constraint prevents invalid values
- Index on touchpoint_status for filtering queries

### Validation Requirements

**Real-Time Validation:**
- Implement `onChanged` callbacks for text fields
- Implement `onBlur` validation for all fields
- Show inline error messages immediately
- Disable submit button until all valid
- Error count display at bottom

**GPS Error Handling:**
- Check GPS availability before allowing capture
- Handle permission denied state
- Handle timeout (30 second limit)
- Block form submission if GPS not captured
- Provide "Enable GPS" / "Open Settings" / "Retry" buttons

**Offline-First Queue:**
- Queue all create/update/delete operations
- Store queued operations locally (Hive/SQLite)
- Show "QUEUED" badge on affected items
- Auto-sync when connection restored
- Manual sync button in UI
- Conflict resolution: last-write-wins

**Release Loan Action:**
- UDI Number required (alphanumeric, 1-50 characters)
- Submit to `POST /api/approvals/loan-release`
- Backend handles: mark touchpoints complete, set loan_released, create UDI approval
- Status: "pending" until manager approves
- Remove from itinerary list after submission
- Queue action if offline, sync when online

### Touch Target Specifications

| Element | Minimum Size |
|--------|---------------|
| Buttons | 44x44px |
| Touch targets | 48x48px (primary) |
| Input fields | 44px height |
| List items | 48px height |

### Color Palette

| Purpose | Color |
|---------|-------|
| Primary dark | #0F172A |
| Blue | #3B82F6 |
| Green (success) | #4CAF50 |
| Red (error/delete) | #EF4444 |
| Selected border | #3B82F6 |
| Selected background | #EFF6FF |
| Required border | #EF4444 |

---

## Success Criteria

- [ ] All gestures work (tap, long-press, swipe)
- [ ] Tap shows Action menu with 5 options
- [ ] Multi-select mode with visual feedback
- [ ] Action bottom sheet with 5 options (including View Client Details)
- [ ] Client detail view accessible from Action menu
- [ ] Touchpoint form with collapsible sections
- [ ] Touchpoint Status field added to database (migration)
- [ ] Client form in 3 steps
- [ ] Required fields clearly marked for Add New Client (red border + asterisk)
- [ ] No required fields for Edit Existing Client (flexible editing)
- [ ] Real-time inline validation with error messages
- [ ] GPS error handling blocks submission until resolved
- [ ] Offline-first queue behavior with sync indicator
- [ ] Loading, success, and error feedback
- [ ] Post-action filtering (remove from list after actions)
- [ ] All touch targets meet 44px minimum
- [ ] Haptic feedback on all interactions
- [ ] Multi-select exit via Done button, empty space tap, or back button
