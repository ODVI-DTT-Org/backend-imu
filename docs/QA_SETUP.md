# IMU QA Environment Setup Guide

This guide explains how to set up and deploy the IMU application to the QA environment.

## Overview

The QA environment is used for quality assurance testing before production deployment. It provides a staging environment that mirrors production but with isolated data and resources.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        QA Environment                          │
├─────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐    ┌──────────────────┐                 │
│  │ Flutter Mobile  │    │   QA Backend     │                 │
│  │   (QA Build)    │◄──►│   (Hono API)     │                 │
│  │                 │    │                  │                 │
│  │  - .env.qa      │    │  - .env.qa       │                 │
│  │  - PowerSync    │    │  - PowerSync     │                 │
│  └─────────────────┘    └──────────┬───────┘                 │
│                                   │                          │
│                          ┌──────────▼───────┐                 │
│                          │ QA PostgreSQL   │                 │
│                          │   (DigitalOcean) │                 │
│                          └──────────────────┘                 │
│                                                                   │
│  QA URLs:                                                         │
│  - Backend API: https://imu-api-qa.cfbtools.app/api           │
│  - PowerSync:   https://qa-imu-powersync.journeyapps.com      │
│                                                                   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **DigitalOcean Account** - For hosting QA backend and database
2. **PowerSync Account** - For QA PowerSync instance
3. **Flutter SDK** - For building QA mobile app
4. **Node.js 18+** - For backend deployment
5. **psql** - PostgreSQL client for database operations

## Step 1: Set Up QA PowerSync Instance

1. Log in to [PowerSync Dashboard](https://app.powersync.journeyapps.com)
2. Create a new PowerSync instance for QA
3. Name it `imu-qa` or similar
4. Copy the instance URL (format: `https://xxx.powersync.journeyapps.com`)
5. Generate and save the JWT signing keys:
   ```bash
   openssl genrsa -out powersync-qa-private.pem 2048
   openssl rsa -in powersync-qa-private.pem -pubout -out powersync-qa-public.pem
   ```

## Step 2: Set Up QA PostgreSQL Database

### Option A: DigitalOcean Managed Database (Recommended)

1. Create a new Managed Database cluster in DigitalOcean
2. Set database name to `imu_qa`
3. Configure trusted sources to allow connections from:
   - QA backend droplet
   - PowerSync service
4. Copy the connection string

### Option B: Self-hosted PostgreSQL

1. Create a new database named `imu_qa`
2. Run the schema:
   ```bash
   psql -h your_host -U your_user -d imu_qa -f backend/migrations/COMPLETE_SCHEMA.sql
   ```

## Step 3: Set Up QA Backend on DigitalOcean

### 3.1 Create the App

1. Go to DigitalOcean → Apps → Create App
2. Select "Deploy a Docker Image" or "Build from Source"
3. Configure:
   - Name: `imu-api-qa`
   - Region: Choose closest to your team
   - Branch: `main`

### 3.2 Set Environment Variables

Add these environment variables in the DigitalOcean App dashboard:

```bash
# Environment
NODE_ENV=qa
PORT=4000

# Database
DATABASE_URL=postgresql://user:pass@host:port/imu_qa?sslmode=require

# JWT
JWT_SECRET=generate-secure-random-string-32-chars

# PowerSync
POWERSYNC_URL=https://qa-imu-powersync.journeyapps.com
POWERSYNC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
...paste your private key with \n for newlines...
-----END PRIVATE KEY-----
POWERSYNC_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
...paste your public key...
-----END PUBLIC KEY-----
POWERSYNC_KEY_ID=imu-qa-key-20260402

# CORS
CORS_ORIGIN=http://localhost:9999,http://localhost:8080,https://imu-qa-web.cfbtools.app

# Logging
LOG_LEVEL=debug
```

**IMPORTANT:** For the private key, use escaped newlines:
```bash
POWERSYNC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQ...\n-----END PRIVATE KEY-----"
```

### 3.3 Deploy and Test

1. Deploy the app
2. Verify health endpoint: `https://imu-api-qa.cfbtools.app/health`
3. Test authentication: `POST https://imu-api-qa.cfbtools.app/api/auth/login`

### 3.4 Seed QA Data

Run the QA seed data script:
```bash
psql $DATABASE_URL -f backend/scripts/seed-qa-data.sql
```

## Step 4: Build QA Mobile App

### 4.1 Update Environment File

Edit `mobile/imu_flutter/.env.qa`:
```bash
# Update the PowerSync URL
POWERSYNC_URL=https://qa-imu-powersync.journeyapps.com

# Update the API URL
POSTGRES_API_URL=https://imu-api-qa.cfbtools.app/api

# Update JWT secrets (must match backend)
JWT_SECRET=qa-imu-production-jwt-secret-2026-change-me-min-32-characters
POWERSYNC_JWT_SECRET=qa-powersync-jwt-secret-key-2026-min-32-characters
```

### 4.2 Build QA APK

```bash
cd mobile/imu_flutter

# Build QA APK (Android)
flutter build apk --release --dart-define=ENV=qa

# Build QA App Bundle (Android - Play Store)
flutter build appbundle --release --dart-define=ENV=qa

# Build QA IPA (iOS - requires macOS)
flutter build ipa --release --dart-define=ENV=qa
```

### 4.3 Install QA Build

**Android:**
```bash
# Install APK on connected device
adb install build/app/outputs/flutter-apk-QA-release.apk

# Or transfer via USB/email
```

**iOS:**
```bash
# Use Apple Configurator or TestFlight
# Transfer the IPA file to testers
```

## Step 5: QA Test Accounts

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Admin | admin@imu-qa.com | admin123 | Full system access |
| Area Manager | area.manager@imu-qa.com | manager123 | Manage team |
| Asst. Manager | asst.manager@imu-qa.com | manager123 | Support team |
| Caravan 1 | caravan1@imu-qa.com | caravan123 | Field agent testing |
| Caravan 2 | caravan2@imu-qa.com | caravan123 | Field agent testing |
| Tele 1 | tele1@imu-qa.com | tele123 | Telemarketer testing |

## Step 6: QA Testing Checklist

### Authentication
- [ ] Admin can login
- [ ] Area Manager can login
- [ ] Caravan can login with PIN/biometrics
- [ ] Tele can login
- [ ] Session timeout works (15 min auto-lock)
- [ ] Token refresh works

### Client Management
- [ ] View client list
- [ ] Search clients
- [ ] Filter by municipality
- [ ] View client details
- [ ] Add new client
- [ ] Edit client
- [ ] Star/unstar client

### Touchpoints
- [ ] Caravan can create Visit touchpoints (1, 4, 7)
- [ ] Caravan CANNOT create Call touchpoints (2, 3, 5, 6)
- [ ] Tele can create Call touchpoints (2, 3, 5, 6)
- [ ] Tele CANNOT create Visit touchpoints (1, 4, 7)
- [ ] Capture GPS time in/out
- [ ] Add photo to touchpoint
- [ ] Add audio note to touchpoint
- [ ] Set touchpoint status
- [ ] Select touchpoint reason

### Itinerary
- [ ] View daily itinerary
- [ ] See scheduled clients
- [ ] Mark visit as complete
- [ ] View touchpoint history

### Sync (PowerSync)
- [ ] Data syncs when online
- [ ] Offline mode works
- [ ] Changes queue when offline
- [ ] Sync resumes when online
- [ ] Conflict resolution works

### Location Assignments
- [ ] Caravan sees assigned municipalities
- [ ] Can only see clients in assigned areas
- [ ] Area Manager can assign locations
- [ ] Location assignments sync to mobile

## Step 7: Monitoring and Debugging

### View Logs

**Backend (DigitalOcean):**
```bash
# View logs in DigitalOcean App dashboard
# Or connect via SSH
doctl apps logs tail --follow imu-api-qa
```

**Mobile:**
```bash
# View Flutter logs
flutter logs

# For Android
adb logcat

# For iOS (Xcode)
# Open Console.app while device connected
```

### Database Queries

```bash
# Connect to QA database
psql $DATABASE_URL

# Check sync status
SELECT COUNT(*) FROM clients;
SELECT COUNT(*) FROM touchpoints;
SELECT * FROM users WHERE role = 'caravan';
```

## Troubleshooting

### Issue: App won't connect to QA backend

**Solution:**
1. Check `.env.qa` has correct `POSTGRES_API_URL`
2. Verify backend is running: `curl https://imu-api-qa.cfbtools.app/health`
3. Check CORS settings in backend `.env.qa`
4. Ensure device/emulator has network access

### Issue: PowerSync not syncing

**Solution:**
1. Check PowerSync URL in `.env.qa`
2. Verify PowerSync instance is running
3. Check JWT token is valid
4. Look for PowerSync errors in mobile logs

### Issue: Touchpoint validation failing

**Solution:**
1. Verify user role is correct in database
2. Check touchpoint number matches touchpoint type
3. Review TouchpointValidationService logs

## Cleaning QA Data

To reset QA data for fresh testing:
```bash
# WARNING: This deletes all QA data!
psql $DATABASE_URL -c "TRUNCATE clients CASCADE;"
psql $DATABASE_URL -c "TRUNCATE touchpoints CASCADE;"
psql $DATABASE_URL -f backend/scripts/seed-qa-data.sql
```

## Promotion to Production

When QA testing is complete:
1. Fix all identified bugs
2. Update changelog
3. Create production build
4. Deploy to production
5. Monitor production metrics

## Contacts

- **Backend Issues:** Backend Team
- **Mobile Issues:** Mobile Team
- **Infrastructure:** DevOps Team
- **QA Coordination:** QA Lead

---

**Last Updated:** 2026-04-02
**Version:** 1.0
