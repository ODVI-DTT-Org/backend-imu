# RBAC UI Integration Design

> **Project:** IMU Mobile App (Flutter)
> **Date:** 2026-04-02
> **Status:** Design Approved

---

## Overview

Integrate the comprehensive RBAC (Role-Based Access Control) system into the mobile app UI, ensuring permissions are enforced at the presentation layer while maintaining clear separation from approval workflows.

---

## Architecture

### Three-Layer Permission System

1. **UI Layer** - Widgets filter/disable based on permissions
2. **Service Layer** - Permission checks before API calls
3. **Backend Layer** - Final validation (already implemented)

### Key Components

- `PermissionWidget` - Shows/hides content based on permissions
- `PermissionGuard` - Disables content with tap feedback
- `OwnershipWidget` - Ownership-based visibility
- `PermissionNavigationGuard` - Route protection and menu filtering
- `RemotePermissionService` - Permission caching and fetching
- `AreaFilterService` - Area-based client filtering
- `OwnershipService` - Ownership validation

---

## RBAC vs Approval Workflows

### Critical Separation

**RBAC Controls (Permissions):**
- Navigation access (who can see which screens)
- Direct destructive actions (delete buttons)
- Role-based features (reports, debug tools)
- Touchpoint type restrictions (Caravan vs Tele)

**Approval Workflow Controls (Business Logic):**
- Client edits (anyone can request, admin approves)
- Release loans (anyone can submit, admin approves)
- Client additions (direct creation, no approval)

### Design Principle

> Permission checks control **access**, approval workflows control **business processes**.

---

## Section 1: Client Management

### Clients Page (`/clients`)

**FloatingActionButton (Add Client)**
- **No permission wrapper** - All users can add clients
- Direct creation, no approval needed
- Area filtering applied via `AreaFilterService`

**Rationale:** Client creation is open to all users. Adding clients is not a restricted action.

### Client Detail Page (`/clients/:id`)

**Edit Button**
- **No permission wrapper** - All users can request edits
- Edit requests go to admin approval queue
- Approval workflow handles business logic

**Delete Button**
- Wrapped in `PermissionDeleter` for `clients` resource
- Admin only - no approval workflow for deletion
- Shows disabled with generic message for non-admins

### Approval Workflows (Separate from RBAC)

| Action | Who Can Initiate | Approval Required | Permission Check |
|--------|-----------------|-------------------|------------------|
| Add Client | All users | No | None |
| Edit Client | All users | Yes (admin) | None |
| Delete Client | Admin only | No | Admin role |

---

## Section 2: Touchpoint Management

### Touchpoint Number Selector

**Role-Based Filtering:**

| Role | Valid Touchpoint Numbers | Type |
|------|-------------------------|------|
| Caravan | 1, 4, 7 | Visit only |
| Tele | 2, 3, 5, 6 | Call only |
| Admin/Managers | 1, 2, 3, 4, 5, 6, 7 | All types |

**Implementation:**
- Use `PermissionService.canCreateTouchpoint()` for filtering
- Auto-select type based on selected number
- Disable type field for Caravan/Tele users
- Managers can choose freely

### Touchpoint Actions

| Action | Permission Check | Ownership Check | Approval |
|--------|-----------------|-----------------|----------|
| Create | Role-based (number filtering) | N/A | No |
| Edit | None | Own touchpoints only | No |
| Delete | Admin only | N/A | No |

**Implementation:**
- Create: Filter number options, no wrapper
- Edit: `OwnershipWidget` for own touchpoints
- Delete: `PermissionDeleter` (admin only)

---

## Section 3: Navigation & Menu

### Bottom Navigation Bar

**All Users:**
- Home
- My Day
- Itinerary
- Clients

**Managers Only:**
- Reports (added to navigation)

**Implementation:**
- Use `PermissionNavigationGuard.getNavigationItems()`
- Filter items based on user role
- Dynamic menu generation

### Home Page Icons

| Icon | Permission | Who Can See |
|------|-----------|-------------|
| Targets | None | All users |
| Reports | `PermissionWidget` (reports.read) | Managers only |
| Debug | `PermissionWidget` (system.read) | Admin only |
| Settings | None | All users |
| Attendance | None | All users |

**Implementation:**
- Wrap icons in `PermissionWidget` or `PermissionGuard`
- Show disabled with tap feedback for unauthorized access
- Generic permission message on tap

### Route Guards

Protected routes use `PermissionNavigationGuard.canNavigateToRoute()`:

| Route | Permission | Role Required |
|-------|-----------|---------------|
| `/debug` | system.read | Admin |
| `/reports` | reports.read | Managers |
| `/settings` | None | All users |
| `/settings/users` | users.update | Admin, Managers |
| `/settings/agency` | agency.update | Admin |

---

## Section 4: Settings & Admin Pages

### Settings Page

**All Users Can Access:**
- Profile settings
- App preferences
- Logout

**Admin Sections:**
- User management (wrapped in `PermissionWidget`)
- System settings (wrapped in `PermissionWidget`)
- Agency settings (wrapped in `PermissionWidget`)

**Implementation:**
- Main settings page: No permission wrapper
- Admin subsections: Wrapped in `PermissionWidget`
- Show disabled with message for non-admins

### Debug Dashboard

**Implementation:**
- Wrap entire page in `PermissionWidget` for `system.read` permission
- Hide completely for non-admin users
- No fallback - page doesn't exist for non-admins

### Developer Options

**Implementation:**
- Wrap in `PermissionWidget` for admin role
- Show permission message if tapped by non-admin
- Consider removing in production builds

---

## Section 5: Area & Ownership Filtering

### Client Lists

**Implementation:**
- Use `AreaFilterService.filterClientsByMunicipality()`
- Filter both online and offline client lists
- No permission check - all users see their assigned area
- Show message if no clients in assigned area

**Rationale:** Area filtering is business logic, not permission-based. All users see clients in their assigned municipalities.

### Touchpoint Lists

**Implementation:**
- Use `OwnershipService.filterByOwnership()`
- Show own touchpoints only (unless admin)
- No permission check - ownership is business logic
- Add visual indicator for non-owned items (if visible)

### Itinerary Management

**Implementation:**
- Wrap edit actions in `OwnershipWidget`
- Show disabled buttons for non-owned itineraries
- Admin sees all, can edit all

---

## Section 6: Permission Error Handling

### Generic Permission Dialog

**Implementation:**
```dart
// lib/shared/widgets/permission_dialog.dart
class PermissionDeniedDialog extends StatelessWidget {
  static void show(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Access Denied'),
        content: const Text(
          'You don\'t have permission to perform this action',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}
```

### Permission Loading States

**Behavior:**
- Show loading indicator while checking permissions
- Fallback to disabled state if check fails
- Never show action before permission confirmed
- Use `PermissionGuard` for most cases (shows disabled during check)

### Permission Feedback UX

**User Experience:**
1. User taps disabled action
2. Generic message: "You don't have permission to perform this action"
3. OK button to dismiss
4. Consistent across all permission-denied actions

---

## Implementation Files

### New Files

**`lib/shared/widgets/permission_dialog.dart`**
- Generic permission denied dialog
- Static `show()` method
- Consistent UX across app

**`lib/shared/utils/permission_helpers.dart`**
- Helper functions for permission checks
- Common patterns extracted
- Reusable utilities

### Modified Files

**`lib/features/clients/presentation/pages/client_detail_page.dart`**
- Wrap delete button in `PermissionDeleter`
- Edit button: No wrapper (approval workflow)

**`lib/features/touchpoints/presentation/widgets/touchpoint_form.dart`**
- Filter touchpoint numbers by role
- Auto-select type based on number
- Disable type for Caravan/Tele

**`lib/features/home/presentation/pages/home_page.dart`**
- Wrap Reports icon in `PermissionWidget`
- Wrap Debug icon in `PermissionWidget`
- Add permission feedback on tap

**`lib/shared/widgets/main_shell.dart`**
- Use `PermissionNavigationGuard.getNavigationItems()`
- Filter bottom navigation by role
- Add Reports tab for managers

**`lib/features/settings/presentation/pages/settings_page.dart`**
- Wrap admin sections in `PermissionWidget`
- User management, system settings

### Files NOT Modified

**`lib/features/clients/presentation/pages/clients_page.dart`**
- FAB stays unwrapped (all users can add)
- Area filtering applied via service

**Add/Edit Client Forms**
- Open to all users
- Approval workflow handles edits

---

## Permission Matrix Summary

| Resource/Action | Admin | Managers | Caravan | Tele |
|-----------------|-------|----------|---------|------|
| **Clients** |
| Add Client | ✓ | ✓ | ✓ | ✓ |
| Edit Client (request) | ✓ | ✓ | ✓ | ✓ |
| Delete Client | ✓ | ✗ | ✗ | ✗ |
| **Touchpoints** |
| Create Visit (1,4,7) | ✓ | ✓ | ✓ | ✗ |
| Create Call (2,3,5,6) | ✓ | ✓ | ✗ | ✓ |
| Edit Own | ✓ | ✓ | ✓ | ✓ |
| Edit Any | ✓ | ✓ | ✗ | ✗ |
| Delete | ✓ | ✗ | ✗ | ✗ |
| **Navigation** |
| Home | ✓ | ✓ | ✓ | ✓ |
| My Day | ✓ | ✓ | ✓ | ✓ |
| Itinerary | ✓ | ✓ | ✓ | ✓ |
| Clients | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✗ | ✗ |
| Debug | ✓ | ✗ | ✗ | ✗ |
| Settings | ✓ | ✓ | ✓ | ✓ |

---

## Testing Strategy

### Unit Tests
- Permission widget behavior
- Role-based filtering logic
- Ownership validation
- Area filtering

### Widget Tests
- PermissionWidget shows/hides correctly
- PermissionGuard disables correctly
- OwnershipWidget respects ownership
- Navigation filters by role

### Integration Tests
- Touchpoint number filtering by role
- Client list area filtering
- Permission denial flows
- Navigation route guards

### Manual Tests
- Test each role's access level
- Verify permission messages
- Check approval workflows (separate)
- Test offline/online transitions

---

## Success Criteria

1. **Permission Enforcement**
   - All restricted actions require appropriate permissions
   - Generic permission messages shown consistently
   - No unauthorized actions possible

2. **Approval Workflow Separation**
   - Client edits don't require permission (go to approval)
   - Client additions don't require permission
   - Only deletions require admin permission

3. **User Experience**
   - Clear feedback when permission denied
   - Disabled state visible during permission check
   - No confusing UI elements

4. **Role-Based Access**
   - Caravan: Visit touchpoints only
   - Tele: Call touchpoints only
   - Managers: All touchpoints + reports
   - Admin: Full access

---

## Rollout Plan

1. **Phase 1:** Core permission widgets and dialog
2. **Phase 2:** Client management integration
3. **Phase 3:** Touchpoint role filtering
4. **Phase 4:** Navigation and menu filtering
5. **Phase 5:** Settings and admin pages
6. **Phase 6:** Testing and validation

---

**Last Updated:** 2026-04-02
**Design Status:** Approved
