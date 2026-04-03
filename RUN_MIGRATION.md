# Run Error Logs Migration

## Quick Start (One Command)

Once you have admin credentials, run this single command:

```bash
# Get token and run migration in one command
TOKEN=$(curl -s -X POST https://imu-api.cfbtools.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_PASSWORD"}' | \
  jq -r '.access_token') && \
curl -s -X GET https://imu-api.cfbtools.app/api/migrate \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

## Step-by-Step Instructions

### Step 1: Get Admin Token

Replace `YOUR_ADMIN_EMAIL` and `YOUR_PASSWORD` with actual credentials:

```bash
curl -X POST https://imu-api.cfbtools.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_PASSWORD"}'
```

Copy the `access_token` from the response.

### Step 2: Run Migration

```bash
curl -X GET https://imu-api.cfbtools.app/api/migrate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Step 3: Verify Success

You should see a response like:

```json
{
  "success": true,
  "results": [
    "✅ Migration 013: Added itineraries.created_by",
    "⏭️  Migration 004: Skipped (PSGC table already exists)",
    "⏭️  Migration 005: Skipped",
    "⏭️  Migration 014: Skipped",
    "✅ Migration 038: Created error_logs table with indexes and triggers"
  ]
}
```

## Alternative: DigitalOcean Console

1. Go to [DigitalOcean Dashboard](https://cloud.digitalocean.com/apps)
2. Find your IMU Backend App
3. Click **"Console"** button
4. In the console, run:
```bash
cd backend && ./scripts/migrate-038-error-logs.sh
```

## Current Status

- ✅ Migration files committed and pushed
- ✅ API endpoint ready (`/api/migrate`)
- ✅ Migration script ready (`scripts/migrate-038-error-logs.sh`)
- ⏳ Awaiting admin credentials to execute

## Need Help?

If you don't have admin credentials, you can create an admin user through the registration endpoint (if enabled) or contact your system administrator.
