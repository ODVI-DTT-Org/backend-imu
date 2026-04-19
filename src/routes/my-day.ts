import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { pool } from '../db/index.js';
import { storageService } from '../services/storage.js';
import {
  ValidationError,
  NotFoundError,
  AppError,
  ConflictError,
} from '../errors/index.js';

const myDay = new Hono();

// Constants for file size limits (in bytes)
const MAX_PHOTO_SIZE = parseInt(process.env.MAX_PHOTO_SIZE || '10485760'); // 10MB default
const MAX_AUDIO_SIZE = parseInt(process.env.MAX_AUDIO_SIZE || '26214400'); // 25MB default
const MAX_REQUEST_SIZE = parseInt(process.env.MAX_REQUEST_SIZE || '52428800'); // 50MB default

// Valid touchpoint statuses
const VALID_STATUSES = ['Interested', 'Undecided', 'Not Interested', 'Completed', 'Follow-up Needed'];

// Validation schemas
const visitFormSchema = z.object({
  client_id: z.string().uuid(),
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  reason: z.string(),
  status: z.enum(['Interested', 'Undecided', 'Not Interested', 'Completed', 'Follow-up Needed']).optional(),
  address: z.string().optional(),
  time_arrival: z.string().optional(),
  time_departure: z.string().optional(),
  odometer_arrival: z.string().optional(),
  odometer_departure: z.string().optional(),
  next_visit_date: z.string().optional(),
  notes: z.string().optional(),
  photo_url: z.string().optional(),
  audio_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const timeInSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const timeOutSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
});

const addToMyDaySchema = z.object({
  client_id: z.string().uuid(),
  scheduled_time: z.string().optional(),
  scheduled_date: z.string().optional(), // Optional: for adding to future dates (YYYY-MM-DD format)
  priority: z.number().int().min(0).max(10).optional(),
  notes: z.string().optional(),
});

// Helper function to get local date string (not UTC)
function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// POST /api/my-day/add-client - Add client to today's itinerary
myDay.post('/add-client', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = addToMyDaySchema.parse(body);

    // Verify client exists and check if loan is released
    // RULE: loan_released clients cannot be added to itinerary/My Day (they're "done")
    const clientCheck = await pool.query(
      'SELECT *, loan_released::int as loan_released_bool FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [validated.client_id]
    );

    if (clientCheck.rows.length === 0) {
      return c.json({ message: 'Client not found' }, 404);
    }

    const client = clientCheck.rows[0];
    if (client.loan_released || client.loan_released_bool) {
      return c.json({
        success: false,
        message: 'Cannot add client to itinerary: Loan has already been released'
      }, 400);
    }

    // Check if already in today's itinerary using CURRENT_DATE (respects database timezone Asia/Manila)
    const existing = await pool.query(
      `SELECT * FROM itineraries
       WHERE client_id = $1 AND user_id = $2 AND scheduled_date = CURRENT_DATE`,
      [validated.client_id, user.sub]
    );

    if (existing.rows.length > 0) {
      return c.json({ message: 'Client already in today\'s itinerary' }, 400);
    }

    // Use provided scheduled_date or CURRENT_DATE for today
    // Note: CURRENT_DATE now respects database timezone (Asia/Manila) due to connection string setting

    // Debug logging
    console.log('[Add to My Day] Received scheduled_date:', validated.scheduled_date);
    console.log('[Add to My Day] Client ID:', validated.client_id);

    // Check for existing itinerary on the target date if custom date is provided
    if (validated.scheduled_date) {
      const customDateCheck = await pool.query(
        `SELECT * FROM itineraries
         WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3::date`,
        [validated.client_id, user.sub, validated.scheduled_date]
      );

      if (customDateCheck.rows.length > 0) {
        return c.json({ message: 'Client already in this date\'s itinerary' }, 400);
      }
    }

    // For INSERT: use $7 for scheduled_date to avoid collision with other parameters
    const targetDate = validated.scheduled_date
      ? `$7::date`  // Cast parameter to date type (timezone-independent)
      : 'CURRENT_DATE';

    // Add to itinerary using target date (either custom date or CURRENT_DATE for today)
    // When scheduled_date is provided, it's passed as $7 parameter to avoid collision with other parameters
    const insertParams = [
      validated.client_id,
      user.sub,
      validated.scheduled_time || null,
      validated.priority || 5,
      validated.notes || null,
      user.sub,
    ];

    // Add scheduled_date as 7th parameter only if provided
    if (validated.scheduled_date) {
      insertParams.push(validated.scheduled_date);
    }

    const result = await pool.query(
      `INSERT INTO itineraries (id, client_id, user_id, scheduled_date, scheduled_time, priority, notes, status, created_by)
       VALUES (gen_random_uuid(), $1, $2, ${targetDate}, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      insertParams
    );

    console.log('[Add to My Day] Inserted scheduled_date:', result.rows[0].scheduled_date);
    console.log('[Add to My Day] targetDate expression:', targetDate);
    console.log('[Add to My Day] insertParams:', insertParams);

    return c.json({
      message: 'Client added to My Day',
      itinerary: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid input', errors: error.errors }, 400);
    }
    console.error('Add to my day error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// DELETE /api/my-day/remove-client/:id - Remove client from today's itinerary
myDay.delete('/remove-client/:id', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const validated = addToMyDaySchema.parse(body);

    // Use provided scheduled_date or CURRENT_DATE for today
    // Note: CURRENT_DATE respects database timezone (Asia/Manila) due to connection string setting
    // But mobile should always send scheduled_date to avoid timezone issues
    const targetDate = validated.scheduled_date
      ? `CAST($3 AS DATE)`
      : 'CURRENT_DATE';

    const insertParams = [clientId, user.sub];
    if (validated.scheduled_date) {
      insertParams.push(validated.scheduled_date);
    }

    console.log('[Remove from My Day] Client ID:', clientId);
    console.log('[Remove from My Day] Received scheduled_date:', validated.scheduled_date);
    console.log('[Remove from My Day] targetDate expression:', targetDate);

    const result = await pool.query(
      `DELETE FROM itineraries
       WHERE client_id = $1 AND user_id = $2 AND scheduled_date = ${targetDate}
       RETURNING *`,
      insertParams
    );

    if (result.rows.length === 0) {
      console.log('[Remove from My Day] No itinerary found for deletion');
      return c.json({ message: 'Client not found in today\'s itinerary' }, 404);
    }

    console.log('[Remove from My Day] Deleted itinerary:', result.rows[0]);
    return c.json({
      message: 'Client removed from My Day',
    });
  } catch (error) {
    console.error('Remove from my day error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Bulk delete validation schema
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

// POST /api/my-day/bulk-delete - Bulk delete from My Day
myDay.post('/bulk-delete', authMiddleware, requirePermission('itineraries', 'delete'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) throw new Error('Unauthorized');

    const { ids } = bulkDeleteSchema.parse(await c.req.json());

    const result = await pool.query(
      'DELETE FROM itineraries WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id',
      [ids, user.sub]
    );
    const deleted = result.rows.map((r: any) => r.id);

    return c.json({
      success: deleted,
      failed: [],
      message: `${deleted.length} item(s) removed from My Day`,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        message: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        errors: error.errors,
      }, 400);
    }
    console.error('Bulk delete my day error:', error);
    return c.json({
      success: false,
      message: 'Failed to bulk delete from My Day',
    }, 500);
  }
});

// GET /api/my-day/status/:clientId - Check if client is in today's itinerary
myDay.get('/status/:clientId', authMiddleware, requirePermission('clients', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('clientId');

    const result = await pool.query(
      'SELECT * FROM itineraries WHERE client_id = $1 AND user_id = $2 AND scheduled_date = CURRENT_DATE',
      [clientId, user.sub]
    );

    return c.json({
      in_my_day: result.rows.length > 0,
      itinerary: result.rows.length > 0 ? result.rows[0] : null,
    });
  } catch (error) {
    console.error('Get my day status error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// GET /api/my-day/tasks - Get today's tasks for field agent
myDay.get('/tasks', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    // Accept optional date parameter, default to today
    const requestedDate = c.req.query('date');
    const targetDate = requestedDate || getLocalDateString();

    // Allow admin/staff to specify user_id, caravan users use their own id
    let caravanId = c.req.query('user_id');
    if (user.role === 'caravan' || !caravanId) {
      caravanId = user.sub;
    }

    // Enhanced debug logging
    const todayDate = getLocalDateString();
    console.log('[My Day Tasks] Fetching tasks:', {
      userId: caravanId,
      targetDate,
      todayDate,
      userRole: user.role,
      requestedDate,
      datesMatch: targetDate === todayDate,
    });

    // Log returned client IDs for debugging
    console.log('[My Day Tasks] Query parameters:', {
      userId: caravanId,
      scheduledDate: targetDate,
    });

    // Get itineraries for the target date with client info
    const itinerariesResult = await pool.query(
      `SELECT i.*, c.first_name, c.last_name, c.email, c.phone, c.client_type,
              a.name as agency_name,
              u.name as assigned_by_name
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
       LEFT JOIN agencies a ON a.id = c.agency_id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.user_id = $1 AND i.scheduled_date = $2
       ORDER BY i.scheduled_time ASC NULLS LAST, i.priority DESC`,
      [caravanId, targetDate]
    );

    // Log returned clients for debugging
    console.log('[My Day Tasks] Query result:', {
      rowCount: itinerariesResult.rows.length,
      clientIds: itinerariesResult.rows.map((r: any) => ({ id: r.client_id, name: `${r.first_name} ${r.last_name}`, scheduledDate: r.scheduled_date })),
    });

    // Fetch addresses for all clients in batch with PSGC join
    const clientIds = itinerariesResult.rows.map((row: any) => row.client_id);
    const addressesResult = clientIds.length > 0 ? await pool.query(
      `SELECT a.client_id, a.id, a.street_address, a.postal_code, a.is_primary,
              p.region, p.province, p.mun_city as municipality, p.barangay
       FROM addresses a
       LEFT JOIN psgc p ON a.psgc_id = p.id
       WHERE a.client_id = ANY($1) AND a.deleted_at IS NULL
       ORDER BY a.client_id, a.is_primary DESC, a.created_at DESC`,
      [clientIds]
    ) : { rows: [] };

    // Group addresses by client_id
    const addressesByClient = new Map<string, any[]>();
    for (const addr of addressesResult.rows) {
      if (!addressesByClient.has(addr.client_id)) {
        addressesByClient.set(addr.client_id, []);
      }
      addressesByClient.get(addr.client_id)!.push({
        id: addr.id,
        street_address: addr.street_address,
        postal_code: addr.postal_code,
        region: addr.region,
        province: addr.province,
        municipality: addr.municipality,
        barangay: addr.barangay,
        is_primary: addr.is_primary,
      });
    }

    // Fetch latest touchpoint for each client
    const touchpointsResult = clientIds.length > 0 ? await pool.query(
      `SELECT DISTINCT ON (t.client_id) t.client_id, t.touchpoint_number, t.type, t.visit_id, t.call_id, t.created_at
       FROM touchpoints t
       WHERE t.client_id = ANY($1)
       ORDER BY t.client_id, t.created_at DESC`,
      [clientIds]
    ) : { rows: [] };

    // Create a map of client_id -> latest touchpoint
    const latestTouchpoints = new Map<string, { touchpoint_number: number; type: string; created_at: string }>();
    for (const tp of touchpointsResult.rows) {
      latestTouchpoints.set(tp.client_id, {
        touchpoint_number: tp.touchpoint_number,
        type: tp.type,
        created_at: tp.created_at,
      });
    }

    // Build tasks with all required data
    const tasks = itinerariesResult.rows.map(row => {
      const latestTp = latestTouchpoints.get(row.client_id);
      const addresses = addressesByClient.get(row.client_id) || [];
      const primaryAddress = addresses.length > 0 ? addresses[0] : null;

      // Calculate next touchpoint number
      const lastTpNumber = latestTp?.touchpoint_number || 0;
      const nextTpNumber = lastTpNumber < 7 ? lastTpNumber + 1 : lastTpNumber;

      // Determine next touchpoint type based on sequence
      // Pattern: 1st: Visit, 2nd: Call, 3rd: Call, 4th: Visit, 5th: Call, 6th: Call, 7th: Visit
      const getNextTouchpointType = (num: number): 'Visit' | 'Call' => {
        switch (num) {
          case 1: case 4: case 7: return 'Visit';
          case 2: case 3: case 5: case 6: return 'Call';
          default: return 'Visit';
        }
      };

      return {
        id: row.id,
        client_id: row.client_id,
        scheduled_date: row.scheduled_date,
        scheduled_time: row.scheduled_time,
        status: row.status,
        priority: row.priority,
        notes: row.notes,
        touchpoint_number: nextTpNumber,
        touchpoint_type: getNextTouchpointType(nextTpNumber),
        time_in: latestTp?.created_at || null,
        client: {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          client_type: row.client_type,
          agency: row.agency_name,
          addresses: addresses,
        },
        assigned_by_name: row.assigned_by_name || null,
        location: primaryAddress?.street_address || null,
      };
    });

    // Get completed touchpoints for the target date
    const completedTouchpointsResult = await pool.query(
      `SELECT t.id, t.client_id, t.touchpoint_number, t.type, t.rejection_reason, t.visit_id, t.call_id,
              t.created_at, t.updated_at, c.first_name, c.last_name, c.client_type
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       WHERE t.user_id = $1 AND t.created_at::date = $2
       ORDER BY t.created_at DESC`,
      [user.sub, targetDate]
    );

    const completedTouchpoints = completedTouchpointsResult.rows.map(row => ({
      id: row.id,
      client_id: row.client_id,
      touchpoint_number: row.touchpoint_number,
      type: row.type,
      rejection_reason: row.rejection_reason,
      visit_id: row.visit_id,
      call_id: row.call_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      client: {
        first_name: row.first_name,
        last_name: row.last_name,
        client_type: row.client_type,
      },
    }));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

    return c.json({
      date: targetDate,
      summary: {
        total: totalTasks,
        completed: completedTasks,
        pending: pendingTasks,
        in_progress: inProgressTasks,
        completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      tasks,
      completed_touchpoints: completedTouchpoints,
    });
  } catch (error) {
    console.error('Get my-day tasks error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/tasks/:id/start - Start a task
myDay.post('/tasks/:id/start', authMiddleware, requirePermission('touchpoints', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const existing = await pool.query(
      'SELECT * FROM itineraries WHERE id = $1 AND user_id = $2',
      [taskId, user.sub]
    );

    if (existing.rows.length === 0) {
      return c.json({ message: 'Task not found' }, 404);
    }

    if (existing.rows[0].status !== 'pending') {
      return c.json({ message: 'Task is not in pending status' }, 400);
    }

    const result = await pool.query(
      `UPDATE itineraries SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [taskId]
    );

    return c.json({
      message: 'Task started',
      task: { id: result.rows[0].id, status: result.rows[0].status },
    });
  } catch (error) {
    console.error('Start task error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/tasks/:id/complete - Complete a task
myDay.post('/tasks/:id/complete', authMiddleware, requirePermission('touchpoints', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const existing = await pool.query(
      'SELECT * FROM itineraries WHERE id = $1 AND user_id = $2',
      [taskId, user.sub]
    );

    if (existing.rows.length === 0) {
      return c.json({ message: 'Task not found' }, 404);
    }

    const result = await pool.query(
      `UPDATE itineraries SET status = 'completed', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [taskId]
    );

    return c.json({
      message: 'Task completed',
      task: { id: result.rows[0].id, status: result.rows[0].status },
    });
  } catch (error) {
    console.error('Complete task error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/clients/:id/time-in - Record time-in for client visit
myDay.post('/clients/:id/time-in', authMiddleware, requirePermission('touchpoints', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = timeInSchema.parse(body);

    // Verify client belongs to this caravan (not soft-deleted)
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [clientId, user.sub]
    );

    if (clientCheck.rows.length === 0) {
      return c.json({ message: 'Client not found or not assigned to you' }, 404);
    }

    const now = new Date();
    const timeIn = now.toTimeString().slice(0, 8);

    // Check for existing touchpoint today using CURRENT_DATE (respects database timezone Asia/Manila)
    const existing = await pool.query(
      `SELECT * FROM touchpoints
       WHERE client_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE`,
      [clientId, user.sub]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing touchpoint with time-in
      result = await pool.query(
        `UPDATE touchpoints SET updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [timeIn, validated.latitude, validated.longitude, existing.rows[0].id]
      );
    } else {
      // Create new touchpoint with time-in using CURRENT_DATE
      const tpResult = await pool.query(
        'SELECT COUNT(*) + 1 as next FROM touchpoints WHERE client_id = $1',
        [clientId]
      );
      const nextNumber = Math.min(parseInt(tpResult.rows[0].next) || 1, 7);

      result = await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, visit_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Visit', gen_random_uuid(), NOW()) RETURNING *`,
        [clientId, user.sub, nextNumber]
      );
    }

    return c.json({
      message: 'Time-in recorded',
      time_in: timeIn,
      touchpoint: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid input', errors: error.errors }, 400);
    }
    console.error('Time-in error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/clients/:id/time-out - Record time-out for client visit
myDay.post('/clients/:id/time-out', authMiddleware, requirePermission('touchpoints', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = timeOutSchema.parse(body);

    // Verify client exists (not soft-deleted, no ownership check - any caravan can visit any client)
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [clientId]
    );

    if (clientCheck.rows.length === 0) {
      return c.json({ message: 'Client not found' }, 404);
    }

    const now = new Date();
    const timeOut = now.toTimeString().slice(0, 8);

    // Check for existing touchpoint today using CURRENT_DATE (respects database timezone Asia/Manila)
    const existing = await pool.query(
      `SELECT * FROM touchpoints
       WHERE client_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE`,
      [clientId, user.sub]
    );

    if (existing.rows.length === 0) {
      return c.json({ message: 'No touchpoint found for today. Please record time-in first.' }, 404);
    }

    // Update existing touchpoint with time-out
    const result = await pool.query(
      `UPDATE touchpoints
       SET updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [timeOut, validated.latitude, validated.longitude, validated.address, existing.rows[0].id]
    );

    return c.json({
      message: 'Time-out recorded',
      time_out: timeOut,
      touchpoint: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid input', errors: error.errors }, 400);
    }
    console.error('Time-out error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/clients/:id/visit - Record visit only (no touchpoint)
myDay.post('/clients/:id/visit', authMiddleware, requirePermission('touchpoints', 'create'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');

    const visitSchema = z.object({
      time_in: z.string().datetime().optional(),
      time_out: z.string().datetime().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional(),
      photo_url: z.string().min(1, 'Photo is required'),
      notes: z.string().optional(),
    });

    const validated = visitSchema.parse(await c.req.json());

    // Verify client exists
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [clientId]
    );

    if (clientCheck.rows.length === 0) {
      return c.json({ message: 'Client not found' }, 404);
    }

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // CREATE visits record (type='regular_visit')
      const visitResult = await dbClient.query(`
        INSERT INTO visits (
          id, client_id, user_id, type, time_in, time_out,
          latitude, longitude, address, photo_url, notes
        ) VALUES (
          gen_random_uuid(), $1, $2, 'regular_visit', $3, $4, $5, $6, $7, $8, $9
        ) RETURNING id
      `, [clientId, user.sub, validated.time_in, validated.time_out,
          validated.latitude, validated.longitude, validated.address,
          validated.photo_url, validated.notes]);

      // UPDATE itineraries (with error handling)
      const itineraryResult = await dbClient.query(`
        UPDATE itineraries
        SET status = 'completed', updated_at = NOW()
        WHERE client_id = $1
          AND scheduled_date = CURRENT_DATE
          AND user_id = $2
        RETURNING *
      `, [clientId, user.sub]);

      // Log warning if no itinerary was updated (not critical, visit is still recorded)
      if (itineraryResult.rows.length === 0) {
        console.warn(`No itinerary found for client ${clientId}, user ${user.sub}`);
        // Visit is still created successfully, just no itinerary to update
      }

      await dbClient.query('COMMIT');

      return c.json({
        message: 'Visit recorded successfully',
        visit_id: visitResult.rows[0].id
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid input', errors: error.errors }, 400);
    }
    console.error('Visit record error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Rate limiting for touchpoint submission (10 requests per 15 minutes per user)
const touchpointRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many touchpoint submissions. Please try again later.',
});

// Helper function to calculate SHA-256 hash for file deduplication
function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Helper function to delete file with retry mechanism
async function deleteFileWithRetry(key: string, maxRetries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await storageService.delete(key);
      if (result.success) {
        console.log(`[File Cleanup] Successfully deleted file: ${key} (attempt ${attempt})`);
        return true;
      }
    } catch (error) {
      console.warn(`[File Cleanup] Attempt ${attempt} failed for ${key}:`, error);
      if (attempt === maxRetries) {
        console.error(`[File Cleanup] Failed to delete file after ${maxRetries} attempts: ${key}`);
        // TODO: Add to dead letter queue for later cleanup
        return false;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
    }
  }
  return false;
}

// POST /api/my-day/visits - Submit complete visit form with file uploads (multipart/form-data)
myDay.post('/visits', authMiddleware, touchpointRateLimit, requirePermission('touchpoints', 'create'), async (c) => {
  let uploadedPhotoUrl: string | undefined;
  let uploadedPhotoKey: string | undefined;
  let uploadedAudioUrl: string | undefined;
  let uploadedAudioKey: string | undefined;
  let uploadedPhotoHash: string | undefined;
  let uploadedAudioHash: string | undefined;

  // Generate request ID for tracing
  const requestId = uuidv4();
  c.header('X-Request-Id', requestId);

  try {
    const user = c.get('user');

    // Check content type and parse accordingly
    let body: Record<string, string | File>;
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Try to use pre-parsed data from middleware
      const parsedData = c.get('parsedFormData' as any) as Record<string, string | File>;

      if (parsedData) {
        body = parsedData;
      } else {
        // Fallback: Try Hono's parseBody() for FormData
        try {
          body = await c.req.parseBody();
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
          console.error('[Submit Visit] FormData parse error:', errorMessage);
          throw new Error('Failed to parse FormData request. Please try sending as JSON with base64 encoded photo.');
        }
      }
    } else {
      // Regular JSON parsing
      body = await c.req.json();
    }

    // Extract form fields
    const clientId = body['client_id'] as string;
    const touchpointNumberStr = body['touchpoint_number'] as string;
    const type = body['type'] as 'Visit' | 'Call';
    const reason = body['reason'] as string;
    const status = body['status'] as string | undefined; // ✅ FIXED: Extract status field
    const address = body['address'] as string | undefined;
    const timeArrival = body['time_arrival'] as string | undefined;
    const timeDeparture = body['time_departure'] as string | undefined;
    const odometerArrival = body['odometer_arrival'] as string | undefined;
    const odometerDeparture = body['odometer_departure'] as string | undefined;
    const nextVisitDate = body['next_visit_date'] as string | undefined;
    const notes = body['notes'] as string | undefined;
    const latitudeStr = body['latitude'] as string | undefined;
    const longitudeStr = body['longitude'] as string | undefined;

    // Extract files
    const photoFile = body['photo'] as File | undefined;
    const audioFile = body['audio'] as File | undefined;

    // Extract base64 encoded photo (alternative to FormData file upload)
    const photoBase64 = body['photo_base64'] as string | undefined;
    const photoFilename = body['photo_filename'] as string | undefined;

    // Validate required fields
    if (!clientId || !touchpointNumberStr || !type || !reason) {
      throw new ValidationError('Missing required fields: client_id, touchpoint_number, type, reason')
        .addDetail('requestId', requestId);
    }

    const touchpointNumber = parseInt(touchpointNumberStr);
    if (isNaN(touchpointNumber) || touchpointNumber < 1 || touchpointNumber > 7) {
      throw new ValidationError('Invalid touchpoint_number. Must be between 1 and 7')
        .addDetail('providedValue', touchpointNumberStr)
        .addDetail('requestId', requestId);
    }

    // Validate type enum
    if (type !== 'Visit' && type !== 'Call') {
      throw new ValidationError('Invalid type. Must be "Visit" or "Call"')
        .addDetail('providedValue', type)
        .addDetail('requestId', requestId);
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
        .addDetail('providedValue', status)
        .addDetail('requestId', requestId);
    }

    // Validate UUID
    try {
      if (!clientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new ValidationError('Invalid client_id format');
      }
    } catch {
      throw new ValidationError('Invalid client_id format')
        .addDetail('providedValue', clientId)
        .addDetail('requestId', requestId);
    }

    // Parse optional numeric fields
    const latitude = latitudeStr ? parseFloat(latitudeStr) : undefined;
    const longitude = longitudeStr ? parseFloat(longitudeStr) : undefined;

    // Handle base64 encoded photo (alternative to FormData file upload)
    if (photoBase64 && photoFilename) {
      try {
        console.log('[Submit Visit] Processing base64 encoded photo...');

        // Decode base64 to buffer
        const photoBuffer = Buffer.from(photoBase64, 'base64');
        uploadedPhotoHash = calculateFileHash(photoBuffer);

        // Check for duplicate file (same content already uploaded)
        const duplicateCheck = await pool.query(
          'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
          [uploadedPhotoHash, 'touchpoint']
        );

        if (duplicateCheck.rows.length > 0) {
          // Use existing file instead of uploading again
          uploadedPhotoUrl = duplicateCheck.rows[0].url;
          uploadedPhotoKey = duplicateCheck.rows[0].storage_key;
          console.log(`[File Deduplication] Reusing existing base64 photo: ${uploadedPhotoUrl}`);
        } else {
          // Upload new file
          const photoResult = await storageService.upload({
            file: photoBuffer,
            filename: photoFilename,
            mimetype: 'image/png', // Default to PNG for base64 uploads
            folder: 'touchpoint_photo',
            maxSize: MAX_PHOTO_SIZE,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          });

          if (!photoResult.success || !photoResult.url) {
            throw new AppError('PHOTO_UPLOAD_FAILED', `Photo upload failed: ${photoResult.error || 'Unknown error'}`, 400)
              .addDetail('requestId', requestId)
              .addDetail('filename', photoFilename);
          }

          uploadedPhotoUrl = photoResult.url;
          uploadedPhotoKey = photoResult.key;
          console.log(`[Submit Visit] Base64 photo uploaded successfully: ${uploadedPhotoUrl}`);
        }
      } catch (error: any) {
        console.error('[Submit Visit] Base64 photo processing error:', error);
        throw new AppError('PHOTO_PROCESSING_FAILED', `Failed to process base64 photo: ${error.message}`, 400)
          .addDetail('requestId', requestId);
      }
    }

    // Handle photo upload with deduplication
    if (photoFile && photoFile instanceof File) {
      const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
      uploadedPhotoHash = calculateFileHash(photoBuffer);

      // Check for duplicate file (same content already uploaded)
      const duplicateCheck = await pool.query(
        'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
        [uploadedPhotoHash, 'touchpoint']
      );

      if (duplicateCheck.rows.length > 0) {
        // Use existing file instead of uploading again
        uploadedPhotoUrl = duplicateCheck.rows[0].url;
        uploadedPhotoKey = duplicateCheck.rows[0].storage_key;
        console.log(`[File Deduplication] Reusing existing photo: ${uploadedPhotoUrl}`);
      } else {
        // Upload new file
        const photoResult = await storageService.upload({
          file: photoBuffer,
          filename: photoFile.name,
          mimetype: photoFile.type,
          folder: 'touchpoint_photo',
          maxSize: MAX_PHOTO_SIZE, // ✅ FIXED: Use constant
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        });

        if (!photoResult.success || !photoResult.url) {
          throw new AppError('PHOTO_UPLOAD_FAILED', `Photo upload failed: ${photoResult.error || 'Unknown error'}`, 400)
            .addDetail('requestId', requestId)
            .addDetail('filename', photoFile.name);
        }

        uploadedPhotoUrl = photoResult.url;
        uploadedPhotoKey = photoResult.key;
      }
    }

    // Handle audio upload with deduplication
    if (audioFile && audioFile instanceof File) {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      uploadedAudioHash = calculateFileHash(audioBuffer);

      // Check for duplicate file
      const duplicateCheck = await pool.query(
        'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
        [uploadedAudioHash, 'touchpoint']
      );

      if (duplicateCheck.rows.length > 0) {
        // Use existing file
        uploadedAudioUrl = duplicateCheck.rows[0].url;
        uploadedAudioKey = duplicateCheck.rows[0].storage_key;
        console.log(`[File Deduplication] Reusing existing audio: ${uploadedAudioUrl}`);
      } else {
        // Upload new file
        const audioResult = await storageService.upload({
          file: audioBuffer,
          filename: audioFile.name,
          mimetype: audioFile.type,
          folder: 'touchpoint_audio',
          maxSize: MAX_AUDIO_SIZE, // ✅ FIXED: Use constant
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/webm'],
        });

        if (!audioResult.success || !audioResult.url) {
          throw new AppError('AUDIO_UPLOAD_FAILED', `Audio upload failed: ${audioResult.error || 'Unknown error'}`, 400)
            .addDetail('requestId', requestId)
            .addDetail('filename', audioFile.name);
        }

        uploadedAudioUrl = audioResult.url;
        uploadedAudioKey = audioResult.key;
      }
    }

    // ✅ FIXED: Wrap in database transaction for atomicity
    await pool.query('BEGIN');

    try {
      // Verify client exists (not soft-deleted)
      const clientCheck = await pool.query(
        'SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL',
        [clientId]
      );

      if (clientCheck.rows.length === 0) {
        throw new NotFoundError('Client')
          .addDetail('clientId', clientId)
          .addDetail('requestId', requestId);
      }

      // Check for existing touchpoint today using CURRENT_DATE (respects database timezone Asia/Manila)
      const existing = await pool.query(
        `SELECT * FROM touchpoints
         WHERE client_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE`,
        [clientId, user.sub]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing touchpoint
        result = await pool.query(
          `UPDATE touchpoints SET
            touchpoint_number = $1, type = $2, rejection_reason = $3,
            visit_id = $4, call_id = $5, updated_at = NOW()
          WHERE id = $6 RETURNING *`,
          [
            touchpointNumber, type, reason,
            existing.rows[0].visit_id, // Keep existing visit_id
            existing.rows[0].call_id,  // Keep existing call_id
            existing.rows[0].id
          ]
        );
      } else {
        // Auto-create visit record for all new touchpoints
        console.log('[Submit Visit] Auto-creating visit record for touchpoint');

        // Create a visit record from the touchpoint data
        const visitResult = await pool.query(
          `INSERT INTO visits (
            client_id, user_id, type, reason, status, notes,
            address, latitude, longitude, photo_url, time_in, time_out
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          ) RETURNING *`,
          [
            clientId, user.sub, 'regular_visit',
            reason, status || 'Interested', notes,
            address, latitude, longitude,
            uploadedPhotoUrl || '', // Use uploaded photo URL or empty string
            timeArrival || null, timeDeparture || null
          ]
        );

        const visitId = visitResult.rows[0].id;
        console.log('[Submit Visit] Auto-created visit record:', visitId);

        // Create new touchpoint using CURRENT_DATE
        result = await pool.query(
          `INSERT INTO touchpoints (
            id, client_id, user_id, touchpoint_number, type, rejection_reason, visit_id, call_id, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()
          ) RETURNING *`,
          [
            clientId, user.sub, touchpointNumber, type,
            reason, visitId, null
          ]
        );
      }

      const touchpoint = result.rows[0];

      // Store file metadata in database (only for newly uploaded files, not duplicates)
      if (uploadedPhotoUrl && uploadedPhotoKey && photoFile) {
        // Check if this is a new upload (not a duplicate)
        const existingFile = await pool.query(
          'SELECT id FROM files WHERE storage_key = $1',
          [uploadedPhotoKey]
        );

        if (existingFile.rows.length === 0) {
          await pool.query(
            `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, hash, uploaded_by, entity_type, entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              uploadedPhotoKey.split('/').pop(),
              photoFile.name,
              photoFile.type,
              photoFile.size,
              uploadedPhotoUrl,
              uploadedPhotoKey,
              uploadedPhotoHash,
              user.sub,
              'touchpoint',
              touchpoint.id,
            ]
          );
        }
      }

      if (uploadedAudioUrl && uploadedAudioKey && audioFile) {
        // Check if this is a new upload
        const existingFile = await pool.query(
          'SELECT id FROM files WHERE storage_key = $1',
          [uploadedAudioKey]
        );

        if (existingFile.rows.length === 0) {
          await pool.query(
            `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, hash, uploaded_by, entity_type, entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              uploadedAudioKey.split('/').pop(),
              audioFile.name,
              audioFile.type,
              audioFile.size,
              uploadedAudioUrl,
              uploadedAudioKey,
              uploadedAudioHash,
              user.sub,
              'touchpoint',
              touchpoint.id,
            ]
          );
        }
      }

      // Mark related itinerary as completed using CURRENT_DATE
      await pool.query(
        `UPDATE itineraries SET status = 'completed', updated_at = NOW()
         WHERE client_id = $1 AND user_id = $2 AND scheduled_date = CURRENT_DATE AND status != 'completed'`,
        [clientId, user.sub]
      );

      // Commit transaction
      await pool.query('COMMIT');

      return c.json({
        message: 'Visit submitted successfully',
        touchpoint: {
          ...touchpoint,
          photo_url: uploadedPhotoUrl,
          audio_url: uploadedAudioUrl,
        },
      });

    } catch (transactionError) {
      // Rollback on any error
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error: any) {
    // ✅ FIXED: Clean up uploaded files if touchpoint creation failed with retry mechanism
    const cleanupPromises: Promise<boolean>[] = [];

    if (uploadedPhotoKey) {
      cleanupPromises.push(deleteFileWithRetry(uploadedPhotoKey));
    }
    if (uploadedAudioKey) {
      cleanupPromises.push(deleteFileWithRetry(uploadedAudioKey));
    }

    // Run cleanup in parallel but don't wait for it
    Promise.all(cleanupPromises).catch((cleanupErrors) => {
      console.error('[Submit Visit] File cleanup errors:', cleanupErrors);
    });

    if (error instanceof AppError) {
      return c.json({
        success: false,
        message: error.message,
        code: error.code,
        requestId: error.details.requestId || 'unknown',
        suggestions: error.suggestions,
      }, error.statusCode as any);
    }

    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        requestId,
        errors: error.errors,
      }, 400);
    }

    if (error.name === 'NotFoundError' || error instanceof NotFoundError) {
      return c.json({
        success: false,
        message: error.message || 'Resource not found',
        code: 'NOT_FOUND',
        requestId,
      }, 404);
    }

    // ENHANCED ERROR LOGGING FOR DEBUGGING
    console.error('[Submit Visit] DETAILED ERROR:', {
      message: error.message,
      name: error.name,
      code: error.code,
      requestId,
      stack: error.stack,
      // Include full error details for debugging
      errorDetails: {
        ...error,
        // Circular reference protection
        cause: error.cause,
      },
    });

    return c.json({
      success: false,
      message: 'An error occurred while submitting your touchpoint. Please try again.',
      code: 'INTERNAL_ERROR',
      requestId,
      // FOR DEBUGGING: Include actual error message
      debugMessage: error.message,
      debugName: error.name,
    }, 500);
  }
});

// GET /api/my-day/stats - Get performance statistics
myDay.get('/stats', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'week';

    // Use PostgreSQL date functions (respects database timezone Asia/Manila)
    let startDateQuery: string;
    switch (period) {
      case 'day':
        startDateQuery = 'CURRENT_DATE';
        break;
      case 'month':
        startDateQuery = 'DATE_TRUNC(\'month\', CURRENT_DATE)::DATE';
        break;
      case 'week':
      default:
        // Start of week (Monday) using PostgreSQL
        startDateQuery = '(CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER + 1)::DATE';
    }

    const touchpointsResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE type = 'Visit') as visits,
              COUNT(*) FILTER (WHERE type = 'Call') as calls
       FROM touchpoints WHERE user_id = $1 AND created_at::date >= ${startDateQuery}`,
      [user.sub]
    );

    const clientsResult = await pool.query(
      `SELECT COUNT(DISTINCT client_id) as unique_clients
       FROM touchpoints WHERE user_id = $1 AND created_at::date >= ${startDateQuery}`,
      [user.sub]
    );

    const itinerariesResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM itineraries WHERE user_id = $1 AND scheduled_date >= ${startDateQuery}`,
      [user.sub]
    );

    // Get the actual start date for the response
    const startDateResult = await pool.query(`SELECT ${startDateQuery} as start_date`);
    const startDate = startDateResult.rows[0].start_date;

    const tp = touchpointsResult.rows[0];
    const clients = clientsResult.rows[0];
    const itin = itinerariesResult.rows[0];

    return c.json({
      period,
      start_date: startDate,
      touchpoints: {
        total: parseInt(tp.total),
        visits: parseInt(tp.visits),
        calls: parseInt(tp.calls),
      },
      clients: { unique_visited: parseInt(clients.unique_clients) },
      itineraries: {
        total: parseInt(itin.total),
        completed: parseInt(itin.completed),
        completion_rate: itin.total > 0 ? Math.round((parseInt(itin.completed) / parseInt(itin.total)) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/my-day/complete-visit - Unified endpoint for complete visit workflow
// Creates/updates touchpoint, ensures itinerary exists, marks as completed
myDay.post('/complete-visit', authMiddleware, touchpointRateLimit, requirePermission('touchpoints', 'create'), async (c) => {
  let uploadedPhotoUrl: string | undefined;
  let uploadedPhotoKey: string | undefined;
  let uploadedAudioUrl: string | undefined;
  let uploadedAudioKey: string | undefined;
  let uploadedPhotoHash: string | undefined;
  let uploadedAudioHash: string | undefined;

  // Generate request ID for tracing
  const requestId = uuidv4();
  c.header('X-Request-Id', requestId);

  try {
    const user = c.get('user');

    // Check content type and parse accordingly
    let body: Record<string, string | File>;
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Try to use pre-parsed data from middleware
      const parsedData = c.get('parsedFormData' as any) as Record<string, string | File>;

      if (parsedData) {
        body = parsedData;
      } else {
        // Fallback: Try Hono's parseBody() for FormData
        try {
          body = await c.req.parseBody();
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
          console.error('[Submit Visit] FormData parse error:', errorMessage);
          throw new Error('Failed to parse FormData request. Please try sending as JSON with base64 encoded photo.');
        }
      }
    } else {
      // Regular JSON parsing
      body = await c.req.json();
    }

    // Extract form fields
    const clientId = body['client_id'] as string;
    const touchpointNumberStr = body['touchpoint_number'] as string;
    const type = body['type'] as 'Visit' | 'Call';
    const reason = body['reason'] as string;
    const status = body['status'] as string | undefined;
    const address = body['address'] as string | undefined;
    const timeArrival = body['time_arrival'] as string | undefined;
    const timeDeparture = body['time_departure'] as string | undefined;
    const odometerArrival = body['odometer_arrival'] as string | undefined;
    const odometerDeparture = body['odometer_departure'] as string | undefined;
    const nextVisitDate = body['next_visit_date'] as string | undefined;
    const notes = body['notes'] as string | undefined;
    const latitudeStr = body['latitude'] as string | undefined;
    const longitudeStr = body['longitude'] as string | undefined;
    const scheduledTime = body['scheduled_time'] as string | undefined;

    // Extract files
    const photoFile = body['photo'] as File | undefined;
    const audioFile = body['audio'] as File | undefined;

    // Extract base64 encoded photo (alternative to FormData file upload)
    const photoBase64 = body['photo_base64'] as string | undefined;
    const photoFilename = body['photo_filename'] as string | undefined;

    // Validate required fields
    if (!clientId || !touchpointNumberStr || !type || !reason) {
      throw new ValidationError('Missing required fields: client_id, touchpoint_number, type, reason')
        .addDetail('requestId', requestId);
    }

    const touchpointNumber = parseInt(touchpointNumberStr);
    if (isNaN(touchpointNumber) || touchpointNumber < 1 || touchpointNumber > 7) {
      throw new ValidationError('Invalid touchpoint_number. Must be between 1 and 7')
        .addDetail('providedValue', touchpointNumberStr)
        .addDetail('requestId', requestId);
    }

    // Validate type enum
    if (type !== 'Visit' && type !== 'Call') {
      throw new ValidationError('Invalid type. Must be "Visit" or "Call"')
        .addDetail('providedValue', type)
        .addDetail('requestId', requestId);
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
        .addDetail('providedValue', status)
        .addDetail('requestId', requestId);
    }

    // Validate UUID
    try {
      if (!clientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new ValidationError('Invalid client_id format');
      }
    } catch {
      throw new ValidationError('Invalid client_id format')
        .addDetail('providedValue', clientId)
        .addDetail('requestId', requestId);
    }

    // Parse optional numeric fields
    const latitude = latitudeStr ? parseFloat(latitudeStr) : undefined;
    const longitude = longitudeStr ? parseFloat(longitudeStr) : undefined;

    // Handle base64 encoded photo (alternative to FormData file upload)
    if (photoBase64 && photoFilename) {
      try {
        console.log('[Submit Visit] Processing base64 encoded photo...');

        // Decode base64 to buffer
        const photoBuffer = Buffer.from(photoBase64, 'base64');
        uploadedPhotoHash = calculateFileHash(photoBuffer);

        // Check for duplicate file (same content already uploaded)
        const duplicateCheck = await pool.query(
          'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
          [uploadedPhotoHash, 'touchpoint']
        );

        if (duplicateCheck.rows.length > 0) {
          // Use existing file instead of uploading again
          uploadedPhotoUrl = duplicateCheck.rows[0].url;
          uploadedPhotoKey = duplicateCheck.rows[0].storage_key;
          console.log(`[File Deduplication] Reusing existing base64 photo: ${uploadedPhotoUrl}`);
        } else {
          // Upload new file
          const photoResult = await storageService.upload({
            file: photoBuffer,
            filename: photoFilename,
            mimetype: 'image/png', // Default to PNG for base64 uploads
            folder: 'touchpoint_photo',
            maxSize: MAX_PHOTO_SIZE,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          });

          if (!photoResult.success || !photoResult.url) {
            throw new AppError('PHOTO_UPLOAD_FAILED', `Photo upload failed: ${photoResult.error || 'Unknown error'}`, 400)
              .addDetail('requestId', requestId)
              .addDetail('filename', photoFilename);
          }

          uploadedPhotoUrl = photoResult.url;
          uploadedPhotoKey = photoResult.key;
          console.log(`[Submit Visit] Base64 photo uploaded successfully: ${uploadedPhotoUrl}`);
        }
      } catch (error: any) {
        console.error('[Submit Visit] Base64 photo processing error:', error);
        throw new AppError('PHOTO_PROCESSING_FAILED', `Failed to process base64 photo: ${error.message}`, 400)
          .addDetail('requestId', requestId);
      }
    }

    // Handle photo upload with deduplication
    if (photoFile && photoFile instanceof File) {
      const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
      uploadedPhotoHash = calculateFileHash(photoBuffer);

      // Check for duplicate file
      const duplicateCheck = await pool.query(
        'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
        [uploadedPhotoHash, 'touchpoint']
      );

      if (duplicateCheck.rows.length > 0) {
        uploadedPhotoUrl = duplicateCheck.rows[0].url;
        uploadedPhotoKey = duplicateCheck.rows[0].storage_key;
        console.log(`[File Deduplication] Reusing existing photo: ${uploadedPhotoUrl}`);
      } else {
        const photoResult = await storageService.upload({
          file: photoBuffer,
          filename: photoFile.name,
          mimetype: photoFile.type,
          folder: 'touchpoint_photo',
          maxSize: MAX_PHOTO_SIZE,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        });

        if (!photoResult.success || !photoResult.url) {
          throw new AppError('PHOTO_UPLOAD_FAILED', `Photo upload failed: ${photoResult.error || 'Unknown error'}`, 400)
            .addDetail('requestId', requestId)
            .addDetail('filename', photoFile.name);
        }

        uploadedPhotoUrl = photoResult.url;
        uploadedPhotoKey = photoResult.key;
      }
    }

    // Handle audio upload with deduplication
    if (audioFile && audioFile instanceof File) {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      uploadedAudioHash = calculateFileHash(audioBuffer);

      const duplicateCheck = await pool.query(
        'SELECT url, storage_key FROM files WHERE hash = $1 AND entity_type = $2 ORDER BY created_at DESC LIMIT 1',
        [uploadedAudioHash, 'touchpoint']
      );

      if (duplicateCheck.rows.length > 0) {
        uploadedAudioUrl = duplicateCheck.rows[0].url;
        uploadedAudioKey = duplicateCheck.rows[0].storage_key;
        console.log(`[File Deduplication] Reusing existing audio: ${uploadedAudioUrl}`);
      } else {
        const audioResult = await storageService.upload({
          file: audioBuffer,
          filename: audioFile.name,
          mimetype: audioFile.type,
          folder: 'touchpoint_audio',
          maxSize: MAX_AUDIO_SIZE,
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/webm'],
        });

        if (!audioResult.success || !audioResult.url) {
          throw new AppError('AUDIO_UPLOAD_FAILED', `Audio upload failed: ${audioResult.error || 'Unknown error'}`, 400)
            .addDetail('requestId', requestId)
            .addDetail('filename', audioFile.name);
        }

        uploadedAudioUrl = audioResult.url;
        uploadedAudioKey = audioResult.key;
      }
    }

    // Wrap in database transaction for atomicity
    await pool.query('BEGIN');

    try {
      // Step 1: Verify client exists (not soft-deleted)
      const clientCheck = await pool.query(
        'SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL',
        [clientId]
      );

      if (clientCheck.rows.length === 0) {
        throw new NotFoundError('Client')
          .addDetail('clientId', clientId)
          .addDetail('requestId', requestId);
      }

      // Step 2: Check for existing touchpoint today using CURRENT_DATE
      const existing = await pool.query(
        `SELECT * FROM touchpoints
         WHERE client_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE`,
        [clientId, user.sub]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing touchpoint
        result = await pool.query(
          `UPDATE touchpoints SET
            touchpoint_number = $1, type = $2, rejection_reason = $3,
            visit_id = $4, call_id = $5, updated_at = NOW()
          WHERE id = $6 RETURNING *`,
          [
            touchpointNumber, type, reason,
            existing.rows[0].visit_id, // Keep existing visit_id
            existing.rows[0].call_id,  // Keep existing call_id
            existing.rows[0].id
          ]
        );
      } else {
        // Auto-create visit record for all new touchpoints
        console.log('[Submit Visit] Auto-creating visit record for touchpoint');

        // Create a visit record from the touchpoint data
        const visitResult = await pool.query(
          `INSERT INTO visits (
            client_id, user_id, type, reason, status, notes,
            address, latitude, longitude, photo_url, time_in, time_out
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          ) RETURNING *`,
          [
            clientId, user.sub, 'regular_visit',
            reason, status || 'Interested', notes,
            address, latitude, longitude,
            uploadedPhotoUrl || '', // Use uploaded photo URL or empty string
            timeArrival || null, timeDeparture || null
          ]
        );

        const visitId = visitResult.rows[0].id;
        console.log('[Submit Visit] Auto-created visit record:', visitId);

        // Create new touchpoint using CURRENT_DATE
        result = await pool.query(
          `INSERT INTO touchpoints (
            id, client_id, user_id, touchpoint_number, type, rejection_reason, visit_id, call_id, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW()
          ) RETURNING *`,
          [
            clientId, user.sub, touchpointNumber, type,
            reason, visitId, null
          ]
        );
      }

      const touchpoint = result.rows[0];

      // Step 3: Find or create today's itinerary for this client
      let itineraryResult = await pool.query(
        `SELECT * FROM itineraries
         WHERE client_id = $1 AND user_id = $2 AND scheduled_date = CURRENT_DATE`,
        [clientId, user.sub]
      );

      let itinerary;
      if (itineraryResult.rows.length === 0) {
        // Create new itinerary
        const createResult = await pool.query(
          `INSERT INTO itineraries (id, client_id, user_id, scheduled_date, scheduled_time, status, priority, created_by)
           VALUES (gen_random_uuid(), $1, $2, CURRENT_DATE, $3, 'completed', 5, $4)
           RETURNING *`,
          [clientId, user.sub, scheduledTime || null, user.sub]
        );
        itinerary = createResult.rows[0];
      } else {
        // Update existing itinerary to completed
        const updateResult = await pool.query(
          `UPDATE itineraries SET status = 'completed', updated_at = NOW()
           WHERE id = $1 AND status != 'completed'
           RETURNING *`,
          [itineraryResult.rows[0].id]
        );
        itinerary = updateResult.rows[0];
      }

      // Step 4: Store file metadata (only for newly uploaded files)
      if (uploadedPhotoUrl && uploadedPhotoKey && photoFile) {
        const existingFile = await pool.query(
          'SELECT id FROM files WHERE storage_key = $1',
          [uploadedPhotoKey]
        );

        if (existingFile.rows.length === 0) {
          await pool.query(
            `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, hash, uploaded_by, entity_type, entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              uploadedPhotoKey.split('/').pop(),
              photoFile.name,
              photoFile.type,
              photoFile.size,
              uploadedPhotoUrl,
              uploadedPhotoKey,
              uploadedPhotoHash,
              user.sub,
              'touchpoint',
              touchpoint.id,
            ]
          );
        }
      }

      if (uploadedAudioUrl && uploadedAudioKey && audioFile) {
        const existingFile = await pool.query(
          'SELECT id FROM files WHERE storage_key = $1',
          [uploadedAudioKey]
        );

        if (existingFile.rows.length === 0) {
          await pool.query(
            `INSERT INTO files (filename, original_filename, mime_type, size, url, storage_key, hash, uploaded_by, entity_type, entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              uploadedAudioKey.split('/').pop(),
              audioFile.name,
              audioFile.type,
              audioFile.size,
              uploadedAudioUrl,
              uploadedAudioKey,
              uploadedAudioHash,
              user.sub,
              'touchpoint',
              touchpoint.id,
            ]
          );
        }
      }

      // Commit transaction
      await pool.query('COMMIT');

      return c.json({
        success: true,
        message: 'Visit completed successfully',
        touchpoint: {
          ...touchpoint,
          photo_url: uploadedPhotoUrl,
          audio_url: uploadedAudioUrl,
        },
        itinerary: {
          id: itinerary.id,
          client_id: itinerary.client_id,
          user_id: itinerary.user_id,
          scheduled_date: itinerary.scheduled_date,
          scheduled_time: itinerary.scheduled_time,
          status: itinerary.status,
          priority: itinerary.priority,
          notes: itinerary.notes,
        },
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error: any) {
    // Clean up uploaded files if failed
    const cleanupPromises: Promise<boolean>[] = [];

    if (uploadedPhotoKey) {
      cleanupPromises.push(deleteFileWithRetry(uploadedPhotoKey));
    }
    if (uploadedAudioKey) {
      cleanupPromises.push(deleteFileWithRetry(uploadedAudioKey));
    }

    Promise.all(cleanupPromises).catch((cleanupErrors) => {
      console.error('[Complete Visit] File cleanup errors:', cleanupErrors);
    });

    if (error instanceof AppError) {
      return c.json({
        success: false,
        message: error.message,
        code: error.code,
        requestId: error.details.requestId || 'unknown',
        suggestions: error.suggestions,
      }, error.statusCode as any);
    }

    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        requestId,
        errors: error.errors,
      }, 400);
    }

    console.error('[Complete Visit] Error:', {
      message: error.message,
      code: error.code || 'INTERNAL_ERROR',
      requestId,
      stack: error.stack,
    });

    return c.json({
      success: false,
      message: 'An error occurred while completing your visit. Please try again.',
      code: 'INTERNAL_ERROR',
      requestId,
    }, 500);
  }
});

export default myDay;
