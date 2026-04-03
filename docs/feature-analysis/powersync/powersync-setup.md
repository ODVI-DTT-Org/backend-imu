# PowerSync Setup Guide

This guide explains how to configure PowerSync for the IMU mobile app with offline-first data synchronization.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  PowerSync      │────▶│   PostgreSQL    │
│  (PowerSync SDK) │◀────│  (Sync Service) │◀────│   (Supabase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│  Hono Backend   │──────────────┘
                        │  (Auth + Upload)│
                        └─────────────────┘
```

## Current Configuration

- **PowerSync URL**: `https://69ba260fe44c66e817793c98.powersync.journeyapps.com`
- **Backend API**: `http://192.168.0.100:3000/api` (or localhost:3000/api)
- **Database**: PostgreSQL (Supabase or local)

## Step 1: Configure PowerSync Dashboard

### 1.1 Authentication Setup

1. Go to [PowerSync Dashboard](https://dashboard.powersync.com/org/odvi/apps/odvi-IMU/projects)
2. Navigate to **Authentication** → **Custom JWT**
3. Configure:
   - **JWT Secret**: Copy from `backend/.env` (`JWT_SECRET` value)
   - **Algorithm**: HS256
   - **Token Endpoint**: Your backend login URL

### 1.2 Data Source Setup

1. Navigate to **Data Sources**
2. Connect your PostgreSQL database:
   - **Host**: Your PostgreSQL host (e.g., `db.odvid.supabase.co`)
   - **Port**: 5432 (or your port)
   - **Database**: `imu_db`
   - **Username**: `postgres`
   - **Password**: Your database password

### 1.3 Sync Rules

Navigate to **Sync Rules** and configure:

```yaml
bucket_definitions:
  by_user:
    parameters: SELECT token_parameters.user_id() AS user_id
    data:
      # Clients - full sync for assigned caravan
      - SELECT * FROM clients WHERE caravan_id = token_parameters.user_id()

      # Itineraries - sync for assigned caravan
      - SELECT * FROM itineraries WHERE caravan_id = token_parameters.user_id()

      # Touchpoints - sync for assigned caravan
      - SELECT * FROM touchpoints WHERE caravan_id = token_parameters.user_id()

      # Addresses - sync related to clients
      - SELECT a.* FROM addresses a
        INNER JOIN clients c ON c.id = a.client_id
        WHERE c.caravan_id = token_parameters.user_id()

      # Phone numbers - sync related to clients
      - SELECT p.* FROM phone_numbers p
        INNER JOIN clients c ON c.id = p.client_id
        WHERE c.caravan_id = token_parameters.user_id()
```

## Step 2: Mobile App Configuration

The mobile app is already configured with:
- `POWERSYNC_URL` in `.env.dev`
- `POSTGRES_API_URL` pointing to your backend

### Environment File (`.env.dev`)

```env
POWERSYNC_URL=https://69ba260fe44c66e817793c98.powersync.journeyapps.com
POSTGRES_API_URL=http://192.168.0.100:3000/api
JWT_SECRET=<same-as-backend>
```

## Step 3: Backend Configuration

The backend needs to handle:

1. **Authentication** - Issue JWT tokens
2. **Upload endpoint** - Handle data writes from mobile app

### Required Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Authenticate and get JWT token |
| `/api/auth/refresh` | POST | Refresh JWT token |
| `/api/upload` | POST | Handle CRUD operations from PowerSync |

### Upload Endpoint

The backend already has `/api/upload` configured in `backend/src/routes/upload.ts`.

## Step 4: Testing the Connection

### 4.1 Verify PowerSync Connection

1. Run the mobile app
2. Check logs for: `Connected to PowerSync`
3. Verify data syncs from PostgreSQL

### 4.2 Test Offline Mode

1. Disable network on device
2. Create/update data locally
3. Re-enable network
4. Verify data syncs to server

## Troubleshooting

### Common Issues
| Issue | Solution |
|-------|----------|
| "Unauthorized" error | Check JWT secret matches in both PowerSync and backend |
| "Connection refused" | Check PowerSync URL is correct |
| "No data syncing" | Verify sync rules in PowerSync dashboard |
| "Upload failed" | Check `/api/upload` endpoint is accessible |
### Debug Logs
Enable debug logging in mobile app:
```env
DEBUG_MODE=true
LOG_LEVEL=debug
```

## Production Checklist
- [ ] PowerSync URL configured
- [ ] JWT secret matches in PowerSync and backend
- [ ] Database connected in PowerSync dashboard
- [ ] Sync rules configured
- [ ] Upload endpoint working
- [ ] Tested offline mode
