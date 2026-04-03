# User Experience Mental Models Guide

A comprehensive guide for the team on understanding, discovering, and designing for user mental models.

---

## Table of Contents

1. [What Are Mental Models?](#what-are-mental-models)
2. [Why Mental Models Matter](#why-mental-models-matter)
3. [Types of Mental Models](#types-of-mental-models)
4. [Discovering User Mental Models](#discovering-user-mental-models)
5. [Designing for Mental Models](#designing-for-mental-models)
6. [IMU App Examples](#imu-app-examples)
7. [Common Pitfalls](#common-pitfalls)
8. [Best Practices](#best-practices)
9. [Template & Checklist](#template--checklist)

---

## What Are Mental Models?

### Definition

A **mental model** is a user's internal representation of how a system works. It's their understanding, assumptions, and expectations based on:
- Past experiences with similar systems
- Cultural conventions
- Real-world analogies
- The system's visible affordances

### The Three Models in UX

| Model | Description | Who Creates |
|-------|-------------|--------------|
| **Mental Model** | How the USER thinks the system works | User (from experience) |
| **Conceptual Model** | How the system ACTUALLY works | Designers/Developers |
| **System Image** | What the system SHOWS about how it works | UI/UX Design |

**Good UX** bridges the gap between the user's mental model and the system's conceptual model through the system image.

---

## Why Mental Models Matter

### Benefits

1. **Reduced Cognitive Load**
   - Users don't have to learn new patterns
   - Familiar interactions feel intuitive

2. **Faster Onboarding**
   - Users can transfer existing knowledge
   - Less training required

3. **Fewer Errors**
   - Predictable behavior
   - Clear cause-and-effect relationships

4. **Increased Satisfaction**
   - Sense of control
   - Confidence in using the system

### Cost of Mental Model Mismatches

| Symptom | Impact |
|---------|--------|
| Confusion | Support tickets ↑ |
| Errors | Retention ↓ |
| Frustration | Adoption ↓ |
| Abandonment | Churn ↑ |

---

## Types of Mental Models

### 1. Object-Based Mental Models

Users think of digital objects as physical objects with similar properties.

**Examples:**
- **Documents** → Paper files (create, save, delete, move to folders)
- **Shopping Cart** → Physical shopping cart (add, remove, checkout)
- **Trash/Recycle Bin** → Physical wastebasket (recover before emptying)

### 2. Process-Based Mental Models

Users understand systems as step-by-step processes.

**Examples:**
- **Wizard** → Form with progressive steps
- **Checkout** → Counter → Payment → Receipt
- **Installation** → Download → Run → Configure

### 3. Spatial Mental Models

Users navigate systems using spatial metaphors.

**Examples:**
- **File System** → Folders, cabinets, desktop
- **Navigation** → Maps, breadcrumbs, landmarks
- **Cloud Storage** → "Up there" vs "on my device"

### 4. Social Mental Models

Users interact with systems using social expectations.

**Examples:**
- **Notifications** → Someone getting your attention
- **Sharing** → Giving someone a copy
- **Permissions** → Allowing/denying access

---

## Discovering User Mental Models

### Research Methods

#### 1. User Interviews

**Ask questions like:**
- "What do you expect will happen when you [action]?"
- "How do you think [feature] works?"
- "What does this icon/button mean to you?"
- "Where would you look to find [function]?"

#### 2. Observational Studies

**Watch for:**
- Where users click first (expectations)
- Confusion points (mental model mismatch)
- Workarounds (adaptive mental models)
- "Happy paths" users create

#### 3. Card Sorting

**Reveals:**
- How users categorize information
- Expected relationships between items
- Terminology and labels users expect

#### 4. Usability Testing

**Listen for:**
- "I thought it would..."
- "Where's the...?"
- "Why did it do that?"
- "That's not what I expected"

#### 5. Surveys & Questionnaires

**Ask about:**
- Previous experience with similar systems
- Industry background
- Technical comfort level
- Cultural context

---

## Designing for Mental Models

### Principles

#### 1. Leverage Existing Mental Models

**Before creating new patterns, ask:**
- What real-world analogy fits?
- What similar apps do users use?
- What conventions exist in this domain?

**Examples:**
- 💰 **Finance apps** → Ledger, wallet, bank
- 📧 **Email** → Letters, inbox, archive, trash
- 📝 **Notes** → Paper notebook, sticky notes
- 📁 **Files** → Folders, cabinets

#### 2. Make the System Model Visible

**Techniques:**
- **Show, don't hide** functionality
- **Use clear labels** (not clever metaphors)
- **Provide feedback** for every action
- **Make state changes** obvious

#### 3. Bridge Gaps Gradually

**When introducing new concepts:**
- Start with familiar patterns
- Add new features incrementally
- Use progressive disclosure
- Provide tutorials/onboarding

#### 4. Respect User Expectations

**Common expectations:**
- **Back button** → Goes to previous screen
- **X button** → Closes/dismisses
- **Save** → Stores current work
- **Delete** → Removes permanently (with confirmation)
- **Settings** → Configuration options

---

## IMU App Examples

### Example 1: Client Management

**User's Mental Model:**
- "Clients are like contacts in my phone"
- "I can search, add, edit, and call them"

**Design Alignment:**
| Feature | Mental Model | Implementation |
|---------|--------------|----------------|
| Client List | Phone contacts | List view with search |
| Add Client | Add new contact | Form with required fields |
| Call Client | Tap phone number | One-tap calling |
| Client Details | Contact card | All info in one place |

### Example 2: Touchpoints

**User's Mental Model:**
- "Touchpoints are like visits or calls I make"
- "I should track 7 specific interactions"

**Design Alignment:**
| Feature | Mental Model | Implementation |
|---------|--------------|----------------|
| Touchpoint List | History log | Chronological list |
| Add Touchpoint | Log entry | Quick-add form |
| 7-Step Pattern | Follow-up sequence | Visual progress indicator |
| Photo/Audio | Evidence | Attach media to records |

### Example 3: Itinerary

**User's Mental Model:**
- "My itinerary is like my daily schedule"
- "I see what I need to do today"

**Design Alignment:**
| Feature | Mental Model | Implementation |
|---------|--------------|----------------|
| Day View | Calendar/Daily planner | Tabs for days |
| Visit Cards | Tasks/appointments | Cards with client info |
| Completion | Checking off tasks | Checkbox/progress |

### Example 4: Assignments

**User's Mental Model:**
- "My assigned area is like my territory"
- "I only work with clients in my area"

**Design Alignment:**
| Feature | Mental Model | Implementation |
|---------|--------------|----------------|
| My Clients | My contacts | Filter by assignment |
| Municipality Filter | Geographic boundary | Location-based filter |
| All Clients Toggle | See everything | Switch between views |

---

## Common Pitfalls

### ❌ Pitfall 1: Clever Metaphors

**Problem:** Using metaphors that users don't understand.

**Example:**
- Using "archive" for delete (users expect archive = store)
- Using "star" for follow-up (users expect bookmark/favorite)

**Solution:** Use literal, clear labels.

### ❌ Pitfall 2: Technical Jargon

**Problem:** Using technical terms that users don't know.

**Examples:**
- "Sync" → "Update"
- "Cache" → "Saved data"
- "Authentication" → "Login"

**Solution:** Use user language, not developer language.

### ❌ Pitfall 3: Hidden Affordances

**Problem:** Users can't tell what's possible.

**Examples:**
- No visual cue that swiping works
- Buttons that don't look clickable
- Features hidden in menus

**Solution:** Make actions visible and discoverable.

### ❌ Pitfall 4: Inconsistent Patterns

**Problem:** Same action works differently in different places.

**Examples:**
- Back button behaves differently
- Save has different meanings
- Swiping does different things

**Solution:** Maintain consistency throughout the app.

---

## Best Practices

### 1. Research First

- ✅ Understand users before designing
- ✅ Test assumptions with real users
- ✅ Iterate based on feedback

### 2. Use Familiar Patterns

- ✅ Follow platform conventions (Material Design/iOS)
- ✅ Use industry-standard patterns
- ✅ Match similar apps in your domain

### 3. Make State Visible

- ✅ Show current state clearly
- ✅ Indicate what actions are available
- ✅ Provide feedback for all interactions

### 4. Progressive Disclosure

- ✅ Show simple options first
- ✅ Reveal complexity when needed
- ✅ Allow exploration without commitment

### 5. Error Prevention

- ✅ Design for common mistakes
- ✅ Provide clear warnings
- ✅ Offer easy recovery

### 6. Documentation

- ✅ Document user research findings
- ✅ Share mental models across the team
- ✅ Create design systems based on user expectations

---

## Template & Checklist

### Mental Model Research Template

```markdown
# [Feature] Mental Model Analysis

## User Profile
- **Target Audience:**
- **Technical Proficiency:**
- **Domain Experience:**
- **Cultural Context:**

## Research Method
- [ ] User Interviews (n=__):
- [ ] Observational Studies:
- [ ] Survey Results:
- [ ] Usability Testing:

## Mental Model Findings

### Expected Behaviors
1.
2.
3.

### Terminology Users Use
- **Term** → User says: "..."
- **Action** → User expects: "..."

### Analogies & Metaphors
- **Real-world comparison:**

### Pain Points
1.
2.
3.

## Design Implications

### What to Align With
-

### What to Avoid
-

### Key Opportunities
-
```

### Design Checklist

Before finalizing any feature, ask:

**Discovery**
- [ ] Have we interviewed users about this feature?
- [ ] Do we understand their mental model?
- [ ] What similar systems do they use?

**Design**
- [ ] Does this match users' expectations?
- [ ] Are we using familiar patterns?
- [ ] Is the terminology clear to users?
- [ ] Can users predict what will happen?

**Testing**
- [ ] Have we tested with real users?
- [ ] Did users behave as expected?
- [ ] Where were users confused?
- [ ] What workarounds did users create?

**Iteration**
- [ ] What did we learn?
- [ ] What should we change?
- [ ] How do we bridge the gap?

---

## Quick Reference

### Common Mental Models by Domain

| Domain | Common Mental Models |
|--------|---------------------|
| **Communication** | Letters, inbox, conversations |
| **Finance** | Wallet, ledger, bank, cash |
| **Files** | Folders, cabinets, paper |
| **Shopping** | Cart, wishlist, checkout |
| **Social** | Friends, sharing, following |
| **Tasks** | To-do list, calendar, reminders |
| **Media** | Library, playlist, channel |
| **Maps** | Paper map, directions, landmarks |

### Signal Words for Mental Model Mismatches

Users saying these indicate a mismatch:
- "I thought it would..."
- "Where's the...?"
- "That's confusing"
- "Why did it do that?"
- "It just doesn't make sense"
- "I keep forgetting how to..."
- "Can you show me again?"

---

## Further Reading

- **"The Design of Everyday Things"** by Don Norman
- **"About Face: The Essentials of Interaction Design"** by Alan Cooper
- **"Mental Models"** by Indi Young
- **Nielsen Norman Group** articles on mental models

---

## Summary

**Mental models are how users understand your system.**

Good UX design:
1. **Discovers** user mental models through research
2. **Designs** interfaces that match those models
3. **Tests** with real users to validate assumptions
4. **Iterates** based on feedback

**Key principle:** Don't make users think like developers. Make systems that think like users.

---

*Last updated: 2026-03-26*
*For the DTT team*
