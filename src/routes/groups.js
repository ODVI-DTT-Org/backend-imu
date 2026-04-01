import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireAnyRole, requireRole } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
const groups = new Hono();
const createGroupSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    area_manager_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    assistant_area_manager_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    caravan_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    members: z.array(z.string().uuid()).optional(),
});
const updateGroupSchema = createGroupSchema.partial();
const addMembersSchema = z.object({
    client_ids: z.array(z.string().uuid()),
});
const bulkDeleteSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(100)
});
// GET /api/groups - List all groups
groups.get('/', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const page = parseInt(c.req.query('page') || '1');
        const perPage = parseInt(c.req.query('perPage') || '50');
        const search = c.req.query('search');
        const offset = (page - 1) * perPage;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (user.role === 'caravan') {
            // Filter by caravan_id (caravan/team member)
            conditions.push(`g.caravan_id = $${paramIndex}`);
            params.push(user.sub);
            paramIndex++;
        }
        if (search) {
            conditions.push(`g.name ILIKE $${paramIndex}`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM groups g ${whereClause}`, params);
        const totalItems = parseInt(countResult.rows[0].count);
        const result = await pool.query(`SELECT g.*,
              CONCAT(am.first_name, ' ', am.last_name) as area_manager_name,
              CONCAT(aam.first_name, ' ', aam.last_name) as assistant_area_manager_name,
              CONCAT(c.first_name, ' ', c.last_name) as caravan_name,
              jsonb_array_length(g.members) as member_count
       FROM groups g
       LEFT JOIN users am ON am.id = g.area_manager_id
       LEFT JOIN users aam ON aam.id = g.assistant_area_manager_id
       LEFT JOIN users c ON c.id = g.caravan_id
       ${whereClause}
       ORDER BY g.name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, perPage, offset]);
        return c.json({
            items: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                description: row.description,
                area_manager_id: row.area_manager_id,
                area_manager_name: row.area_manager_name || null,
                assistant_area_manager_id: row.assistant_area_manager_id,
                assistant_area_manager_name: row.assistant_area_manager_name || null,
                caravan_id: row.caravan_id,
                caravan_name: row.caravan_name || null,
                members: row.members || [],
                member_count: row.member_count || 0,
                created: row.created_at,
            })),
            page, perPage, totalItems,
            totalPages: Math.ceil(totalItems / perPage),
        });
    }
    catch (error) {
        console.error('List groups error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// GET /api/groups/:id - Get single group with members
groups.get('/:id', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        let whereClause = 'WHERE g.id = $1';
        const params = [id];
        if (user.role === 'caravan') {
            whereClause += ' AND g.caravan_id = $2';
            params.push(user.sub);
        }
        const result = await pool.query(`SELECT g.*,
              CONCAT(am.first_name, ' ', am.last_name) as area_manager_name,
              CONCAT(aam.first_name, ' ', aam.last_name) as assistant_area_manager_name,
              CONCAT(c.first_name, ' ', c.last_name) as caravan_name
       FROM groups g
       LEFT JOIN users am ON am.id = g.area_manager_id
       LEFT JOIN users aam ON aam.id = g.assistant_area_manager_id
       LEFT JOIN users c ON c.id = g.caravan_id
       ${whereClause}`, params);
        if (result.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        const group = result.rows[0];
        return c.json({
            id: group.id,
            name: group.name,
            description: group.description,
            area_manager_id: group.area_manager_id,
            area_manager_name: group.area_manager_name || null,
            assistant_area_manager_id: group.assistant_area_manager_id,
            assistant_area_manager_name: group.assistant_area_manager_name || null,
            caravan_id: group.caravan_id,
            caravan_name: group.caravan_name || null,
            members: group.members || [],
            created: group.created_at,
        });
    }
    catch (error) {
        console.error('Get group error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/groups - Create group
groups.post('/', authMiddleware, auditMiddleware('group'), async (c) => {
    try {
        const user = c.get('user');
        const body = await c.req.json();
        const validated = createGroupSchema.parse(body);
        const members = validated.members || [];
        const result = await pool.query(`INSERT INTO groups (id, name, description, area_manager_id, assistant_area_manager_id, caravan_id, members)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING *`, [
            validated.name,
            validated.description,
            validated.area_manager_id || null,
            validated.assistant_area_manager_id || null,
            validated.caravan_id || null,
            JSON.stringify(members)
        ]);
        return c.json({
            id: result.rows[0].id,
            name: result.rows[0].name,
            description: result.rows[0].description,
            area_manager_id: result.rows[0].area_manager_id,
            assistant_area_manager_id: result.rows[0].assistant_area_manager_id,
            caravan_id: result.rows[0].caravan_id,
            members: members,
            created: result.rows[0].created_at,
        }, 201);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Create group error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// PUT /api/groups/:id - Update group
groups.put('/:id', authMiddleware, auditMiddleware('group'), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const body = await c.req.json();
        // Convert empty strings to null for role fields
        const processedBody = {
            ...body,
            area_manager_id: body.area_manager_id === '' ? null : body.area_manager_id,
            assistant_area_manager_id: body.assistant_area_manager_id === '' ? null : body.assistant_area_manager_id,
            caravan_id: body.caravan_id === '' ? null : body.caravan_id
        };
        console.log('[Groups] PUT request body:', JSON.stringify(processedBody, null, 2));
        const validated = updateGroupSchema.parse(processedBody);
        let whereClause = 'WHERE id = $1';
        const params = [id];
        if (user.role === 'field_agent') {
            whereClause += ' AND area_manager_id = $2';
            params.push(user.sub);
        }
        const groupCheck = await pool.query(`SELECT * FROM groups ${whereClause}`, params);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        if (validated.name !== undefined) {
            updateFields.push(`name = $${paramIndex++}`);
            updateValues.push(validated.name);
        }
        if (validated.description !== undefined) {
            updateFields.push(`description = $${paramIndex++}`);
            updateValues.push(validated.description);
        }
        if (validated.area_manager_id !== undefined) {
            updateFields.push(`area_manager_id = $${paramIndex++}`);
            updateValues.push(validated.area_manager_id);
        }
        if (validated.assistant_area_manager_id !== undefined) {
            updateFields.push(`assistant_area_manager_id = $${paramIndex++}`);
            updateValues.push(validated.assistant_area_manager_id);
        }
        if (validated.caravan_id !== undefined) {
            updateFields.push(`caravan_id = $${paramIndex++}`);
            updateValues.push(validated.caravan_id);
        }
        if (validated.members !== undefined) {
            updateFields.push(`members = $${paramIndex++}`);
            updateValues.push(JSON.stringify(validated.members));
        }
        if (updateFields.length === 0) {
            return c.json({ message: 'No fields to update' }, 400);
        }
        updateValues.push(id);
        const result = await pool.query(`UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`, updateValues);
        return c.json({
            id: result.rows[0].id,
            name: result.rows[0].name,
            description: result.rows[0].description,
            area_manager_id: result.rows[0].area_manager_id,
            assistant_area_manager_id: result.rows[0].assistant_area_manager_id,
            caravan_id: result.rows[0].caravan_id,
            members: result.rows[0].members || [],
            created: result.rows[0].created_at,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Update group validation error:', {
                errors: error.errors,
                issues: error.issues
            });
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Update group error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// DELETE /api/groups/:id - Delete group
groups.delete('/:id', authMiddleware, auditMiddleware('group'), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        let whereClause = 'WHERE id = $1';
        const params = [id];
        if (user.role === 'caravan') {
            whereClause += ' AND caravan_id = $2';
            params.push(user.sub);
        }
        const result = await pool.query(`DELETE FROM groups ${whereClause} RETURNING id`, params);
        if (result.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        return c.json({ message: 'Group deleted successfully' });
    }
    catch (error) {
        console.error('Delete group error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/groups/bulk-delete - Bulk delete groups
groups.post('/bulk-delete', authMiddleware, requireRole('admin'), auditMiddleware('group', 'bulk_delete'), async (c) => {
    const user = c.get('user');
    if (!user)
        return c.json({ message: 'Unauthorized' }, 401);
    try {
        const body = await c.req.json();
        const { ids } = bulkDeleteSchema.parse(body);
        const success = [];
        const failed = [];
        // Process each delete independently (no transaction wrapper)
        for (const id of ids) {
            try {
                const result = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING id', [id]);
                if (result.rowCount === 0) {
                    success.push(id); // Already deleted
                }
                else {
                    success.push(id);
                }
            }
            catch (error) {
                // Check if foreign key constraint
                if (error.code === '23503') {
                    failed.push({ id, error: 'Cannot delete group with dependent records', code: error.code });
                }
                else {
                    failed.push({ id, error: 'Failed to delete group', code: error.code });
                }
            }
        }
        return c.json({ success, failed });
    }
    catch (error) {
        if (error.name === 'ZodError') {
            return c.json({ message: 'Invalid request body', errors: error.errors }, 400);
        }
        console.error('Bulk delete groups error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/groups/:id/members - Add members to group
groups.post('/:id/members', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const body = await c.req.json();
        const validated = addMembersSchema.parse(body);
        let whereClause = 'WHERE id = $1';
        const params = [id];
        if (user.role === 'caravan') {
            whereClause += ' AND caravan_id = $2';
            params.push(user.sub);
        }
        const groupCheck = await pool.query(`SELECT * FROM groups ${whereClause}`, params);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        let added = 0;
        for (const clientId of validated.client_ids) {
            try {
                await pool.query(`INSERT INTO group_members (id, group_id, client_id) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING`, [id, clientId]);
                added++;
            }
            catch { /* skip */ }
        }
        return c.json({ message: `Added ${added} members to group`, added });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Add members error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// DELETE /api/groups/:id/members/:clientId - Remove member from group
groups.delete('/:id/members/:clientId', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const clientId = c.req.param('clientId');
        let whereClause = 'WHERE id = $1';
        const params = [id];
        if (user.role === 'caravan') {
            whereClause += ' AND caravan_id = $2';
            params.push(user.sub);
        }
        const groupCheck = await pool.query(`SELECT * FROM groups ${whereClause}`, params);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        await pool.query('DELETE FROM group_members WHERE group_id = $1 AND client_id = $2', [id, clientId]);
        return c.json({ message: 'Member removed from group' });
    }
    catch (error) {
        console.error('Remove member error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// MUNICIPALITY ASSIGNMENT ENDPOINTS
// ============================================
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'];
// GET /api/groups/:id/municipalities - Get assigned municipalities
groups.get('/:id/municipalities', authMiddleware, async (c) => {
    try {
        const groupId = c.req.param('id');
        // Verify group exists
        const groupCheck = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        // Get assigned municipalities with PSGC data in a single JOIN query
        const result = await pool.query(`SELECT
        gm.id,
        gm.municipality_id,
        gm.assigned_at,
        gm.assigned_by,
        p.region,
        p.province,
        p.mun_city as municipality_name
       FROM group_municipalities gm
       LEFT JOIN psgc p ON TRIM(p.province) || '-' || TRIM(p.mun_city) = gm.municipality_id
       WHERE gm.group_id = $1 AND gm.deleted_at IS NULL
       ORDER BY gm.assigned_at DESC`, [groupId]);
        // Map results to expected format
        const items = result.rows.map(row => ({
            id: row.id,
            municipality_id: row.municipality_id,
            municipality_name: row.municipality_name || row.municipality_id,
            municipality_code: row.municipality_id,
            region_name: row.region || '',
            region_code: row.region || '',
            assigned_at: row.assigned_at,
            assigned_by: row.assigned_by,
        }));
        return c.json({ items });
    }
    catch (error) {
        console.error('Fetch group municipalities error:', error);
        return c.json({ items: [] });
    }
});
// POST /api/groups/:id/municipalities - Assign municipalities
groups.post('/:id/municipalities', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const currentUser = c.get('user');
        const groupId = c.req.param('id');
        const body = await c.req.json();
        const schema = z.object({
            municipality_ids: z.array(z.string()).min(1),
        });
        const validated = schema.parse(body);
        // Verify group exists and get caravan
        const groupCheck = await pool.query('SELECT id, caravan_id FROM groups WHERE id = $1', [groupId]);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        const group = groupCheck.rows[0];
        const caravanId = group.caravan_id;
        if (!caravanId) {
            return c.json({ message: 'Group has no caravan. Please assign a caravan first.' }, 400);
        }
        // Verify all municipalities exist in PSGC table
        for (const municipalityId of validated.municipality_ids) {
            if (!municipalityId || !municipalityId.includes('-')) {
                return c.json({ message: `Invalid municipality ID format: ${municipalityId}` }, 400);
            }
            const check = await pool.query(`SELECT 1 FROM psgc WHERE TRIM(province) || '-' || TRIM(mun_city) = $1 LIMIT 1`, [municipalityId]);
            if (check.rows.length === 0) {
                return c.json({ message: `Municipality not found: ${municipalityId}` }, 400);
            }
        }
        // Insert group assignments (upsert - handle re-assignments)
        let groupAssigned = 0;
        for (const municipalityId of validated.municipality_ids) {
            const existing = await pool.query('SELECT id, deleted_at FROM group_municipalities WHERE group_id = $1 AND municipality_id = $2', [groupId, municipalityId]);
            if (existing.rows.length > 0) {
                if (existing.rows[0].deleted_at) {
                    await pool.query('UPDATE group_municipalities SET deleted_at = NULL, assigned_at = NOW(), assigned_by = $1 WHERE id = $2', [currentUser.sub, existing.rows[0].id]);
                    groupAssigned++;
                }
            }
            else {
                await pool.query('INSERT INTO group_municipalities (id, group_id, municipality_id, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, NOW(), $3)', [groupId, municipalityId, currentUser.sub]);
                groupAssigned++;
            }
        }
        // Also assign to the caravan (user_locations table)
        let caravanAssigned = 0;
        for (const municipalityId of validated.municipality_ids) {
            try {
                // Use INSERT ... ON CONFLICT to prevent duplicates
                const result = await pool.query(`INSERT INTO user_locations (user_id, municipality_id, assigned_at, assigned_by, deleted_at)
           VALUES ($1, $2, NOW(), $3, NULL)
           ON CONFLICT (user_id, municipality_id)
           DO UPDATE SET
             deleted_at = NULL,
             assigned_at = NOW(),
             assigned_by = $3
           RETURNING (xmax = 0) as inserted`, [caravanId, municipalityId, currentUser.sub]);
                const wasInserted = result.rows[0].inserted;
                if (wasInserted) {
                    caravanAssigned++;
                }
            }
            catch (error) {
                // If constraint doesn't exist yet, fall back to manual check
                if (error.code === '42710' || error.code === '23505') {
                    const existing = await pool.query('SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND municipality_id = $2 AND deleted_at IS NULL LIMIT 1', [caravanId, municipalityId]);
                    if (existing.rows.length === 0) {
                        await pool.query('INSERT INTO user_locations (id, user_id, municipality_id, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, NOW(), $3)', [caravanId, municipalityId, currentUser.sub]);
                        caravanAssigned++;
                    }
                }
                else {
                    throw error;
                }
            }
        }
        return c.json({
            message: `Municipalities assigned successfully to group and caravan`,
            group_assigned_count: groupAssigned,
            caravan_assigned_count: caravanAssigned,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Assign municipalities error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/groups/:id/municipalities/bulk - Bulk unassign municipalities (admin, area_manager, assistant_area_manager)
// IMPORTANT: This route must be defined BEFORE the GET /municipalities route
groups.post('/:id/municipalities/bulk', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const groupId = c.req.param('id');
        const body = await c.req.json();
        const schema = z.object({
            municipality_ids: z.array(z.string()).min(1),
        });
        const validated = schema.parse(body);
        // Get group to find caravan
        const groupCheck = await pool.query('SELECT caravan_id FROM groups WHERE id = $1', [groupId]);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        const caravanId = groupCheck.rows[0].caravan_id;
        // Bulk soft delete from group_municipalities using ANY()
        const groupResult = await pool.query(`UPDATE group_municipalities
       SET deleted_at = NOW()
       WHERE group_id = $1
         AND TRIM(municipality_id) = ANY($2)
         AND deleted_at IS NULL
       RETURNING id`, [groupId, validated.municipality_ids.map(m => m.trim())]);
        // Also remove from caravan (user_locations table) using ANY()
        let caravanDeleted = 0;
        if (caravanId) {
            const caravanResult = await pool.query(`UPDATE user_locations
         SET deleted_at = NOW()
         WHERE user_id = $1
           AND TRIM(municipality_id) = ANY($2)
           AND deleted_at IS NULL
         RETURNING id`, [caravanId, validated.municipality_ids.map(m => m.trim())]);
            caravanDeleted = caravanResult.rows.length;
        }
        return c.json({
            message: `Bulk unassigned ${groupResult.rows.length} municipalities`,
            group_deleted_count: groupResult.rows.length,
            caravan_deleted_count: caravanDeleted,
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
// DELETE /api/groups/:id/municipalities/:municipalityId - Unassign municipality
groups.delete('/:id/municipalities/:municipalityId', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
    try {
        const groupId = c.req.param('id');
        const municipalityId = c.req.param('municipalityId');
        // Get group to find caravan
        const groupCheck = await pool.query('SELECT caravan_id FROM groups WHERE id = $1', [groupId]);
        if (groupCheck.rows.length === 0) {
            return c.json({ message: 'Group not found' }, 404);
        }
        const caravanId = groupCheck.rows[0].caravan_id;
        // Remove from group (use TRIM to handle whitespace issues)
        const existing = await pool.query('SELECT id, deleted_at FROM group_municipalities WHERE group_id = $1 AND TRIM(municipality_id) = TRIM($2)', [groupId, municipalityId]);
        if (existing.rows.length === 0) {
            return c.json({ message: 'Assignment not found' }, 404);
        }
        const groupRecord = existing.rows[0];
        // If already deleted in group, still try to remove from user_locations (idempotent for both)
        if (groupRecord.deleted_at === null) {
            await pool.query('UPDATE group_municipalities SET deleted_at = NOW() WHERE id = $1', [groupRecord.id]);
        }
        // Also remove from caravan (user_locations table) - use TRIM, idempotent
        if (caravanId) {
            await pool.query('UPDATE user_locations SET deleted_at = COALESCE(deleted_at, NOW()) WHERE user_id = $1 AND TRIM(municipality_id) = TRIM($2)', [caravanId, municipalityId]);
        }
        return c.json({ message: 'Municipality unassigned successfully' });
    }
    catch (error) {
        console.error('Unassign municipality error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
export default groups;
