import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../errors/index.js';

const myDay = new Hono();

// Validation schemas
const visitFormSchema = z.object({
  client_id: z.string().uuid(),
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  reason: z.string(),
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

const addToMyDaySchema = z.object({
  client_id: z.string().uuid(),
  scheduled_time: z.string().optional(),
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
myDay.post('/add-client', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = addToMyDaySchema.parse(body);

    // Verify client exists (no ownership check - users can add any client)
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [validated.client_id]
    );

    if (clientCheck.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    const today = getLocalDateString();
    console.log('[ADD-CLIENT] Date calculation:', {
      now: new Date().toISOString(),
      nowLocal: new Date().toString(),
      calculatedToday: today,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffset: new Date().getTimezoneOffset()
    });

    // Check if already in today's itinerary
    const existing = await pool.query(
      'SELECT * FROM itineraries WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3',
      [validated.client_id, user.sub, today]
    );

    if (existing.rows.length > 0) {
      throw new ConflictError('Client already in today\'s itinerary');
    }

    // Add to itinerary
    const result = await pool.query(
      `INSERT INTO itineraries (id, client_id, user_id, scheduled_date, scheduled_time, priority, notes, status, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [
        validated.client_id,
        user.sub,
        today,
        validated.scheduled_time || null,
        validated.priority || 5,
        validated.notes || null,
        user.sub
      ]
    );

    return c.json({
      message: 'Client added to My Day',
      itinerary: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add to my day error:', error);
    throw new Error('Failed to add client to my day');
  }
});

// DELETE /api/my-day/remove-client/:id - Remove client from today's itinerary
myDay.delete('/remove-client/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');
    const today = getLocalDateString();

    const result = await pool.query(
      `DELETE FROM itineraries
       WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3
       RETURNING *`,
      [clientId, user.sub, today]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Client in today\'s itinerary');
    }

    return c.json({
      message: 'Client removed from My Day',
    });
  } catch (error) {
    console.error('Remove from my day error:', error);
    throw new Error('Failed to remove client from my day');
  }
});

// GET /api/my-day/status/:clientId - Check if client is in today's itinerary
myDay.get('/status/:clientId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('clientId');
    const today = getLocalDateString();

    const result = await pool.query(
      'SELECT * FROM itineraries WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3',
      [clientId, user.sub, today]
    );

    return c.json({
      in_my_day: result.rows.length > 0,
      itinerary: result.rows.length > 0 ? result.rows[0] : null,
    });
  } catch (error) {
    console.error('Get my day status error:', error);
    throw new Error('Failed to get my day status');
  }
});

// GET /api/my-day/tasks - Get today's tasks for field agent
myDay.get('/tasks', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const today = getLocalDateString();

    // Allow admin/staff to specify user_id, field agents use their own id
    let caravanId = c.req.query('user_id');
    if (user.role === 'field_agent' || !caravanId) {
      caravanId = user.sub;
    }

    // Get today's itineraries with client info
    const itinerariesResult = await pool.query(
      `SELECT i.*, c.first_name, c.last_name, c.email, c.phone, c.client_type,
              a.name as agency_name
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE i.user_id = $1 AND i.scheduled_date = $2
       ORDER BY i.scheduled_time ASC NULLS LAST, i.priority DESC`,
      [caravanId, today]
    );

    // Get today's completed touchpoints
    const touchpointsResult = await pool.query(
      `SELECT t.id, t.client_id, t.touchpoint_number, t.type, t.reason, t.time_arrival, t.time_departure,
              c.first_name, c.last_name, c.client_type
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id
       WHERE t.user_id = $1 AND t.date = $2
       ORDER BY t.created_at DESC`,
      [user.sub, today]
    );

    const tasks = itinerariesResult.rows.map(row => ({
      id: row.id,
      client_id: row.client_id,
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      status: row.status,
      priority: row.priority,
      notes: row.notes,
      client: {
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        client_type: row.client_type,
        agency: row.agency_name,
      },
    }));

    const completedTouchpoints = touchpointsResult.rows.map(row => ({
      id: row.id,
      client_id: row.client_id,
      touchpoint_number: row.touchpoint_number,
      type: row.type,
      reason: row.reason,
      time_arrival: row.time_arrival,
      time_departure: row.time_departure,
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
      date: today,
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
    throw new Error('Failed to get my-day tasks');
  }
});

// POST /api/my-day/tasks/:id/start - Start a task
myDay.post('/tasks/:id/start', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const existing = await pool.query(
      'SELECT * FROM itineraries WHERE id = $1 AND user_id = $2',
      [taskId, user.sub]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Task');
    }

    if (existing.rows[0].status !== 'pending') {
      throw new ValidationError('Task is not in pending status');
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
    throw new Error('Failed to start task');
  }
});

// POST /api/my-day/tasks/:id/complete - Complete a task
myDay.post('/tasks/:id/complete', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('id');

    const existing = await pool.query(
      'SELECT * FROM itineraries WHERE id = $1 AND user_id = $2',
      [taskId, user.sub]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Task');
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
    throw new Error('Failed to complete task');
  }
});

// POST /api/my-day/clients/:id/time-in - Record time-in for client visit
myDay.post('/clients/:id/time-in', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = timeInSchema.parse(body);

    // Verify client belongs to this caravan
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [clientId, user.sub]
    );

    if (clientCheck.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    const now = new Date();
    const timeIn = now.toTimeString().slice(0, 8);
    const today = getLocalDateString(now);

    // Check for existing touchpoint today
    const existing = await pool.query(
      'SELECT * FROM touchpoints WHERE client_id = $1 AND user_id = $2 AND date = $3',
      [clientId, user.sub, today]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing touchpoint with time-in
      result = await pool.query(
        `UPDATE touchpoints SET time_arrival = $1, latitude = $2, longitude = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [timeIn, validated.latitude, validated.longitude, existing.rows[0].id]
      );
    } else {
      // Create new touchpoint with time-in
      const tpResult = await pool.query(
        'SELECT COUNT(*) + 1 as next FROM touchpoints WHERE client_id = $1',
        [clientId]
      );
      const nextNumber = Math.min(parseInt(tpResult.rows[0].next) || 1, 7);

      result = await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, time_arrival, latitude, longitude)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Visit', $4, $5, $6, $7) RETURNING *`,
        [clientId, user.sub, nextNumber, today, timeIn, validated.latitude, validated.longitude]
      );
    }

    return c.json({
      message: 'Time-in recorded',
      time_in: timeIn,
      touchpoint: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Time-in error:', error);
    throw new Error('Failed to record time-in');
  }
});

// POST /api/my-day/visits - Submit complete visit form
myDay.post('/visits', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = visitFormSchema.parse(body);

    // Verify client exists (no ownership check - users can add any client)
    const clientCheck = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [validated.client_id]
    );

    if (clientCheck.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    const today = getLocalDateString();

    // Check for existing touchpoint today
    const existing = await pool.query(
      'SELECT * FROM touchpoints WHERE client_id = $1 AND user_id = $2 AND date = $3',
      [validated.client_id, user.sub, today]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing touchpoint
      result = await pool.query(
        `UPDATE touchpoints SET
          touchpoint_number = $1, type = $2, reason = $3, address = $4,
          time_arrival = $5, time_departure = $6, odometer_arrival = $7, odometer_departure = $8,
          next_visit_date = $9, notes = $10, photo_url = $11, audio_url = $12,
          latitude = $13, longitude = $14, updated_at = NOW()
        WHERE id = $15 RETURNING *`,
        [
          validated.touchpoint_number, validated.type, validated.reason, validated.address,
          validated.time_arrival, validated.time_departure, validated.odometer_arrival, validated.odometer_departure,
          validated.next_visit_date, validated.notes, validated.photo_url, validated.audio_url,
          validated.latitude, validated.longitude, existing.rows[0].id
        ]
      );
    } else {
      // Create new touchpoint
      result = await pool.query(
        `INSERT INTO touchpoints (
          id, client_id, user_id, touchpoint_number, type, date,
          reason, address, time_arrival, time_departure,
          odometer_arrival, odometer_departure, next_visit_date,
          notes, photo_url, audio_url, latitude, longitude
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING *`,
        [
          validated.client_id, user.sub, validated.touchpoint_number, validated.type, today,
          validated.reason, validated.address, validated.time_arrival, validated.time_departure,
          validated.odometer_arrival, validated.odometer_departure, validated.next_visit_date,
          validated.notes, validated.photo_url, validated.audio_url, validated.latitude, validated.longitude
        ]
      );
    }

    // Mark related itinerary as completed
    await pool.query(
      `UPDATE itineraries SET status = 'completed', updated_at = NOW()
       WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3 AND status != 'completed'`,
      [validated.client_id, user.sub, today]
    );

    return c.json({
      message: 'Visit submitted successfully',
      touchpoint: result.rows[0],
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Submit visit error:', error);
    throw new Error('Failed to submit visit');
  }
});

// GET /api/my-day/stats - Get performance statistics
myDay.get('/stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'week';

    const today = new Date();
    let startDate: string;

    switch (period) {
      case 'day':
        startDate = getLocalDateString(today);
        break;
      case 'month':
        startDate = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
        break;
      case 'week':
      default:
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = getLocalDateString(new Date(today.setDate(diff)));
    }

    const touchpointsResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE type = 'Visit') as visits,
              COUNT(*) FILTER (WHERE type = 'Call') as calls
       FROM touchpoints WHERE user_id = $1 AND date >= $2`,
      [user.sub, startDate]
    );

    const clientsResult = await pool.query(
      `SELECT COUNT(DISTINCT client_id) as unique_clients
       FROM touchpoints WHERE user_id = $1 AND date >= $2`,
      [user.sub, startDate]
    );

    const itinerariesResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM itineraries WHERE user_id = $1 AND scheduled_date >= $2`,
      [user.sub, startDate]
    );

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
    throw new Error('Failed to get stats');
  }
});

export default myDay;
