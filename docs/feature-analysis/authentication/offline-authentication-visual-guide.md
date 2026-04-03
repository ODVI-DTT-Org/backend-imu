# Offline Authentication Flow - Visual Guide

## 📱 SCENARIO 1: WiFi Available (Online Mode)

```
┌─────────────────────────────────────────────────────────────┐
│                     📶 WiFi ON                               │
│                  Internet Connected                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔐 LOGIN SCREEN                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Email:    [user@email.com]                            │   │
│  │ Password: [•••••••••]                                  │   │
│  │                                                      │   │
│  │              [Login Button]                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Backend API      │
                    │ validates       │
                    │ credentials      │
                    │ & returns JWT   │
                    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔑 PIN SETUP (First Time Only)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Enter 6-digit PIN                           │   │
│  │              [•] [•] [•] [•] [•] [•]                    │   │
│  │                                                      │   │
│  │              [Confirm PIN]                            │   │
│  │          [•] [•] [•] [•] [•] [•]                    │   │
│  │                                                      │   │
│  │              ✅ PIN Set Successfully!                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🏠 HOME SCREEN                                 │
│         Full access to all features                         │
│  • View clients                                             │
│  • Create touchpoints                                       │
│  • Sync data to PowerSync                                   │
│  • All functionality available                               │
└─────────────────────────────────────────────────────────────┘

     Status: 🟢 ONLINE
     Session: Active (8 hour timer started)
     Last Login: Current time saved
```


## 📱 SCENARIO 2: WiFi OFF (Offline Mode) - Within Grace Period

```
┌─────────────────────────────────────────────────────────────┐
│                     📶 WiFi OFF                              │
│                  No Internet Connection                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔐 LOGIN SCREEN                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Email:    [user@email.com]                            │   │
│  │ Password: [•••••••••]                                  │
│  │                                                      │   │
│  │              [Login Button] ❌ Disabled                 │   │
│  │              (Requires Internet)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            🟢 OFFLINE LOGIN AVAILABLE                  │   │
│  │                                                      │   │
│  │     Grace Period: 6h 23m remaining                   │   │
│  │     Last online: 2 hours ago                         │   │
│  │                                                      │   │
│  │              [🔑 PIN Login]                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    User taps "PIN Login" button
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔑 PIN ENTRY SCREEN                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │              Enter 6-digit PIN                       │   │
│ │                  [•] [•] [•] [•] [•] [•]                  │   │
│  │                                                      │   │
│  │           ✅ PIN Validated!                          │   │
│  │                                                      │   │
│  │     🔓 Authenticating with cached credentials...       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    PIN validated against stored hash
                              │
                              ▼
                    Cached JWT token loaded
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🏠 HOME SCREEN                                 │
│         Full access to all features                         │
│  • View clients (from local PowerSync)                       │
│  • Create touchpoints (queued for sync)                    │
│  • View cached data                                          │
│  • All functionality available ✅                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔄 Auto-sync when WiFi restored                       │   │
│  │  ⚠️  Changes will sync when online                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

     Status: 🟡 OFFLINE (Grace Period Active)
     Session: Active
     Data Source: Local PowerSync (SQLite)
     Sync Queue: Pending changes
```


## 📱 SCENARIO 3: WiFi OFF (Offline Mode) - Grace Period EXPIRED

```
┌─────────────────────────────────────────────────────────────┐
│                     📶 WiFi OFF                              │
│                  No Internet Connection                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔐 LOGIN SCREEN                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Email:    [user@email.com]                            │
│  │ Password: [•••••••••]                                  │
│  │                                                      │   │
│  │              [Login Button] ❌ Disabled                 │   │
│  │              (Requires Internet)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            🟠 OFFLINE LOGIN UNAVAILABLE                 │   │
│  │                                                      │   │
│  │     Grace Period: EXPIRED                             │   │
│  │     Last online: 10 hours ago                          │
│  │                                                      │   │
│  │              ⚠️  Please connect to WiFi                 │   │
│  │              and login with your password               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

     Status: 🔴 OFFLINE (Grace Period Expired)
     Action Required: Connect to WiFi and login online
```


## 📱 SCENARIO 4: Session Lock (15 Min Inactivity)

```
┌─────────────────────────────────────────────────────────────┐
│              🏠 HOME SCREEN                                 │
│         User is inactive for 15 minutes...                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ⏰ 15-minute timer expires
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔒 SCREEN LOCKED                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │                  🔒 Session Locked                   │   │
│  │                                                      │   │
│  │              Enter PIN to resume                       │   │
│  │                  [•] [•] [•] [•] [•] [•]                    │   │
│  │                                                      │   │
│  │              Or use biometric                          │   │
│  │              [👆 Fingerprint] [👤 Face ID]               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    User enters valid PIN
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🏠 HOME SCREEN (Restored)                    │
│         Session resumed, timer reset                        │
└─────────────────────────────────────────────────────────────┘
```


## 📱 SCENARIO 5: Session Expired (8 Hours Total)

```
┌─────────────────────────────────────────────────────────────┐
│              🏠 HOME SCREEN                                 │
│         8 hours since login...                               │
└─────────────────────────────────────────────────────────────⏰
                              │
                              ▼
                    ⏰ 8-hour session timer expires
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🔐 LOGIN SCREEN                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │              🔒 Session Expired                      │   │
│  │                                                      │   │
│  │         Please login again to continue               │   │
│  │                                                      │   │
│  │              [Email] [Password]                      │   │
│  │              [Login Button]                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

     Note: 8-hour session timer CANNOT be extended
          User must login with email + password
```


## 📊 COMPARISON TABLE

| Feature | 🟢 Online | 🟡 Offline (Grace Period) | 🔴 Offline (Expired) |
|---------|----------|-------------------------|---------------------|
| **Login Method** | Email + Password | PIN only | ❌ Must go online |
| **Internet Required** | Yes | No | Yes |
| **Data Source** | Backend API | Local PowerSync | ❌ Can't access |
| **Touchpoint Creation** | ✅ Yes | ✅ Yes (queued) | ❌ No |
| **Client Viewing** | ✅ All clients | ✅ All clients | ❌ No |
| **Data Sync** | Real-time | Queued | ❌ None |
| **Grace Period** | N/A | 8 hours | Expired |
| **PIN Required** | For convenience | Required | N/A |


## 🔄 STATE TRANSITIONS

```
┌─────────────┐
│  LOGGED OUT  │
└──────┬──────┘
       │
       ▼
   [WiFi ON?]
       │
       ├─YES──> [Online Login with Email/Password]
       │        │
       │        ├─> [First Time?] ──YES──> [Set Up PIN]
       │        │                            │
       │        └─NO─────────────────────> [Home Screen]
       │                                        │
       │                                        ├─> [15min inactive?] ──YES─> [Screen Lock]
       │                                        │                              │
       │                                        └─NO─────────────────────────> [8h elapsed?] ──YES─> [Logout]
       │
       └─NO───> [Check: PIN + Cached Token + Grace Period?]
                │
                ├─ALL YES──> [Show "PIN Login" button] ──> [Enter PIN] ──> [Home Screen]
                │
                └─ANY NO──> [Show "Go Online" message] ──> [Wait for WiFi]
```


## 🎯 USER FLOW SUMMARY

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  FIRST TIME USER                                              │
│  ────────────────                                             │
│  1. Connect to WiFi                                          │
│  2. Login with email + password                             │
│  3. Set up 6-digit PIN                                        │
│  4. App ready for use ✅                                      │
│                                                              │
│  RETURNING USER (WiFi ON)                                    │
│  ────────────────────────                                    │
│  1. App shows PIN entry screen                               │
│  2. Enter PIN or use biometric                                │
│  3. App unlocks, full access ✅                                │
│                                                              │
│  RETURNING USER (WiFi OFF, Grace Period Active)              │
│  ────────────────────────────────────────────────            │
│  1. Login screen shows "PIN Login" button (green)              │
│  2. Tap "PIN Login"                                           │
│  3. Enter PIN                                                 │
│  4. App authenticates with cached credentials                  │
│  5. Full access to local data ✅                               │
│  6. Changes sync when WiFi restored                           │
│                                                              │
│  RETURNING USER (WiFi OFF, Grace Period Expired)              │
│  ────────────────────────────────────────────────            │
│  1. Login screen shows "Go Online" message (orange)            │
│  2. Must connect to WiFi                                      │
│  3. Login with email + password                             │
│  4. Set up new grace period                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```


## 🔐 SECURITY CONSIDERATIONS

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                             │
│                                                              │
│  Layer 1: Network                                             │
│  ├─ Online: Backend validates email + password              │
│  └─ Offline: PIN + cached token validation                 │
│                                                              │
│  Layer 2: PIN Storage                                        │
│  ├─ SHA-256 hashed with unique salt per user               │
│  ├─ Stored in FlutterSecureStorage (Keychain/Keystore)    │
│  └─ Never stored in plain text                               │
│                                                              │
│  Layer 3: Token Management                                   │
│  ├─ JWT tokens validated before use                          │
│  ├─ Token expiry checked (30 min before refresh)            │
│  └─ Expired tokens force re-authentication                  │
│                                                              │
│  Layer 4: Session Management                                │
│  ├─ 15-minute auto-lock on inactivity                     │
│  ├─ 8-hour hard limit regardless of activity                │
│  └─ Failed PIN attempts (3 max) triggers lockout             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```


## 📱 UI SCREEN MOCKUPS

### Login Screen (WiFi OFF, Grace Period Available)
```
┌─────────────────────────────────────────┐
│                                           │
│         🏠 Itinerary Manager              │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ 🟢 OFFLINE LOGIN AVAILABLE           │ │
│  │                                       │ │
│  │  Grace Period: 6h 23m remaining       │ │
│ │  Last online: 2 hours ago            │ │
│  │                                       │ │
│  │      [🔑 PIN Login]                 │ │
│  │                                       │ │
│  │  ⚠️  Or connect to WiFi and         │ │
│  │      login with your password       │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  [ Cancel ]  [ Help ]                   │
└─────────────────────────────────────────┘
```

### Login Screen (WiFi OFF, Grace Period Expired)
```
┌─────────────────────────────────────────┐
│                                           │
│         🏠 Itinerary Manager              │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ 🟠 OFFLINE LOGIN UNAVAILABLE         │ │
│  │                                       │ │
│  │  Grace Period: EXPIRED                │ │
│ │  Last online: 10 hours ago           │ │
│  │                                       │
│  │  ⚠️  Please connect to WiFi and      │ │
│  │      login with your password       │ │
│  │                                       │ │
│  │      Email: [________________]      │ │
│  │  Password: [__________________]   │ │
│  │                                       │ │
│  │      [ Login Button ]               │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  [ Cancel ]  [ Help ]                   │
└─────────────────────────────────────────┘
```

### PIN Entry Screen (Offline Mode)
```
┌─────────────────────────────────────────┐
│                                           │
│         🔑 Enter PIN                     │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │                                       │ │
│  │         🔐 Authenticating...          │ │
│  │                                       │ │
│  │        [ Loading Spinner ]          │ │
│  │                                       │
│  │                                       │ │
│  │         Using cached credentials     │ │
│  │                                       │
│  └─────────────────────────────────────┘ │
│                                           │
│  [ Cancel ]                              │
└─────────────────────────────────────────┘
```

### Home Screen (Offline Mode)
```
┌─────────────────────────────────────────┐
│  👤 John Doe                              │
│  📍 Lanao del Sur                        │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  🟡 OFFLINE MODE                      │ │
│  │  Grace period: 6h 23m remaining       │ │
│  │  Changes will sync when online       │
│  └─────────────────────────────────────┘ │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  🔴 Touchpoint (queued)             │ │
│  │  🟢 Clients (61 available)           │ │
│  │  🟢 Targets (12 pending)              │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  [ Sync Queue: 3 items ]                │
└─────────────────────────────────────────┘
```

---

**Key**: 🟢 = Available | 🟡 = Limited | 🔴 = Unavailable | 📶 = WiFi Status | 🔐 = Security
