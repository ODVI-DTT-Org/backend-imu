import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import 'dotenv/config';

import { pool } from './db/index.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import { logger, simpleRequestLogger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { errorLogger } from './services/errorLogger.js';
import './middleware/database-logger.js'; // Initialize database query logging

import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import clientsRoutes from './routes/clients.js';
import usersRoutes from './routes/users.js';
import agenciesRoutes from './routes/agencies.js';
import caravansRoutes from './routes/caravans.js';
import touchpointsRoutes from './routes/touchpoints.js';
import itinerariesRoutes from './routes/itineraries.js';
import dashboardRoutes from './routes/dashboard.js';
import attendanceRoutes from './routes/attendance.js';
import myDayRoutes from './routes/my-day.js';
import groupsRoutes from './routes/groups.js';
import targetsRoutes from './routes/targets.js';
import profileRoutes from './routes/profile.js';
import reportsRoutes from './routes/reports.js';
import approvalsRoutes from './routes/approvals.js';
import auditLogsRoutes from './routes/audit-logs.js';
import psgcRoutes from './routes/psgc.js';
import touchpointReasonsRoutes from './routes/touchpoint-reasons.js';
import debugAuditRoutes from './routes/debug-audit.js';
import touchpointsAnalyticsRoutes from './routes/touchpoints-analytics.js';
import searchRoutes from './routes/search.js';
import errorLogsRoutes from './routes/error-logs.js';
import jobsRoutes from './routes/jobs.js';
import './queues/workers.js'; // Start BullMQ workers

const app = new Hono();

// Request logging middleware (simplified format)
app.use('*', simpleRequestLogger);

// Error handler middleware (must be after request logging)
app.use('*', errorHandler);

// CORS configuration for web and mobile app
app.use('*', cors({
  origin: (origin) => {
    // Parse CORS_ORIGIN environment variable
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [];

    // Allow all localhost ports, local network IPs, and mobile app origins
    const allowedPatterns = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^http:\/\/10\.0\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^capacitor:\/\/localhost$/,
      /^ionic:\/\/localhost$/,
      /^https?:\/\/.*\.preview\.app\.github\.dev$/, // GitHub Codespaces
      /^https:\/\/imu\.cfbtools\.app$/, // Production frontend
    ];

    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return origin || '*';
    }

    // Check if origin is in CORS_ORIGIN environment variable
    if (origin && allowedOrigins.includes(origin)) {
      return origin;
    }

    // Check if origin matches any allowed pattern
    if (origin && allowedPatterns.some(pattern => pattern.test(origin))) {
      return origin;
    }

    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'idempotency-key'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400,
}));

// Health check endpoint
app.get('/api/health', async (c) => {
  let dbStatus = 'unknown';

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    version: '1.0.0',
  });
});

// Debug endpoint to check and fix approvals table (admin only)
app.get('/api/debug/approvals-table', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const client = await pool.connect();
    try {
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'approvals'
        )
      `);

      const tableExists = tableCheck.rows[0].exists;

      if (!tableExists) {
        // Create the table from scratch
        await client.query(`
          CREATE TABLE approvals (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            type TEXT NOT NULL CHECK (type IN ('client', 'udi')),
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            caravan_id UUID REFERENCES users(id) ON DELETE SET NULL,
            touchpoint_number INTEGER,
            role TEXT,
            reason TEXT,
            notes TEXT,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
            rejected_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // Create indexes
        await client.query(`CREATE INDEX idx_approvals_client_id ON approvals(client_id)`);
        await client.query(`CREATE INDEX idx_approvals_caravan_id ON approvals(caravan_id)`);
        await client.query(`CREATE INDEX idx_approvals_type ON approvals(type)`);
        await client.query(`CREATE INDEX idx_approvals_status ON approvals(status)`);

        // Create trigger
        await client.query(`
          CREATE TRIGGER update_approvals_updated_at
            BEFORE UPDATE ON approvals
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        return c.json({ success: true, message: 'Created approvals table', tableExists: false });
      }

      // Get columns
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'approvals'
        ORDER BY ordinal_position
      `);

      return c.json({ success: true, tableExists: true, columns: columns.rows });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Migration endpoint (admin only, for development/maintenance)
app.get('/api/migrate', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const client = await pool.connect();
    const results: string[] = [];

    try {
      // Migration 013: Add created_by column to itineraries
      try {
        await client.query(`ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`);
        results.push('✅ Migration 013: Added itineraries.created_by');
      } catch (e: any) {
        results.push(`⏭️  Migration 013: ${e.message.substring(0, 100)}`);
      }

      // Migration 004: Add regions and municipalities tables
      // Note: Skip this as PSGC table already exists in the database
      try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        results.push('⏭️  Migration 004: Skipped (PSGC table already exists)');
      } catch (e: any) {
        results.push(`⏭️  Migration 004: ${e.message.substring(0, 100)}`);
      }

      // Migration 005: Add user_municipalities_simple table (with no FK to municipalities, uses TEXT)
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS user_municipalities_simple (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, municipality_id TEXT NOT NULL, assigned_at TIMESTAMPTZ DEFAULT NOW(), assigned_by UUID REFERENCES users(id) ON DELETE SET NULL, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, municipality_id))`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_user ON user_municipalities_simple(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_municipality ON user_municipalities_simple(municipality_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_active ON user_municipalities_simple(user_id, municipality_id) WHERE deleted_at IS NULL`);
        // Create updated_at trigger if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_municipalities_simple_updated_at') THEN
              CREATE TRIGGER update_user_municipalities_simple_updated_at
                BEFORE UPDATE ON user_municipalities_simple
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            END IF;
          END $$;
        `);
        results.push('✅ Migration 005: Created user_municipalities_simple table');
      } catch (e: any) {
        results.push(`⏭️  Migration 005: ${e.message.substring(0, 100)}`);
      }

      // Migration 014: Fix approvals table - add missing columns
      try {
        // Add caravan_id column if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'approvals' AND column_name = 'caravan_id'
            ) THEN
              ALTER TABLE approvals ADD COLUMN caravan_id UUID REFERENCES users(id) ON DELETE SET NULL;
            END IF;
          END $$;
        `);
        // Add other missing columns
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'touchpoint_number') THEN
              ALTER TABLE approvals ADD COLUMN touchpoint_number INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'role') THEN
              ALTER TABLE approvals ADD COLUMN role TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'reason') THEN
              ALTER TABLE approvals ADD COLUMN reason TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'notes') THEN
              ALTER TABLE approvals ADD COLUMN notes TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'approved_by') THEN
              ALTER TABLE approvals ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'approved_at') THEN
              ALTER TABLE approvals ADD COLUMN approved_at TIMESTAMPTZ;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'rejected_by') THEN
              ALTER TABLE approvals ADD COLUMN rejected_by UUID REFERENCES users(id) ON DELETE SET NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'rejected_at') THEN
              ALTER TABLE approvals ADD COLUMN rejected_at TIMESTAMPTZ;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'rejection_reason') THEN
              ALTER TABLE approvals ADD COLUMN rejection_reason TEXT;
            END IF;
          END $$;
        `);
        // Create indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approvals(client_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_approvals_caravan_id ON approvals(caravan_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`);
        // Create updated_at trigger if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_approvals_updated_at') THEN
              CREATE TRIGGER update_approvals_updated_at
                BEFORE UPDATE ON approvals
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            END IF;
          END $$;
        `);
        results.push('✅ Migration 014: Fixed approvals table columns');
      } catch (e: any) {
        results.push(`⏭️  Migration 014: ${e.message.substring(0, 100)}`);
      }

      // Migration 038: Create error_logs table
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS error_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id VARCHAR(36) UNIQUE NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            code VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            path VARCHAR(500) NOT NULL,
            method VARCHAR(10) NOT NULL,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            ip_address INET,
            user_agent TEXT,
            details JSONB DEFAULT '{}',
            errors JSONB DEFAULT '[]',
            stack_trace TEXT,
            suggestions TEXT[] DEFAULT '{}',
            documentation_url VARCHAR(500),
            resolved BOOLEAN DEFAULT FALSE,
            resolved_at TIMESTAMPTZ,
            resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            resolution_notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        // Create indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_timestamp ON error_logs(resolved, timestamp DESC)`);

        // Create trigger function
        await client.query(`
          CREATE OR REPLACE FUNCTION update_error_logs_updated_at()
          RETURNS TRIGGER AS $$
          BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql
        `);

        await client.query(`
          DROP TRIGGER IF EXISTS trigger_update_error_logs_updated_at ON error_logs
        `);

        await client.query(`
          CREATE TRIGGER trigger_update_error_logs_updated_at
            BEFORE UPDATE ON error_logs
            FOR EACH ROW
            EXECUTE FUNCTION update_error_logs_updated_at()
        `);

        results.push('✅ Migration 038: Created error_logs table with indexes and triggers');
      } catch (e: any) {
        results.push(`⏭️  Migration 038: ${e.message.substring(0, 100)}`);
      }

      // Migration 041: Fix user_locations table
      try {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'user_locations'
              AND column_name = 'municipality_id'
            ) THEN
              ALTER TABLE user_locations ADD COLUMN municipality_id TEXT;

              RAISE NOTICE 'Added municipality_id column to user_locations table';
            ELSE
              RAISE NOTICE 'municipality_id column already exists in user_locations table';
            END IF;
          END $$;
        `);
        results.push('✅ Migration 041: Fixed user_locations table (added municipality_id column)');
      } catch (e: any) {
        results.push(`⏭️  Migration 041: ${e.message.substring(0, 100)}`);
      }

      // Migration 042: Add province column to user_locations table
      try {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'user_locations'
              AND column_name = 'province'
            ) THEN
              ALTER TABLE user_locations ADD COLUMN province TEXT;
            END IF;
          END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_locations_province ON user_locations(province)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_locations_user_province ON user_locations(user_id, province) WHERE deleted_at IS NULL`);

        results.push('✅ Migration 042: Added province column to user_locations table');
      } catch (e: any) {
        results.push(`⏭️  Migration 042: ${e.message.substring(0, 100)}`);
      }

      // Migration 043: Add municipality column to user_locations table
      try {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'user_locations'
              AND column_name = 'municipality'
            ) THEN
              ALTER TABLE user_locations ADD COLUMN municipality TEXT;
            END IF;
          END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_locations_municipality ON user_locations(municipality)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_locations_user_province_municipality ON user_locations(user_id, province, municipality) WHERE deleted_at IS NULL`);

        // Backfill existing records
        await client.query(`
          UPDATE user_locations
          SET municipality = SUBSTRING(municipality_id FROM POSITION('-' IN municipality_id) + 1)
          WHERE municipality IS NULL
            AND municipality_id IS NOT NULL
            AND municipality_id LIKE '%-%'
        `);

        results.push('✅ Migration 043: Added municipality column to user_locations table for PowerSync compatibility');
      } catch (e: any) {
        results.push(`⏭️  Migration 043: ${e.message.substring(0, 100)}`);
      }

      // Migration 044: Remove municipality_id column from user_locations table
      try {
        // Drop old unique constraint on (user_id, municipality_id) if it exists
        await client.query(`DROP INDEX IF EXISTS idx_user_locations_user_municipality_id`);

        // Drop the municipality_id column
        await client.query(`ALTER TABLE user_locations DROP COLUMN IF EXISTS municipality_id`);

        // Create unique constraint on (user_id, province, municipality) for data integrity
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_user_province_municipality_unique
          ON user_locations(user_id, province, municipality)
          WHERE deleted_at IS NULL
        `);

        results.push('✅ Migration 044: Removed municipality_id column from user_locations table');
      } catch (e: any) {
        results.push(`⏭️  Migration 044: ${e.message.substring(0, 100)}`);
      }

      // Migration 045: Add province and municipality columns to group_municipalities table
      try {
        // Add province column if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'group_municipalities'
              AND column_name = 'province'
            ) THEN
              ALTER TABLE group_municipalities ADD COLUMN province TEXT;
            END IF;
          END $$;
        `);

        // Add municipality column if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'group_municipalities'
              AND column_name = 'municipality'
            ) THEN
              ALTER TABLE group_municipalities ADD COLUMN municipality TEXT;
            END IF;
          END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_group_municipalities_province ON group_municipalities(province)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_group_municipalities_municipality ON group_municipalities(municipality)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_group_municipalities_group_province ON group_municipalities(group_id, province) WHERE deleted_at IS NULL`);

        // Backfill existing records
        await client.query(`
          UPDATE group_municipalities
          SET
            province = SUBSTRING(municipality_id FROM 1 FOR POSITION('-' IN municipality_id) - 1),
            municipality = SUBSTRING(municipality_id FROM POSITION('-' IN municipality_id) + 1)
          WHERE province IS NULL
            AND municipality IS NULL
            AND municipality_id IS NOT NULL
            AND municipality_id LIKE '%-%'
        `);

        results.push('✅ Migration 045: Added province and municipality columns to group_municipalities table');
      } catch (e: any) {
        results.push(`⏭️  Migration 045: ${e.message.substring(0, 100)}`);
      }

      // Migration 046: Remove municipality_id column from group_municipalities table
      try {
        // Drop old unique constraint on (group_id, municipality_id) if it exists
        await client.query(`DROP INDEX IF EXISTS idx_group_municipalities_group_municipality_id`);

        // Drop the municipality_id column
        await client.query(`ALTER TABLE group_municipalities DROP COLUMN IF EXISTS municipality_id`);

        // Create unique constraint on (group_id, province, municipality) for data integrity
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_group_municipalities_group_province_municipality_unique
          ON group_municipalities(group_id, province, municipality)
          WHERE deleted_at IS NULL
        `);

        results.push('✅ Migration 046: Removed municipality_id column from group_municipalities table');
      } catch (e: any) {
        results.push(`⏭️  Migration 046: ${e.message.substring(0, 100)}`);
      }
    } finally {
      client.release();
    }

    return c.json({ success: true, results });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'IMU Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      upload: '/api/upload',
      clients: '/api/clients',
      users: '/api/users',
      agencies: '/api/agencies',
      caravans: '/api/caravans',
      touchpoints: '/api/touchpoints',
      itineraries: '/api/itineraries',
      dashboard: '/api/dashboard',
      attendance: '/api/attendance',
      'my-day': '/api/my-day',
      groups: '/api/groups',
      targets: '/api/targets',
      profile: '/api/profile',
      reports: '/api/reports',
      approvals: '/api/approvals',
      auditLogs: '/api/audit-logs',
      psgc: '/api/psgc',
      touchpointReasons: '/api/touchpoint-reasons',
      touchpointsAnalytics: '/api/touchpoints/analytics',
      errorLogs: '/api/error-logs',
      jobs: '/api/jobs',
    },
  });
});

// Mount routes
app.route('/api/auth', authRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/clients', clientsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/agencies', agenciesRoutes);
app.route('/api/caravans', caravansRoutes);
app.route('/api/touchpoints/analytics', touchpointsAnalyticsRoutes);
app.route('/api/touchpoints', touchpointsRoutes);
app.route('/api/itineraries', itinerariesRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/my-day', myDayRoutes);
app.route('/api/groups', groupsRoutes);
app.route('/api/targets', targetsRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/approvals', approvalsRoutes);
app.route('/api/audit-logs', auditLogsRoutes);
app.route('/api/psgc', psgcRoutes);
app.route('/api/touchpoint-reasons', touchpointReasonsRoutes);
app.route('/api/debug-audit', debugAuditRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/error-logs', errorLogsRoutes);
app.route('/api/jobs', jobsRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ message: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('Server', error, { path: c.req.path, method: c.req.method });

  // Get or generate request ID
  const requestId = (c as any).get('requestId') || `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Log error to database (async, non-blocking)
  errorLogger.log(error, {
    requestId,
    timestamp: new Date().toISOString(),
    path: c.req.path,
    method: c.req.method,
    userId: (c as any).get('userId'),
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
    userAgent: c.req.header('user-agent'),
  });

  // Use statusCode from error object if available, otherwise default to 500
  const statusCode = (err as any).statusCode || 500;

  // Build error response
  const errorResponse: Record<string, any> = {
    success: false,
    message: error.message || 'Internal Server Error',
    statusCode,
    requestId,
  };

  // Include additional error details in development
  if (process.env.NODE_ENV === 'development') {
    if ((err as any).code) {
      errorResponse.code = (err as any).code;
    }
    if ((err as any).suggestions) {
      errorResponse.suggestions = (err as any).suggestions;
    }
  }

  return c.json(errorResponse, statusCode as any);
});

// Start server
const port = parseInt(process.env.PORT || '3000');

logger.info('Startup', 'Starting IMU Backend API...');
logger.info('Startup', `Server running on http://localhost:${port}`);
logger.info('Startup', `JWT Secret: ${process.env.JWT_SECRET ? 'configured' : 'NOT SET'}`);
logger.info('Startup', `Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT SET'}`);

serve({
  fetch: app.fetch,
  port,
});
