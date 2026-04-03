# JWT Token Generator for PowerSync Testing

This script generates test JWT tokens compatible with PowerSync.

## Prerequisites

```bash
npm install jsonwebtoken cryptography
```

Or use Python:
```bash
pip install pyjwt cryptography
```

---

## Option 1: Node.js Generator

Create `generate-token.js`:

```javascript
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncodingStrategy: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncodingStrategy: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Your PowerSync project ID
const POWERSYNC_PROJECT_ID = '69ba260fe44c66e817793c98';
const KEY_ID = 'imu-test-key';

// User data
const userPayload = {
  sub: '33081a5a-51b4-4111-8642-52886c06fe30', // User ID from your logs
  email: 'mobile@imu.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'field_agent',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
};

// Generate JWT
const token = jwt.sign(userPayload, privateKey, {
  algorithm: 'RS256',
  keyid: KEY_ID
});

console.log('=== JWT Token Generated ===\n');
console.log('Token:', token);
console.log('\n=== Private Key (save this!) ===\n');
console.log(privateKey);
console.log('\n=== Public Key (add to PowerSync) ===\n');
console.log(publicKey);
console.log('\n=== Key ID (add to PowerSync) ===\n');
console.log(KEY_ID);
```

Run it:
```bash
node generate-token.js
```

---

## Option 2: Python Generator

Create `generate_token.py`:

```python
import jwt
import uuid
from datetime import datetime, timedelta
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# Generate RSA key pair
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend()
)

private_pem = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

public_key = private_key.public_key()
public_pem = public_key.public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

# Your PowerSync project ID
POWERSYNC_PROJECT_ID = '69ba260fe44c66e817793c98'
KEY_ID = 'imu-test-key'

# User data
user_payload = {
    'sub': '33081a5a-51b4-4111-8642-52886c06fe30',  # User ID from your logs
    'email': 'mobile@imu.com',
    'first_name': 'Test',
    'last_name': 'User',
    'role': 'field_agent',
    'iat': int(datetime.utcnow().timestamp()),
    'exp': int((datetime.utcnow() + timedelta(hours=24)).timestamp())
}

# Generate JWT
token = jwt.encode(user_payload, private_pem, algorithm='RS256', headers={'kid': KEY_ID})

print('=== JWT Token Generated ===\n')
print('Token:', token)
print('\n=== Private Key (save this!) ===\n')
print(private_pem.decode())
print('\n=== Public Key (add to PowerSync) ===\n')
print(public_pem.decode())
print('\n=== Key ID (add to PowerSync) ===\n')
print(KEY_ID)
```

Run it:
```bash
python generate_token.py
```

---

## Option 3: Quick Online Tool

Visit: https://jwt.io/

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "imu-test-key"
}
```

**Payload:**
```json
{
  "sub": "33081a5a-51b4-4111-8642-52886c06fe30",
  "email": "mobile@imu.com",
  "first_name": "Test",
  "last_name": "User",
  "role": "field_agent",
  "iat": 1711464000,
  "exp": 1711550400
}
```

**Note:** For RS256, you'll need to sign with your private key.

---

## Adding to PowerSync

### Step 1: Get Your Public Key

From the output above, copy the **Public Key** section.

### Step 2: Add to PowerSync Dashboard

1. Go to [PowerSync Dashboard](https://app.powersync.com/)
2. Select project: `69ba260fe44c66e817793c98`
3. Go to **Settings** → **Keys**
4. Click **Add Key**
5. Enter:
   - **Key ID:** `imu-test-key`
   - **Public Key:** (paste your public key)
   - **Algorithm:** RS256

### Step 3: Test in Mobile App

Use the generated token in your app:

```dart
// For testing only - set token directly
final jwtAuth = JwtAuthService.instance;
// You'll need to add a method to set token for testing
```

---

## Manual Test Token (HS256)

For quick testing without RSA, you can use HS256 (HMAC):

**Secret:** `imu-test-secret-key-2024`

**Token:** Generate at https://jwt.io/

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT",
  "kid": "imu-hmac-key"
}
```

**Payload:**
```json
{
  "sub": "33081a5a-51b4-4111-8642-52886c06fe30",
  "email": "mobile@imu.com",
  "exp": 1711550400
}
```

**Note:** HS256 is less secure than RS256 but easier for testing.

---

## Verification

After adding the key to PowerSync, test with:

```bash
# Test the token
curl -X POST https://69ba260fe44c66e817793c98.powersync.journeyapps.com/sync \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response: Sync stream opens (no 401 error).

---

## Next Steps

1. ✅ Run the generator script
2. ✅ Add the **Public Key** to PowerSync Dashboard
3. ✅ Update your backend to use the **Private Key** for signing
4. ✅ Test login in the mobile app

The generated token should work immediately with PowerSync!
