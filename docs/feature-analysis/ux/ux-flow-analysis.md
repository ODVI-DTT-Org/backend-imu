# UX Flow Analysis - IMU Mobile App

**Date:** 2025-01-24
**Project:** IMU (Itinerary Manager - Uniformed)
**Focus:** Field Agent Mobile App UX Flow
**Status:** Analysis Complete | Implementation Pending

---

## Executive Summary

This document analyzes the current user experience (UX) flow of the IMU mobile app from a field agent's perspective. The analysis identifies critical gaps between user mental models and the actual implementation, focusing on the core workflow: **Plan → Visit → Record**.

**Key Finding:** The app has strong recording capabilities but lacks planning workflow features, causing significant user confusion and friction.

---

## Table of Contents

1. [Current State Summary](#current-state-summary)
2. [Feature Location Matrix](#feature-location-matrix)
3. [Critical UX Issues](#critical-ux-issues)
4. [User Mental Model Analysis](#user-mental-model-analysis)
5. [Detailed User Scenarios](#detailed-user-scenarios)
6. [User Personas](#user-personas)
7. [Emotional Journey Map](#emotional-journey-map)
8. [Cognitive Load Analysis](#cognitive-load-analysis)
9. [Implementation Plan](#implementation-plan)

---

## Current State Summary

### Home Screen Navigation

The home screen displays 6 menu icons:
- My Clients
- My Targets
- Missed Visits
- Loan Calculator
- Attendance
- My Profile

**Issue:** "My Day" - the core daily workflow feature - is missing from the home screen.

### Current Feature Locations

| Location | Button/Action | Behavior | Issue? |
|----------|---------------|----------|--------|
| **Home Screen** | My Day entry | Doesn't exist | ❌ MISSING |
| **Client List** | Client Card tap | Navigates to Client Detail | ⚠️ Indirect |
| **Client List** | Add to My Day | Doesn't exist | ❌ MISSING |
| **Client List** | Add to Itinerary | Doesn't exist | ❌ MISSING |
| **Client Detail** | Record Visit FAB | Opens touchpoint form | ❌ WRONG LOCATION |
| **Client Detail** | Add Touchpoint | Opens touchpoint form | ⚠️ Redundant |
| **My Day Page** | Client Card tap | Opens touchpoint form | ✅ CORRECT |
| **My Day Page** | Record Visit FAB | Doesn't exist | ❌ MISSING |
| **My Day Page** | Add new visit | Navigates to Client List | ❌ MISLEADING |
| **My Day Page** | Remove client | Doesn't exist | ❌ MISSING |

---

## Feature Location Matrix

### Comprehensive Button/Action Table

| Location | Button/Action | Current Behavior | User Expectation | Issue |
|----------|---------------|------------------|------------------|-------|
| **Home Screen** | 6 menu icons | Clients, Targets, Missed Visits, Calculator, Attendance, Profile | Where's "My Day"? | ❌ CRITICAL |
| **Home Screen** | No "My Day" entry | N/A | Start day by seeing today's schedule | ❌ CRITICAL |
| **Client List** | Client Card tap | Goes to Client Detail | See quick actions | ⚠️ Indirect |
| **Client List** | Card swipe | Nothing | Delete/remove? | ❌ MISSING |
| **Client List** | Long press | Nothing | Quick menu? | ❌ MISSING |
| **Client List** | "Add to My Day" | Doesn't exist | Add to today's list | ❌ MISSING |
| **Client List** | "Add to Itinerary" | Doesn't exist | Schedule for future | ❌ MISSING |
| **Client List** | Search/Filter | Works | ✅ | ✅ Good |
| **Client Detail** | "Record Visit" FAB | Opens touchpoint form | Should be in My Day | ❌ WRONG LOC |
| **Client Detail** | "Add Touchpoint" | Opens touchpoint form | Redundant with FAB | ⚠️ Confusing |
| **Client Detail** | "Schedule" | Doesn't exist | Plan future visits | ❌ MISSING |
| **Client Detail** | Edit pencil | Works | ✅ | ✅ Good |
| **Client Detail** | Delete trash | Works | ✅ | ✅ Good |
| **My Day Page** | Client Card tap | Opens touchpoint form | ✅ | ✅ Perfect |
| **My Day Page** | "Record Visit" FAB | Doesn't exist | Quick record action | ❌ MISSING |
| **My Day Page** | "Add new visit" | Goes to Client List | Add client to today | ❌ WRONG |
| **My Day Page** | "Multiple Time In" | Works | ✅ | ✅ Good |
| **My Day Page** | Remove client | Doesn't exist | Undo mistake | ❌ MISSING |
| **My Day Page** | Reorder clients | Doesn't exist | Optimize route | ❌ MISSING |
| **Touchpoint Form** | Photo capture | Works | ✅ | ✅ Good |
| **Touchpoint Form** | GPS capture | Auto (fixed) | ✅ | ✅ Good |
| **Touchpoint Form** | 25+ reasons | Works | ✅ | ✅ Good |

---

## Critical UX Issues

### Priority 1: CRITICAL (Breaks Core Workflow)

#### 1. "My Day" Missing from Home Screen
- **Issue:** Field agents start their day by checking today's schedule, but "My Day" is not on the home screen
- **Impact:** Users cannot find the primary workflow entry point
- **Fix:** Add "My Day" as prominent home screen icon (position 1 or 2)

#### 2. No Way to Build Today's Client List
- **Issue:** Core workflow requires Plan → Visit → Record, but the planning step is completely missing
- **Impact:** Users must use workarounds (paper, memory) to plan their day
- **Fix:** Add "Add to My Day" button to Client List cards

#### 3. "Record Visit" FAB in Wrong Location
- **Issue:** "Record Visit" FAB appears in Client Detail, but should be in My Day
- **Impact:** Encourages recording without planning; creates duplicate entry points
- **Fix:** Move FAB to My Day page, remove from Client Detail

### Priority 2: HIGH (Causes Confusion)

#### 4. Terminology Inconsistency
- **Issue:** "Add Touchpoint" vs "Record Visit" vs "Add new visit" - inconsistent terminology
- **Impact:** Users confused about which action to take
- **Fix:** Standardize terminology across the app

#### 5. No Remove/Undo in My Day
- **Issue:** Users make mistakes but can't remove clients from today's list
- **Impact:** Errors are permanent; causes anxiety
- **Fix:** Add swipe-to-remove or remove button

#### 6. "Add new visit" Misleads Users
- **Issue:** Button suggests adding a visit, but navigates to Client List
- **Impact:** User expectation mismatch
- **Fix:** Rename to "Add Client" or implement actual visit creation

#### 7. No Visual State Indicators
- **Issue:** Can't tell which clients are already in My Day from Client List
- **Impact:** Users add duplicates or can't see planning status
- **Fix:** Add badge or icon indicating "In My Day"

### Priority 3: MEDIUM (Annoying but Functional)

#### 8. No Future Planning UI
- **Issue:** Can't schedule visits beyond today
- **Impact:** Limited planning capability

#### 9. No Route Optimization
- **Issue:** Can't reorder My Day list
- **Impact:** Inefficient route planning

#### 10. No Quick Actions on Client Cards
- **Issue:** Must tap through to Client Detail for everything
- **Impact:** Extra taps for common actions

---

## User Mental Model Analysis

### Field Agent's Mental Map

```
MORNING →                  MID-DAY →                   EVENING →
"Start my day"             "Record visits"             "Finish my day"
   ↓                           ↓                            ↓
"Who do I visit?"          "How did it go?"            "What's next?"
   ↓                           ↓                            ↓
"Plan my route"            "Log the touchpoint"         "Review progress"
```

### Mental Model Mismatch

| **User's Mental Model** | **Current UI** | **Gap** |
|-------------------------|----------------|---------|
| "I need to plan my day" | No planning interface | ❌ Missing |
| "I'll add clients to visit" | No "Add to My Day" button | ❌ Missing |
| "I'll record the visit now" | "Record Visit" in wrong place | ❌ Misplaced |
| "I made a mistake, let me undo" | No undo function | ❌ Missing |
| "Which page do I use for what?" | Multiple entry points, unclear | ❌ Confusing |

---

## Detailed User Scenarios

### Scenario 1: New Agent First Day

```
👤 New Agent: "I just installed the app. What do I do first?"

📱 What They See: Login screen → Home screen with 6 icons

🧠 Their Thought Process:
   "I see 'My Clients' - that's probably my client list"
   "I see 'Missed Visits' - sounds important"
   "But wait... where's the main screen? Where's my work for today?"

❌ Mental Model Mismatch:
   User expects: "Today's Schedule" as the first thing
   App provides: 6 equal-weighted options, no clear starting point

💭 Internal Monologue:
   "Maybe I tap 'My Clients' first?"
   "OK, here are all clients. Which ones do I visit today?"
   "This is overwhelming. Do I visit ALL of them?"
   "Where's the filter for 'today's clients'?"
```

### Scenario 2: Experienced Agent - Morning Routine

```
👤 Agent Maria: "8:00 AM, time to start my day. Let me check my route."

🧠 Their Mental Model:
   Step 1: "Who's on my list for today?"
   Step 2: "What's the best route to take?"
   Step 3: "Do I need to call anyone first?"
   Step 4: "Let me start heading out"

📱 What They Want to Do:
   "Open app → See today's schedule → Check addresses → Start driving"

❌ Result: Frustration due to missing "Add to My Day" functionality
```

### Scenario 3: Agent Arrives at Client Location

```
👤 Agent Juan: "I'm at Juan dela Cruz's house. Time to record this visit."

🧠 Their Mental Model:
   "I'm HERE. I need to RECORD that I'm here. Quick and simple."

❌ Confusion: Two ways to record (My Day vs Client Detail)
   "What's the difference between recording here vs in My Day?"
```

### Scenario 4: Agent Makes a Mistake

```
👤 Agent: "Oops, I accidentally added Maria to today's list. I meant Pedro."

❌ Problem: No remove/undo functionality
💭 "I guess I can't undo this. Now my list is wrong."
```

---

## User Personas

### Persona A: The Planner (Organized Agent)
```
Name: Maria
Style: Plans entire week in advance
Needs: Scheduling, route optimization, future planning

Current Experience:
   ❌ Can't plan beyond today
   ❌ Can't optimize route
   ✅ Can record visits (after the fact)

Quote: "I use a spreadsheet for planning. The app is just for recording."
```

### Persona B: The Improviser (Flexible Agent)
```
Name: Juan
Style: Decides visits on the fly
Needs: Quick add, quick record, flexible

Current Experience:
   ❌ Can't quickly add to today
   ❌ No quick-record from Client List

Quote: "I call clients first. Then I use the app if I remember."
```

### Persona C: The Compliance-Following Agent
```
Name: Pedro
Style: Follows rules strictly
Needs: Clear workflow, guidance, no ambiguity

Current Experience:
   ❌ No clear workflow
   ❌ Multiple ways to do things (which is correct?)

Quote: "I'm scared I'll use it wrong and get in trouble."
```

### Persona D: The Tech-Challenged Agent
```
Name: Rosa
Style: Not comfortable with technology
Needs: Simple, obvious, forgiving

Current Experience:
   ❌ Hidden features (not discoverable)
   ❌ No undo function

Quote: "I ask my grandson to help. He says 'Grandma, tap here, then here'."
```

---

## Emotional Journey Map

```
First Open:
🤔 CONFUSED  → "Where do I start?"
   ↓
😰 OVERWHELMED → "Too many options, no clear path"
   ↓
😤 FRUSTRATED  → "Why can't I find basic features?"
   ↓
🤷 GIVE UP     → "I'll just figure it out myself"

Daily Use:
😐 RELUCTANT  → "I know how to use it, but it's clunky"
   ↓
😤 ANNOYED    → "Why is 'Record Visit' in the wrong place?"
   ↓
😟 ANXIOUS    → "Did I miss something? I can't tell"
   ↓
😔 RESIGNED    → "I guess I'll work around it"
```

---

## Cognitive Load Analysis

### Decision Fatigue Points

Every time the user has to make a decision:
- "Which button do I tap?" → FAB or quick action?
- "Which page do I use?" → Client Detail or My Day?
- "Is this the right way?" → No feedback, no confirmation
- "What if I make a mistake?" → No undo, creates anxiety

**Result:** User defaults to familiar paths, abandons complex features, creates workarounds

---

## Implementation Plan

### Phase 1: Core Workflow (Must Fix First)

**Priority:** CRITICAL
**Estimated Time:** 4-6 hours

1. **Add "My Day" to Home Screen**
   - Add to home menu grid (position 1, before "My Clients")
   - Icon: `calendar` or `sun` from Lucide Icons
   - Label: "My Day"

2. **Add "Add to My Day" Button to Client List**
   - Add button to each client card
   - Single action: Adds to today's itinerary
   - Show confirmation toast/snackbar
   - Add visual indicator for clients already in My Day

3. **Move "Record Visit" FAB to My Day Page**
   - Remove from Client Detail page
   - Add to My Day page
   - Label: "Record Visit"
   - Action: Opens client selector or form

4. **Remove "Record Visit" FAB from Client Detail**
   - Keep "Add Touchpoint" quick action for manual entry
   - Remove floating action button

### Phase 2: Error Recovery

**Priority:** HIGH
**Estimated Time:** 2-3 hours

5. **Add Swipe-to-Remove in My Day**
   - Swipe left on client card to reveal remove button
   - Confirm with dialog
   - Haptic feedback on swipe

6. **Add Visual Indicator for "Already in My Day"**
   - Show badge on Client List cards
   - Label: "In My Day" or checkmark icon
   - Color: Green or blue accent

### Phase 3: Terminology & Polish

**Priority:** MEDIUM
**Estimated Time:** 2-3 hours

7. **Rename "Add new visit" → "Add Client to Today"**
   - Update button label in My Day header
   - Make action clearer: opens client selector

8. **Standardize Terminology**
   - "Touchpoint" (internal/system)
   - "Visit/Call" (user-facing)
   - "My Day" (today's planned list)
   - "Itinerary" (future scheduling)

### Phase 4: Future Enhancements

**Priority:** LOW
**Estimated Time:** TBD

9. Add future scheduling (date picker)
10. Add route reordering (drag-and-drop)
11. Add daily summary view
12. Add onboarding/tutorial for first-time users

---

## Success Criteria

After implementing Phase 1-3:

✅ New users can complete the core workflow within 5 minutes without training
✅ "Add to My Day" is discoverable and intuitive
✅ Only one clear way to record visits (in My Day)
✅ Users can recover from mistakes (remove/undo)
✅ Terminology is consistent across the app

---

## Files to Modify

### Flutter Mobile App

1. `lib/features/home/presentation/pages/home_page.dart`
   - Add "My Day" to menu items

2. `lib/features/clients/presentation/pages/clients_page.dart`
   - Add "Add to My Day" button to client cards
   - Add "In My Day" badge indicator

3. `lib/features/my_day/presentation/pages/my_day_page.dart`
   - Add "Record Visit" FAB
   - Rename "Add new visit" → "Add Client"
   - Add swipe-to-remove functionality

4. `lib/features/clients/presentation/pages/client_detail_page.dart`
   - Remove "Record Visit" FAB
   - Keep "Add Touchpoint" quick action

5. `lib/features/my_day/data/models/my_day_client.dart`
   - Add `isInMyDay` property (if not exists)

6. `lib/features/my_day/presentation/providers/my_day_provider.dart`
   - Add `addToMyDay()` method
   - Add `removeFromMyDay()` method

7. `lib/features/my_day/presentation/widgets/client_card.dart`
   - Add swipe-to-dismiss functionality

8. `lib/features/clients/presentation/widgets/` (create if needed)
   - Create `client_list_card.dart` with "Add to My Day" button

---

## Backend API Changes (If Needed)

1. `backend/src/routes/my-day.ts`
   - POST `/api/my-day/add-client` - Add client to today's list
   - DELETE `/api/my-day/remove-client/:id` - Remove client from today's list
   - GET `/api/my-day/status` - Check if client is in today's list

2. Database Schema (if needed)
   - `my_day_clients` table with columns:
     - `id`
     - `caravan_id`
     - `client_id`
     - `date`
     - `created_at`
     - `updated_at`

---

## Related Documents

- `master_plan_mobile_tablet.md` - Flutter implementation plan
- `elephant-carpaccio-version-2.md` - Development methodology
- `docs/deep-analysis-on-project.md` - Comprehensive project analysis

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-24 | 1.0 | Initial UX analysis and implementation plan |
| 2025-01-24 | 1.1 | Phase 1-3 implementation completed |

---

## Implementation Status

### ✅ Phase 1: Core Workflow (COMPLETED)
- ✅ Add "My Day" to Home Screen menu
- ✅ Add "Add to My Day" button to Client List cards
- ✅ Move "Record Visit" FAB to My Day page
- ✅ Remove "Record Visit" FAB from Client Detail

### ✅ Phase 2: Error Recovery (COMPLETED)
- ✅ Add swipe-to-remove in My Day
- ✅ Add visual indicator for "Already in My Day"

### ✅ Phase 3: Terminology & Polish (COMPLETED)
- ✅ Rename "Add new visit" → "Add Client"
- ✅ Standardize terminology: "Touchpoint History" → "Visit History", "Add Touchpoint" → "New Visit"
- ✅ Enhanced haptic feedback for success/error states
- ✅ Improved empty state messaging

---

## Files Modified

### Flutter Mobile App
1. `lib/features/home/presentation/pages/home_page.dart` - Added My Day menu item
2. `lib/features/clients/presentation/pages/clients_page.dart` - Added "Add to My Day" button
3. `lib/features/clients/presentation/pages/client_detail_page.dart` - Removed FAB, updated labels
4. `lib/features/my_day/presentation/pages/my_day_page.dart` - Added FAB, improved empty state
5. `lib/features/my_day/presentation/widgets/client_card.dart` - Added swipe-to-remove
6. `lib/features/my_day/presentation/widgets/header_buttons.dart` - Updated button label
7. `lib/services/api/my_day_api_service.dart` - Added API methods

### Backend API
1. `backend/src/routes/my-day.ts` - Added add/remove/status endpoints

---

**Next Steps:**
1. ✅ Review and approve this document
2. ✅ Begin Phase 1 implementation
3. ✅ Phase 2-3 implementation
4. 🔄 Test with real users
5. ⏳ Iterate based on feedback
