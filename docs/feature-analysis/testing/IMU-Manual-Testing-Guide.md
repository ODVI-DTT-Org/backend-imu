# IMU (Itinerary Manager) - Manual Testing Guide

## Overview

This guide provides comprehensive manual testing instructions for the IMU Flutter Mobile App. The app is designed for field agents managing client visits for PNP retirees.

## Prerequisites

1. **Flutter App**: Build and install the debug APK on your Android device/emulator
   ```bash
   cd mobile/imu_flutter
   flutter build apk --debug
   ```

2. **Backend Services**: Ensure PocketBase is running (for web admin)
   ```bash
   cd imu-web/pocketbase
   ./pocketbase serve --http=0.0.0.0:4000
   ```

## Test Environment Setup

### 1. Mobile Testing Setup

#### Android Device (Recommended)
- Enable Developer Options and USB debugging
- Connect device via USB
- Install the APK: `adb install build/app/outputs/flutter-apk/app-debug.apk`

#### Android Emulator
- Create an Android AVD (Android Virtual Device)
- Launch the emulator
- Install the APK

#### iOS Simulator (macOS only)
- Open Xcode
- Select an iOS simulator
- Run: `flutter run -d <device_id>`

### 2. Test Users

Create test accounts with different roles:
- **Admin**: Full system access
- **Staff**: Limited administrative functions
- **Field Agent**: Mobile app only

## Test Scenarios

### 1. Authentication Flow

#### 1.1 Login Screen
- **Test Case**: Email/Password Login
  1. Open app → Login screen appears
  2. Enter valid email and password
  3. Click "Login" button
  4. Should navigate to Home screen

- **Test Case**: Invalid Credentials
  1. Enter invalid email/password
  2. Click "Login"
  3. Should show error: "Invalid email or password"

- **Test Case**: Empty Fields
  1. Leave email/password empty
  2. Click "Login"
  3. Should show validation errors

- **Test Case**: Password Visibility
  1. Click eye icon next to password field
  2. Password should become visible
  3. Click again to hide

#### 1.2 PIN Setup (First Time User)
- **Test Case**: Create PIN
  1. Login with new account
  2. Should show PIN setup screen
  3. Enter 6-digit PIN
  4. Confirm PIN
  5. Should navigate to Home screen

- **Test Case**: PIN Mismatch
  1. Enter PIN: "123456"
  2. Enter different confirmation: "654321"
  3. Should show error: "PINs do not match"

- **Test Case**: Invalid PIN Length
  1. Enter PIN with <6 digits
  2. Should show error: "PIN must be 6 digits"

#### 1.3 PIN Entry (Returning User)
- **Test Case**: Correct PIN Entry
  1. After successful login, close app
  2. Reopen app
  3. Enter correct PIN
  4. Should navigate to Home screen

- **Test Case**: Incorrect PIN Entry
  1. Enter wrong PIN
  2. Should show error: "Incorrect PIN"
  3. After 3 attempts, should show option to reset PIN

### 2. Home Screen

#### 2.1 Dashboard Grid
- **Test Case**: Six-Icon Grid
  1. Navigate to Home screen
  2. Should show 6 main features as clickable icons:
     - Clients (People icon)
     - Itinerary (Calendar icon)
     - Touchpoints (Message icon)
     - My Day (Checklist icon)
     - Targets (Bullseye icon)
     - Settings (Gear icon)

- **Test Case**: Icon Navigation
  1. Click each icon
  2. Should navigate to respective screen
  3. Test back navigation from each screen

### 3. Clients Management

#### 3.1 Clients List
- **Test Case**: Load Client List
  1. Navigate to Clients
  2. Should display list of clients
  3. Each client card should show:
     - Name
     - Client type (POTENTIAL/EXISTING)
     - Status indicators
     - Star button for favorites

- **Test Case**: Filter Options
  1. Click filter button
  2. Should show filter dialog:
     - Search by name
     - Filter by type (POTENTIAL/EXISTING)
     - Sort options

- **Test Case**: Search Functionality
  1. Enter search term
  2. Should filter clients in real-time
  3. Clear search → show all clients

#### 3.2 Client Detail
- **Test Case**: View Client Details
  1. Click on a client
  2. Should show detail screen with:
     - Basic info (name, type)
     - Contact information
     - Address(es)
     - Touchpoint history
     - Star toggle

- **Test Case**: Edit Client
  1. Click edit button
  2. Should open edit form
  3. Modify fields and save
  4. Changes should reflect in detail view

#### 3.3 Add New Client
- **Test Case**: Prospect Client
  1. Click "+" button
  2. Select "Add Prospect Client"
  3. Fill form:
     - Name fields
     - Phone number
     - Address
     - Client type: POTENTIAL
  4. Save client
  5. Should appear in clients list

### 4. Itinerary Management

#### 4.1 Day Tabs
- **Test Case**: Day Navigation
  1. Navigate to Itinerary screen
  2. Should show tabs for different days
  3. Click tabs to switch between days
  4. Each tab should show visits for that day

- **Test Case**: Today's Tab
  1. Should highlight today's date
  2. Should show scheduled visits for today

#### 4.2 Visit Cards
- **Test Case**: Visit Card Display
  1. Each visit card should show:
     - Client name
     - Visit time
     - Status (scheduled, completed)
     - Touchpoint number (1-7)
     - Navigation button

- **Test Case**: Complete Visit
  1. Click on a visit card
  2. Should open touchpoint form
  3. Select reason from dropdown
  4. Fill optional notes/photo/audio
  5. Submit touchpoint

### 5. Touchpoint Form

#### 5.1 Form Fields
- **Test Case**: Required Fields
  1. Touchpoint type (Visit/Call) - should be determined by sequence
  2. Reason selection - should show 25+ options
  3. Date/time - should default to current
  4. Notes (optional)

- **Test Case**: Photo Upload
  1. Click camera button
  2. Should open camera/gallery
  3. Take/select photo
  4. Photo should appear on form

- **Test Case**: Audio Recording
  1. Click microphone button
  2. Should start recording (visual indicator)
  3. Click again to stop
  4. Audio should be saved

#### 5.2 Reason Categories
- **Test Case**: Color Coding
  - INTERESTED → Green
  - NOT INTERESTED → Red
  - UNDECIDED → Yellow
  - LOAN INQUIRY → Blue
  - FOR UPDATE → Purple
  - FOR VERIFICATION → Orange
  - FOR ADA COMPLIANCE → Indigo
  - Others → Gray

### 6. My Day Screen

#### 6.1 Task Progress
- **Test Case**: Progress Tracking
  1. Navigate to My Day
  2. Should show:
     - Progress circle/completion percentage
     - List of tasks
     - Task completion toggle
     - Completed tasks count

- **Test Case**: Mark Tasks Complete
  1. Tap checkbox next to tasks
  2. Tasks should be marked complete
  3. Progress percentage should update
  4. Completed tasks should move to bottom

### 7. Settings Screen

#### 7.1 Account Settings
- **Test Case**: Profile Information
  1. Navigate to Settings → Account
  2. Should show current user info
  3. Edit option for profile fields

- **Test Case**: Password Change
  1. Navigate to Settings → Change Password
  2. Enter current password
  3. Enter new password (min 8 chars)
  4. Confirm new password
  5. Should show success message

#### 7.2 App Settings
- **Test Case**: Theme
  1. Navigate to Settings → Appearance
  2. Toggle between light/dark theme
  3. Should update app immediately

- **Test Case**: Sync Settings
  1. Should show sync status
  2. Option to force sync
  3. Data retention policy display

### 8. Offline Testing

#### 8.1 Offline Behavior
- **Test Case**: Offline Mode
  1. Enable airplane mode/disable Wi-Fi
  2. Navigate to different screens
  3. Should show offline banner
  4. Should still allow local operations

- **Test Case**: Create Client Offline
  1. Go offline
  2. Add new client
  3. Client should be stored locally
  4. Should show "pending sync" indicator

- **Test Case**: Reconnect and Sync
  1. Enable Wi-Fi/disable airplane mode
  2. Wait for sync
  3. "Pending sync" indicator should disappear
  4. Check web admin - synced data should appear

### 9. Cross-Platform Sync Testing

#### 9.1 Web → Mobile Sync
- **Test Case**: Create Client on Web
  1. Login to web admin (http://localhost:4002)
  2. Create new client
  3. On mobile app, pull to refresh
  4. New client should appear on mobile

#### 9.2 Mobile → Web Sync
- **Test Case**: Create Client on Mobile
  1. Create new client on mobile app
  2. Wait for sync (5-10 seconds)
  3. Refresh web admin clients page
  4. New client should appear on web

### 10. Error Handling

#### 10.1 Network Errors
- **Test Case**: Backend Unavailable
  1. Stop PocketBase/backend server
  2. Try to sync data
  3. Should show error message
  4. Should allow offline operations

- **Test Case**: API Timeout
  1. Slow down network (Network tab in browser dev tools)
  2. Perform operations
  3. Should show loading indicator
  4. Should handle timeouts gracefully

#### 10.2 Input Validation
- **Test Case**: Invalid Email Format
  1. Enter invalid email in forms
  2. Should show validation error
  3. Prevent submission until valid

- **Test Case**: Required Field Validation
  1. Leave required fields empty
  2. Should highlight required fields
  3. Show error messages

### 11. Performance Testing

#### 11.1 Loading Times
- **Test Case**: Initial Load
  1. Time app startup
  2. Should load within 3 seconds

- **Test Case**: List Loading
  1. Load large client lists (100+)
  2. Should be smooth (no stuttering)
  3. Should load within 2 seconds

#### 11.2 Memory Usage
- **Test Case**: Memory Leaks
  1. Navigate through screens repeatedly
  2. Monitor memory usage
  3. Should not show memory growth over time

## Testing Checklist

### Core Functionality
- [ ] App launches successfully
- [ ] All screens are accessible
- [ ] Navigation between screens works
- [ ] All forms save data
- [ ] Data syncs properly
- [ ] Offline mode works
- [ ] Errors are handled gracefully

### User Experience
- [ ] Intuitive navigation
- [ ] Clear feedback on actions
- [ ] Proper loading states
- [ ] Responsive touch targets
- [ ] Readable text and icons
- [ ] Smooth animations

### Data Consistency
- [ ] Data matches between web and mobile
- [ ] Sync conflicts are resolved
- [ ] No data corruption
- [ ] Offline data preserved
- [ ] Updates reflected in real-time (when online)

## Reporting Issues

When finding bugs:
1. Take screenshots/videos
2. Note exact steps to reproduce
3. Include error messages
3. Note device/emulator info
4. Report severity:
   - Critical: App crash
   - High: Core feature broken
   - Medium: Minor issues affecting UX
   - Low: UI bugs, suggestions

## Known Issues

The following are known limitations:
- Sync is not real-time (polled every few seconds)
- PowerSync integration requires backend setup
- Some features are mock implementations until backend is connected

## Next Steps

After manual testing:
1. Address any critical bugs found
2. Optimize performance issues
3. Add automated tests
4. Deploy to production