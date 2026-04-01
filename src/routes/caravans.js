import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole, requireAnyRole } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
const caravans = new Hono();
// Valid roles for the new role system
const CARAVAN_ROLES = ['caravan', 'field_agent']; // Support both for migration
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'];
// Validation schemas
const createCaravanSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    is_active: z.boolean().optional(),
});
const updateCaravanSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    is_active: z.boolean().optional(),
});
const bulkDeleteSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(100)
});
// Helper to map DB row to Caravan type
// Note: Caravans are now stored in the users table with role IN ('field_agent', 'caravan')
function mapRowToCaravan(row) {
    const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return {
        id: row.id,
        name: fullName || row.email,
        email: row.email,
        phone: row.phone || '',
        status: row.is_active ? 'active' : 'inactive',
        created: row.created_at,
        updated: row.updated_at,
    };
}
// GET /api/caravans - List all caravans (field agents)
caravans.get('/', authMiddleware, async (c) => {
    try {
        const page = parseInt(c.req.query('page') || '1');
        const perPage = parseInt(c.req.query('perPage') || '20');
        const search = c.req.query('search');
        const status = c.req.query('status');
        const offset = (page - 1) * perPage;
        const conditions = ["role = ANY($1)"]; // Filter by caravan roles
        const params = [CARAVAN_ROLES];
        let paramIndex = 2;
        if (search) {
            conditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (status && status !== 'all') {
            conditions.push(`is_active = $${paramIndex}`);
            params.push(status === 'active');
            paramIndex++;
        }
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        // Get total count
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM users ${whereClause}`, params);
        const totalItems = parseInt(countResult.rows[0].count);
        // Get paginated results
        const result = await pool.query(`SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, perPage, offset]);
        const items = result.rows.map(mapRowToCaravan);
        return c.json({
            items,
            page,
            perPage,
            totalItems,
            totalPages: Math.ceil(totalItems / perPage),
        });
    }
    catch (error) {
        console.error('Fetch caravans error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// GET /api/caravans/:id - Get single caravan
caravans.get('/:id', authMiddleware, async (c) => {
    try {
        const id = c.req.param('id');
        const result = await pool.query(`SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at
       FROM users
       WHERE id = $1 AND role = ANY($2)`, [id, CARAVAN_ROLES]);
        if (result.rows.length === 0) {
            return c.json({ message: 'Caravan not found' }, 404);
        }
        return c.json(mapRowToCaravan(result.rows[0]));
    }
    catch (error) {
        console.error('Fetch caravan error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/caravans - Create new caravan (admin only)
caravans.post('/', authMiddleware, requireRole('admin'), auditMiddleware('caravan'), async (c) => {
    try {
        const body = await c.req.json();
        const validated = createCaravanSchema.parse(body);
        // Check if email already exists
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [validated.email]);
        if (existing.rows.length > 0) {
            return c.json({ message: 'Email already exists' }, 409);
        }
        // Split name into first_name and last_name
        const nameParts = validated.name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';
        // Create user with field_agent role
        const result = await pool.query(`INSERT INTO users (email, password_hash, first_name, last_name, role, phone, is_active)
       VALUES ($1, '', $2, $3, 'field_agent', $4, COALESCE($5, true))
       RETURNING id, email, first_name, last_name, phone, is_active, created_at, updated_at`, [validated.email, firstName, lastName, validated.phone, validated.is_active]);
        console.log('[Create Caravan] Created field agent user:', {
            userId: result.rows[0].id,
            email: validated.email
        });
        return c.json(mapRowToCaravan(result.rows[0]), 201);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Create caravan error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// PUT /api/caravans/:id - Update caravan
caravans.put('/:id', authMiddleware, auditMiddleware('caravan'), async (c) => {
    try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const validated = updateCaravanSchema.parse(body);
        // Check if caravan exists
        const existing = await pool.query('SELECT * FROM users WHERE id = $1 AND role = ANY($2)', [id, CARAVAN_ROLES]);
        if (existing.rows.length === 0) {
            return c.json({ message: 'Caravan not found' }, 404);
        }
        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;
        if (validated.name) {
            const nameParts = validated.name.split(' ');
            updates.push(`first_name = $${paramIndex}`);
            params.push(nameParts[0]);
            paramIndex++;
            updates.push(`last_name = $${paramIndex}`);
            params.push(nameParts.slice(1).join(' ') || '');
            paramIndex++;
        }
        if (validated.email) {
            // Check if email is already used by another user
            const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [validated.email, id]);
            if (emailCheck.rows.length > 0) {
                return c.json({ message: 'Email already in use' }, 409);
            }
            updates.push(`email = $${paramIndex}`);
            params.push(validated.email);
            paramIndex++;
        }
        if (validated.phone !== undefined) {
            updates.push(`phone = $${paramIndex}`);
            params.push(validated.phone);
            paramIndex++;
        }
        if (validated.is_active !== undefined) {
            updates.push(`is_active = $${paramIndex}`);
            params.push(validated.is_active);
            paramIndex++;
        }
        if (updates.length === 0) {
            return c.json({ message: 'No fields to update' }, 400);
        }
        params.push(id);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
        // Fetch updated record
        const result = await pool.query('SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at FROM users WHERE id = $1', [id]);
        return c.json(mapRowToCaravan(result.rows[0]));
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Update caravan error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// DELETE /api/caravans/:id - Delete caravan (admin only)
caravans.delete('/:id', authMiddleware, requireRole('admin'), auditMiddleware('caravan'), async (c) => {
    try {
        const id = c.req.param('id');
        // Check if caravan exists
        const existing = await pool.query('SELECT id FROM users WHERE id = $1 AND role = ANY($2)', [id, CARAVAN_ROLES]);
        if (existing.rows.length === 0) {
            return c.json({ message: 'Caravan not found' }, 404);
        }
        // Delete from users table (will cascade to related data)
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        return c.json({ message: 'Caravan deleted successfully' });
    }
    catch (error) {
        console.error('Delete caravan error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/caravans/bulk-delete - Bulk delete caravans (admin only)
caravans.post('/bulk-delete', authMiddleware, requireRole('admin'), auditMiddleware('caravan', 'bulk_delete'), async (c) => {
    const user = c.get('user');
    if (!user)
        return c.json({ message: 'Unauthorized' }, 401);
    try {
        const body = await c.req.json();
        const { ids } = bulkDeleteSchema.parse(body);
        // Prevent self-deletion
        if (ids.includes(user.sub)) {
            return c.json({ message: 'Cannot delete your own account' }, 400);
        }
        const success = [];
        const failed = [];
        // Process each delete independently (no transaction wrapper)
        for (const id of ids) {
            try {
                const result = await pool.query('DELETE FROM users WHERE id = $1 AND role = ANY($2) RETURNING id', [id, CARAVAN_ROLES]);
                if (result.rowCount === 0) {
                    success.push(id); // Already deleted or not a caravan
                }
                else {
                    success.push(id);
                }
            }
            catch (error) {
                // Check if foreign key constraint
                if (error.code === '23503') {
                    failed.push({ id, error: 'Cannot delete caravan with dependent records', code: error.code });
                }
                else {
                    failed.push({ id, error: 'Failed to delete caravan', code: error.code });
                }
            }
        }
        return c.json({ success, failed });
    }
    catch (error) {
        if (error.name === 'ZodError') {
            return c.json({ message: 'Invalid request body', errors: error.errors }, 400);
        }
        console.error('Bulk delete caravans error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// MUNICIPALITY ASSIGNMENT ENDPOINTS
// ============================================
// GET /api/caravans/:id/municipalities - Get assigned municipalities
caravans.get('/:id/municipalities', authMiddleware, async (c) => {
    try {
        const caravanId = c.req.param('id');
        // Verify caravan exists (is a user with field_agent/caravan role)
        const caravanCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = ANY($2)', [caravanId, CARAVAN_ROLES]);
        if (caravanCheck.rows.length === 0) {
            return c.json({ message: 'Caravan not found' }, 404);
        }
        // Check if user_locations table exists
        const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      )
    `);
        if (!tableCheck.rows[0].exists) {
            // Table doesn't exist yet, return empty results
            return c.json({ items: [] });
        }
        // Get assigned municipalities (not deleted) - caravanId IS the user_id
        // Use the new province and municipality columns for efficient querying
        const result = await pool.query(`SELECT
        ums.id,
        ums.province,
        ums.municipality,
        ums.assigned_at,
        ums.assigned_by,
        p.region
       FROM user_locations ums
       LEFT JOIN psgc p ON p.province = ums.province AND p.mun_city = ums.municipality
       WHERE ums.user_id = $1 AND ums.deleted_at IS NULL
       ORDER BY ums.assigned_at DESC`, [caravanId]);
        // Map results to expected format
        const items = result.rows.map(row => ({
            id: row.id,
            municipality_id: `${row.province}-${row.municipality}`, // Legacy format for frontend compatibility
            province: row.province,
            municipality: row.municipality,
            municipality_name: row.municipality,
            municipality_code: `${row.province}-${row.municipality}`,
            region_name: row.region || '',
            region_code: row.region || '',
            assigned_at: row.assigned_at,
            assigned_by: row.assigned_by,
        }));
        console.log('[GET Municipalities] Fetched assignments:', {
            userId: caravanId,
            count: result.rows.length,
            assignments: result.rows.map(r => r.municipality_id)
        });
        console.log('[GET Municipalities] Returning items:', items.length);
        return c.json({ items });
    }
    catch (error) {
        console.error('Fetch caravan municipalities error:', error);
        // Return empty items instead of 500 error for now
        return c.json({ items: [] });
    }
});
// POST /api/caravans/:id/municipalities - Assign municipalities (admin, area_manager, assistant_area_manager)
// Supports both legacy format ("Province-Municipality") and new format ({province, municipality} objects)
caravans.post('/:id/municipalities', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const currentUser = c.get('user');
        const caravanId = c.req.param('id');
        const body = await c.req.json();
        // Support both legacy string array and new object array formats
        const legacySchema = z.object({
            municipality_ids: z.array(z.string()).min(1),
        });
        const newSchema = z.object({
            locations: z.array(z.object({
                province: z.string().min(1),
                municipality: z.string().min(1),
            })).min(1),
        });
        let validated;
        let useNewFormat = false;
        try {
            validated = newSchema.parse(body);
            useNewFormat = true;
        } catch {
            validated = legacySchema.parse(body);
            useNewFormat = false;
        }
        console.log('[Assign Municipalities] Request:', {
            caravanId,
            format: useNewFormat ? 'new' : 'legacy',
            locations: useNewFormat ? validated.locations : validated.municipality_ids,
            count: useNewFormat ? validated.locations.length : validated.municipality_ids.length
        });
        // Verify caravan exists (is a user with field_agent/caravan role)
        const caravanCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = ANY($2)', [caravanId, CARAVAN_ROLES]);
        if (caravanCheck.rows.length === 0) {
            return c.json({ message: 'Caravan not found' }, 404);
        }
        // Check if user_locations table exists and has the new columns
        const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      ) as table_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_locations' AND column_name = 'province'
      ) as has_province_column
    `);
        if (!tableCheck.rows[0].table_exists) {
            return c.json({ message: 'Municipality assignments feature not available. Please run database migrations.' }, 501);
        }
        const hasNewColumns = tableCheck.rows[0].has_province_column;
        const userId = caravanId;
        let assigned = 0;
        // Helper function to insert a location assignment
        const insertLocation = async (province, municipality) => {
            try {
                // Verify the location exists in PSGC table
                const check = await pool.query(
                    `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
                    [province.trim(), municipality.trim()]
                );
                if (check.rows.length === 0) {
                    throw new Error(`Location not found: ${province}-${municipality}`);
                }
                // Insert using the new columns if available
                if (hasNewColumns) {
                    // Check if unique constraint exists on (user_id, province, municipality)
                    const result = await pool.query(
                        `INSERT INTO user_locations (user_id, province, municipality, assigned_at, assigned_by, deleted_at)
                   VALUES ($1, $2, $3, NOW(), $4, NULL)
                   ON CONFLICT (user_id, province, municipality)
                   DO UPDATE SET
                     deleted_at = NULL,
                     assigned_at = NOW(),
                     assigned_by = $4
                   RETURNING (xmax = 0) as inserted`,
                        [userId, province.trim(), municipality.trim(), currentUser.sub]
                    );
                    const wasInserted = result.rows[0].inserted;
                    if (wasInserted) {
                        assigned++;
                        console.log('[Assign Municipalities] Created new assignment:', province, municipality);
                    } else {
                        console.log('[Assign Municipalities] Re-activated existing:', province, municipality);
                    }
                } else {
                    // Fallback to old municipality_id format
                    const municipalityId = `${province.trim()}-${municipality.trim()}`;
                    const result = await pool.query(
                        `INSERT INTO user_locations (user_id, municipality_id, assigned_at, assigned_by, deleted_at)
                   VALUES ($1, $2, NOW(), $3, NULL)
                   ON CONFLICT (user_id, municipality_id)
                   DO UPDATE SET
                     deleted_at = NULL,
                     assigned_at = NOW(),
                     assigned_by = $3
                   RETURNING (xmax = 0) as inserted`,
                        [userId, municipalityId, currentUser.sub]
                    );
                    const wasInserted = result.rows[0].inserted;
                    if (wasInserted) {
                        assigned++;
                        console.log('[Assign Municipalities] Created new assignment (legacy):', municipalityId);
                    }
                }
            } catch (error) {
                console.error('[Assign Municipalities] Error inserting location:', error);
                throw error;
            }
        };
        // Process locations based on format
        if (useNewFormat) {
            for (const location of validated.locations) {
                await insertLocation(location.province, location.municipality);
            }
        } else {
            // Legacy format: parse "Province-Municipality" strings
            for (const municipalityId of validated.municipality_ids) {
                if (!municipalityId || !municipalityId.includes('-')) {
                    return c.json({ message: `Invalid municipality ID format: ${municipalityId}` }, 400);
                }
                const parts = municipalityId.split('-');
                const province = parts[0];
                const municipality = parts.slice(1).join('-'); // Handle cases with multiple dashes
                await insertLocation(province, municipality);
            }
        }
        console.log('[Assign Municipalities] Final result:', { assigned });
        if (assigned === 0) {
            return c.json({
                message: 'No new municipalities were assigned. All selected municipalities are already assigned to this caravan.',
                assigned_count: 0,
                already_assigned: true
            }, 400);
        }
        return c.json({
            message: 'Municipalities assigned successfully',
            assigned_count: assigned,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Assign municipalities error:', error);
        return c.json({ message: error.message || 'Internal server error' }, 500);
    }
});
// POST /api/caravans/:id/municipalities/bulk - Bulk unassign municipalities (admin, area_manager, assistant_area_manager)
// IMPORTANT: This route must be defined BEFORE the GET /municipalities route
// Supports both legacy format ("Province-Municipality") and new format ({province, municipality} objects)
caravans.post('/:id/municipalities/bulk', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const caravanId = c.req.param('id');
        const body = await c.req.json();
        // Support both legacy string array and new object array formats
        const legacySchema = z.object({
            municipality_ids: z.array(z.string()).min(1),
        });
        const newSchema = z.object({
            locations: z.array(z.object({
                province: z.string().min(1),
                municipality: z.string().min(1),
            })).min(1),
        });
        let validated;
        let useNewFormat = false;
        try {
            validated = newSchema.parse(body);
            useNewFormat = true;
        } catch {
            validated = legacySchema.parse(body);
            useNewFormat = false;
        }
        const userId = caravanId;
        // Check if new columns exist
        const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_locations' AND column_name = 'province'
      ) as has_province_column
    `);
        const hasNewColumns = columnCheck.rows[0].has_province_column;
        let deletedCount = 0;
        if (useNewFormat && hasNewColumns) {
            // Use new format with province and municipality
            for (const location of validated.locations) {
                const result = await pool.query(
                    `UPDATE user_locations
           SET deleted_at = NOW()
           WHERE user_id = $1
             AND province = $2
             AND municipality = $3
             AND deleted_at IS NULL
           RETURNING id`,
                    [userId, location.province.trim(), location.municipality.trim()]
                );
                deletedCount += result.rows.length;
            }
        } else if (useNewFormat) {
            // New format requested but old schema - convert to legacy format
            const municipalityIds = validated.locations.map(
                loc => `${loc.province.trim()}-${loc.municipality.trim()}`
            );
            const result = await pool.query(
                `UPDATE user_locations
         SET deleted_at = NOW()
         WHERE user_id = $1
           AND TRIM(municipality_id) = ANY($2)
           AND deleted_at IS NULL
         RETURNING id`,
                [userId, municipalityIds]
            );
            deletedCount = result.rows.length;
        } else {
            // Legacy format
            const result = await pool.query(
                `UPDATE user_locations
         SET deleted_at = NOW()
         WHERE user_id = $1
           AND TRIM(municipality_id) = ANY($2)
           AND deleted_at IS NULL
         RETURNING id`,
                [userId, validated.municipality_ids.map(m => m.trim())]
            );
            deletedCount = result.rows.length;
        }
        return c.json({
            message: `Bulk unassigned ${deletedCount} municipalities`,
            deleted_count: deletedCount,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Bulk unassign municipalities error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// DELETE /api/caravans/:id/municipalities/:municipalityId - Unassign municipality (admin, area_manager, assistant_area_manager)
// Supports legacy format: "Province-Municipality"
caravans.delete('/:id/municipalities/:municipalityId', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const caravanId = c.req.param('id');
        const municipalityId = c.req.param('municipalityId');
        // Check if user_locations table exists and if it has new columns
        const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      ) as table_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_locations' AND column_name = 'province'
      ) as has_province_column
    `);
        if (!tableCheck.rows[0].table_exists) {
            return c.json({ message: 'Municipality assignments feature not available' }, 501);
        }
        const hasNewColumns = tableCheck.rows[0].has_province_column;
        const userId = caravanId;
        // Parse the municipalityId (format: "Province-Municipality")
        if (!municipalityId || !municipalityId.includes('-')) {
            return c.json({ message: 'Invalid municipality ID format. Expected: Province-Municipality' }, 400);
        }
        const parts = municipalityId.split('-');
        const province = parts[0];
        const municipality = parts.slice(1).join('-'); // Handle cases with multiple dashes
        // Check if assignment exists (including deleted records for idempotency)
        let existing;
        if (hasNewColumns) {
            existing = await pool.query(
                'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3',
                [userId, province.trim(), municipality.trim()]
            );
        } else {
            existing = await pool.query(
                'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND TRIM(municipality_id) = TRIM($2)',
                [userId, municipalityId]
            );
        }
        if (existing.rows.length === 0) {
            return c.json({ message: 'Assignment not found' }, 404);
        }
        const record = existing.rows[0];
        // If already deleted, return success (idempotent)
        if (record.deleted_at !== null) {
            return c.json({ message: 'Municipality already unassigned' });
        }
        // Soft delete
        await pool.query('UPDATE user_locations SET deleted_at = NOW() WHERE id = $1', [record.id]);
        return c.json({ message: 'Municipality unassigned successfully' });
    }
    catch (error) {
        console.error('Unassign municipality error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
export default caravans;
