import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireAnyRole, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
} from '../errors/index.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';

const groups = new Hono();

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
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
groups.get('/', authMiddleware, requirePermission('groups', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '50');
    const search = c.req.query('search');
    const status = c.req.query('status');
    const userId = c.req.query('user_id');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (user.role === 'caravan') {
      // Filter by caravan_id (caravan/team member)
      conditions.push(`g.caravan_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    } else if (userId) {
      // Managers can filter by user_id
      conditions.push(`g.caravan_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (search) {
      conditions.push(`g.name ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Note: groups table has no 'status' column — filter omitted

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM groups g ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT g.*,
              CONCAT(c.first_name, ' ', c.last_name) as caravan_name,
              COALESCE(gm.member_count, 0) as member_count
       FROM groups g
       LEFT JOIN users c ON c.id = g.caravan_id
       LEFT JOIN (
         SELECT group_id, COUNT(*) as member_count
         FROM group_members
         GROUP BY group_id
       ) gm ON gm.group_id = g.id
       ${whereClause}
       ORDER BY g.name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    return c.json({
      items: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        caravan_id: row.caravan_id,
        caravan_name: row.caravan_name || null,
        member_count: row.member_count || 0,
        created: row.created_at,
      })),
      page, perPage, totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('List groups error:', error);
    throw new Error();
  }
});

// GET /api/groups/:id - Get single group with members
groups.get('/:id', authMiddleware, requirePermission('groups', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    let whereClause = 'WHERE g.id = $1';
    const params: any[] = [id];

    if (user.role === 'caravan') {
      whereClause += ' AND g.caravan_id = $2';
      params.push(user.sub);
    }

    const result = await pool.query(
      `SELECT g.*,
              CONCAT(c.first_name, ' ', c.last_name) as caravan_name
       FROM groups g
       LEFT JOIN users c ON c.id = g.caravan_id
       ${whereClause}`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    const group = result.rows[0];

    // Fetch members from group_members table (not from groups.members)
    const membersResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.client_id
       WHERE gm.group_id = $1`,
      [id]
    );

    const memberIds = membersResult.rows.map(m => m.id);
    const expandedMembers = membersResult.rows.map(m => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      email: m.email
    }));

    return c.json({
      id: group.id,
      name: group.name,
      description: group.description,
      caravan_id: group.caravan_id,
      caravan_name: group.caravan_name || null,
      members: memberIds,
      expand: {
        members: expandedMembers
      },
      created: group.created_at,
    });
  } catch (error) {
    console.error('Get group error:', error);
    throw new Error();
  }
});

// POST /api/groups - Create group
groups.post('/', authMiddleware, requirePermission('groups', 'create'), auditMiddleware('group'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createGroupSchema.parse(body);

    const members = validated.members || [];

    // Insert group without members column
    const result = await pool.query(
      `INSERT INTO groups (id, name, description, caravan_id)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
      [
        validated.name,
        validated.description || null,
        validated.caravan_id || null
      ]
    );

    const groupId = result.rows[0].id;

    // Insert members into group_members table if provided
    if (members.length > 0) {
      const placeholders = members.map((_: string, i: number) => `(gen_random_uuid(), $1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO group_members (id, group_id, client_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        [groupId, ...members]
      );
    }

    return c.json({
      id: groupId,
      name: result.rows[0].name,
      description: result.rows[0].description,
      caravan_id: result.rows[0].caravan_id,
      members: members,
      created: result.rows[0].created_at,
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create group error:', error);
    throw new Error('Failed to create group');
  }
});

// PUT /api/groups/:id - Update group
groups.put('/:id', authMiddleware, requirePermission('groups', 'update'), auditMiddleware('group'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();

    console.log('[Groups] PUT request body:', JSON.stringify(body, null, 2));
    const validated = updateGroupSchema.parse(body);

    // Check if group exists
    const groupCheck = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(validated.name);
    }
    if (validated.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(validated.description);
    }
    if (validated.caravan_id !== undefined) {
      updateFields.push(`caravan_id = $${paramIndex++}`);
      updateValues.push(validated.caravan_id);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    // Handle members update separately (delete and re-add)
    if (validated.members !== undefined) {
      // Delete existing members
      await pool.query('DELETE FROM group_members WHERE group_id = $1', [id]);

      // Add new members if provided
      if (validated.members.length > 0) {
        const placeholders = validated.members.map((_: string, i: number) => `(gen_random_uuid(), $1, $${i + 2})`).join(', ');
        await pool.query(
          `INSERT INTO group_members (id, group_id, client_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          [id, ...validated.members]
        );
      }
    }

    // Fetch current members for response
    const membersResult = await pool.query(
      `SELECT client_id FROM group_members WHERE group_id = $1`,
      [id]
    );
    const memberIds = membersResult.rows.map(row => row.client_id);

    // Return updated group
    return c.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      caravan_id: result.rows[0].caravan_id,
      members: memberIds,
      created: result.rows[0].created_at,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Update group validation error:', {
        errors: error.errors,
        issues: error.issues
      });
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update group error:', error);
    throw new Error('Failed to update group');
  }
});

// DELETE /api/groups/:id - Delete group
groups.delete('/:id', authMiddleware, requirePermission('groups', 'delete'), auditMiddleware('group'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    let whereClause = 'WHERE id = $1';
    const params: any[] = [id];
    if (user.role === 'caravan') {
      whereClause += ' AND caravan_id = $2';
      params.push(user.sub);
    }

    const result = await pool.query(`DELETE FROM groups ${whereClause} RETURNING id`, params);
    if (result.rows.length === 0) {
      throw new NotFoundError('Group');
    }
    return c.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    throw new Error();
  }
});

// POST /api/groups/bulk-delete - Bulk delete groups (now queued)
groups.post('/bulk-delete', authMiddleware, requirePermission('groups', 'delete'), auditMiddleware('group', 'bulk_delete'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids } = bulkDeleteSchema.parse(body);

    // Create bulk delete job
    const job = await addBulkJob(
      BulkJobType.BULK_DELETE_GROUPS,
      user.sub,
      ids
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk delete job started for ${ids.length} groups`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: `${Math.ceil(ids.length / 50)} minutes`,
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk delete groups error:', error);
    throw new Error('Failed to create bulk delete job');
  }
});

// POST /api/groups/:id/members - Add members to group
groups.post('/:id/members', authMiddleware, requirePermission('groups', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = addMembersSchema.parse(body);

    let whereClause = 'WHERE id = $1';
    const params: any[] = [id];
    if (user.role === 'caravan') {
      whereClause += ' AND caravan_id = $2';
      params.push(user.sub);
    }

    const groupCheck = await pool.query(`SELECT * FROM groups ${whereClause}`, params);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    let added = 0;
    for (const clientId of validated.client_ids) {
      try {
        await pool.query(
          `INSERT INTO group_members (id, group_id, client_id) VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING`,
          [id, clientId]
        );
        added++;
      } catch { /* skip */ }
    }
    return c.json({ message: `Added ${added} members to group`, added });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add members error:', error);
    throw new Error('Failed to add members');
  }
});

// DELETE /api/groups/:id/members/:clientId - Remove member from group
groups.delete('/:id/members/:clientId', authMiddleware, requirePermission('groups', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const clientId = c.req.param('clientId');

    let whereClause = 'WHERE id = $1';
    const params: any[] = [id];
    if (user.role === 'caravan') {
      whereClause += ' AND caravan_id = $2';
      params.push(user.sub);
    }

    const groupCheck = await pool.query(`SELECT * FROM groups ${whereClause}`, params);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    await pool.query('DELETE FROM group_members WHERE group_id = $1 AND client_id = $2', [id, clientId]);
    return c.json({ message: 'Member removed from group' });
  } catch (error) {
    console.error('Remove member error:', error);
    throw new Error();
  }
});

// ============================================
// MUNICIPALITY ASSIGNMENT ENDPOINTS
// ============================================

const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;

// GET /api/groups/:id/municipalities - Get assigned municipalities
groups.get('/:id/municipalities', authMiddleware, requirePermission('groups', 'read'), async (c) => {
  try {
    const groupId = c.req.param('id');

    // Verify group exists
    const groupCheck = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    // Get assigned municipalities with PSGC data in a single JOIN query
    const result = await pool.query(
      `SELECT
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
       ORDER BY gm.assigned_at DESC`,
      [groupId]
    );

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
  } catch (error) {
    console.error('Fetch group municipalities error:', error);
    return c.json({ items: [] });
  }
});

// POST /api/groups/:id/municipalities - Assign municipalities
groups.post('/:id/municipalities', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const currentUser = c.get('user');
    const groupId = c.req.param('id');

    const body = await c.req.json();
    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    // Verify group exists and get caravan
    const groupCheck = await pool.query('SELECT id, caravan_id FROM groups WHERE id = $1', [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    const group = groupCheck.rows[0];
    const caravanId = group.caravan_id;

    if (!caravanId) {
      throw new ValidationError('Group has no caravan. Please assign a caravan first.');
    }

    // Verify all municipalities exist in PSGC table
    for (const location of validated.locations) {
      const { province, municipality } = location;

      const check = await pool.query(
        `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
        [province, municipality]
      );

      if (check.rows.length === 0) {
        throw new NotFoundError(`Municipality not found: ${province}-${municipality}`);
      }
    }

    // Insert group assignments (upsert - handle re-assignments)
    let groupAssigned = 0;
    for (const location of validated.locations) {
      const { province, municipality } = location;

      const existing = await pool.query(
        'SELECT id, deleted_at FROM group_municipalities WHERE group_id = $1 AND province = $2 AND municipality = $3',
        [groupId, province, municipality]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].deleted_at) {
          await pool.query(
            'UPDATE group_municipalities SET deleted_at = NULL, assigned_at = NOW(), assigned_by = $1 WHERE id = $2',
            [currentUser.sub, existing.rows[0].id]
          );
          groupAssigned++;
        }
      } else {
        await pool.query(
          'INSERT INTO group_municipalities (id, group_id, province, municipality, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)',
          [groupId, province, municipality, currentUser.sub]
        );
        groupAssigned++;
      }
    }

    // Also assign to the caravan (user_locations table)
    let caravanAssigned = 0;
    for (const location of validated.locations) {
      const { province, municipality } = location;

      try {
        // Use INSERT ... ON CONFLICT to prevent duplicates
        const result = await pool.query(
          `INSERT INTO user_locations (id, user_id, province, municipality, assigned_at, assigned_by)
           VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)
           ON CONFLICT (user_id, province, municipality)
           DO UPDATE SET
             deleted_at = NULL,
             assigned_at = NOW(),
             assigned_by = $4
           RETURNING (xmax = 0) as inserted`,
          [caravanId, province, municipality, currentUser.sub]
        );

        const wasInserted = result.rows[0].inserted;
        if (wasInserted) {
          caravanAssigned++;
        }
      } catch (error: any) {
        // If constraint doesn't exist yet, fall back to manual check
        if (error.code === '42710' || error.code === '23505') {
          const existing = await pool.query(
            'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL LIMIT 1',
            [caravanId, province, municipality]
          );

          if (existing.rows.length === 0) {
            await pool.query(
              'INSERT INTO user_locations (id, user_id, province, municipality, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)',
              [caravanId, province, municipality, currentUser.sub]
            );
            caravanAssigned++;
          }
        } else {
          throw error;
        }
      }
    }

    return c.json({
      message: `Municipalities assigned successfully to group and caravan`,
      group_assigned_count: groupAssigned,
      caravan_assigned_count: caravanAssigned,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Assign municipalities error:', error);
    throw new Error('Failed to assign municipalities');
  }
});

// POST /api/groups/:id/municipalities/bulk - Bulk unassign municipalities (admin, area_manager, assistant_area_manager)
// IMPORTANT: This route must be defined BEFORE the GET /municipalities route
groups.post('/:id/municipalities/bulk', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const groupId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    // Get group to find caravan
    const groupCheck = await pool.query('SELECT caravan_id FROM groups WHERE id = $1', [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    const caravanId = groupCheck.rows[0].caravan_id;

    // Bulk soft delete from group_municipalities
    const locationsToDelete = [];
    for (const location of validated.locations) {
      const { province, municipality } = location;
      locationsToDelete.push(`(province = '${province.replace(/'/g, "''")}' AND municipality = '${municipality.replace(/'/g, "''")}')`);
    }
    const whereClause = locationsToDelete.join(' OR ');

    const groupResult = await pool.query(
      `UPDATE group_municipalities
       SET deleted_at = NOW()
       WHERE group_id = $1
         AND (${whereClause})
         AND deleted_at IS NULL
       RETURNING id`,
      [groupId]
    );

    // Also remove from caravan (user_locations table)
    let caravanDeleted = 0;
    if (caravanId) {
      for (const location of validated.locations) {
        const { province, municipality } = location;

        const caravanResult = await pool.query(
          `UPDATE user_locations
           SET deleted_at = NOW()
           WHERE user_id = $1
             AND province = $2
             AND municipality = $3
             AND deleted_at IS NULL
           RETURNING id`,
          [caravanId, province, municipality]
        );
        caravanDeleted += caravanResult.rowCount || 0;
      }
    }

    return c.json({
      message: `Bulk unassigned ${groupResult.rows.length} locations`,
      group_deleted_count: groupResult.rows.length,
      caravan_deleted_count: caravanDeleted,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk unassign municipalities error:', error);
    throw new Error('Failed to bulk unassign municipalities');
  }
});

// DELETE /api/groups/:id/locations/:province/:municipality - Unassign location
groups.delete('/:id/locations/:province/:municipality', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const groupId = c.req.param('id');
    const province = c.req.param('province');
    const municipality = c.req.param('municipality');

    // Validate required parameters
    if (!province || !municipality) {
      throw new ValidationError('province and municipality are required');
    }

    // Get group to find caravan
    const groupCheck = await pool.query('SELECT caravan_id FROM groups WHERE id = $1', [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new NotFoundError('Group');
    }

    const caravanId = groupCheck.rows[0].caravan_id;

    // Remove from group using province and municipality
    const existing = await pool.query(
      'SELECT id, deleted_at FROM group_municipalities WHERE group_id = $1 AND province = $2 AND municipality = $3',
      [groupId, province, municipality]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Assignment');
    }

    const groupRecord = existing.rows[0];

    // If already deleted in group, still try to remove from user_locations (idempotent for both)
    if (groupRecord.deleted_at === null) {
      await pool.query(
        'UPDATE group_municipalities SET deleted_at = NOW() WHERE id = $1',
        [groupRecord.id]
      );
    }

    // Also remove from caravan (user_locations table) - use province/municipality
    if (caravanId) {
      await pool.query(
        'UPDATE user_locations SET deleted_at = COALESCE(deleted_at, NOW()) WHERE user_id = $1 AND province = $2 AND municipality = $3',
        [caravanId, province, municipality]
      );
    }

    return c.json({ message: 'Location unassigned successfully' });
  } catch (error) {
    console.error('Unassign municipality error:', error);
    throw new Error();
  }
});

export default groups;
