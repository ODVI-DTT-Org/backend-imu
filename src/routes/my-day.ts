import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { pool } from '../db/index.js';
import { storageService } from '../services/storage.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';
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

// POST /api/my-day/bulk-delete - Bulk delete from My Day (now queued)
myDay.post('/bulk-delete', authMiddleware, requirePermission('itineraries', 'delete'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) throw new Error('Unauthorized');

    const { ids } = bulkDeleteSchema.parse(await c.req.json());

    // Create bulk delete job
    const job = await addBulkJob(
      BulkJobType.BULK_DELETE_MY_DAY,
      user.sub,
      ids
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk delete job started for ${ids.length} my day items`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: `${Math.ceil(ids.length / 50)} minutes`,
    }, 201);
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
      message: 'Failed to create bulk delete job',
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

    // Get itineraries for the target date with client info
    const itinerariesResult = await pool.query(
      `SELECT i.*, c.first_name, c.last_name, c.email, c.phone, c.client_type,
              a.name as agency_name
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE i.user_id = $1 AND i.scheduled_date = $2
       ORDER BY i.scheduled_time ASC NULLS LAST, i.priority DESC`,
      [caravanId, targetDate]
    );

    // Get completed touchpoints for the target date
    const touchpointsResult = await pool.query(
      `SELECT t.id, t.client_id, t.touchpoint_number, t.type, t.reason, t.time_arrival, t.time_departure,
              c.first_name, c.last_name, c.client_type
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       WHERE t.user_id = $1 AND t.date = $2
       ORDER BY t.created_at DESC`,
      [user.sub, targetDate]
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
       WHERE client_id = $1 AND user_id = $2 AND date = CURRENT_DATE`,
      [clientId, user.sub]
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
      // Create new touchpoint with time-in using CURRENT_DATE
      const tpResult = await pool.query(
        'SELECT COUNT(*) + 1 as next FROM touchpoints WHERE client_id = $1',
        [clientId]
      );
      const nextNumber = Math.min(parseInt(tpResult.rows[0].next) || 1, 7);

      result = await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, time_arrival, latitude, longitude)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Visit', CURRENT_DATE, $4, $5, $6) RETURNING *`,
        [clientId, user.sub, nextNumber, timeIn, validated.latitude, validated.longitude]
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
       WHERE client_id = $1 AND user_id = $2 AND date = CURRENT_DATE`,
      [clientId, user.sub]
    );

    if (existing.rows.length === 0) {
      return c.json({ message: 'No touchpoint found for today. Please record time-in first.' }, 404);
    }

    // Update existing touchpoint with time-out
    const result = await pool.query(
      `UPDATE touchpoints
       SET time_departure = $1,
           time_out_gps_lat = $2,
           time_out_gps_lng = $3,
           time_out_gps_address = $4,
           updated_at = NOW()
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

    // Parse multipart form data
    const body = await c.req.parseBody();

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
         WHERE client_id = $1 AND user_id = $2 AND date = CURRENT_DATE`,
        [clientId, user.sub]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing touchpoint
        result = await pool.query(
          `UPDATE touchpoints SET
            touchpoint_number = $1, type = $2, reason = $3, address = $4,
            time_arrival = $5, time_departure = $6, odometer_arrival = $7, odometer_departure = $8,
            next_visit_date = $9, notes = $10, photo_url = $11, audio_url = $12,
            latitude = $13, longitude = $14, status = $15, updated_at = NOW()
          WHERE id = $16 RETURNING *`,
          [
            touchpointNumber, type, reason, address,
            timeArrival, timeDeparture, odometerArrival, odometerDeparture,
            nextVisitDate, notes, uploadedPhotoUrl, uploadedAudioUrl,
            latitude, longitude, status || 'Completed', // ✅ FIXED: Use status or default to 'Completed'
            existing.rows[0].id
          ]
        );
      } else {
        // Create new touchpoint using CURRENT_DATE
        result = await pool.query(
          `INSERT INTO touchpoints (
            id, client_id, user_id, touchpoint_number, type, date,
            reason, address, time_arrival, time_departure,
            odometer_arrival, odometer_departure, next_visit_date,
            notes, photo_url, audio_url, latitude, longitude, status
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          ) RETURNING *`,
          [
            clientId, user.sub, touchpointNumber, type,
            reason, address, timeArrival, timeDeparture,
            odometerArrival, odometerDeparture, nextVisitDate,
            notes, uploadedPhotoUrl, uploadedAudioUrl, latitude, longitude, status || 'Completed'
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

    console.error('[Submit Visit] Error:', {
      message: error.message,
      code: error.code || 'INTERNAL_ERROR',
      requestId,
      stack: error.stack,
    });

    return c.json({
      success: false,
      message: 'An error occurred while submitting your touchpoint. Please try again.',
      code: 'INTERNAL_ERROR',
      requestId,
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
       FROM touchpoints WHERE user_id = $1 AND date >= ${startDateQuery}`,
      [user.sub]
    );

    const clientsResult = await pool.query(
      `SELECT COUNT(DISTINCT client_id) as unique_clients
       FROM touchpoints WHERE user_id = $1 AND date >= ${startDateQuery}`,
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

    // Parse multipart form data
    const body = await c.req.parseBody();

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
         WHERE client_id = $1 AND user_id = $2 AND date = CURRENT_DATE`,
        [clientId, user.sub]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing touchpoint
        result = await pool.query(
          `UPDATE touchpoints SET
            touchpoint_number = $1, type = $2, reason = $3, address = $4,
            time_arrival = $5, time_departure = $6, odometer_arrival = $7, odometer_departure = $8,
            next_visit_date = $9, notes = $10, photo_url = $11, audio_url = $12,
            latitude = $13, longitude = $14, status = $15, updated_at = NOW()
          WHERE id = $16 RETURNING *`,
          [
            touchpointNumber, type, reason, address,
            timeArrival, timeDeparture, odometerArrival, odometerDeparture,
            nextVisitDate, notes, uploadedPhotoUrl, uploadedAudioUrl,
            latitude, longitude, status || 'Completed',
            existing.rows[0].id
          ]
        );
      } else {
        // Create new touchpoint using CURRENT_DATE
        result = await pool.query(
          `INSERT INTO touchpoints (
            id, client_id, user_id, touchpoint_number, type, date,
            reason, address, time_arrival, time_departure,
            odometer_arrival, odometer_departure, next_visit_date,
            notes, photo_url, audio_url, latitude, longitude, status
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          ) RETURNING *`,
          [
            clientId, user.sub, touchpointNumber, type,
            reason, address, timeArrival, timeDeparture,
            odometerArrival, odometerDeparture, nextVisitDate,
            notes, uploadedPhotoUrl, uploadedAudioUrl, latitude, longitude, status || 'Completed'
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
