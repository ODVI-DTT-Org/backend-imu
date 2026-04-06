# IMU Environment Variables

> **Environment Configuration** - All required and optional environment variables

---

## Overview

The IMU project uses environment variables for configuration across three platforms:
- **Backend (Hono)** - Node.js/TypeScript
- **Mobile (Flutter)** - Dart/Flutter
- **Web Admin (Vue)** - Vue 3/TypeScript

**⚠️ SECURITY WARNING:** Never commit `.env` files to version control. Always use `.env.example` files as templates.

---

## Backend Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database_name

# JWT Authentication
JWT_SECRET=your-super-secret-key-min-256-bits
JWT_EXPIRY_HOURS=720          # Access token expiration (30 days)
JWT_REFRESH_EXPIRY_DAYS=30    # Refresh token expiration (30 days)

# PowerSync
POWERSYNC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
POWERSYNC_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
POWERSYNC_KEY_ID=imu-production-key-20260401
POWERSYNC_URL=https://xxx.powersync.journeyapps.com

# Mapbox
MAPBOX_ACCESS_TOKEN=your-mapbox-public-token

# Email (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
EMAIL_FROM=noreply@example.com

# Storage (optional)
STORAGE_TYPE=s3|nas
S3_BUCKET=imu-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
NAS_PATH=/path/to/nas/storage

# Application
NODE_ENV=production|development
PORT=4000
API_URL=https://imu-api.cfbtools.app
CORS_ORIGINS=https://imu-web.example.com
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info|debug|error

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Session
SESSION_SECRET=your-session-secret
SESSION_MAX_AGE=28800000
```

---

## Mobile Environment Variables

### Development (`.env.dev`)

```bash
# API Configuration
API_BASE_URL=http://localhost:4000
API_TIMEOUT=30000

# PowerSync
POWERSYNC_URL=https://dev-xxx.powersync.journeyapps.com
POWERSYNC_TOKEN_ENDPOINT=http://localhost:4000/auth/powersync-token

# Mapbox
MAPBOX_ACCESS_TOKEN=your-mapbox-token
MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12

# Storage
STORAGE_BASE_URL=http://localhost:4000/uploads

# App Configuration
APP_ENV=development
SYNC_INTERVAL_SECONDS=60
GPS_ACCURACY_THRESHOLD=50
GPS_TIMEOUT_SECONDS=30

# Session
SESSION_TIMEOUT_MINUTES=480
AUTO_LOCK_MINUTES=15

# Features
ENABLE_BIOMETRIC=true
ENABLE_DEBUG_TOOLS=true
```

### Production (`.env.prod`)

```bash
# API Configuration
API_BASE_URL=https://imu-api.cfbtools.app
API_TIMEOUT=30000

# PowerSync
POWERSYNC_URL=https://xxx.powersync.journeyapps.com
POWERSYNC_TOKEN_ENDPOINT=https://imu-api.cfbtools.app/auth/powersync-token

# Mapbox
MAPBOX_ACCESS_TOKEN=your-production-mapbox-token
MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12

# Storage
STORAGE_BASE_URL=https://cdn.example.com/uploads

# App Configuration
APP_ENV=production
SYNC_INTERVAL_SECONDS=300
GPS_ACCURACY_THRESHOLD=50
GPS_TIMEOUT_SECONDS=30

# Session
SESSION_TIMEOUT_MINUTES=480
AUTO_LOCK_MINUTES=15

# Features
ENABLE_BIOMETRIC=true
ENABLE_DEBUG_TOOLS=false
```

---

## Web Admin Environment Variables

### Development (`.env.development`)

```bash
# API Configuration
VITE_API_URL=http://localhost:4000
VITE_API_TIMEOUT=30000

# Mapbox
VITE_MAPBOX_TOKEN=your-mapbox-token

# Application
VITE_APP_ENV=development
VITE_APP_TITLE=IMU Admin

# Feature Flags
VITE_ENABLE_DEBUG=true
VITE_ENABLE_ANALYTICS=false
```

### Production (`.env.production`)

```bash
# API Configuration
VITE_API_URL=https://imu-api.cfbtools.app
VITE_API_TIMEOUT=30000

# Mapbox
VITE_MAPBOX_TOKEN=your-production-mapbox-token

# Application
VITE_APP_ENV=production
VITE_APP_TITLE=IMU Admin

# Feature Flags
VITE_ENABLE_DEBUG=false
VITE_ENABLE_ANALYTICS=true
```

---

## Variable Reference

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `DB_POOL_MIN` | No | 2 | Minimum pool size |
| `DB_POOL_MAX` | No | 10 | Maximum pool size |

### JWT Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for signing tokens |
| `JWT_EXPIRY_HOURS` | No | 24 | Access token expiration in hours (1 day) |
| `JWT_REFRESH_EXPIRY_DAYS` | No | 30 | Refresh token expiration in days (30 days) |
| `JWT_ALGORITHM` | No | RS256 | Signing algorithm |

### PowerSync

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POWERSYNC_PRIVATE_KEY` | Yes | - | RSA private key (with escaped newlines) |
| `POWERSYNC_PUBLIC_KEY` | Yes | - | RSA public key (with escaped newlines) |
| `POWERSYNC_KEY_ID` | Yes | - | Key identifier for PowerSync |
| `POWERSYNC_URL` | Yes | - | PowerSync service URL |

### Mapbox

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAPBOX_ACCESS_TOKEN` | Yes | - | Mapbox public access token |
| `MAPBOX_STYLE_URL` | No | mapbox://styles/mapbox/streets-v12 | Map style URL |

### Email (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | SMTP server host |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |
| `EMAIL_FROM` | No | - | Default sender email |

---

## Setup Instructions

### Backend

1. **Create `.env` file:**
```bash
cd backend
cp .env.example .env
```

2. **Edit `.env` with your values:**
```bash
DATABASE_URL=postgresql://imu_user:password@localhost:5432/imu_db
JWT_SECRET=generate-a-secure-random-key-here
POWERSYNC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
# ... other variables
```

3. **Handle escaped newlines in keys:**
```javascript
// In code, handle escaped newlines:
const privateKey = process.env.POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n');
```

### Mobile (Flutter)

1. **Create environment files:**
```bash
cd mobile/imu_flutter
cp .env.dev.example .env.dev
cp .env.prod.example .env.prod
```

2. **Add to `pubspec.yaml`:**
```yaml
flutter:
  assets:
    - .env.dev
    - .env.prod
```

3. **Load in code:**
```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

await dotenv.load(fileName: '.env.dev');
final apiBaseUrl = dotenv.env['API_BASE_URL'];
```

### Web Admin (Vue)

1. **Create `.env` file:**
```bash
cd imu-web-vue
cp .env.example .env.development
cp .env.example .env.production
```

2. **Use in code:**
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

---

## Security Best Practices

### DO's
✅ Use `.env.example` files as templates
✅ Generate strong random secrets
✅ Use different keys for dev/prod
✅ Rotate keys regularly
✅ Never commit `.env` files
✅ Add `.env` to `.gitignore`

### DON'Ts
❌ Don't commit actual `.env` files
❌ Don't share secrets in chat/email
❌ Don't use the same secrets across environments
❌ Don't use weak/default secrets
❌ Don't log environment variables

---

## Key Generation

### Generate JWT Secret

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# OpenSSL
openssl rand -hex 64

# Python
python -c "import secrets; print(secrets.token_hex(64))"
```

### Generate RSA Key Pair (PowerSync)

```bash
# Generate private key
openssl genrsa -out private-key.pem 2048

# Generate public key
openssl rsa -in private-key.pem -pubout -out public-key.pem

# Format for environment variable (with escaped newlines)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0}' private-key.pem
```

---

## Validation

### Backend Validation

```bash
cd backend

# Check required variables
node -e "
require('dotenv').config();
const required = ['DATABASE_URL', 'JWT_SECRET', 'POWERSYNC_PRIVATE_KEY'];
required.forEach(v => {
  if (!process.env[v]) {
    console.error(\`Missing: \${v}\`);
    process.exit(1);
  }
});
console.log('All required variables present');
"
```

### Mobile Validation

```dart
// Validate at app startup
bool validateEnvironment() {
  final required = ['API_BASE_URL', 'POWERSYNC_URL', 'MAPBOX_ACCESS_TOKEN'];

  for (var variable in required) {
    if (dotenv.env[variable] == null) {
      debugPrint('Missing environment variable: $variable');
      return false;
    }
  }

  return true;
}
```

---

## Troubleshooting

### Issue: "PowerSync private key not found"

**Solution:** Check that `POWERSYNC_PRIVATE_KEY` is set and contains escaped newlines (`\n` → `\\n`).

### Issue: "Database connection failed"

**Solution:** Verify `DATABASE_URL` format:
```
postgresql://user:password@host:port/database
```

### Issue: "Mapbox not displaying"

**Solution:** Check that `MAPBOX_ACCESS_TOKEN` is valid and has proper permissions.

### Issue: "JWT verification failed"

**Solution:** Ensure `JWT_SECRET` matches between services and algorithm is RS256.

---

## Environment-Specific Notes

### Development Environment

- Use `localhost` for local services
- Enable debug logging
- Use development Mapbox token
- Shorter token expirations

### Production Environment

- Use actual service URLs
- Disable debug logging
- Use production Mapbox token
- Longer token expirations
- Enable all security features

---

**Last Updated:** 2026-04-03
