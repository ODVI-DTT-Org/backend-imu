/**
 * Debug endpoint to check audit_logs table status
 * This is a temporary endpoint for debugging purposes
 */
import { Hono } from 'hono';
import { pool } from '../db/index.js';
const debugAudit = new Hono();
// GET /api/debug-audit - Check audit_logs table status (no auth required for debugging)
debugAudit.get('/check-table', async (c) => {
    try {
        // Check if audit_logs table exists
        const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
    `);
        const tableExists = tables.rows.length > 0;
        let count = 0;
        let recentLogs = [];
        if (tableExists) {
            // Get count
            const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
            count = parseInt(countResult.rows[0].count);
            // Get recent logs
            const recentResult = await pool.query(`
        SELECT al.*, u.first_name, u.last_name, u.email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 5
      `);
            recentLogs = recentResult.rows;
        }
        return c.json({
            tableExists,
            count,
            recentLogs: recentLogs.map(log => ({
                id: log.id,
                action: log.action,
                entity: log.entity,
                userEmail: log.email,
                createdAt: log.created_at,
                newValues: log.new_values
            }))
        });
    }
    catch (error) {
        return c.json({
            error: true,
            message: error.message
        }, 500);
    }
});
export default debugAudit;
