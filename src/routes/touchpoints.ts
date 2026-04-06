import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import { validateTouchpointLocation } from '../services/gps-validation.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
} from '../errors/index.js';

const touchpoints = new Hono();

// Manager roles for authorization
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;

// Touchpoint sequence pattern: Visit → Call → Call → Visit → Call → Call → Visit
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;

/**
 * Get the expected touchpoint type for a given touchpoint number
 * @param touchpointNumber - The touchpoint number (1-7)
 * @returns The expected type ('Visit' or 'Call')
 */
function getExpectedTouchpointType(touchpointNumber: number): 'Visit' | 'Call' {
  if (touchpointNumber < 1 || touchpointNumber > 7) {
    throw new Error('Touchpoint number must be between 1 and 7');
  }
  return TOUCHPOINT_SEQUENCE[touchpointNumber - 1];
}

/**
 * Get the next touchpoint number for a client
 * @param clientId - The client ID
 * @returns The next expected touchpoint number (1-7) or null if all 7 are completed
 */
async function getNextTouchpointNumber(clientId: string): Promise<number | null> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT touchpoint_number) as count
     FROM touchpoints
     WHERE client_id = $1`,
    [clientId]
  );
  const count = parseInt(result.rows[0].count);
  return count >= 7 ? null : count + 1;
}

/**
 * Validate touchpoint sequence
 * @param touchpointNumber - The touchpoint number (1-7)
 * @param touchpointType - The touchpoint type ('Visit' or 'Call')
 * @returns Object with isValid flag and optional error message
 */
function validateTouchpointSequence(touchpointNumber: number, touchpointType: 'Visit' | 'Call'): {
  isValid: boolean;
  error?: string;
  expectedType?: 'Visit' | 'Call';
} {
  const expectedType = getExpectedTouchpointType(touchpointNumber);
  if (touchpointType !== expectedType) {
    return {
      isValid: false,
      error: `Invalid touchpoint type for touchpoint #${touchpointNumber}. Expected '${expectedType}' but got '${touchpointType}'`,
      expectedType,
    };
  }
  return { isValid: true, expectedType };
}

/**
 * Validates if a user can create a specific touchpoint type based on their role
 * and the expected touchpoint sequence
 * @param userRole - The user's role
 * @param touchpointNumber - The touchpoint number (1-7)
 * @param touchpointType - The touchpoint type ('Visit' or 'Call')
 * @returns true if the user can create this touchpoint, false otherwise
 */
function canCreateTouchpoint(
  userRole: string,
  touchpointNumber: number,
  touchpointType: 'Visit' | 'Call'
): boolean {
  const expectedType = TOUCHPOINT_SEQUENCE[touchpointNumber - 1];

  if (userRole === 'caravan') {
    // Caravan: Only Visit types allowed (1, 4, 7)
    if (expectedType !== 'Visit' || touchpointType !== 'Visit') {
      return false;
    }
    return true;
  }

  if (userRole === 'tele') {
    // Tele: Only Call types allowed (2, 3, 5, 6)
    if (expectedType !== 'Call' || touchpointType !== 'Call') {
      return false;
    }
    return true;
  }

  // Admin/Manager: Any type allowed
  return true;
}

// Validation schemas
const createTouchpointSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid().optional(), // Optional - will be set to current user if not provided
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  date: z.string(),
  address: z.string().optional(),
  time_arrival: z.string().optional(),
  time_departure: z.string().optional(),
  odometer_arrival: z.string().nullish(), // .nullish() accepts undefined, null, or string
  odometer_departure: z.string().nullish(), // .nullish() accepts undefined, null, or string
  reason: z.string().min(1),
  status: z.enum(['Interested', 'Undecided', 'Not Interested', 'Completed']).optional().default('Interested'),
  next_visit_date: z.string().optional(),
  notes: z.string().optional(),
  photo_url: z.string().optional(),
  audio_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  rejection_reason: z.string().optional(),
  // Time In/Out fields
  time_in: z.string().optional(),
  time_in_gps_lat: z.number().optional(),
  time_in_gps_lng: z.number().optional(),
  time_in_gps_address: z.string().optional(),
  time_out: z.string().optional(),
  time_out_gps_lat: z.number().optional(),
  time_out_gps_lng: z.number().optional(),
  time_out_gps_address: z.string().optional(),
});

const updateTouchpointSchema = createTouchpointSchema.partial();

// Helper to map DB row to Touchpoint type
function mapRowToTouchpoint(row: Record<string, any>) {
  return {
    id: row.id,
    client_id: row.client_id,
    user_id: row.user_id,
    touchpoint_number: row.touchpoint_number,
    type: row.type,
    date: row.date,
    address: row.address,
    time_arrival: row.time_arrival,
    time_departure: row.time_departure,
    odometer_arrival: row.odometer_arrival,
    odometer_departure: row.odometer_departure,
    reason: row.reason,
    status: row.status,
    next_visit_date: row.next_visit_date,
    notes: row.notes,
    photo_url: row.photo_url,
    audio_url: row.audio_url,
    latitude: row.latitude,
    longitude: row.longitude,
    rejection_reason: row.rejection_reason,
    // Time In/Out fields
    time_in: row.time_in,
    time_in_gps_lat: row.time_in_gps_lat,
    time_in_gps_lng: row.time_in_gps_lng,
    time_in_gps_address: row.time_in_gps_address,
    time_out: row.time_out,
    time_out_gps_lat: row.time_out_gps_lat,
    time_out_gps_lng: row.time_out_gps_lng,
    time_out_gps_address: row.time_out_gps_address,
    created: row.created_at,
    updated: row.updated_at,
    expand: row.expand,
  };
}

// GET /api/touchpoints - List touchpoints with filters
touchpoints.get('/', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const clientId = c.req.query('client_id');
    const userId = c.req.query('user_id');
    const type = c.req.query('type');
    const scope = c.req.query('scope'); // 'all' or 'own'
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const status = c.req.query('status');
    const reason = c.req.query('reason');
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Scope-based filtering (respects explicit scope parameter)
    // scope='all': show ALL touchpoints (no user_id filter for any role)
    // scope='own': show only user's own touchpoints
    // scope not provided: show based on role and type (role-based defaults)
    if (scope === 'all') {
      // Explicitly requested ALL touchpoints - no user_id filter
      // This applies to all roles: admin, manager, caravan, tele
    } else if (scope === 'own') {
      // Explicitly requested own touchpoints
      conditions.push(`t.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    } else if (user.role === 'admin' || user.role === 'area_manager' || user.role === 'assistant_area_manager') {
      // Admin/Manager: can see all touchpoints by default (no filtering)
      // Don't add user_id condition
    } else if (user.role === 'caravan' || (user.role === 'tele' && type !== 'all')) {
      // Caravan: always see own touchpoints by default
      // Tele: see own touchpoints unless type='all'
      conditions.push(`t.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`t.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (clientId) {
      conditions.push(`t.client_id = $${paramIndex}`);
      params.push(clientId);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`t.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (type && type !== 'all') {
      conditions.push(`t.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (reason) {
      conditions.push(`t.reason = $${paramIndex}`);
      params.push(reason);
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

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM touchpoints t ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results with expanded relations
    const result = await pool.query(
      `SELECT t.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              u.first_name as user_first_name, u.last_name as user_last_name
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users u ON u.id = t.user_id
       ${whereClause}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(row => ({
      ...mapRowToTouchpoint(row),
      expand: {
        client_id: {
          id: row.client_id,
          first_name: row.client_first_name,
          last_name: row.client_last_name,
        },
        user_id: row.user_id ? {
          id: row.user_id,
          first_name: row.user_first_name,
          last_name: row.user_last_name,
        } : null,
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
    console.error('Fetch touchpoints error:', error);
    throw new Error();
  }
});

// GET /api/touchpoints/reasons - Get all touchpoint reasons
touchpoints.get('/reasons', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {
  try {
    const result = await pool.query(
      `SELECT id, code, label, color, sort_order
       FROM touchpoint_reasons
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );

    return c.json({
      items: result.rows.map(row => ({
        id: row.id,
        code: row.code,
        label: row.label,
        color: row.color,
        sortOrder: row.sort_order,
      })),
    });
  } catch (error) {
    console.error('Fetch touchpoint reasons error:', error);
    throw new Error();
  }
});

// GET /api/touchpoints/next/:clientId - Get next expected touchpoint info for a client
touchpoints.get('/next/:clientId', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const clientId = c.req.param('clientId');

    if (!clientId) {
      throw new ValidationError('Client ID is required');
    }

    // Get the next expected touchpoint number
    const nextTouchpointNumber = await getNextTouchpointNumber(clientId);

    if (nextTouchpointNumber === null) {
      return c.json({
        message: 'All 7 touchpoints have been completed',
        completedTouchpoints: 7,
        nextTouchpoint: null,
        sequence: TOUCHPOINT_SEQUENCE,
      });
    }

    // Get the expected type for this touchpoint
    const expectedType = getExpectedTouchpointType(nextTouchpointNumber);

    // Get existing touchpoints for this client
    const existingResult = await pool.query(
      `SELECT touchpoint_number, type, date, edit_status
       FROM touchpoints
       WHERE client_id = $1
       AND edit_status IN ('approved', 'pending_approval')
       ORDER BY touchpoint_number ASC`,
      [clientId]
    );

    const existingTouchpoints = existingResult.rows.map(row => ({
      touchpointNumber: row.touchpoint_number,
      type: row.type,
      date: row.date,
      editStatus: row.edit_status,
    }));

    return c.json({
      nextTouchpointNumber,
      nextTouchpointType: expectedType,
      completedTouchpoints: nextTouchpointNumber - 1,
      sequence: TOUCHPOINT_SEQUENCE,
      existingTouchpoints,
      canCreate: true,
    });
  } catch (error) {
    console.error('Get next touchpoint error:', error);
    throw new Error();
  }
});

// GET /api/touchpoints/:id/gps-validate - Validate touchpoint GPS location
touchpoints.get('/:id/gps-validate', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {
  const touchpointId = c.req.param('id');

  try {
    // Get touchpoint with client address data
    const result = await pool.query(`
      SELECT
        t.id,
        t.time_in_gps_lat,
        t.time_in_gps_lng,
        t.time_in_gps_address,
        a.latitude as client_latitude,
        a.longitude as client_longitude
      FROM touchpoints t
      LEFT JOIN clients cl ON t.client_id = cl.id
      LEFT JOIN addresses a ON cl.id = a.client_id AND a.is_primary = true
      WHERE t.id = $1
    `, [touchpointId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Touchpoint not found' }, 404);
    }

    const row = result.rows[0];

    const validation = await validateTouchpointLocation(
      {
        time_in_gps_lat: row.time_in_gps_lat,
        time_in_gps_lng: row.time_in_gps_lng,
        time_in_gps_address: row.time_in_gps_address
      },
      {
        latitude: row.client_latitude,
        longitude: row.client_longitude
      },
      touchpointId
    );

    return c.json(validation);
  } catch (error) {
    console.error('GPS validation error:', error);
    return c.json({ error: 'Failed to validate GPS location' }, 500);
  }
});

// GET /api/touchpoints/:id - Get single touchpoint
touchpoints.get('/:id', authMiddleware, requirePermission('touchpoints', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT t.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              u.first_name as user_first_name, u.last_name as user_last_name
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Touchpoint');
    }

    const touchpoint = result.rows[0];

    // Role-based access check
    if (user.role === 'field_agent' && touchpoint.user_id !== user.sub) {
      return c.json({ message: 'Forbidden' }, 403);
    }

    return c.json({
      ...mapRowToTouchpoint(touchpoint),
      expand: {
        client_id: {
          id: touchpoint.client_id,
          first_name: touchpoint.client_first_name,
          last_name: touchpoint.client_last_name,
        },
        user_id: touchpoint.user_id ? {
          id: touchpoint.user_id,
          first_name: touchpoint.user_first_name,
          last_name: touchpoint.user_last_name,
        } : null,
      },
    });
  } catch (error) {
    console.error('Fetch touchpoint error:', error);
    throw new Error();
  }
});

// POST /api/touchpoints - Create new touchpoint (requires admin approval)
touchpoints.post('/', authMiddleware, requirePermission('touchpoints', 'create'), auditMiddleware('touchpoint'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createTouchpointSchema.parse(body);

    // === Role-based Validation ===

    // Validate touchpoint type against user role and sequence
    if (!canCreateTouchpoint(user.role, validated.touchpoint_number, validated.type)) {
      let reason = '';
      if (user.role === 'caravan') {
        reason = 'Caravan users can only create Visit touchpoints (1, 4, 7)';
      } else if (user.role === 'tele') {
        reason = 'Tele users can only create Call touchpoints (2, 3, 5, 6)';
      } else {
        reason = `Touchpoint #${validated.touchpoint_number} must be a ${TOUCHPOINT_SEQUENCE[validated.touchpoint_number - 1]}`;
      }

      return c.json({
        message: reason,
        errorCode: 'INVALID_TOUCHPOINT_TYPE_FOR_ROLE',
        touchpointNumber: validated.touchpoint_number,
        requestedType: validated.type,
        userRole: user.role,
        expectedType: TOUCHPOINT_SEQUENCE[validated.touchpoint_number - 1],
      }, 403);
    }

    // === Loan Released Validation ===
    // RULE: Cannot create touchpoints for clients with released loans (they're "done")
    const clientCheck = await pool.query(
      `SELECT id, loan_released::int as loan_released_bool FROM clients WHERE id = $1`,
      [validated.client_id]
    );
    if (clientCheck.rows.length === 0) {
      return c.json({
        message: 'Client not found',
        errorCode: 'CLIENT_NOT_FOUND'
      }, 404);
    }

    const client = clientCheck.rows[0];
    if (client.loan_released || client.loan_released_bool) {
      return c.json({
        message: 'Cannot create touchpoint: Loan has already been released for this client',
        errorCode: 'LOAN_ALREADY_RELEASED',
        clientId: validated.client_id,
        loanReleasedAt: null // TODO: Add loan_released_at to response if needed
      }, 400);
    }

    // === Touchpoint Sequence Validation ===

    // 1. Validate that the touchpoint type matches the sequence pattern
    const sequenceValidation = validateTouchpointSequence(
      validated.touchpoint_number,
      validated.type
    );
    if (!sequenceValidation.isValid) {
      return c.json({
        message: sequenceValidation.error,
        expectedType: sequenceValidation.expectedType,
        providedType: validated.type,
        touchpointNumber: validated.touchpoint_number,
        sequence: TOUCHPOINT_SEQUENCE,
      }, 400);
    }

    // 2. Check if this is the next expected touchpoint number for the client
    const nextTouchpointNumber = await getNextTouchpointNumber(validated.client_id);
    if (nextTouchpointNumber === null) {
      return c.json({
        message: 'All 7 touchpoints have been completed for this client',
        completedTouchpoints: 7,
        sequence: TOUCHPOINT_SEQUENCE,
      }, 400);
    }

    // 3. Golden Rule: Call touchpoints require the preceding touchpoint to be completed
    // TP2 (Call) requires TP1 (Visit) completed
    // TP3 (Call) requires TP2 (Call) completed
    // TP5 (Call) requires TP4 (Visit) completed
    // TP6 (Call) requires TP5 (Call) completed
    if (validated.type === 'Call') {
      const requiredPrecedingNumber = validated.touchpoint_number - 1;

      // Get existing touchpoints for this client
      const existingTouchpointsResult = await pool.query(
        `SELECT touchpoint_number FROM touchpoints WHERE client_id = $1`,
        [validated.client_id]
      );
      const existingNumbers = existingTouchpointsResult.rows.map(r => r.touchpoint_number);

      // Check if the required preceding touchpoint exists
      if (!existingNumbers.includes(requiredPrecedingNumber)) {
        const requiredType = getExpectedTouchpointType(requiredPrecedingNumber);
        return c.json({
          message: `Cannot create Call touchpoint #${validated.touchpoint_number}. Touchpoint #${requiredPrecedingNumber} (${requiredType}) must be completed first.`,
          errorCode: 'PRECEDING_TOUCHPOINT_REQUIRED',
          touchpointNumber: validated.touchpoint_number,
          requiredPrecedingNumber,
          requiredPrecedingType: requiredType,
          sequence: TOUCHPOINT_SEQUENCE,
        }, 400);
      }
    }

    if (validated.touchpoint_number !== nextTouchpointNumber) {
      return c.json({
        message: `Invalid touchpoint number. Expected touchpoint #${nextTouchpointNumber} (${getExpectedTouchpointType(nextTouchpointNumber)})`,
        providedNumber: validated.touchpoint_number,
        expectedNumber: nextTouchpointNumber,
        expectedType: getExpectedTouchpointType(nextTouchpointNumber),
        sequence: TOUCHPOINT_SEQUENCE,
      }, 400);
    }

    // 4. Check if a touchpoint with this number already exists for this client
    const existingTouchpoint = await pool.query(
      `SELECT id, touchpoint_number, type
       FROM touchpoints
       WHERE client_id = $1
       AND touchpoint_number = $2
       LIMIT 1`,
      [validated.client_id, validated.touchpoint_number]
    );

    if (existingTouchpoint.rows.length > 0) {
      const existing = existingTouchpoint.rows[0];
      return c.json({
        message: `Touchpoint #${validated.touchpoint_number} already exists for this client`,
        existingTouchpoint: {
          id: existing.id,
          touchpointNumber: existing.touchpoint_number,
          type: existing.type,
        },
      }, 400);
    }

    // === End Touchpoint Sequence Validation ===

    // Helper function to convert time string (HH:MM) to timestamp by combining with date
    const timeToTimestamp = (timeStr: string | null | undefined, dateStr: string): string | null => {
      if (!timeStr) return null;

      // If timeStr already looks like a full timestamp (ISO format), return as-is
      if (timeStr.includes('T') || timeStr.includes('-')) {
        return timeStr;
      }

      // Otherwise, combine date (YYYY-MM-DD) with time (HH:MM) to create timestamp
      // Format: YYYY-MM-DDTHH:MM:SS
      return `${dateStr}T${timeStr}:00`;
    };

    // Convert time_in and time_out to proper timestamps
    const time_in = timeToTimestamp(validated.time_in, validated.date);
    const time_out = timeToTimestamp(validated.time_out, validated.date);

    // Validate Time Out is after Time In (if both provided)
    if (time_in && time_out) {
      const timeInDate = new Date(time_in);
      const timeOutDate = new Date(time_out);
      if (timeOutDate <= timeInDate) {
        throw new ValidationError('Time Out must be after Time In');
      }
    }

    // Set user_id to current user if not provided
    if (!validated.user_id) {
      validated.user_id = user.sub as string;
    }

    const result = await pool.query(
      `INSERT INTO touchpoints (
        id, client_id, user_id, touchpoint_number, type, date,
        address, time_arrival, time_departure, odometer_arrival, odometer_departure,
        reason, status, next_visit_date, notes, photo_url, audio_url, latitude, longitude,
        time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address,
        time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26
      ) RETURNING *`,
      [
        validated.client_id, validated.user_id, validated.touchpoint_number, validated.type,
        validated.date, validated.address, validated.time_arrival, validated.time_departure,
        validated.odometer_arrival, validated.odometer_departure, validated.reason, validated.status,
        validated.next_visit_date, validated.notes, validated.photo_url, validated.audio_url,
        validated.latitude, validated.longitude,
        time_in, validated.time_in_gps_lat, validated.time_in_gps_lng, validated.time_in_gps_address,
        time_out, validated.time_out_gps_lat, validated.time_out_gps_lng, validated.time_out_gps_address
      ]
    );

    // Mark ALL itineraries for this client as 'completed' when touchpoint is submitted
    // This ensures the client is removed from itinerary lists across all date tabs
    await pool.query(
      `UPDATE itineraries SET status = 'completed', updated_at = NOW()
       WHERE client_id = $1 AND status = 'pending'`,
      [validated.client_id]
    );

    return c.json({
      ...mapRowToTouchpoint(result.rows[0]),
      message: 'Touchpoint submitted for approval'
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create touchpoint error:', error);
    throw new Error('Failed to create touchpoint');
  }
});

// POST /api/touchpoints/bulk - Create multiple touchpoints at once
touchpoints.post('/bulk', authMiddleware, requirePermission('touchpoints', 'create'), auditMiddleware('touchpoint'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const body = await c.req.json();

    // Validate bulk request schema
    const bulkTouchpointSchema = z.object({
      touchpoints: z.array(z.object({
        client_id: z.string().uuid(),
        touchpoint_number: z.number().int().min(1).max(7),
        type: z.enum(['Visit', 'Call']),
        reason: z.string().min(1).max(100),
        status: z.enum(['Interested', 'Undecided', 'Not Interested', 'Completed']).default('Interested'),
        remarks: z.string().max(1000).optional(),
        date: z.string().optional(), // Will default to CURRENT_DATE
        time_in: z.string().optional(),
        time_out: z.string().optional(),
        gps_lat: z.number().optional(),
        gps_lng: z.number().optional(),
        gps_address: z.string().optional(),
      })).min(1).max(50), // Max 50 touchpoints at once
      gps_lat: z.number().optional(), // Shared GPS for all touchpoints
      gps_lng: z.number().optional(),
      gps_address: z.string().optional(),
    });

    const validated = bulkTouchpointSchema.parse(body);

    // Helper function to convert time string (HH:MM) to timestamp
    const timeToTimestamp = (timeStr: string | null | undefined, dateStr: string): string | null => {
      if (!timeStr) return null;
      if (timeStr.includes('T') || timeStr.includes('-')) {
        return timeStr;
      }
      return `${dateStr}T${timeStr}:00`;
    };

    const createdTouchpoints = [];
    const errors = [];

    // Process each touchpoint
    for (const touchpointData of validated.touchpoints) {
      try {
        // Apply shared GPS if individual touchpoint doesn't have it
        const finalGpsLat = touchpointData.gps_lat ?? validated.gps_lat;
        const finalGpsLng = touchpointData.gps_lng ?? validated.gps_lng;
        const finalGpsAddress = touchpointData.gps_address ?? validated.gps_address;

        // === Role-based Validation ===
        if (!canCreateTouchpoint(user.role, touchpointData.touchpoint_number, touchpointData.type)) {
          errors.push({
            clientId: touchpointData.client_id,
            error: user.role === 'caravan'
              ? 'Caravan users can only create Visit touchpoints (1, 4, 7)'
              : 'Tele users can only create Call touchpoints (2, 3, 5, 6)',
          });
          continue;
        }

        // Check if client exists and loan not released
        const clientCheck = await client.query(
          `SELECT id, loan_released::int as loan_released_bool FROM clients WHERE id = $1`,
          [touchpointData.client_id]
        );

        if (clientCheck.rows.length === 0) {
          errors.push({
            clientId: touchpointData.client_id,
            error: 'Client not found',
          });
          continue;
        }

        const clientData = clientCheck.rows[0];
        if (clientData.loan_released || clientData.loan_released_bool) {
          errors.push({
            clientId: touchpointData.client_id,
            error: 'Loan already released',
          });
          continue;
        }

        // Check if touchpoint already exists
        const existingCheck = await client.query(
          `SELECT id FROM touchpoints WHERE client_id = $1 AND touchpoint_number = $2`,
          [touchpointData.client_id, touchpointData.touchpoint_number]
        );

        if (existingCheck.rows.length > 0) {
          errors.push({
            clientId: touchpointData.client_id,
            error: `Touchpoint #${touchpointData.touchpoint_number} already exists`,
          });
          continue;
        }

        // Use provided date or default to CURRENT_DATE
        const date = touchpointData.date || new Date().toISOString().split('T')[0];

        // Convert time_in and time_out to timestamps
        const time_in = timeToTimestamp(touchpointData.time_in, date);
        const time_out = timeToTimestamp(touchpointData.time_out, date);

        // Insert touchpoint - match exact database schema order
        // Columns: client_id, user_id, touchpoint_number, type, date, address, time_arrival, time_departure,
        //          odometer_arrival, odometer_departure, reason, status, next_visit_date, notes,
        //          photo_url, audio_url, latitude, longitude, time_in, time_in_gps_lat, time_in_gps_lng,
        //          time_in_gps_address, time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address
        const result = await client.query(
          `INSERT INTO touchpoints (
            client_id, user_id, touchpoint_number, type, date, address,
            time_arrival, time_departure, odometer_arrival, odometer_departure,
            reason, status, next_visit_date, notes, photo_url, audio_url,
            latitude, longitude,
            time_in, time_in_gps_lat, time_in_gps_lng, time_in_gps_address,
            time_out, time_out_gps_lat, time_out_gps_lng, time_out_gps_address
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            $17, $18,
            $19, $20, $21, $22, $23,
            $24, $25, $26, $27
          ) RETURNING *`,
          [
            touchpointData.client_id,
            user.sub,
            touchpointData.touchpoint_number,
            touchpointData.type,
            date,
            finalGpsAddress || null,  // address
            null,  // time_arrival
            null,  // time_departure
            null,  // odometer_arrival
            null,  // odometer_departure
            touchpointData.reason,
            touchpointData.status,
            null,  // next_visit_date
            touchpointData.remarks || null,  // notes (remarks from mobile maps to notes in DB)
            null,  // photo_url
            null,  // audio_url
            finalGpsLat,  // latitude
            finalGpsLng,  // longitude
            time_in,
            finalGpsLat,  // time_in_gps_lat
            finalGpsLng,  // time_in_gps_lng
            finalGpsAddress,  // time_in_gps_address
            time_out,
            null,  // time_out_gps_lat (not captured yet)
            null,  // time_out_gps_lng
            null,  // time_out_gps_address
          ]
        );

        createdTouchpoints.push(mapRowToTouchpoint(result.rows[0]));
      } catch (error) {
        console.error(`Error creating touchpoint for client ${touchpointData.client_id}:`, error);
        errors.push({
          clientId: touchpointData.client_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await client.query('COMMIT');

    return c.json({
      message: `Created ${createdTouchpoints.length} touchpoint(s)`,
      created: createdTouchpoints,
      errors: errors,
      totalCount: validated.touchpoints.length,
      successCount: createdTouchpoints.length,
      errorCount: errors.length,
    }, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk touchpoint creation error:', error);
    throw new Error('Failed to create bulk touchpoints');
  } finally {
    client.release();
  }
});

// PUT /api/touchpoints/:id - Update touchpoint
touchpoints.put('/:id', authMiddleware, requirePermission('touchpoints', 'update'), auditMiddleware('touchpoint'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateTouchpointSchema.parse(body);

    // Check if touchpoint exists
    const existing = await pool.query('SELECT * FROM touchpoints WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('Touchpoint');
    }

    const existingTouchpoint = existing.rows[0];

    // Check user has access (owner or admin/manager)
    if (user.role !== 'admin' && user.role !== 'area_manager' && user.role !== 'assistant_area_manager') {
      if (existingTouchpoint.user_id !== user.sub) {
        throw new AuthorizationError('You do not have permission to perform this action');
      }
    }

    // Helper function to convert time string (HH:MM) to timestamp by combining with date
    const timeToTimestamp = (timeStr: string | null | undefined, dateStr: string): string | null => {
      if (!timeStr) return null;

      // If timeStr already looks like a full timestamp (ISO format), return as-is
      if (timeStr.includes('T') || timeStr.includes('-')) {
        return timeStr;
      }

      // Otherwise, combine date (YYYY-MM-DD) with time (HH:MM) to create timestamp
      // Format: YYYY-MM-DDTHH:MM:SS
      return `${dateStr}T${timeStr}:00`;
    };

    // Get the date to use for time conversion (either from update or existing)
    const dateForTime = validated.date || existingTouchpoint.date;

    // Convert time_in and time_out to proper timestamps if provided
    const time_in = validated.time_in !== undefined
      ? timeToTimestamp(validated.time_in, dateForTime)
      : existingTouchpoint.time_in;
    const time_out = validated.time_out !== undefined
      ? timeToTimestamp(validated.time_out, dateForTime)
      : existingTouchpoint.time_out;

    // Validate Time Out is after Time In (if both provided)
    if (time_in && time_out) {
      const timeInDate = new Date(time_in);
      const timeOutDate = new Date(time_out);
      if (timeOutDate <= timeInDate) {
        return c.json({ message: 'Time Out must be after Time In' }, 400);
      }
    }

    // Build the updates object
    const updates: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const fieldMappings: Record<string, string> = {
      client_id: 'client_id',
      user_id: 'user_id',
      touchpoint_number: 'touchpoint_number',
      type: 'type',
      date: 'date',
      address: 'address',
      time_arrival: 'time_arrival',
      time_departure: 'time_departure',
      odometer_arrival: 'odometer_arrival',
      odometer_departure: 'odometer_departure',
      reason: 'reason',
      status: 'status',
      next_visit_date: 'next_visit_date',
      notes: 'notes',
      photo_url: 'photo_url',
      audio_url: 'audio_url',
      latitude: 'latitude',
      longitude: 'longitude',
      // Time In/Out fields - use converted values
      time_in: 'time_in',
      time_in_gps_lat: 'time_in_gps_lat',
      time_in_gps_lng: 'time_in_gps_lng',
      time_in_gps_address: 'time_in_gps_address',
      time_out: 'time_out',
      time_out_gps_lat: 'time_out_gps_lat',
      time_out_gps_lng: 'time_out_gps_lng',
      time_out_gps_address: 'time_out_gps_address',
    };

    // Override time_in and time_out values with converted timestamps
    const updateData: any = { ...validated };
    if (validated.time_in !== undefined) {
      updateData.time_in = time_in;
    }
    if (validated.time_out !== undefined) {
      updateData.time_out = time_out;
    }

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in updateData) {
        updates.push(`${dbField} = $${valueIndex}`);
        values.push(updateData[key]);
        valueIndex++;
      }
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    // Add updated_at
    updates.push('updated = NOW()');
    values.push(id);

    // Direct update without approval
    const updateResult = await pool.query(
      `UPDATE touchpoints SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
      [...values, id]
    );

    return c.json({
      message: 'Touchpoint updated successfully',
      touchpoint: mapRowToTouchpoint(updateResult.rows[0])
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid input', errors: error.errors }, 400);
    }
    console.error('Update touchpoint error:', error);
    throw new Error();
  }
});

// DELETE /api/touchpoints/:id - Delete touchpoint
touchpoints.delete('/:id', authMiddleware, requirePermission('touchpoints', 'delete'), auditMiddleware('touchpoint'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Check if touchpoint exists
    const existing = await pool.query('SELECT * FROM touchpoints WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('Touchpoint');
    }

    const touchpoint = existing.rows[0];

    // Check user has access (owner or admin/manager)
    if (user.role !== 'admin' && user.role !== 'area_manager' && user.role !== 'assistant_area_manager') {
      if (touchpoint.user_id !== user.sub) {
        throw new AuthorizationError('You do not have permission to perform this action');
      }
    }

    // Hard delete
    await pool.query('DELETE FROM touchpoints WHERE id = $1', [id]);

    return c.json({ message: 'Touchpoint deleted successfully' });
  } catch (error) {
    console.error('Delete touchpoint error:', error);
    throw new Error();
  }
});

export default touchpoints;
