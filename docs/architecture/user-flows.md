# User Flows

> **IMU User Journey Flows** - Detailed user interaction flows

---

## Field Agent (Caravan) Flows

### Flow 1: First-Time Login

```mermaid
flowchart TD
    Start([App Start]) --> EmailInput[Enter Email/Password]
    EmailInput --> ValidateCredentials{Valid?}
    ValidateCredentials -->|No| ShowError[Show Error]
    ShowError --> EmailInput
    ValidateCredentials -->|Yes| FirstTimeCheck{First Time?}
    FirstTimeCheck -->|Yes| PinSetup[Create 6-digit PIN]
    FirstTimeCheck -->|No| PinEntry[Enter PIN]
    PinSetup --> PinConfirm[Confirm PIN]
    PinConfirm --> PinsMatch{PINs Match?}
    PinsMatch -->|No| PinSetup
    PinsMatch -->|Yes| BiometricOffer{Biometric Available?}
    PinEntry --> ValidatePIN{Valid PIN?}
    ValidatePIN -->|No| PinLock[Account Locked 3 attempts]
    ValidatePIN -->|Yes| BiometricOffer
    BiometricOffer -->|Yes| EnableBiometric[Enable Biometric]
    BiometricOffer -->|No| Dashboard[View Dashboard]
    EnableBiometric --> Dashboard
```

**Steps:**
1. User opens mobile app
2. Enters email and password
3. Backend validates credentials
4. If first-time user: Setup 6-digit PIN
5. If returning user: Enter PIN
6. Optional: Enable biometric authentication
7. Navigate to dashboard

**Error Handling:**
- Invalid credentials: Show error message
- PIN mismatch: Ask to re-enter
- 3 failed PIN attempts: Lock account
- Network error: Queue for retry

---

### Flow 2: Daily Client Visit

```mermaid
flowchart TD
    Start([Open App]) --> ViewItinerary[View Daily Itinerary]
    ViewItinerary --> SelectClient[Select Client]
    SelectClient --> ViewNavigation[View Navigation Options]
    ViewNavigation --> OpenMaps[Open Google Maps]
    OpenMaps --> TravelToClient[Travel to Client]
    TravelToClient --> ArriveAtClient[Arrive at Client]
    ArriveAtClient --> StartVisit[Start Visit]
    StartVisit --> CaptureTimeIn[Capture Time In GPS]
    CaptureTimeIn --> ValidateGPS{GPS Accurate?}
    ValidateGPS -->|No| RetryGPS[Retry GPS]
    RetryGPS --> ValidateGPS
    ValidateGPS -->|Yes| SelectReason[Select Visit Reason]
    SelectReason --> ChooseStatus[Choose Client Status]
    ChooseStatus --> AddPhoto[Add Photo Optional]
    AddPhoto --> AddAudio[Add Audio Note Optional]
    AddAudio --> CaptureTimeOut[Capture Time Out GPS]
    CaptureTimeOut --> ReviewTouchpoint[Review Touchpoint]
    ReviewTouchpoint --> ConfirmSave{Confirm?}
    ConfirmSave -->|No| SelectReason
    ConfirmSave -->|Yes| SaveTouchpoint[Save Touchpoint]
    SaveTouchpoint --> SyncToPowerSync[Sync to PowerSync]
    SyncToPowerSync --> NextClient{More Clients?}
    NextClient -->|Yes| SelectClient
    NextClient -->|No| EndDay[End Day]
```

**Steps:**
1. View daily itinerary
2. Select client to visit
3. Open navigation (Google Maps)
4. Travel to client location
5. Arrive and start visit
6. Capture GPS location (time in)
7. Select visit reason
8. Choose client status
9. Optionally add photo
10. Optionally add audio note
11. Capture GPS location (time out)
12. Review and confirm
13. Save touchpoint
14. Sync to PowerSync
15. Continue to next client

**Validation:**
- GPS accuracy must be < 50m
- Touchpoint number must be valid for role (Caravan: 1, 4, 7)
- All required fields must be filled

---

### Flow 3: Offline Touchpoint Creation

```mermaid
flowchart TD
    Start([No Internet]) --> CreateTouchpoint[Create Touchpoint]
    CreateTouchpoint --> SaveLocally[Save to Local DB]
    SaveLocally --> ShowPending[Show Pending Status]
    ShowPending --> InternetCheck{Internet Available?}
    InternetCheck -->|No| ContinueOffline[Continue Offline Work]
    ContinueOffline --> CreateTouchpoint
    InternetCheck -->|Yes| SyncNow[Sync Now]
    SyncNow --> UploadPending[Upload Pending Changes]
    UploadPending --> SyncSuccess{Sync Success?}
    SyncSuccess -->|Yes| ShowSynced[Show Synced Status]
    SyncSuccess -->|No| RetrySync[Retry Later]
    ShowSynced --> End([Complete])
    RetrySync --> InternetCheck
```

**Steps:**
1. Create touchpoint without internet
2. Save to local PowerSync database
3. Show pending sync indicator
4. When internet available: auto-sync
5. Upload all pending changes
6. Show synced status

**Offline Features:**
- View assigned clients
- Create touchpoints
- View itinerary
- Limited functionality without sync

---

## Administrator Flows

### Flow 4: User Management

```mermaid
flowchart TD
    Start([Login to Web Admin]) --> Dashboard[View Dashboard]
    Dashboard --> NavigateUsers[Navigate to Users]
    NavigateUsers --> ViewUsers[View User List]
    ViewUsers --> UserAction{Select Action}
    UserAction -->|Create| CreateUser[Create New User]
    UserAction -->|Edit| EditUser[Edit User]
    UserAction -->|Delete| ConfirmDelete{Confirm Delete?}
    CreateUser --> EnterUserDetails[Enter User Details]
    EnterUserDetails --> ValidateUser{Valid?}
    ValidateUser -->|No| ShowUserErrors[Show Validation Errors]
    ShowUserErrors --> EnterUserDetails
    ValidateUser -->|Yes| SaveUser[Save User]
    EditUser --> LoadUserData[Load User Data]
    LoadUserData --> UpdateUserDetails[Update User Details]
    UpdateUserDetails --> SaveUser
    ConfirmDelete -->|Yes| DeleteUser[Delete User]
    ConfirmDelete -->|No| ViewUsers
    SaveUser --> ViewUsers
    DeleteUser --> ViewUsers
```

**Steps:**
1. Login to web admin
2. Navigate to Users section
3. Choose action: Create, Edit, Delete
4. For Create: Enter user details and save
5. For Edit: Load user, update details, save
6. For Delete: Confirm deletion
7. View updated user list

**Validation:**
- Email must be unique
- Role must be valid
- Required fields must be filled
- Password requirements for new users

---

### Flow 5: Client Import

```mermaid
flowchart TD
    Start([Navigate to Clients]) --> ClickImport[Click Import Button]
    ClickImport --> UploadCSV[Upload CSV File]
    UploadCSV --> ValidateCSV{Valid CSV?}
    ValidateCSV -->|No| ShowCSVErrors[Show CSV Errors]
    ShowCSVErrors --> UploadCSV
    ValidateCSV -->|Yes| PreviewData[Preview Import Data]
    PreviewData --> ConfirmImport{Confirm Import?}
    ConfirmImport -->|No| ClickImport
    ConfirmImport -->|Yes| ProcessImport[Process Import]
    ProcessImport --> ValidateData{Data Valid?}
    ValidateData -->|No| ShowDataErrors[Show Validation Errors]
    ShowDataErrors --> ConfirmImport
    ValidateData -->|Yes| SaveClients[Save Clients to DB]
    SaveClients --> AssignToAgency[Assign to Agency]
    AssignToAgency --> AssignToUsers[Assign to Field Agents]
    AssignToUsers --> ImportComplete[Import Complete]
    ImportComplete --> ShowResults[Show Import Results]
```

**Steps:**
1. Navigate to Clients section
2. Click Import button
3. Upload CSV file
4. Validate CSV format
5. Preview import data
6. Confirm import
7. Process and validate data
8. Save clients to database
9. Assign to agency and users
10. Show import results

**CSV Format:**
```csv
first_name,middle_name,last_name,client_type,product_type,market_type,pension_type,street,barangay,city_municipality,province,region,postal_code,phone_type,phone_number
```

---

## Tele Agent Flows

### Flow 6: Call Touchpoint Creation

```mermaid
flowchart TD
    Start([Open Web Admin]) --> ViewClients[View Assigned Clients]
    ViewClients --> SelectCallClient[Select Client for Call]
    SelectCallClient --> ClickCreateTouchpoint[Click Create Touchpoint]
    ClickCreateTouchpoint --> SelectCallNumber[Select Touchpoint Number]
    SelectCallNumber --> ValidateCallNumber{Valid Call Number?}
    ValidateCallNumber -->|No| ShowCallError[Show Validation Error]
    ShowCallError --> SelectCallNumber
    ValidateCallNumber -->|Yes| EnterCallDetails[Enter Call Details]
    EnterCallDetails --> SelectCallReason[Select Call Reason]
    SelectCallReason --> ChooseCallStatus[Choose Client Status]
    ChooseCallStatus --> EnterCallDuration[Enter Call Duration]
    EnterCallDuration --> EnterCallNotes[Enter Call Notes]
    EnterCallNotes --> ReviewCallTouchpoint[Review Touchpoint]
    ReviewCallTouchpoint --> SaveCallTouchpoint[Save Touchpoint]
    SaveCallTouchpoint --> ViewUpdatedClients[View Updated Client List]
```

**Steps:**
1. Open web admin
2. View assigned clients
3. Select client for call
4. Click create touchpoint
5. Select call touchpoint number (2, 3, 5, 6)
6. Enter call details
7. Select call reason
8. Choose client status
9. Enter call duration
10. Add call notes
11. Save touchpoint

**Validation:**
- Tele role can only create call touchpoints (2, 3, 5, 6)
- Call duration must be positive
- All required fields must be filled

---

## Common User Flow Elements

### Navigation Patterns

**Mobile App Navigation:**
- Bottom navigation bar
- Main sections: Home, Clients, Itinerary, Profile
- Back button for navigation hierarchy
- Deep linking for notifications

**Web Admin Navigation:**
- Sidebar navigation
- Main sections: Dashboard, Users, Clients, Agencies, Reports
- Breadcrumbs for navigation hierarchy
- Role-based menu items

### Data Entry Patterns

**Mobile Data Entry:**
- Form validation at field level
- Progress indicators for multi-step forms
- Auto-save for long forms
- Confirmation dialogs for destructive actions

**Web Data Entry:**
- Inline validation
- Modal dialogs for forms
- Table-based data entry
- Bulk operations available

### Error Handling Patterns

**Common Error States:**
- Network errors: Retry option
- Validation errors: Inline messages
- Authentication errors: Redirect to login
- Server errors: Contact support message

---

## User Flow Optimization

### Performance Considerations

**Mobile:**
- Lazy load client lists
- Cache frequently accessed data
- Optimize image sizes
- Minimize sync data

**Web:**
- Pagination for large lists
- Debounce search inputs
- Virtual scrolling for tables
- Lazy load images

### Accessibility

**Mobile:**
- Minimum touch target size: 48x48dp
- Color contrast ratio: 4.5:1
- Screen reader support
- Haptic feedback for actions

**Web:**
- Keyboard navigation support
- ARIA labels for screen readers
- Focus indicators
- Error announcements

---

**Last Updated:** 2026-04-02
