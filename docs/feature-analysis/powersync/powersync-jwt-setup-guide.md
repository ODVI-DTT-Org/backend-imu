# PowerSync JWT Authentication Setup Guide

**Error:** `PSYNC_S2101(AuthorizationError): Could not find an appropriate key in the keystore. The key is missing or no key matched the token KID`

**Problem:** PowerSync cannot validate the JWT tokens because the signing key doesn't match PowerSync's keystore configuration.

---

## Understanding the Issue

PowerSync uses JWT tokens to authenticate sync requests. The JWT must be signed with a private key that PowerSync can verify using a public key in its keystore.

**Current Flow:**
1. Backend signs JWT with **Private Key A**
2. Mobile app sends JWT to PowerSync
3. PowerSync tries to verify with **Public Key B** (from its keystore)
4. ❌ Mismatch → 401 Authorization Error

---

## Solution Options

### **Option 1: Configure PowerSync with Your Backend's Public Key** (Recommended)

Add your backend's JWT public key to PowerSync's keystore.

#### Step 1: Extract Your Backend's Public Key

If your backend uses RS256 (RSA) signing:

```bash
# From your backend directory
openssl rsa -in private-key.pem -pubout -out public-key.pem
```

Or if using HS256 (HMAC):

```bash
# Your secret key (keep this secure!)
echo "your-secret-key" > jwt-secret.txt
```

#### Step 2: Add Public Key to PowerSync Keystore

**For PowerSync Cloud:**

1. Go to [PowerSync Dashboard](https://app.powersync.com/)
2. Select your project: `69ba260fe44c66e817793c98`
3. Navigate to **Settings** → **Keys**
4. Add your public key:
   - **For RS256:** Upload the PEM file or paste the public key
   - **For HS256:** Add the secret key

**For PowerSync Self-Hosted:**

Edit your `powersync/service.yaml`:

```yaml
# For RS256 (RSA)
jwt_auth:
  algorithm: RS256
  public_keys:
    - key_id: "your-key-id"
      public_key: |
        -----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
        -----END PUBLIC KEY-----

# For HS256 (HMAC)
jwt_auth:
  algorithm: HS256
  secret: "your-secret-key"
```

#### Step 3: Include `kid` (Key ID) in Your JWT

Your backend MUST include the `kid` claim in the JWT header:

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "your-key-id"  // ← Must match PowerSync keystore
}
```

**Example Backend Code (Node.js):**

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    sub: userId,
    email: user.email,
    // ... other claims
  },
  privateKey,
  {
    algorithm: 'RS256',
    keyid: 'your-key-id',  // ← This sets the "kid" header
    expiresIn: '24h'
  }
);
```

---

### **Option 2: Use PowerSync's Key Management**

Let PowerSync manage the keys instead of your backend.

#### Step 1: Generate Keys in PowerSync

1. Go to [PowerSync Dashboard](https://app.powersync.com/)
2. Select your project
3. Navigate to **Settings** → **Keys**
4. Click **Generate New Key Pair**
5. Download the private key

#### Step 2: Update Your Backend to Use PowerSync's Private Key

**Node.js Example:**

```javascript
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Load PowerSync private key
const privateKey = fs.readFileSync('./powersync-private-key.pem');

const token = jwt.sign(
  {
    sub: userId,
    email: user.email
  },
  privateKey,
  {
    algorithm: 'RS256',
    keyid: 'powersync-key-id',  // Use the key ID from PowerSync
    expiresIn: '24h'
  }
);
```

**Python Example:**

```python
import jwt
from cryptography.hazmat.primitives import serialization

# Load PowerSync private key
with open('powersync-private-key.pem', 'rb') as f:
    private_key = serialization.load_pem_private_key(
        f.read(),
        password=None
    )

# Generate JWT
token = jwt.encode(
    {
        'sub': user_id,
        'email': user.email,
        'exp': datetime.utcnow() + timedelta(hours=24)
    },
    private_key,
    algorithm='RS256',
    headers={'kid': 'powersync-key-id'}
)
```

---

## Backend Configuration Files

### **PostgreSQL Backend (NestJS)**

**File:** `backend/src/auth/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';

@Injectable()
export class AuthService {
  private privateKey: string;

  constructor(private jwtService: JwtService) {
    // Load PowerSync private key
    this.privateKey = fs.readFileSync('powersync-private-key.pem', 'utf-8');
  }

  async login(email: string, password: string) {
    // ... authenticate user ...

    // Generate JWT with PowerSync key
    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        role: user.role,
      },
      {
        privateKey: this.privateKey,
        algorithm: 'RS256',
        keyid: 'powersync-key-id',  // ← Must match PowerSync
        expiresIn: '24h',
      }
    );

    return { access_token: token };
  }
}
```

**Update `.env`:**
```env
# JWT Configuration
JWT_PRIVATE_KEY_PATH=./powersync-private-key.pem
JWT_KEY_ID=powersync-key-id
JWT_ALGORITHM=RS256
```

---

## Verification Steps

### **Step 1: Check Your JWT Header**

Use [jwt.io](https://jwt.io) to decode your JWT and check the header:

```json
{
  "alg": "RS256",      // ← Must match PowerSync config
  "typ": "JWT",
  "kid": "your-key-id" // ← Must exist and match PowerSync keystore
}
```

### **Step 2: Check Your JWT Payload**

PowerSync expects these claims:

```json
{
  "sub": "user-id-uuid",  // ← Required: User ID
  "exp": 1234567890,      // ← Required: Expiration timestamp
  "iat": 1234567890,      // ← Optional: Issued at
  // ... other claims
}
```

### **Step 3: Test PowerSync Connection**

After updating your backend:

1. Restart your backend server
2. Clear app data: `flutter clean && flutter pub get`
3. Rebuild the app: `flutter run`
4. Login and check logs for:
   ```
   [PowerSync] FINE: Credentials: PowerSyncCredentials<endpoint: ... userId: "actual-user-id" expiresAt: ...>
   ```

---

## Troubleshooting

### **Issue: Still getting "no key matched the token KID"**

**Check:**
1. Is the `kid` in your JWT header EXACTLY matching the key ID in PowerSync?
2. Is the algorithm (RS256/HS256) the same on both sides?
3. Did you restart PowerSync after adding the key?

### **Issue: "userId: null" in logs**

**Fix:** Ensure your JWT has a `sub` claim with the user ID.

### **Issue: Token expires immediately**

**Fix:** Ensure your `exp` claim is a Unix timestamp (seconds, not milliseconds):
```javascript
// WRONG (milliseconds)
exp: Date.now() + 86400000

// RIGHT (seconds)
exp: Math.floor(Date.now() / 1000) + 86400
```

---

## Quick Fix Summary

**Minimal Steps to Fix:**

1. **Extract your backend's public key** (or generate new key pair in PowerSync)
2. **Add public key to PowerSync Dashboard** (Settings → Keys)
3. **Update your backend** to include `kid` in JWT header
4. **Restart backend and test**

**Time Estimate:** 15-30 minutes

---

## Resources

- [PowerSync JWT Auth Docs](https://docs.powersync.com/authentication)
- [PowerSync Dashboard](https://app.powersync.com/)
- [JWT.io Debugger](https://jwt.io/)
- [Generate RSA Key Pair](https://travistidwell.com/jsencrypt/demo/)
