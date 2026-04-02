import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

// IMPORTANT: Import database logger BEFORE pool to wrap query methods
import './middleware/database-logger.js';

import { pool } from './db/index.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import { simpleRequestLogger } from './middleware/request-logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

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
import permissionsRoutes from './routes/permissions.js';
import errorLogsRoutes from './routes/error-logs.js';

const app = new Hono();

// Request logging - log all incoming requests
app.use('*', simpleRequestLogger());

// CORS configuration for web and mobile app
app.use('*', cors({
  origin: (origin) => {
    // Allow all localhost ports, local network IPs, and mobile app origins
    const allowedPatterns = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^http:\/\/10\.0\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^capacitor:\/\/localhost$/,
      /^ionic:\/\/localhost$/,
      /^https?:\/\/.*\.preview\.app\.github\.dev$/, // GitHub Codespaces
      /^https:\/\/imu\.cfbtools\.app$/, // Production web app
      /^https:\/\/.*\.cfbtools\.app$/, // Any subdomain of cfbtools.app
    ];

    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return origin || '*';
    }

    // Check if origin matches any allowed pattern
    if (origin && allowedPatterns.some(pattern => pattern.test(origin))) {
      return origin;
    }

    // If origin is null (like mobile apps or curl requests), allow it
    if (!origin) {
      return '*';
    }

    // Log blocked origins for debugging
    console.warn('CORS: Blocked origin:', origin);
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400,
}));

// Error handling - catch all errors and format responses
app.use('*', simpleRequestLogger());

// Use Hono's built-in error handler instead of middleware
app.onError((err, c) => {
  const requestId = uuidv4();

  console.error('🔍🔍🔍 APP.ONERROR CALLED 🔍🔍🔍');
  console.error('🔍 Error type:', err instanceof Error ? err.name : typeof err);
  console.error('🔍 Error statusCode:', (err as any).statusCode);
  console.error('🔍 Error message:', err instanceof Error ? err.message : String(err));

  const statusCode = (err as any).statusCode || 500;

  // Return error response with proper status code
  return c.json({
    success: false,
    message: err instanceof Error ? err.message : 'Unknown error',
    statusCode: statusCode,
    requestId: requestId,
  }, statusCode as any);
});

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

// RBAC health check endpoint (admin only)
app.get('/api/health/rbac', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const client = await pool.connect();
    try {
      // Check if RBAC components exist
      const componentsCheck = await client.query(`
        SELECT
          (SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'roles'
          )) as roles_table,
          (SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'permissions'
          )) as permissions_table,
          (SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'user_roles'
          )) as user_roles_table,
          (SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'role_permissions'
          )) as role_permissions_table,
          (SELECT EXISTS (
            SELECT 1 FROM information_schema.views
            WHERE view_name = 'user_permissions_view'
          )) as user_permissions_view,
          (SELECT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'has_permission'
          )) as has_permission_function,
          (SELECT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'get_user_permissions'
          )) as get_user_permissions_function,
          (SELECT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'has_role'
          )) as has_role_function
      `);

      const components = componentsCheck.rows[0];
      const allComponentsInstalled = Object.values(components).every((v: any) => v === true);

      let rbacStatus = allComponentsInstalled ? 'installed' : 'partial';
      if (!components.roles_table) {
        rbacStatus = 'not_installed';
      }

      // Get additional stats if RBAC is installed
      let stats = null;
      if (components.roles_table) {
        const statsResult = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM roles) as total_roles,
            (SELECT COUNT(*) FROM permissions) as total_permissions,
            (SELECT COUNT(*) FROM role_permissions) as total_role_permissions,
            (SELECT COUNT(*) FROM user_roles WHERE is_active = TRUE) as total_active_user_roles
        `);
        stats = statsResult.rows[0];
      }

      return c.json({
        rbac_status: rbacStatus,
        components: {
          roles_table: components.roles_table,
          permissions_table: components.permissions_table,
          user_roles_table: components.user_roles_table,
          role_permissions_table: components.role_permissions_table,
          user_permissions_view: components.user_permissions_view,
          has_permission_function: components.has_permission_function,
          get_user_permissions_function: components.get_user_permissions_function,
          has_role_function: components.has_role_function,
        },
        stats,
        timestamp: new Date().toISOString(),
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return c.json({
      rbac_status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
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
      healthRbac: '/api/health/rbac',
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
      permissions: '/api/permissions',
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
app.route('/api/touchpoints/analytics', touchpointsAnalyticsRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/permissions', permissionsRoutes);
app.route('/api/error-logs', errorLogsRoutes);

// 404 handler
app.notFound(notFoundHandler);

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log('🚀 Starting IMU Backend API...');
console.log(`📡 Server running on http://localhost:${port}`);
console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? 'configured' : 'NOT SET'}`);
console.log(`📊 Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT SET'}`);

serve({
  fetch: app.fetch,
  port,
});
