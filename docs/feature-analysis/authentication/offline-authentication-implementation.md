# Offline Authentication Implementation

## Overview

Implemented PIN/biometric-based offline authentication that allows users to access the app without internet connection for up to 8 hours after their last online login.

## Features

### 1. Offline Grace Period
- **Duration**: 8 hours after last online login
- **Requirement**: PIN must be set up
- **Validation**: Cached JWT token must still be valid

### 2. Authentication Flow

#### Online Login (Internet Required)
```
User enters email + password
  ↓
Backend API validates credentials
  ↓
JWT token returned & stored
  ↓
Last online login time saved
  ↓
User prompted to set up PIN
```

#### Offline Login (No Internet Required)
```
User opens app while offline
  ↓
App checks: Has PIN? + Within grace period? + Has cached token?
  ↓
If all yes: Show "PIN Login" button
  ↓
User enters PIN
  ↓
PIN validated against stored hash
  ↓
Cached JWT token loaded
  ↓
User authenticated! 🎉
```

### 3. Session Management

| Event | Action |
|-------|--------|
| **Online login** | Saves last online login time, starts 8-hour grace period |
| **PIN entry** | Extends session, validates cached token |
| **15 min inactivity** | Auto-locks (requires PIN to resume) |
| **8 hours total** | Session expires (requires online login) |

## Files Modified

### Core Services
1. **`lib/services/auth/secure_storage_service.dart`**
   - Added offline grace period constants
   - Added `saveLastLoginTime()` method
   - Added `saveLastOnlineLoginTime()` method
   - Added `canLoginOffline()` method
   - Added `getOfflineGracePeriodRemaining()` method

2. **`lib/services/auth/jwt_auth_service.dart`**
   - Added `saveLastOnlineLoginTime()` call in login method
   - Added `setOfflineAuth()` method for offline authentication
   - Added `updateCachedTokens()` method

3. **`lib/services/auth/offline_auth_service.dart`** (NEW)
   - Complete offline authentication service
   - `authenticateWithPin()` - PIN-based offline auth
   - `authenticateWithBiometric()` - Biometric offline auth
   - `getGracePeriodRemaining()` - Check remaining grace period
   - `needsReauthentication()` - Check if re-auth is needed

### UI Pages
4. **`lib/features/auth/presentation/pages/login_page.dart`**
   - Added offline capability check
   - Added grace period display
   - Added "PIN Login" button when offline & available
   - Shows remaining grace period

5. **`lib/features/auth/presentation/pages/pin_entry_page.dart`**
   - Added offline mode detection
   - Added `_handleOfflineAuth()` method
   - Added `_handleOnlineAuth()` method
   - Supports both online and offline PIN authentication

### Providers
6. **`lib/shared/providers/app_providers.dart`**
   - Added `offlineAuthProvider` export
   - Added offline auth service import

## User Experience

### When Online
1. User enters email + password
2. Backend validates and returns JWT token
3. User sets up PIN (first time only)
4. App is ready for use

### When Offline (Within Grace Period)
1. App detects offline status
2. Shows green banner: "Offline login available!"
3. Shows remaining grace period (e.g., "6 hours 23 minutes remaining")
4. User taps "PIN Login" button
5. User enters 6-digit PIN
6. App authenticates with cached credentials
7. User has full access to local data

### When Offline (Grace Period Expired)
1. App detects offline status
2. Shows orange banner: "You are offline. Login requires internet connection."
3. No "PIN Login" button shown
4. User must connect to internet and login with email + password

## Security Features

1. **PIN Storage**: SHA-256 hashed with unique salt per user
2. **Token Validation**: Cached tokens are validated before use
3. **Session Expiry**: 8-hour hard limit regardless of activity
4. **Inactivity Lock**: 15-minute auto-lock requires PIN to resume
5. **Failed Attempt Limit**: 3 failed PIN attempts shows re-auth prompt

## Technical Details

### Grace Period Calculation
```dart
// Check if within 8 hours of last online login
final lastOnlineLogin = await getLastOnlineLoginTime();
final timeSinceLastOnline = DateTime.now().difference(lastOnlineLogin);
final gracePeriod = Duration(hours: 8);

return timeSinceLastOnline < gracePeriod;
```

### Token Validation
```dart
// Decode JWT and check expiration
final decoded = JwtDecoder.decode(token);
final exp = decoded['exp'] as int?;
final expiryTime = DateTime.fromMillisecondsSinceEpoch(exp * 1000);

// Check if token is expired
if (DateTime.now().isAfter(expiryTime)) {
  // Token expired, requires re-authentication
}
```

## Testing Checklist

- [ ] Online login with email + password works
- [ ] PIN setup after first login works
- [ ] PIN entry while online works
- [ ] Offline login with PIN works (within grace period)
- [ ] Offline login blocked after grace period expires
- [ ] Grace period display shows correct time remaining
- [ ] Session auto-locks after 15 minutes of inactivity
- [ ] Session expires after 8 hours total
- [ ] Failed PIN attempts show appropriate error messages

## Future Enhancements

1. **Biometric Authentication**: Use fingerprint/Face ID for offline login
2. **Multiple Users**: Support multiple offline profiles on same device
3. **Admin Override**: Allow admin to bypass grace period restriction
4. **Sync Status**: Show last successful sync time in offline banner
5. **Data Freshness**: Warn users about stale data when offline

## Migration Guide

### For Existing Users
1. Update app to latest version
2. Login online with email + password
3. Set up PIN when prompted
4. Offline authentication is now enabled!

### For New Users
1. Install app
2. Login online with email + password
3. Set up PIN (required)
4. Use PIN for quick access going forward

---

**Implementation Date**: March 26, 2026
**Version**: 1.0.0
**Status**: ✅ Complete
