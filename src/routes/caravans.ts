import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole,
requireAnyRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  ConflictError,
} from '../errors/index.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';

const caravans = new Hono();

// Valid roles for the role system (field_agent was renamed to caravan in migration 008)
const CARAVAN_ROLES = ['caravan'] as const;
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;

// Validation schemas
const createCaravanSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().max(255),
  phone: z.string().max(50).optional(),
  is_active: z.boolean().optional(),
});

const updateCaravanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  is_active: z.boolean().optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

// Helper to map DB row to Caravan type
// Note: Caravans are stored in the users table with role = 'caravan' (renamed from 'field_agent' in migration 008)
function mapRowToCaravan(row: Record<string, any>) {
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
caravans.get('/', authMiddleware, requirePermission('caravans', 'read'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const status = c.req.query('status');

    const offset = (page - 1) * perPage;
    const conditions: string[] = ["role = ANY($1)"]; // Filter by caravan roles
    const params: any[] = [CARAVAN_ROLES];
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
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(mapRowToCaravan);

    return c.json({
      items,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch caravans error:', error);
    throw new Error();
  }
});

// GET /api/caravans/:id - Get single caravan
caravans.get('/:id', authMiddleware, requirePermission('caravans', 'read'), async (c) => {
  try {
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at
       FROM users
       WHERE id = $1 AND role = ANY($2)`,
      [id, CARAVAN_ROLES]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Caravan');
    }

    return c.json(mapRowToCaravan(result.rows[0]));
  } catch (error) {
    console.error('Fetch caravan error:', error);
    throw new Error();
  }
});

// POST /api/caravans - Create new caravan (admin only)
caravans.post('/', authMiddleware, requirePermission('caravans', 'create'), auditMiddleware('caravan'), async (c) => {
  try {
    const body = await c.req.json();
    const validated = createCaravanSchema.parse(body);

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [validated.email]);
    if (existing.rows.length > 0) {
      throw new ConflictError('A caravan with this email already exists');
    }

    // Split name into first_name and last_name
    const nameParts = validated.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create user with caravan role
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, phone, is_active)
       VALUES ($1, '', $2, $3, 'caravan', $4, COALESCE($5, true))
       RETURNING id, email, first_name, last_name, phone, is_active, created_at, updated_at`,
      [validated.email, firstName, lastName, validated.phone, validated.is_active]
    );

    console.log('[Create Caravan] Created caravan user:', {
      userId: result.rows[0].id,
      email: validated.email
    });

    return c.json(mapRowToCaravan(result.rows[0]), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create caravan error:', error);
    throw new Error('Failed to create caravan');
  }
});

// PUT /api/caravans/:id - Update caravan
caravans.put('/:id', authMiddleware, requirePermission('caravans', 'update'), auditMiddleware('caravan'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateCaravanSchema.parse(body);

    // Check if caravan exists
    const existing = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND role = ANY($2)',
      [id, CARAVAN_ROLES]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Caravan');
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
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
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [validated.email, id]
      );
      if (emailCheck.rows.length > 0) {
        throw new ConflictError('Email is already in use');
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
      throw new ValidationError('No fields to update');
    }

    params.push(id);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // Fetch updated record
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone, is_active, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );

    return c.json(mapRowToCaravan(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update caravan error:', error);
    throw new Error('Failed to update caravan');
  }
});

// DELETE /api/caravans/:id - Delete caravan (admin only)
caravans.delete('/:id', authMiddleware, requirePermission('caravans', 'delete'), auditMiddleware('caravan'), async (c) => {
  try {
    const id = c.req.param('id');

    // Check if caravan exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = ANY($2)',
      [id, CARAVAN_ROLES]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Caravan');
    }

    // Delete from users table (will cascade to related data)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    return c.json({ message: 'Caravan deleted successfully' });
  } catch (error) {
    console.error('Delete caravan error:', error);
    throw new Error();
  }
});

// POST /api/caravans/bulk-delete - Bulk delete caravans (admin only, now queued)
caravans.post('/bulk-delete', authMiddleware, requirePermission('caravans', 'delete'), auditMiddleware('caravan', 'bulk_delete'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids } = bulkDeleteSchema.parse(body);

    // Prevent self-deletion
    if (ids.includes(user.sub)) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Create bulk delete job
    const job = await addBulkJob(
      BulkJobType.BULK_DELETE_CARAVANS,
      user.sub,
      ids,
      { preventSelfDeletion: true }
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk delete job started for ${ids.length} caravans`,
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
    console.error('Bulk delete caravans error:', error);
    throw new Error('Failed to create bulk delete job');
  }
});

// ============================================
// MUNICIPALITY ASSIGNMENT ENDPOINTS
// ============================================

// GET /api/caravans/:id/municipalities - Get assigned municipalities
caravans.get('/:id/municipalities', authMiddleware, requirePermission('caravans', 'read'), async (c) => {
  try {
    const caravanId = c.req.param('id');

    // Verify caravan exists (is a user with caravan role)
    const caravanCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = ANY($2)',
      [caravanId, CARAVAN_ROLES]
    );

    if (caravanCheck.rows.length === 0) {
      throw new NotFoundError('Caravan');
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
    // Use JOIN to get PSGC data in a single query instead of parallel queries
    const result = await pool.query(
      `SELECT
        ums.id,
        ums.province,
        ums.municipality,
        ums.assigned_at,
        ums.assigned_by,
        p.region
       FROM user_locations ums
       LEFT JOIN psgc p ON p.province = ums.province AND p.mun_city = ums.municipality
       WHERE ums.user_id = $1 AND ums.deleted_at IS NULL
       ORDER BY ums.assigned_at DESC`,
      [caravanId]
    );

    // Map results to expected format
    const items = result.rows.map(row => ({
      id: row.id,
      province: row.province,
      municipality: row.municipality,
      municipality_id: `${row.province}-${row.municipality}`, // Legacy format for frontend compatibility
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
      assignments: result.rows.map(r => r.province + '-' + r.municipality)
    });

    console.log('[GET Municipalities] Returning items:', items.length);

    return c.json({ items });
  } catch (error) {
    console.error('Fetch caravan municipalities error:', error);
    // Return empty items instead of 500 error for now
    return c.json({ items: [] });
  }
});

// ========================================
// BULK OPERATIONS FOR MUNICIPALITY ASSIGNMENTS
// All bulk operations use action-based endpoints
// ========================================

// POST /api/caravans/:id/municipalities/bulk/create - Bulk create municipalities assignments (admin, area_manager, assistant_area_manager)
caravans.post('/:id/municipalities/bulk/create', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const currentUser = c.get('user');
    const caravanId = c.req.param('id');

    const body = await c.req.json();
    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    console.log('[Bulk Create Municipalities] Request:', {
      caravanId,
      locations: validated.locations,
      count: validated.locations.length
    });

    // Verify caravan exists (is a user with caravan role)
    const caravanCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = ANY($2)',
      [caravanId, CARAVAN_ROLES]
    );

    if (caravanCheck.rows.length === 0) {
      throw new NotFoundError('Caravan');
    }

    // Check if user_locations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('Municipality assignments feature not available. Please run database migrations.');
    }

    // caravanId IS the user_id - we query users table directly now
    const userId = caravanId;

    // Verify all municipalities exist in PSGC table
    for (const location of validated.locations) {
      const { province, municipality } = location;

      // Query using separate province and municipality
      const check = await pool.query(
        `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
        [province.trim(), municipality.trim()]
      );

      if (check.rows.length === 0) {
        throw new NotFoundError(`Municipality not found: ${province}-${municipality}`);
      }
    }

    // Bulk insert assignments using upsert (INSERT ... ON CONFLICT)
    // This approach is atomic and prevents race conditions
    let assigned = 0;

    for (const location of validated.locations) {
      const { province, municipality } = location;

      try {
        // Try to insert - if unique constraint is violated, update the existing record
        const result = await pool.query(
          `INSERT INTO user_locations (id, user_id, province, municipality, assigned_at, assigned_by)
           VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)
           ON CONFLICT (user_id, province, municipality)
           DO UPDATE SET
             deleted_at = NULL,
             assigned_at = NOW(),
             assigned_by = $4
           RETURNING (xmax = 0) as inserted`,
          [userId, province.trim(), municipality.trim(), currentUser.sub]
        );

        // xmax = 0 means the row was inserted, not updated
        const wasInserted = result.rows[0].inserted;

        if (wasInserted) {
          assigned++;
          console.log('[Bulk Create Municipalities] Created new assignment:', province, municipality);
        } else {
          console.log('[Bulk Create Municipalities] Re-activated existing:', province, municipality);
        }
      } catch (error: any) {
        console.error('[Bulk Create Municipalities] Error inserting location:', error);

        // Fallback: Try to find existing location
        const existing = await pool.query(
          'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL LIMIT 1',
          [userId, province, municipality]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            'INSERT INTO user_locations (id, user_id, province, municipality, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)',
            [userId, province, municipality, currentUser.sub]
          );
          assigned++;
          console.log('[Bulk Create Municipalities] Created new assignment (fallback):', province, municipality);
        } else {
          console.log('[Bulk Create Municipalities] Skipped (already active):', province, municipality);
        }
      }
    }

    console.log('[Bulk Create Municipalities] Final result:', { assigned });

    // If no municipalities were actually assigned, return an error
    if (assigned === 0) {
      return c.json({
        message: 'No new municipalities were assigned. All selected municipalities are already assigned to this caravan.',
        assigned_count: 0,
        already_assigned: true
      }, 400); // 400 Bad Request since nothing was actually changed
    }

    return c.json({
      message: 'Municipalities assigned successfully',
      assigned_count: assigned,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk create municipalities error:', error);
    throw new Error('Failed to bulk create municipalities');
  }
});

// POST /api/caravans/:id/municipalities/bulk/update - Bulk update municipalities assignments (admin, area_manager, assistant_area_manager)
caravans.post('/:id/municipalities/bulk/update', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const currentUser = c.get('user');
    const caravanId = c.req.param('id');

    const body = await c.req.json();
    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
        oldProvince: z.string().min(1).optional(),
        oldMunicipality: z.string().min(1).optional(),
      })).min(1),
    });
    const validated = schema.parse(body);

    console.log('[Bulk Update Municipalities] Request:', {
      caravanId,
      locations: validated.locations,
      count: validated.locations.length
    });

    // Verify caravan exists (is a user with caravan role)
    const caravanCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = ANY($2)',
      [caravanId, CARAVAN_ROLES]
    );

    if (caravanCheck.rows.length === 0) {
      throw new NotFoundError('Caravan');
    }

    // Check if user_locations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('Municipality assignments feature not available. Please run database migrations.');
    }

    // caravanId IS the user_id - we query users table directly now
    const userId = caravanId;

    let updated = 0;

    for (const location of validated.locations) {
      const { province, municipality, oldProvince, oldMunicipality } = location;

      // If old values provided, update specific location; otherwise verify new location exists
      if (oldProvince && oldMunicipality) {
        // Update existing assignment
        const checkResult = await pool.query(
          'SELECT id FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL LIMIT 1',
          [userId, oldProvince.trim(), oldMunicipality.trim()]
        );

        if (checkResult.rows.length === 0) {
          console.log('[Bulk Update Municipalities] Assignment not found:', oldProvince, oldMunicipality);
          continue;
        }

        // Verify new municipality exists in PSGC table
        const psgcCheck = await pool.query(
          `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
          [province.trim(), municipality.trim()]
        );

        if (psgcCheck.rows.length === 0) {
          throw new NotFoundError(`Municipality not found: ${province}-${municipality}`);
        }

        // Check if new location already exists
        const existingCheck = await pool.query(
          'SELECT id FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL LIMIT 1',
          [userId, province.trim(), municipality.trim()]
        );

        if (existingCheck.rows.length > 0) {
          // New location already exists, delete old one
          await pool.query(
            'UPDATE user_locations SET deleted_at = NOW() WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL',
            [userId, oldProvince.trim(), oldMunicipality.trim()]
          );
          updated++;
          console.log('[Bulk Update Municipalities] Removed old assignment (new already exists):', oldProvince, oldMunicipality);
        } else {
          // Update the existing assignment
          await pool.query(
            `UPDATE user_locations
             SET province = $1, municipality = $2, updated_at = NOW(), updated_by = $3
             WHERE user_id = $4 AND province = $5 AND municipality = $6 AND deleted_at IS NULL`,
            [province.trim(), municipality.trim(), currentUser.sub, userId, oldProvince.trim(), oldMunicipality.trim()]
          );
          updated++;
          console.log('[Bulk Update Municipalities] Updated assignment:', oldProvince, oldMunicipality, '->', province, municipality);
        }
      } else {
        // Just verify the municipality exists (for validation purposes)
        const psgcCheck = await pool.query(
          `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
          [province.trim(), municipality.trim()]
        );

        if (psgcCheck.rows.length === 0) {
          throw new NotFoundError(`Municipality not found: ${province}-${municipality}`);
        }

        // Check if assignment exists and update timestamp
        const checkResult = await pool.query(
          'SELECT id FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3 AND deleted_at IS NULL LIMIT 1',
          [userId, province.trim(), municipality.trim()]
        );

        if (checkResult.rows.length > 0) {
          await pool.query(
            'UPDATE user_locations SET updated_at = NOW(), updated_by = $1 WHERE id = $2',
            [currentUser.sub, checkResult.rows[0].id]
          );
          updated++;
          console.log('[Bulk Update Municipalities] Refreshed assignment:', province, municipality);
        }
      }
    }

    console.log('[Bulk Update Municipalities] Final result:', { updated });

    if (updated === 0) {
      return c.json({
        message: 'No municipalities were updated. Check that the assignments exist.',
        updated_count: 0,
      }, 400);
    }

    return c.json({
      message: 'Municipalities updated successfully',
      updated_count: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk update municipalities error:', error);
    throw new Error('Failed to bulk update municipalities');
  }
});

// POST /api/caravans/:id/municipalities/bulk/delete - Bulk delete municipalities assignments (admin, area_manager, assistant_area_manager)
// IMPORTANT: This route must be defined BEFORE the GET /municipalities route
caravans.post('/:id/municipalities/bulk/delete', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const currentUser = c.get('user');
    const caravanId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    console.log('[Bulk Delete Municipalities] Request:', {
      caravanId,
      locations: validated.locations,
      count: validated.locations.length
    });

    // caravanId IS the user_id
    const userId = caravanId;

    // Bulk soft delete - use locations array with province/municipality
    const locationsToDelete = [];
    for (const location of validated.locations) {
      const { province, municipality } = location;
      locationsToDelete.push(`(province = '${province.replace(/'/g, "''")}' AND municipality = '${municipality.replace(/'/g, "''")}')`);
    }
    if (locationsToDelete.length === 0) {
      throw new ValidationError('No valid locations provided');
    }
    const whereClause = locationsToDelete.join(' OR ');
    const result = await pool.query(
      `UPDATE user_locations
       SET deleted_at = NOW()
       WHERE user_id = $1
         AND (${whereClause})
         AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );

    console.log('[Bulk Delete Municipalities] Result:', {
      deleted_count: result.rows.length
    });

    return c.json({
      message: `Bulk unassigned ${result.rows.length} locations`,
      deleted_count: result.rows.length,
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

// DELETE /api/caravans/:id/municipalities/:province/:municipality - Unassign municipality (admin, area_manager, assistant_area_manager)
caravans.delete('/:id/municipalities/:province/:municipality', authMiddleware, requirePermission('locations', 'assign'), async (c) => {
  try {
    const caravanId = c.req.param('id');
    const province = c.req.param('province');
    const municipality = c.req.param('municipality');

    // Check if user_locations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('Municipality assignments feature not available');
    }

    // caravanId IS the user_id
    const userId = caravanId;

    // Note: province and municipality are already extracted from route params above

    // Check if assignment exists (including deleted records for idempotency)
    const existing = await pool.query(
      'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3',
      [userId, province, municipality]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Assignment');
    }

    const record = existing.rows[0];

    // If already deleted, return success (idempotent)
    if (record.deleted_at !== null) {
      return c.json({ message: 'Municipality already unassigned' });
    }

    // Soft delete
    await pool.query(
      'UPDATE user_locations SET deleted_at = NOW() WHERE id = $1',
      [record.id]
    );

    return c.json({ message: 'Municipality unassigned successfully' });
  } catch (error) {
    console.error('Unassign municipality error:', error);
    throw new Error();
  }
});

export default caravans;
