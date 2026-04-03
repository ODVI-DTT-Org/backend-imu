# PowerSync Setup Guide for IMU Mobile App

Complete guide for setting up and deploying PowerSync sync rules for the IMU mobile application.

## Prerequisites

- Node.js installed
- PowerSync account with access to the IMU project
- Backend API running on `http://192.168.131.70:3000`
- PostgreSQL database on DigitalOcean

---

## PowerSync Instance Details

| Resource | Name | ID |
|----------|------|-----|
| **Organization** | odvi-egonzaga | `69ba25e053fc4000071fb490` |
| **Project** | IMU | `69ba260e6d4a040007b40a17` |
| **Instance** | Development | `69ba260fe44c66e817793c98` |
| **Dashboard** | - | `https://69ba260fe44c66e817793c98.powersync.journeyapps.com` |

---

## Step 1: Login to PowerSync CLI

```bash
cd C:\odvi-apps\IMU\mobile\imu_flutter
npx powersync login
```

1. Accept the prompt to open browser
2. Generate a token in the PowerSync dashboard
3. Paste the token when prompted

---

## Step 2: Link to PowerSync Instance

```bash
npx powersync link cloud --org-id 69ba25e053fc4000071fb490 --project-id 69ba260e6d4a040007b40a17 --instance-id 69ba260fe44c66e817793c98
```

---

## Step 3: Deploy Sync Rules

```bash
npx powersync deploy
```

This deploys the configuration from:
- `mobile/imu_flutter/powersync/service.yaml` - Database + JWT config
- `mobile/imu_flutter/powersync/sync-config.yaml` - Sync rules

---

## Sync Rules Configuration

The following data streams are synced to mobile clients:

### Global Data (synced to all users)
- `touchpoint_reasons` - 26 standard touchpoint reason codes
- `psgc` - Philippine geographic codes (regions, provinces, municipalities, barangays)

### User-Specific Data
- `user_profile` - Current user's profile information
- `user_municipalities` - User's assigned municipality territories

### All Client Data (for territory filtering)
- `clients` - All client records
- `touchpoints` - All touchpoint records
- `addresses` - All address records
- `phone_numbers` - All phone number records

---

## Database Connection

**Production Database:** DigitalOcean PostgreSQL
```
Host: [Set via environment variable]
Port: [Set via environment variable]
Database: [Set via environment variable]
User: [Set via environment variable]
SSL: require
```

**Note:** Actual connection details should be set via environment variables and never committed to git.

---

## JWT Authentication

PowerSync uses the same JWT secret as the backend API:

**Secret:** [Set via environment variable - see backend .env]
**Algorithm:** HS256

**Security Note:** Never commit actual JWT secrets to git. Use environment variables for all deployments.

---

## Testing PowerSync

### Terminal Test - Check Backend API

```bash
curl http://192.168.131.70:3000/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"...","database":"connected","version":"1.0.0"}
```

### Terminal Test - Check PowerSync Server

```bash
curl https://69ba260fe44c66e817793c98.powersync.journeyapps.com
```

Expected response: JSON error (404) - this is normal, server is reachable

### Mobile App - Check PowerSync Status

1. Open IMU app on device
2. Login with credentials
3. Go to **Debug Dashboard** (tap version 5x in Settings)
4. Check **System Info** tab
5. Verify: **PowerSync Connected: true**

---

## Troubleshooting

### Login Issues

If `npx powersync login` fails:
1. Check you have access to the odvi-egonzaga organization
2. Generate a new token from the PowerSync dashboard

### Link Issues

If `npx powersync link cloud` fails:
1. Verify all three IDs are correct:
   - `--org-id`
   - `--project-id`
   - `--instance-id`
2. Run `npx powersync fetch instances` to list available instances

### Deploy Issues

If `npx powersync deploy` fails:
1. Check `service.yaml` has correct database URI
2. Check `sync-config.yaml` has valid SQL queries
3. Check `.env` file contains `POWERSYNC_JWT_SECRET`

### Mobile App Connection Issues

If app shows "PowerSync not connected":
1. Verify network configuration in `.env.dev`:
   ```
   POSTGRES_API_URL=http://192.168.131.70:3000/api
   POWERSYNC_URL=https://69ba260fe44c66e817793c98.powersync.journeyapps.com
   ```
2. Check device is on the same network as backend
3. Verify user is logged in with valid JWT token

---

## File Locations

| File | Location |
|------|----------|
| **PowerSync Config** | `mobile/imu_flutter/powersync/service.yaml` |
| **Sync Rules** | `mobile/imu_flutter/powersync/sync-config.yaml` |
| **Environment Variables** | `mobile/imu_flutter/powersync/.env` |
| **Mobile App Config** | `mobile/imu_flutter/.env.dev` |
| **Source Sync Rules** | `docs/powersync-sync-rules.yaml` |

---

## Quick Reference Commands

```bash
# Login
npx powersync login

# List instances
npx powersync fetch instances

# Link to instance
npx powersync link cloud --org-id 69ba25e053fc4000071fb490 --project-id 69ba260e6d4a040007b40a17 --instance-id 69ba260fe44c66e817793c98

# Deploy sync rules
npx powersync deploy

# Check sync status
npx powersync fetch status

# View deployed config
npx powersync fetch config
```

---

## Network Configuration

**Current Development Network:**
- Computer IP: `192.168.131.70`
- Backend API: `http://192.168.131.70:3000/api`
- PowerSync Cloud: `https://69ba260fe44c66e817793c98.powersync.journeyapps.com`

**Note:** If your network changes, update `POSTGRES_API_URL` in `.env.dev` and rebuild the app.

---

## Support

For issues or questions:
1. Check PowerSync dashboard for instance status
2. Review backend logs at `http://192.168.131.70:3000/api/health`
3. Check mobile app Debug Dashboard for detailed logs
