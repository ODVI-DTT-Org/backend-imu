/**
 * Audit Log Middleware & Service
 * Tracks all CRUD operations for compliance and debugging
 */
import { pool } from '../db/index.js';
// Create audit log table if not exists, or recreate if schema is outdated
async function ensureAuditTable() {
    try {
        // Check if table exists and has correct schema
        const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'audit_logs'
      )
    `);
        if (tableExists.rows[0].exists) {
            // Check if it has the 'entity' column (our key indicator of correct schema)
            const hasEntityColumn = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'audit_logs' AND column_name = 'entity'
        )
      `);
            if (!hasEntityColumn.rows[0].exists) {
                console.log('⚠️  Audit table has old schema, recreating...');
                await pool.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
            }
            else {
                console.log('✅ Audit table exists with correct schema');
                // Just ensure indexes exist
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC)`);
                return;
            }
        }
        // Create table with correct schema
        await pool.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id UUID,
        old_values JSONB,
        new_values JSONB,
        ip_address TEXT,
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        // Create indexes
        await pool.query(`CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)`);
        await pool.query(`CREATE INDEX idx_audit_logs_entity ON audit_logs(entity)`);
        await pool.query(`CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id)`);
        await pool.query(`CREATE INDEX idx_audit_logs_action ON audit_logs(action)`);
        await pool.query(`CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)`);
        await pool.query(`CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)`);
        await pool.query(`CREATE INDEX idx_audit_logs_entity_created ON audit_logs(entity, created_at DESC)`);
        // Add comments
        await pool.query(`COMMENT ON TABLE audit_logs IS 'Audit trail for all CRUD operations and system events'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL for system actions)'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.action IS 'Action type: create, update, delete, login, logout, approve, reject, etc.'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.entity IS 'Entity type: user, client, caravan, agency, touchpoint, itinerary, group, etc.'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.entity_id IS 'ID of the affected entity'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.old_values IS 'Previous values for update/delete operations (JSONB)'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.new_values IS 'New values for create/update operations (JSONB)'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.ip_address IS 'Client IP address'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.user_agent IS 'Client user agent string'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.metadata IS 'Additional context: success status, rejection reasons, etc.'`);
        await pool.query(`COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp of the audit event'`);
        console.log('✅ Audit table created successfully');
    }
    catch (error) {
        console.error('❌ Failed to create audit table:', error);
    }
}
// Set up PostgreSQL trigger for real-time audit log notifications
async function setupAuditNotificationTrigger() {
    try {
        // Create the trigger function if it doesn't exist
        await pool.query(`
      CREATE OR REPLACE FUNCTION notify_audit_log_new()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('audit_log_new', NEW.id::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        // Drop the trigger if it exists
        await pool.query(`DROP TRIGGER IF EXISTS audit_log_insert_trigger ON audit_logs`);
        // Create the trigger
        await pool.query(`
      CREATE TRIGGER audit_log_insert_trigger
      AFTER INSERT ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION notify_audit_log_new();
    `);
        console.log('✅ Audit log notification trigger set up successfully');
    }
    catch (error) {
        console.error('❌ Failed to set up audit notification trigger:', error);
    }
}
// Cleanup old audit logs based on retention policy
export async function cleanupOldAuditLogs(retentionDays = 90) {
    try {
        const result = await pool.query(`DELETE FROM audit_logs
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`, [retentionDays]);
        const deletedCount = result.rowCount || 0;
        console.log(`🗑️  Cleaned up ${deletedCount} old audit logs (older than ${retentionDays} days)`);
        return { deleted: deletedCount };
    }
    catch (error) {
        console.error('❌ Failed to cleanup old audit logs:', error);
        return { deleted: 0, error: error.message };
    }
}
// Get audit log statistics
export async function getAuditLogStats() {
    try {
        const totalResult = await pool.query(`SELECT COUNT(*) as count FROM audit_logs`);
        const oldestResult = await pool.query(`SELECT MIN(created_at) as oldest FROM audit_logs`);
        const newestResult = await pool.query(`SELECT MAX(created_at) as newest FROM audit_logs`);
        const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_total_relation_size('audit_logs')) as size
    `);
        return {
            total: parseInt(totalResult.rows[0].count),
            oldest: oldestResult.rows[0].oldest,
            newest: newestResult.rows[0].newest,
            size: sizeResult.rows[0].size,
        };
    }
    catch (error) {
        console.error('❌ Failed to get audit log stats:', error);
        return {
            total: 0,
            oldest: null,
            newest: null,
            size: 'Unknown',
        };
    }
}
// Scheduled cleanup job
let cleanupInterval = null;
export function startScheduledCleanup(intervalMs = 24 * 60 * 60 * 1000) {
    if (cleanupInterval) {
        console.warn('[Audit Cleanup] Scheduled cleanup already running');
        return;
    }
    const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10);
    console.log(`🕒 Starting scheduled audit log cleanup (every ${intervalMs}ms, retaining ${retentionDays} days)`);
    cleanupInterval = setInterval(async () => {
        console.log('[Audit Cleanup] Running scheduled cleanup...');
        const result = await cleanupOldAuditLogs(retentionDays);
        if (result.error) {
            console.error('[Audit Cleanup] Scheduled cleanup failed:', result.error);
        }
    }, intervalMs);
}
export function stopScheduledCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('🛑 Stopped scheduled audit log cleanup');
    }
}
// Initialize table on module load
ensureAuditTable().then(() => {
    setupAuditNotificationTrigger().catch(console.error);
    // Start scheduled cleanup if enabled
    if (process.env.AUDIT_LOG_CLEANUP_ENABLED === 'true') {
        const cleanupInterval = parseInt(process.env.AUDIT_LOG_CLEANUP_INTERVAL_MS || '86400000', 10); // 24 hours
        startScheduledCleanup(cleanupInterval);
    }
}).catch(console.error);
// Detect source from user-agent string
export function detectSource(userAgent) {
    if (!userAgent)
        return 'unknown';
    const ua = userAgent.toLowerCase();
    // Check for Flutter/Dart (mobile app)
    if (ua.includes('flutter') || ua.includes('dart')) {
        return 'mobile';
    }
    // Check for common mobile browsers
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        // Check if it's a mobile browser (not the app)
        if (ua.includes('safari/') || ua.includes('chrome/') || ua.includes('firefox/')) {
            return 'web';
        }
        return 'mobile';
    }
    // Check for programmatic/API access
    if (ua.includes('curl') || ua.includes('wget') || ua.includes('python') || ua.includes('http')) {
        return 'api';
    }
    // Default to web for browsers
    return 'web';
}
// Log an audit entry
export async function auditLog(entry) {
    try {
        await pool.query(`INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            entry.userId,
            entry.action,
            entry.entity,
            entry.entityId,
            entry.oldValues ? JSON.stringify(entry.oldValues) : null,
            entry.newValues ? JSON.stringify(entry.newValues) : null,
            entry.ipAddress,
            entry.userAgent,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
        ]);
    }
    catch (error) {
        console.error('Failed to create audit log:', error);
    }
}
// Middleware to automatically log CRUD operations
export function auditMiddleware(entity, customAction) {
    return async (c, next) => {
        const user = c.get('user');
        const method = c.req.method;
        const path = c.req.path;
        // Map HTTP methods to audit actions (can be overridden by customAction)
        const actionMap = {
            POST: 'create',
            PUT: 'update',
            PATCH: 'update',
            DELETE: 'delete',
        };
        // Get entity ID from path for update/delete
        const pathParts = path.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        let entityId;
        if (lastPart && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastPart)) {
            entityId = lastPart;
        }
        // For update operations, capture old values before the change
        let oldValues;
        if ((method === 'PUT' || method === 'PATCH') && entityId) {
            try {
                // Map entity to table name
                const tableMap = {
                    user: 'users',
                    client: 'clients',
                    caravan: 'users', // caravan users are in users table
                    agency: 'agencies',
                    touchpoint: 'touchpoints',
                    itinerary: 'itineraries',
                    group: 'groups',
                    target: 'targets',
                    attendance: 'attendance',
                };
                const tableName = tableMap[entity];
                if (tableName) {
                    // Query current record before update
                    const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [entityId]);
                    if (result.rows.length > 0) {
                        const rawOldValues = result.rows[0];
                        oldValues = {};
                        // Copy all properties except sensitive ones
                        Object.keys(rawOldValues).forEach(key => {
                            if (key !== 'password_hash' && key !== 'password') {
                                // Type guard to satisfy TypeScript strict null checks
                                if (oldValues) {
                                    oldValues[key] = rawOldValues[key];
                                }
                            }
                        });
                    }
                }
            }
            catch (error) {
                // Failed to fetch old values, continue without them
                console.error('[Audit] Failed to fetch old values:', error);
            }
        }
        // Proceed with the request
        await next();
        // After the request completes, try to get the body for logging
        // Note: In Hono, c.req.json() can be called multiple times and returns cached result
        let newValues;
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            try {
                // Try to get the parsed body (Hono caches this)
                const body = await c.req.json();
                newValues = body;
                // Don't log sensitive fields
                if (newValues) {
                    delete newValues.password;
                    delete newValues.password_hash;
                    delete newValues.token;
                }
            }
            catch {
                // Body already consumed or not JSON
                // That's okay, we'll log without the body
            }
        }
        // Log after operation completes
        const action = customAction || actionMap[method];
        if (action) {
            console.log(`[Audit] ${action} ${entity} by ${user?.sub || 'unknown'}`);
            const userAgent = c.req.header('user-agent');
            const source = detectSource(userAgent);
            const logEntry = {
                userId: user?.sub,
                action,
                entity,
                entityId,
                newValues,
                ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
                userAgent,
                metadata: {
                    source
                }
            };
            if (oldValues) {
                logEntry.oldValues = oldValues;
            }
            await auditLog(logEntry);
        }
    };
}
// Audit auth helpers
export const auditAuth = {
    login: (userId, ipAddress, userAgent, success = true) => auditLog({ userId, action: 'login', entity: 'auth', ipAddress, userAgent, metadata: { success, source: detectSource(userAgent) } }),
    logout: (userId, ipAddress, userAgent) => auditLog({ userId, action: 'logout', entity: 'auth', ipAddress, userAgent, metadata: { source: detectSource(userAgent) } }),
    passwordReset: (userId, ipAddress, userAgent) => auditLog({ userId, action: 'password_reset', entity: 'auth', ipAddress, userAgent, metadata: { source: detectSource(userAgent) } }),
    passwordChange: (userId, ipAddress, userAgent) => auditLog({ userId, action: 'password_change', entity: 'auth', ipAddress, userAgent, metadata: { source: detectSource(userAgent) } }),
};
// Audit approval helpers
export const auditApproval = {
    approve: (userId, approvalId, clientId, notes, userAgent) => auditLog({ userId, action: 'approve', entity: 'approval', entityId: approvalId, userAgent, metadata: { clientId, notes, source: detectSource(userAgent) } }),
    reject: (userId, approvalId, clientId, reason, userAgent) => auditLog({ userId, action: 'reject', entity: 'approval', entityId: approvalId, userAgent, metadata: { clientId, reason, source: detectSource(userAgent) } }),
};
// Query audit logs
export async function getAuditLogs(options) {
    const { page = 1, perPage = 50 } = options;
    const offset = (page - 1) * perPage;
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (options.userId) {
        conditions.push(`user_id = $${paramIndex}`);
        params.push(options.userId);
        paramIndex++;
    }
    if (options.entity) {
        conditions.push(`entity = $${paramIndex}`);
        params.push(options.entity);
        paramIndex++;
    }
    if (options.entityId) {
        conditions.push(`entity_id = $${paramIndex}`);
        params.push(options.entityId);
        paramIndex++;
    }
    if (options.action) {
        conditions.push(`action = $${paramIndex}`);
        params.push(options.action);
        paramIndex++;
    }
    if (options.source) {
        conditions.push(`al.metadata->>'source' = $${paramIndex}`);
        params.push(options.source);
        paramIndex++;
    }
    if (options.startDate) {
        conditions.push(`al.created_at >= $${paramIndex}`);
        params.push(options.startDate);
        paramIndex++;
    }
    if (options.endDate) {
        conditions.push(`al.created_at <= $${paramIndex}`);
        params.push(options.endDate);
        paramIndex++;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // For count query, replace al. with nothing since we're querying from audit_logs directly
    const countWhereClause = whereClause.replace(/al\./g, '');
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM audit_logs ${countWhereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const result = await pool.query(`SELECT al.*, u.first_name, u.last_name, u.email as user_email
     FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
     ${whereClause} ORDER BY al.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, perPage, offset]);
    return {
        items: result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            userName: row.first_name ? `${row.first_name} ${row.last_name}` : 'System',
            userEmail: row.user_email,
            action: row.action,
            entity: row.entity,
            entityId: row.entity_id,
            oldValues: row.old_values,
            newValues: row.new_values,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            metadata: row.metadata,
            createdAt: row.created_at,
        })),
        total,
    };
}
