import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';

const itineraries = new Hono();

// Validation schemas
const createItinerarySchema = z.object({
  user_id: z.string().uuid(),
  client_id: z.string().uuid(),
  scheduled_date: z.string(),
  scheduled_time: z.string().optional(),
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).default('pending'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  notes: z.string().optional(),
});

const updateItinerarySchema = createItinerarySchema.partial();

// Helper to map DB row to Itinerary type
function mapRowToItinerary(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    client_id: row.client_id,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    is_recurring: false,
    recurring_pattern: undefined,
    created: row.created_at,
    updated: row.updated_at,
    created_by: row.created_by,
    expand: row.expand,
  };
}

// GET /api/itineraries - List itineraries with filters
itineraries.get('/', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const clientId = c.req.query('client_id');
    const status = c.req.query('status');
    const date = c.req.query('date');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const userId = c.req.query('user_id');
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Role-based filtering - filter by user_id or municipality
    if (user.role === 'field_agent' || user.role === 'caravan') {
      // Filter by user_id (itineraries assigned to this user)
      conditions.push(`i.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    } else if (userId) {
      // Managers can filter by user_id
      conditions.push(`i.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (clientId) {
      conditions.push(`i.client_id = $${paramIndex}`);
      params.push(clientId);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`i.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (date) {
      conditions.push(`i.scheduled_date = $${paramIndex}`);
      params.push(date);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`i.scheduled_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`i.scheduled_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (municipality) {
      conditions.push(`c.municipality_id = $${paramIndex}`);
      params.push(municipality);
      paramIndex++;
    }

    if (province) {
      conditions.push(`c.province = $${paramIndex}`);
      params.push(province);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM itineraries i ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results with expanded relations
    const result = await pool.query(
      `SELECT i.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              c.municipality as client_municipality,
              u.first_name as user_first_name, u.last_name as user_last_name,
              cb.first_name as created_by_first_name, cb.last_name as created_by_last_name
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN users cb ON cb.id = i.created_by
       ${whereClause}
       ORDER BY i.scheduled_date DESC, i.scheduled_time DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(row => ({
      ...mapRowToItinerary(row),
      expand: {
        client_id: {
          id: row.client_id,
          first_name: row.client_first_name,
          last_name: row.client_last_name,
          municipality: row.client_municipality,
        },
        user_id: row.user_id ? {
          id: row.user_id,
          first_name: row.user_first_name,
          last_name: row.user_last_name,
        } : undefined,
        created_by: row.created_by ? {
          id: row.created_by,
          name: `${row.created_by_first_name} ${row.created_by_last_name}`,
        } : undefined,
      },
    }));

    return c.json({
      items,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch itineraries error:', error);
    throw new Error();
  }
});

// GET /api/itineraries/:id - Get single itinerary
itineraries.get('/:id', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT i.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              c.municipality as client_municipality,
              u.first_name as user_first_name, u.last_name as user_last_name,
              cb.first_name as created_by_first_name, cb.last_name as created_by_last_name
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN users cb ON cb.id = i.created_by
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = result.rows[0];

    // Role-based access check - field agents can only access their own itineraries
    if (user.role === 'field_agent' || user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only access your own itineraries');
      }
    }

    return c.json({
      ...mapRowToItinerary(itinerary),
      expand: {
        user_id: itinerary.user_id ? {
          id: itinerary.user_id,
          name: `${itinerary.user_first_name} ${itinerary.user_last_name}`,
        } : undefined,
        client_id: {
          id: itinerary.client_id,
          first_name: itinerary.client_first_name,
          last_name: itinerary.client_last_name,
          municipality: itinerary.client_municipality,
        },
        created_by: itinerary.created_by ? {
          id: itinerary.created_by,
          name: `${itinerary.created_by_first_name} ${itinerary.created_by_last_name}`,
        } : undefined,
      },
    });
  } catch (error) {
    console.error('Fetch itinerary error:', error);
    throw new Error();
  }
});

// POST /api/itineraries - Create new itinerary
itineraries.post('/', authMiddleware, requirePermission('itineraries', 'create'), auditMiddleware('itinerary'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createItinerarySchema.parse(body);

    // Validate that scheduled_date is not in the past
    const scheduledDate = new Date(validated.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (scheduledDate < today) {
      throw new ValidationError('Scheduled date cannot be in the past');
    }

    // Validate that client exists, check loan_released status, and user has access to client's municipality
    // RULE: loan_released clients cannot be added to itinerary (they're "done")
    const clientCheck = await pool.query(
      `SELECT id, municipality, loan_released::int as loan_released_bool FROM clients WHERE id = $1 AND deleted_at IS NULL`,
      [validated.client_id]
    );
    if (clientCheck.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    const client = clientCheck.rows[0];
    if (client.loan_released || client.loan_released_bool) {
      return c.json({
        success: false,
        message: 'Cannot add client to itinerary: Loan has already been released'
      }, 400);
    }

    // Check if itinerary already exists for this client, user, and date
    const existingCheck = await pool.query(
      `SELECT id FROM itineraries
       WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3`,
      [validated.client_id, validated.user_id, validated.scheduled_date]
    );
    if (existingCheck.rows.length > 0) {
      return c.json({
        message: 'Client already has an itinerary for this date',
        existing_itinerary_id: existingCheck.rows[0].id
      }, 400);
    }

    // For field agents and caravans, they can create itineraries for any client
    // (The itinerary is assigned to them via user_id, not filtered by client municipality)

    const result = await pool.query(
      `INSERT INTO itineraries (
        id, user_id, client_id, scheduled_date, scheduled_time, status, priority, notes, created_by
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [
        validated.user_id, validated.client_id, validated.scheduled_date,
        validated.scheduled_time, validated.status, validated.priority,
        validated.notes, user.sub
      ]
    );

    return c.json(mapRowToItinerary(result.rows[0]), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create itinerary error:', error);
    throw new Error('Failed to create itinerary');
  }
});

// PUT /api/itineraries/:id - Update itinerary
itineraries.put('/:id', authMiddleware, requirePermission('itineraries', 'update'), auditMiddleware('itinerary'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateItinerarySchema.parse(body);

    // Check if itinerary exists
    const existing = await pool.query(
      `SELECT i.*, c.municipality as client_municipality
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = existing.rows[0];

    // For field agents and caravans, verify they own this itinerary
    if (user.role === 'field_agent' || user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only modify your own itineraries');
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      user_id: 'user_id',
      client_id: 'client_id',
      scheduled_date: 'scheduled_date',
      scheduled_time: 'scheduled_time',
      status: 'status',
      priority: 'priority',
      notes: 'notes',
    };

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in validated) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push((validated as any)[key]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE itineraries SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    return c.json(mapRowToItinerary(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update itinerary error:', error);
    throw new Error('Failed to update itinerary');
  }
});

// DELETE /api/itineraries/:id - Delete itinerary
itineraries.delete('/:id', authMiddleware, requirePermission('itineraries', 'delete'), auditMiddleware('itinerary'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Check if itinerary exists and get client municipality
    const existing = await pool.query(
      `SELECT i.*, c.municipality as client_municipality
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = existing.rows[0];

    // For field agents and caravans, verify they own this itinerary
    if (user.role === 'field_agent' || user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only modify your own itineraries');
      }
    }

    await pool.query('DELETE FROM itineraries WHERE id = $1', [id]);
    return c.json({ message: 'Itinerary deleted successfully' });
  } catch (error) {
    console.error('Delete itinerary error:', error);
    throw new Error();
  }
});

// Bulk delete validation schema
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

// POST /api/itineraries/bulk-delete - Bulk delete itineraries (now queued)
itineraries.post('/bulk-delete', authMiddleware, requirePermission('itineraries', 'delete'), auditMiddleware('itinerary', 'bulk_delete'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) throw new AuthorizationError('Unauthorized');

    const { ids } = bulkDeleteSchema.parse(await c.req.json());

    // Create bulk delete job
    const job = await addBulkJob(
      BulkJobType.BULK_DELETE_ITINERARIES,
      user.sub,
      ids
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk delete job started for ${ids.length} itineraries`,
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
    console.error('Bulk delete itineraries error:', error);
    throw new Error('Failed to create bulk delete job');
  }
});

export default itineraries;
