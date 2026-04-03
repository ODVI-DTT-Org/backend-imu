# PowerSync Production JWT Setup - Complete Guide

**Last Updated:** 2026-03-26
**Project ID:** `69ba260fe44c66e817793c98`
**Key ID:** `imu-production-key-20260326`

---

## 📋 Table of Contents

1. [PowerSync Dashboard Configuration](#step-1-powersync-dashboard-configuration)
2. [Backend Configuration](#step-2-backend-configuration)
3. [Testing & Verification](#step-3-testing--verification)
4. [Troubleshooting](#troubleshooting)

---

## Step 1: PowerSync Dashboard Configuration

### **JWKS Configuration**

Go to: https://app.powersync.com/ → Project `69ba260fe44c66e817793c98` → Settings → Keys

**Copy and paste this JWKS:**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "imu-production-key-20260326",
      "n": "ygBzhoizpWxEEn4ZXDPqNVBlTneRv3dIK-9WZ7gd1gRmMf7aNsawcjZwnUU03a8m4lVEnf4_oFkv72ryDR9YHdJkjXe-rrg7yky071jN_DgePg_dReYqssCCNEmJRDquQ5mzvALJUQqicTZFmqdSueszhKZCwYAOLdbmLsygEgYa9lXlD7XSqSde2ToHrWnDqrSy0oJqnTaKk7Yg7qn7ydIBa9DMc_dy66FKHvDx36eVWFgQPR2SDY5zD1v9tG0acoKmCitKaLvg3IPmZJ8Ha_hML6bnH55YC9cMZgYpFsobimmvJRvnxrqauGjCystihgaBdpYeTJhvfu656OeqyQ",
      "e": "AQAB",
      "alg": "RS256",
      "use": "sig"
    }
  ]
}
```

**Settings:**
- **Key ID:** `imu-production-key-20260326`
- **Algorithm:** RS256

---

## Step 2: Backend Configuration

### **Save Private Key**

Create file: `backend/powersync-private-key.pem`

**⚠️ IMPORTANT:** Add to `.gitignore`:
```
powersync-private-key.pem
*.pem
```

**Copy this private key:**

```
-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDKAHOGiLOlbEQS
fhlcM+o1UGVOd5G/d0gr71ZnuB3WBGYx/to2xrByNnCdRTTdrybiVUSd/j+gWS/v
avINH1gd0mSNd76uuDvKTLTvWM38OB4+D91F5iqywII0SYlEOq5DmbO8AslRCqJx
NkWap1K56zOEpkLBgA4t1uYuzKASBhr2VeUPtdKpJ17ZOgetacOqtLLSgmqdNoqT
tiDuqfvJ0gFr0Mxz93LroUoe8PHfp5VYWBA9HZINjnMPW/20bRpygqYKK0pou+Dc
g+Zknwdr+EwvpucfnlgL1wxmBikWyhuKaa8lG+fGupq4aMLKy2KGBoF2lh5MmG9+
7rno56rJAgMBAAECggEAGKqQG3rQilVQxVFQl3RfbRMxdltzbgXgHOf6N8AWee50
7DX1P4Bo8LQPxvnkcrgomgqqI6t1lDGlK38g/36MVq089L633MNHycmEGUCm0TL+
aRBW3L+LseLVWL0ssyrXN2Squz073VbcbyaevpEgBkPfjpsexlzKCR7st1o//EiQ
XCZMYdQsT4BqMx/rZr3S0pLHiKti+DDY3IwJ0/lAQQybhnrxW5sUKv3ijB7LJt0u
7iNFKSKDc7f1DWo25xZf3SKjOCTrdK1Hov013hx9rAlOAbZ7dTf+E8USsZolD+1z
wHm3rLPdIAJSkZSa2g+VugA01O2w2WBEGtT7EXBT4QKBgQDnQEX2+S3nDcSD1G0y
VosAK0prH7qq3tl/DjRMctVP3A2vQ1ExQGZRIteAn3afWSW05jsyX9wHJYR1F2eS
eHAUmKBsQpDs8o2U+y1gpQPZGF6586ZbMjEJmtRyNt80MtsSp8Y86S/WBDO1mVey
lH52yccXBCDa2f9sd7aYzW++ZwKBgQDfntEg7Pg9uS1QoFQWucjgJcBJCch8Uteu
BoCEYcywNKubVhmsDYy0DwOILPHxcCWP5aFpBrmBUtEngsTvwam2qUPjcoyvutPn
5O+z4KEIAf7u8xfs4tL4P5poqhek+otdvqKsdmnV7CxjrJ0prPeJlYAHahpQcZ+p
MDdX7HEvTwKBgEIJdbFYaQZRRSwMTn6QfjM3KZI7xlejOeLxkHfAVy/t/C5vf9Eb
vdwvofDGGN7aW000bfUtsKyNxyyU2WvXXtJS34Tq4W34ufuwWr39gYLOVcauUHQ8
egpvH3naN5U1bKAALzkXsiRgoM+cEZIam56acnMdJ7C3jhxQd2FdUSrDAoGAKJSU
lOoL/n99RrVhrSIX3v1a0KZS2KTb+Pu7FMr+rzdPsQfF7uAimYZj+LFXUp4sYtmk
GgAbZ+mUhRwJCw1U9A3xgPQHrdg0nk+AZF8uOdrK3agFvnpHGL/KEJZVZh4FboSq
1qtCd4y9XXU0rBx0a2ZS7oWFsvV7qONUF8OToqcCgYALbcTmfr8PU1YJ/43Elwza
meaweJeV7apcmrWVewbip+qz0hTLOxr08GOQFom6Y8lGzZEpO5gK9DnkbmNYx5wm
HiBaR7xH/Pd9NaIv0PcxOVzpX9TwBiRGD59/co5w+8WUrpbcRjPW0Y8lcK5s6AoJ
Yts+idNRYwG1gefNVMM3Qg==
-----END PRIVATE KEY-----
```

---

### **Backend Code Examples**

#### **Option A: NestJS (Recommended)**

**File:** `backend/src/auth/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AuthService {
  private privateKey: string;

  constructor(private jwtService: JwtService) {
    // Load private key from file
    const privateKeyPath = path.join(process.cwd(), 'powersync-private-key.pem');
    try {
      this.privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
      console.log('✅ PowerSync private key loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load PowerSync private key:', error);
      throw new Error('PowerSync private key not found');
    }
  }

  async login(email: string, password: string) {
    // ... your authentication logic ...

    const payload = {
      sub: user.id,              // Required: User ID (UUID)
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
    };

    const token = this.jwtService.sign(payload, {
      privateKey: this.privateKey,
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',  // ← MUST match JWKS kid!
      expiresIn: '24h',
    });

    console.log('✅ JWT generated with PowerSync key');

    return {
      access_token: token,
      user: { ...payload }
    };
  }
}
```

---

#### **Option B: Express.js**

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Load private key
const privateKey = fs.readFileSync(
  path.join(__dirname, '../powersync-private-key.pem'),
  'utf-8'
);

async function login(req, res) {
  const { email, password } = req.body;

  // ... your authentication logic ...

  const payload = {
    sub: user.id,              // Required: User ID (UUID)
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    role: user.role,
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: 'imu-production-key-20260326',  // ← Critical!
    expiresIn: '24h',
  });

  return res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 86400
  });
}
```

---

#### **Option C: FastAPI (Python)**

```python
import jwt
from datetime import datetime, timedelta
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

class AuthService:
    def __init__(self):
        # Load private key
        key_path = Path(__file__).parent / "powersync-private-key.pem"
        with open(key_path, "rb") as f:
            self.private_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
                backend=default_backend()
            )
        print("✅ PowerSync private key loaded")

    async def login(self, email: str, password: str):
        # ... your authentication logic ...

        payload = {
            "sub": str(user.id),        # Required: User ID (UUID)
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "exp": datetime.utcnow() + timedelta(hours=24)
        }

        token = jwt.encode(
            payload,
            self.private_key,
            algorithm="RS256",
            headers={"kid": "imu-production-key-20260326"}  # ← Critical!
        )

        print("✅ JWT generated with PowerSync key")

        return {"access_token": token}
```

---

## Step 3: Testing & Verification

### **Expected Logs (Mobile App)**

After configuration, you should see:

```
[DEBUG] Login successful for 33081a5a-51b4-4111-8642-52886c06fe30
[DEBUG] Connecting to PowerSync...
[DEBUG] JWT token available, length: 500+
[DEBUG] PowerSync credentials fetched successfully
[PowerSync] FINE: Credentials: PowerSyncCredentials<userId: "33081a5a-51b4-4111-8642-52886c06fe30" expiresAt: 1774583329>
[PowerSync] FINE: Sync completed successfully ✅
```

### **No More Errors:**

❌ `401 Unauthorized: PSYNC_S2101(AuthorizationError): Could not find an appropriate key in the keystore`
❌ `No access token - user needs to login`
❌ `Logout successful` (auto-logout loop)

✅ **Everything works!**

---

## Troubleshooting

### **Error: "private key not found"**

**Fix:** Ensure `powersync-private-key.pem` is in your backend root directory.

---

### **Error: "kid mismatch"**

**Fix:** Ensure these match EXACTLY:
- PowerSync Dashboard: `imu-production-key-20260326`
- Backend code: `keyid: 'imu-production-key-20260326'`
- JWKS `kid` field: `"imu-production-key-20260326"`

---

### **Error: "Invalid token format"**

**Fix:** Your JWT must include these claims:
```json
{
  "sub": "user-uuid",    // Required: User ID
  "exp": 1734567890,     // Required: Expiration timestamp
  "email": "user@email",  // Optional
  "first_name": "...",   // Optional
  "last_name": "..."     // Optional
}
```

---

### **Error: "Algorithm not supported"**

**Fix:** Ensure you're using `RS256` (RSA with SHA-256) on both:
- PowerSync Dashboard: RS256
- Backend: `algorithm: 'RS256'`

---

## Security Checklist

- ✅ Private key is saved as `backend/powersync-private-key.pem`
- ✅ Private key is in `.gitignore`
- ✅ Private key has restricted permissions (chmod 600)
- ✅ JWKS is configured in PowerSync Dashboard
- ✅ Backend uses `keyid: 'imu-production-key-20260326'`
- ✅ Backend uses `algorithm: 'RS256'`

---

## Quick Reference

| Configuration | Value |
|----------------|-------|
| **PowerSync Project** | `69ba260fe44c66e817793c98` |
| **Key ID** | `imu-production-key-20260326` |
| **Algorithm** | `RS256` |
| **Token Expiration** | 24 hours |
| **Private Key Path** | `backend/powersync-private-key.pem` |
| **JWT Header Required** | `kid: "imu-production-key-20260326"` |

---

## Files to Update

1. **Backend:** `backend/src/auth/auth.service.ts` (or equivalent)
2. **Backend:** Create `backend/powersync-private-key.pem`
3. **Gitignore:** Add `*.pem` and `powersync-private-key.pem`
4. **PowerSync:** Paste JWKS in dashboard settings

---

## Next Steps

1. ✅ Copy JWKS to PowerSync Dashboard
2. ✅ Save private key to `backend/powersync-private-key.pem`
3. ✅ Update backend auth service code (choose your framework above)
4. ✅ Restart backend server
5. ✅ Test login in mobile app
6. ✅ Verify sync logs show success

---

**Generated:** 2026-03-26
**Valid Until:** Keys don't expire, but you can regenerate anytime
**Support:** Check logs for `PowerSync FINE: Sync completed successfully`
