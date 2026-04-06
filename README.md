# IMU Backend API

Backend API for IMU mobile app using Hono + PostgreSQL + JWT authentication.

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm

### Installation

```bash
cd backend
pnpm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/imu
JWT_SECRET=your-256-bit-secret-key
JWT_EXPIRY_HOURS=720
PORT=3000
```

### Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE imu;
```

2. Run schema:
```bash
psql -d imu -f src/schema.sql
```

### Development

```bash
pnpm dev
```

Server runs at http://localhost:3000

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/me` | GET | Get current user |
| `/api/upload` | POST | PowerSync upload endpoint |

### Login Request

```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "field_agent"
  }
}
```

### PowerSync Upload

```json
POST /api/upload
Authorization: Bearer <access_token>
{
  "operations": [
    {
      "table": "clients",
      "op": "PUT",
      "id": "uuid",
      "data": {
        "first_name": "John",
        "last_name": "Doe"
      }
    }
  ]
}
```

## Production

```bash
pnpm build
pnpm start
```
