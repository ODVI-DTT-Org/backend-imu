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
import { writeAssignmentAudit } from '../utils/assignment-audit.js';

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

    if (user.role === 'caravan' || user.role === 'team_leader') {
      conditions.push(`EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = g.id AND gm.client_id = $${paramIndex}
      )`);
      params.push(user.sub);
      paramIndex++;
    } else if (userId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = g.id AND gm.client_id = $${paramIndex}
      )`);
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
              CONCAT(ah.first_name, ' ', ah.last_name) as area_manager_name,
              CONCAT(aah.first_name, ' ', aah.last_name) as assistant_area_manager_name,
              COALESCE(gm.member_count, 0) as member_count,
              COALESCE(tl.names, ARRAY[]::text[]) as team_leader_names,
              COALESCE(all_members.names, ARRAY[]::text[]) as member_names
       FROM groups g
       LEFT JOIN users ah ON ah.id = g.area_manager_id
       LEFT JOIN users aah ON aah.id = g.assistant_area_manager_id
       LEFT JOIN (
         SELECT group_id, COUNT(*) as member_count
         FROM group_members
         GROUP BY group_id
       ) gm ON gm.group_id = g.id
       LEFT JOIN (
         SELECT gm2.group_id,
                array_agg(CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.first_name) as names
         FROM group_members gm2
         JOIN users u ON u.id = gm2.client_id AND u.role = 'team_leader'
         GROUP BY gm2.group_id
       ) tl ON tl.group_id = g.id
       LEFT JOIN (
         SELECT gm3.group_id,
                array_agg(CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.first_name) as names
         FROM group_members gm3
         JOIN users u ON u.id = gm3.client_id
         GROUP BY gm3.group_id
       ) all_members ON all_members.group_id = g.id
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
        area_manager_id: row.area_manager_id,
        area_manager_name: row.area_manager_name || null,
        assistant_area_manager_id: row.assistant_area_manager_id,
        assistant_area_manager_name: row.assistant_area_manager_name || null,
        team_leader_names: row.team_leader_names || [],
        member_names: row.member_names || [],
        member_count: parseInt(row.member_count) || 0,
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

// GET /api/groups/my - Get the group managed by the current user
groups.get('/my', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const result = await pool.query(
      `SELECT g.id, g.name, g.area_manager_id, g.assistant_area_manager_id,
              array_agg(gm.client_id) FILTER (WHERE gm.client_id IS NOT NULL) as members
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.area_manager_id = $1 OR g.assistant_area_manager_id = $1
       GROUP BY g.id
       LIMIT 1`,
      [user.sub]
    );
    if (!result.rows[0]) {
      return c.json({ error: 'No group found' }, 404);
    }
    const row = result.rows[0];
    return c.json({
      id: row.id,
      name: row.name,
      area_manager_id: row.area_manager_id,
      assistant_area_manager_id: row.assistant_area_manager_id,
      members: row.members || [],
    });
  } catch (error) {
    console.error('Get my group error:', error);
    throw new Error('Failed to get group');
  }
});

// GET /api/groups/:id - Get single group with members
groups.get('/:id', authMiddleware, requirePermission('groups', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    let whereClause = 'WHERE g.id = $1';
    const params: any[] = [id];

    if (user.role === 'caravan' || user.role === 'team_leader') {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = g.id AND gm.client_id = $2
      )`;
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

// POST /api/groups/bulk-delete - Bulk delete groups
groups.post('/bulk-delete', authMiddleware, requirePermission('groups', 'delete'), auditMiddleware('group', 'bulk_delete'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids } = bulkDeleteSchema.parse(body);

    const result = await pool.query(
      'DELETE FROM groups WHERE id = ANY($1::uuid[]) RETURNING id',
      [ids]
    );
    const deleted = result.rows.map((r: any) => r.id);

    return c.json({
      success: deleted,
      failed: [],
      message: `${deleted.length} group(s) deleted`,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk delete groups error:', error);
    throw new Error('Failed to bulk delete groups');
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

// ─── Stage 3b: area-RBAC management schemas ────────────────────────────────
const roleMemberAssignSchema = z.object({
  user_id: z.string().uuid(),
  role_in_group: z.enum(['area_head', 'assistant_area_head', 'tele']),
});

const teamLeaderAssignSchema = z.object({
  user_id: z.string().uuid(),
});

const municipalityPair = z.object({
  province: z.string().min(1),
  municipality: z.string().min(1),
});

const caravanAssignSchema = z.object({
  user_id: z.string().uuid(),
  municipalities: z.array(municipalityPair).optional().default([]),
});

const caravanMunicipalitiesReplaceSchema = z.object({
  municipalities: z.array(municipalityPair),
});

// ─── Stage 3b: scope guard for management endpoints ────────────────────────
/**
 * Verify that the actor has the right to manage this group via the new
 * group_role_members table. Returns the matching membership row(s) or throws.
 *
 * If actorRole === 'admin', the user must be a real admin (users.role).
 * Otherwise, the user must have at least one of the allowed roles in this
 * group (via group_role_members).
 */
async function ensureGroupAccess(
  actorId: string,
  actorRole: string,
  groupId: string,
  allowedRoles: ReadonlyArray<'area_head' | 'assistant_area_head' | 'team_leader'>,
): Promise<void> {
  if (actorRole === 'admin') return;
  const { rows } = await pool.query<{ role_in_group: string }>(
    `SELECT role_in_group FROM group_role_members
      WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [groupId, actorId],
  );
  const hasAllowed = rows.some(r =>
    (allowedRoles as readonly string[]).includes(r.role_in_group),
  );
  if (!hasAllowed) {
    throw new AuthenticationError(
      `actor user_id=${actorId} lacks ${allowedRoles.join('/')} membership in group ${groupId}`,
    );
  }
}

// POST /api/groups/:id/role-members
// Admin-only. Body: { user_id, role_in_group: 'area_head' | 'assistant_area_head' | 'tele' }
groups.post(
  '/:id/role-members',
  authMiddleware,
  requireRole('admin'),
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id');
    const parsed = roleMemberAssignSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ValidationError('Invalid request body').addDetail('zod', parsed.error.flatten());
    }
    const { user_id, role_in_group } = parsed.data;

    const { rows } = await pool.query(
      `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, group_id, user_id, role_in_group, assigned_at`,
      [groupId, user_id, role_in_group, user.sub],
    );
    if (rows.length === 0) {
      // Already exists — return the existing row instead of erroring
      const existing = await pool.query(
        `SELECT id, group_id, user_id, role_in_group, assigned_at
           FROM group_role_members
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = $3 AND deleted_at IS NULL`,
        [groupId, user_id, role_in_group],
      );
      return c.json({ member: existing.rows[0], created: false }, 200);
    }

    await writeAssignmentAudit({
      actorUserId: user.sub,
      action: 'role_member.assign',
      targetUserId: user_id,
      targetGroupId: groupId,
      payload: { role_in_group },
    });
    return c.json({ member: rows[0], created: true }, 201);
  },
);

// DELETE /api/groups/:id/role-members/:userId/:role
groups.delete(
  '/:id/role-members/:userId/:role',
  authMiddleware,
  requireRole('admin'),
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id');
    const userId = c.req.param('userId');
    const role = c.req.param('role') ?? '';
    if (!['area_head', 'assistant_area_head', 'tele'].includes(role)) {
      throw new ValidationError(`Invalid role ${role}`);
    }
    const { rowCount } = await pool.query(
      `UPDATE group_role_members
          SET deleted_at = NOW()
        WHERE group_id = $1 AND user_id = $2
          AND role_in_group = $3 AND deleted_at IS NULL`,
      [groupId, userId, role],
    );
    if (rowCount === 0) {
      throw new NotFoundError('Role membership not found');
    }
    await writeAssignmentAudit({
      actorUserId: user.sub,
      action: 'role_member.remove',
      targetUserId: userId,
      targetGroupId: groupId,
      payload: { role_in_group: role },
    });
    return c.json({ removed: true });
  },
);

// POST /api/groups/:id/team-leaders
// Admin or area_head in this group.
groups.post(
  '/:id/team-leaders',
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id') ?? '';
    await ensureGroupAccess(user.sub, user.role, groupId, ['area_head']);

    const parsed = teamLeaderAssignSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ValidationError('Invalid request body').addDetail('zod', parsed.error.flatten());
    }
    const { user_id } = parsed.data;

    try {
      const { rows } = await pool.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'team_leader', $3)
         RETURNING id, group_id, user_id, role_in_group, assigned_at`,
        [groupId, user_id, user.sub],
      );
      await writeAssignmentAudit({
        actorUserId: user.sub,
        action: 'team_leader.assign',
        targetUserId: user_id,
        targetGroupId: groupId,
      });
      return c.json({ team_leader: rows[0] }, 201);
    } catch (err: any) {
      // uq_group_role_members_one_group_for_tl violation → user is TL elsewhere
      if (err.code === '23505' && err.constraint?.includes('one_group_for_tl')) {
        throw new ValidationError(
          'User is already a team leader in another group; remove first',
        ).addDetail('user_id', user_id);
      }
      throw err;
    }
  },
);

// DELETE /api/groups/:id/team-leaders/:userId
// Stage 1 trigger blocks if any caravan is still assigned to this group.
groups.delete(
  '/:id/team-leaders/:userId',
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id') ?? '';
    const userId = c.req.param('userId') ?? '';
    await ensureGroupAccess(user.sub, user.role, groupId, ['area_head']);

    try {
      const { rowCount } = await pool.query(
        `UPDATE group_role_members
            SET deleted_at = NOW()
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'team_leader' AND deleted_at IS NULL`,
        [groupId, userId],
      );
      if (rowCount === 0) {
        throw new NotFoundError('Team leader not found in this group');
      }
      await writeAssignmentAudit({
        actorUserId: user.sub,
        action: 'team_leader.remove',
        targetUserId: userId,
        targetGroupId: groupId,
      });
      return c.json({ removed: true });
    } catch (err: any) {
      // The plan didn't specify TL-blocks-on-caravans for Stage 3b (the spec said
      // 'strict block by default' is a follow-up). Currently the Stage 1 trigger
      // blocks 'caravan' role removal with active slices, NOT TL removal.
      // So this path likely won't trigger. If a future trigger blocks TL removal
      // with dependent caravans, return 409 with a useful payload.
      throw err;
    }
  },
);

// POST /api/groups/:id/caravans
// Adds a caravan member + optional initial slice. Allowed: admin / area_head /
// assistant_area_head / team_leader in this group.
groups.post(
  '/:id/caravans',
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id') ?? '';
    await ensureGroupAccess(user.sub, user.role, groupId,
      ['area_head', 'assistant_area_head', 'team_leader']);

    const parsed = caravanAssignSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ValidationError('Invalid request body').addDetail('zod', parsed.error.flatten());
    }
    const { user_id, municipalities } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert the caravan membership (idempotent)
      await client.query(
        `INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
         VALUES ($1, $2, 'caravan', $3)
         ON CONFLICT DO NOTHING`,
        [groupId, user_id, user.sub],
      );

      // 2. Insert each municipality slice. Stage 1 trigger validates each row.
      const inserted: { province: string; municipality: string }[] = [];
      for (const m of municipalities) {
        const { rows } = await client.query<{ province: string; municipality: string }>(
          `INSERT INTO group_caravan_municipalities
             (group_id, caravan_user_id, province, municipality, assigned_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING province, municipality`,
          [groupId, user_id, m.province, m.municipality, user.sub],
        );
        if (rows[0]) inserted.push(rows[0]);
      }

      await client.query('COMMIT');

      await writeAssignmentAudit({
        actorUserId: user.sub,
        action: 'caravan.assign',
        targetUserId: user_id,
        targetGroupId: groupId,
        payload: { municipalities: inserted },
      });
      return c.json({ caravan: { user_id, group_id: groupId }, slice: inserted }, 201);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505' && err.constraint?.includes('one_group_for_caravan')) {
        throw new ValidationError(
          'User is already a caravan in another group; remove first',
        ).addDetail('user_id', user_id);
      }
      if (err.message?.includes('municipality_not_in_group_pool')) {
        throw new ValidationError(
          'One or more municipalities are not in this group\'s pool',
        ).addDetail('hint', err.hint ?? null);
      }
      throw err;
    } finally {
      client.release();
    }
  },
);

// PATCH /api/groups/:id/caravans/:userId/municipalities
// Full replace. Soft-deletes rows not in the new list, inserts new ones.
groups.patch(
  '/:id/caravans/:userId/municipalities',
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id') ?? '';
    const userId = c.req.param('userId') ?? '';
    await ensureGroupAccess(user.sub, user.role, groupId,
      ['area_head', 'assistant_area_head', 'team_leader']);

    const parsed = caravanMunicipalitiesReplaceSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ValidationError('Invalid request body').addDetail('zod', parsed.error.flatten());
    }
    const { municipalities } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Select existing active slices
      const { rows: existing } = await client.query<{ province: string; municipality: string }>(
        `SELECT province, municipality FROM group_caravan_municipalities
          WHERE group_id = $1 AND caravan_user_id = $2 AND deleted_at IS NULL`,
        [groupId, userId],
      );
      const existingSet = new Set(existing.map(e => `${e.province}|${e.municipality}`));
      const newSet = new Set(municipalities.map(m => `${m.province}|${m.municipality}`));

      const toRemove = existing.filter(e => !newSet.has(`${e.province}|${e.municipality}`));
      const toAdd = municipalities.filter(m => !existingSet.has(`${m.province}|${m.municipality}`));

      for (const r of toRemove) {
        await client.query(
          `UPDATE group_caravan_municipalities
              SET deleted_at = NOW()
            WHERE group_id = $1 AND caravan_user_id = $2
              AND province = $3 AND municipality = $4
              AND deleted_at IS NULL`,
          [groupId, userId, r.province, r.municipality],
        );
      }
      for (const a of toAdd) {
        await client.query(
          `INSERT INTO group_caravan_municipalities
             (group_id, caravan_user_id, province, municipality, assigned_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [groupId, userId, a.province, a.municipality, user.sub],
        );
      }

      await client.query('COMMIT');

      await writeAssignmentAudit({
        actorUserId: user.sub,
        action: 'caravan_municipalities.replace',
        targetUserId: userId,
        targetGroupId: groupId,
        payload: { added: toAdd, removed: toRemove },
      });
      return c.json({ added: toAdd.length, removed: toRemove.length });
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.message?.includes('municipality_not_in_group_pool')) {
        throw new ValidationError(
          'One or more municipalities are not in this group\'s pool',
        ).addDetail('hint', err.hint ?? null);
      }
      throw err;
    } finally {
      client.release();
    }
  },
);

// DELETE /api/groups/:id/caravans/:userId
// Soft-deletes the caravan member + their slices in the same transaction
// (Stage 1 trigger requires slices to be empty before member soft-delete).
groups.delete(
  '/:id/caravans/:userId',
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const groupId = c.req.param('id') ?? '';
    const userId = c.req.param('userId') ?? '';
    await ensureGroupAccess(user.sub, user.role, groupId,
      ['area_head', 'assistant_area_head', 'team_leader']);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE group_caravan_municipalities
            SET deleted_at = NOW()
          WHERE group_id = $1 AND caravan_user_id = $2 AND deleted_at IS NULL`,
        [groupId, userId],
      );
      const { rowCount } = await client.query(
        `UPDATE group_role_members
            SET deleted_at = NOW()
          WHERE group_id = $1 AND user_id = $2
            AND role_in_group = 'caravan' AND deleted_at IS NULL`,
        [groupId, userId],
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Caravan membership not found');
      }
      await client.query('COMMIT');

      await writeAssignmentAudit({
        actorUserId: user.sub,
        action: 'caravan.remove',
        targetUserId: userId,
        targetGroupId: groupId,
      });
      return c.json({ removed: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
);

export default groups;




