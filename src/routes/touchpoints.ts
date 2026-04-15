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
import { getClientCacheInvalidation } from '../services/cache/client-cache-invalidation.js';

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

// Validation schemas (normalized schema - visit/call data moved to separate tables)
const createTouchpointSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid().optional(), // Optional - will be set to current user if not provided
  touchpoint_number: z.number().int().min(1).max(7),
  type: z.enum(['Visit', 'Call']),
  rejection_reason: z.string().optional(),
  visit_id: z.string().uuid().optional(),
  call_id: z.string().uuid().optional(),
});

const updateTouchpointSchema = createTouchpointSchema.partial();

// Helper to map DB row to Touchpoint type (normalized schema)
function mapRowToTouchpoint(row: Record<string, any>) {
  return {
    id: row.id,
    client_id: row.client_id,
    user_id: row.user_id,
    touchpoint_number: row.touchpoint_number,
    type: row.type,
    rejection_reason: row.rejection_reason,
    visit_id: row.visit_id,
    call_id: row.call_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
      conditions.push(`t.created_at::date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.created_at::date <= $${paramIndex}`);
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
              c.middle_name as client_middle_name,
              u.first_name as user_first_name, u.last_name as user_last_name
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users u ON u.id = t.user_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(row => {
      // Calculate display_name for client: "Surname, First Name MiddleName"
      const middleName = row.client_middle_name || '';
      const nameParts = [row.client_first_name, middleName].filter((p: string) => p && p.trim().length > 0);
      const clientDisplayName = `${row.client_last_name}, ${nameParts.join(' ')}`;

      return {
        ...mapRowToTouchpoint(row),
        expand: {
          client_id: {
            id: row.client_id,
            first_name: row.client_first_name,
            last_name: row.client_last_name,
            middle_name: row.client_middle_name,
            display_name: clientDisplayName,
          },
          user_id: row.user_id ? {
            id: row.user_id,
            first_name: row.user_first_name,
            last_name: row.user_last_name,
          } : null,
        },
      };
    });

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
      `SELECT touchpoint_number, type, created_at
       FROM touchpoints
       WHERE client_id = $1
       ORDER BY touchpoint_number ASC`,
      [clientId]
    );

    const existingTouchpoints = existingResult.rows.map(row => ({
      touchpointNumber: row.touchpoint_number,
      type: row.type,
      created_at: row.created_at,
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
        t.visit_id,
        t.call_id,
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

    // GPS data is now in visits/calls tables, not touchpoints
    // Return a message indicating GPS validation requires visit/call data
    return c.json({
      touchpoint_id: touchpointId,
      visit_id: row.visit_id,
      call_id: row.call_id,
      message: 'GPS data is now stored in visits/calls tables. Please validate using the appropriate endpoint.',
      client_latitude: row.client_latitude,
      client_longitude: row.client_longitude
    });
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
    if (user.role === 'caravan' && touchpoint.user_id !== user.sub) {
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
      `SELECT id, loan_released::int as loan_released_bool FROM clients WHERE id = $1 AND deleted_at IS NULL`,
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
      // EXCEPTION: Allow preterm touchpoints even when loan is released
      // Preterm reasons include: "preterm", "Preterm", "PRETERM", or rejection_reason starting with "PRETERM"
      const isPretermTouchpoint = validated.rejection_reason && (
        validated.rejection_reason.toLowerCase().includes('preterm') ||
        validated.rejection_reason.toUpperCase().startsWith('PRETERM')
      );

      if (!isPretermTouchpoint) {
        return c.json({
          message: 'Cannot create touchpoint: Loan has already been released for this client',
          errorCode: 'LOAN_ALREADY_RELEASED',
          clientId: validated.client_id,
          loanReleasedAt: null // TODO: Add loan_released_at to response if needed
        }, 400);
      }
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

    // Set user_id to current user if not provided
    if (!validated.user_id) {
      validated.user_id = user.sub as string;
    }

    // Auto-create visit record if neither visit_id nor call_id is provided
    // This handles the case where mobile apps create touchpoints directly
    let visitId = validated.visit_id;
    let callId = validated.call_id;

    if (!visitId && !callId) {
      console.log('[Touchpoints] No visit_id or call_id provided, auto-creating visit record');

      // Create a visit record from the touchpoint data
      const visitResult = await pool.query(
        `INSERT INTO visits (
          client_id, user_id, type, time_in, time_out,
          odometer_arrival, odometer_departure, notes,
          reason, status, address, latitude, longitude
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *`,
        [
          validated.client_id,
          validated.user_id,
          'regular_visit',
          validated.time_in || null,
          validated.time_out || null,
          validated.odometer_arrival || null,
          validated.odometer_departure || null,
          validated.notes || null,
          validated.reason || null,
          validated.status || null,
          validated.address || null,
          validated.latitude || null,
          validated.longitude || null,
        ]
      );

      visitId = visitResult.rows[0].id;
      console.log('[Touchpoints] Auto-created visit record:', visitId);
    }

    const result = await pool.query(
      `INSERT INTO touchpoints (
        client_id, user_id, touchpoint_number, type, rejection_reason, visit_id, call_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      ) RETURNING *`,
      [
        validated.client_id, validated.user_id, validated.touchpoint_number, validated.type,
        validated.rejection_reason, visitId, callId
      ]
    );

    // Mark ALL itineraries for this client as 'completed' when touchpoint is submitted
    // This ensures the client is removed from itinerary lists across all date tabs
    await pool.query(
      `UPDATE itineraries SET status = 'completed', updated_at = NOW()
       WHERE client_id = $1 AND status = 'pending'`,
      [validated.client_id]
    );

    // ============================================
    // CACHE INVALIDATION: Invalidate touchpoint cache
    // ============================================
    // Non-blocking async cache invalidation
    const cacheInvalidation = getClientCacheInvalidation();
    cacheInvalidation.onTouchpointCreated(validated.client_id, validated.user_id)
      .catch((error) => {
        console.error('[Touchpoints] Cache invalidation error after touchpoint creation:', error);
      });

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
        rejection_reason: z.string().max(1000).optional(),
        visit_id: z.string().uuid().optional(),
        call_id: z.string().uuid().optional(),
      })).min(1).max(50), // Max 50 touchpoints at once
    });

    const validated = bulkTouchpointSchema.parse(body);

    const createdTouchpoints = [];
    const errors = [];

    // Process each touchpoint
    for (const touchpointData of validated.touchpoints) {
      try {
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
          `SELECT id, loan_released::int as loan_released_bool FROM clients WHERE id = $1 AND deleted_at IS NULL`,
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

        // Insert touchpoint - normalized schema (visit/call data in separate tables)
        const result = await client.query(
          `INSERT INTO touchpoints (
            client_id, user_id, touchpoint_number, type, rejection_reason, visit_id, call_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
          ) RETURNING *`,
          [
            touchpointData.client_id,
            user.sub,
            touchpointData.touchpoint_number,
            touchpointData.type,
            touchpointData.rejection_reason || null,
            touchpointData.visit_id || null,
            touchpointData.call_id || null,
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

    // ============================================
    // CACHE INVALIDATION: Invalidate bulk touchpoint cache
    // ============================================
    // Non-blocking async cache invalidation for all created touchpoints
    if (createdTouchpoints.length > 0) {
      const cacheInvalidation = getClientCacheInvalidation();
      const clientIds = [...new Set(createdTouchpoints.map((tp: any) => tp.client_id))];
      cacheInvalidation.onBulkTouchpointChange(clientIds, 'touchpoint_created')
        .catch((error) => {
          console.error('[Touchpoints] Cache invalidation error after bulk creation:', error);
        });
    }

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

    // Build the updates object
    const updates: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const fieldMappings: Record<string, string> = {
      client_id: 'client_id',
      user_id: 'user_id',
      touchpoint_number: 'touchpoint_number',
      type: 'type',
      rejection_reason: 'rejection_reason',
      visit_id: 'visit_id',
      call_id: 'call_id',
    };

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in validated) {
        updates.push(`${dbField} = $${valueIndex}`);
        values.push(validated[key as keyof typeof validated]);
        valueIndex++;
      }
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    // Add updated_at
    updates.push('updated_at = NOW()');
    values.push(id);

    // Direct update without approval
    const updateResult = await pool.query(
      `UPDATE touchpoints SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
      [...values, id]
    );

    // ============================================
    // CACHE INVALIDATION: Invalidate touchpoint cache
    // ============================================
    // Non-blocking async cache invalidation
    const cacheInvalidation = getClientCacheInvalidation();
    cacheInvalidation.onTouchpointUpdated(existingTouchpoint.client_id, existingTouchpoint.user_id)
      .catch((error) => {
        console.error('[Touchpoints] Cache invalidation error after touchpoint update:', error);
      });

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

    // ============================================
    // CACHE INVALIDATION: Invalidate touchpoint cache
    // ============================================
    // Non-blocking async cache invalidation
    const cacheInvalidation = getClientCacheInvalidation();
    cacheInvalidation.onTouchpointDeleted(touchpoint.client_id, touchpoint.user_id)
      .catch((error) => {
        console.error('[Touchpoints] Cache invalidation error after touchpoint deletion:', error);
      });

    return c.json({ message: 'Touchpoint deleted successfully' });
  } catch (error) {
    console.error('Delete touchpoint error:', error);
    throw new Error();
  }
});

/**
 * GET /api/touchpoints/:id/photo-url - Get presigned URL for touchpoint photo
 *
 * Generates a presigned S3 URL for secure access to touchpoint photos.
 * Caches URLs for 5 minutes to reduce S3 API calls.
 *
 * Path Parameters:
 * - id: Touchpoint UUID
 *
 * Response:
 * {
 *   url: string (presigned URL),
 *   cached: boolean,
 *   expiresAt: string (ISO datetime)
 * }
 *
 * Error Responses:
 * - 404: Touchpoint not found or no photo
 * - 400: Photo not stored in S3
 * - 500: Failed to generate presigned URL
 */
touchpoints.get('/:id/photo-url', authMiddleware, async (c) => {
  try {
    const touchpointId = c.req.param('id');

    // Import storage service
    const { storageService } = await import('../services/storage.js');
    const { cacheService } = await import('../services/cache.js');

    // Check cache first
    const cacheKey = `touchpoint:photo:${touchpointId}`;
    const cachedUrl = await cacheService.get(cacheKey);

    if (cachedUrl) {
      console.log(`[Touchpoints] ✅ Cache HIT for touchpoint ${touchpointId}`);
      return c.json({
        url: cachedUrl,
        cached: true,
        expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
      });
    }

    console.log(`[Touchpoints] ❌ Cache MISS for touchpoint ${touchpointId}, generating...`);

    // Fetch touchpoint photo_url
    const touchpointResult = await pool.query(
      'SELECT photo_url FROM touchpoints WHERE id = $1',
      [touchpointId]
    );

    if (touchpointResult.rows.length === 0) {
      return c.json({ error: 'Touchpoint not found' }, 404);
    }

    const touchpoint = touchpointResult.rows[0];

    if (!touchpoint.photo_url) {
      return c.json({ error: 'Touchpoint has no photo' }, 404);
    }

    // Verify storage provider is S3
    if (storageService.getProvider() !== 's3') {
      return c.json({
        error: 'Presigned URLs only supported for S3 storage',
        storageProvider: storageService.getProvider(),
      }, 400);
    }

    // Extract storage_key from the URL
    // URL format: https://imu.s3.ap-southeast-1.amazonaws.com/touchpoint_photo/2026/04/07/abc.jpg
    // We need to extract: touchpoint_photo/2026/04/07/abc.jpg
    const url = touchpoint.photo_url;
    const storageKeyMatch = url.match(/\.s3\.[^\.]+\.amazonaws\.com\/(.+)$/);

    if (!storageKeyMatch) {
      console.error(`[Touchpoints] ❌ Invalid S3 URL format: ${url}`);
      return c.json({
        error: 'Photo URL is not a valid S3 URL',
        url: url
      }, 400);
    }

    const storageKey = storageKeyMatch[1];

    // Generate presigned URL (5 minute expiry)
    const signedUrl = await storageService.getSignedUrl(storageKey, 300);

    // Cache the URL
    await cacheService.set(cacheKey, signedUrl, 300);

    console.log(`[Touchpoints] ✅ Generated presigned URL for touchpoint ${touchpointId}, cached for 300s`);

    return c.json({
      url: signedUrl,
      cached: false,
      expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
      storageKey: storageKey,
    });
  } catch (error) {
    console.error('[Touchpoints] Error generating photo URL:', error);
    return c.json({ error: 'Failed to generate photo URL' }, 500);
  }
});

export default touchpoints;
