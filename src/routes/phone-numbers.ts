import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { apiRateLimit } from '../middleware/rate-limit.js';
import { getCacheService, CACHE_PREFIX, CACHE_TTL } from '../services/cache/redis-cache.js';
import { getCacheMetrics } from '../services/cache/cache-metrics.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
} from '../errors/index.js';

const phoneNumbers = new Hono();

// Apply rate limiting to all phone numbers routes
phoneNumbers.use('/*', apiRateLimit);

// Validation schemas
const createPhoneSchema = z.object({
  label: z.enum(['Mobile', 'Home', 'Work']),
  number: z.string().min(1).max(20).regex(
    // Philippine phone number formats:
    // - Mobile: 09XXXXXXXXX (11 digits starting with 09)
    // - International: +639XXXXXXXXX (12 digits starting with +639)
    // - Landline: Area code (2-4 digits) + 7-8 digit number
    /^(09\d{9}|\+639\d{9}|(0\d{1,4})?\d{7,8})$/,
    'Invalid Philippine phone number format. Mobile: 09XX XXX XXXX, International: +639XX XXX XXXX, Landline: (Area Code) XXX XXXX'
  ),
  is_primary: z.boolean().default(false),
});

const updatePhoneSchema = createPhoneSchema.partial();

// Helper to map DB row to PhoneNumber type
function mapRowToPhoneNumber(row: Record<string, any>) {
  return {
    id: row.id,
    client_id: row.client_id,
    label: row.label,
    number: row.number,
    is_primary: row.is_primary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Cache helpers
const cache = getCacheService();
const metrics = getCacheMetrics();

/**
 * Generate cache key for client phone numbers
 */
function getPhoneNumbersCacheKey(clientId: string, page: number, limit: number): string {
  return `${CACHE_PREFIX.PHONE_NUMBERS}client:${clientId}:page:${page}:limit:${limit}`;
}

/**
 * Generate cache key for single phone number
 */
function getPhoneNumberCacheKey(phoneId: string): string {
  return `${CACHE_PREFIX.PHONE_NUMBERS}${phoneId}`;
}

/**
 * Invalidate all phone number caches for a client
 */
async function invalidateClientPhoneNumbersCache(clientId: string): Promise<void> {
  try {
    await cache.delPattern(`${CACHE_PREFIX.PHONE_NUMBERS}client:${clientId}:*`);
    metrics.recordDelete('phone-numbers');
  } catch (error) {
    console.error('[Phone Numbers Cache] Invalidation error:', error);
  }
}

/**
 * Invalidate single phone number cache
 */
async function invalidatePhoneNumberCache(phoneId: string): Promise<void> {
  try {
    await cache.del(getPhoneNumberCacheKey(phoneId));
    metrics.recordDelete('phone-numbers');
  } catch (error) {
    console.error('[Phone Numbers Cache] Invalidation error:', error);
  }
}

/**
 * GET /api/clients/:id/phone-numbers
 * List all phone numbers for a specific client
 *
 * @param id - Client ID
 * @param page - Page number (optional, default: 1)
 * @param limit - Items per page (optional, default: 50, max: 100)
 * @returns { success: true, data: PhoneNumber[], pagination: object } - Paginated phone numbers
 * @throws {NotFoundError} - If client not found or access denied
 * @throws {ValidationError} - If pagination parameters are invalid
 *
 * Phone numbers are ordered by is_primary DESC, created_at ASC
 * Only returns active phone numbers (deleted_at IS NULL)
 */
phoneNumbers.get('/clients/:id/phone-numbers', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const userId = c.get('user')?.sub;

  // Parse pagination parameters
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  // Check cache first
  const cacheKey = getPhoneNumbersCacheKey(clientId, page, limit);
  const cached = await cache.get(cacheKey);

  if (cached) {
    metrics.recordHit('phone-numbers');
    return c.json(cached);
  }

  metrics.recordMiss('phone-numbers');

  // Verify user has access to this client
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  // I23: Optimize N+1 query - use window function for single query with count
  const result = await pool.query(
    `SELECT *, COUNT(*) OVER() as total_count
     FROM phone_numbers
     WHERE client_id = $1 AND deleted_at IS NULL
     ORDER BY is_primary DESC, created_at ASC
     LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
  const totalPages = Math.ceil(totalCount / limit);

  const response = {
    success: true,
    data: result.rows.map(mapRowToPhoneNumber),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };

  // Store in cache for 5 minutes
  await cache.set(cacheKey, response, CACHE_TTL.SHORT);
  metrics.recordSet('phone-numbers');

  return c.json(response);
});

/**
 * POST /api/clients/:id/phone-numbers
 * Create a new phone number for a client
 *
 * @param id - Client ID
 * @param body - Phone number data
 * @param body.label - Phone label (Mobile, Home, Work)
 * @param body.number - Phone number (Philippine format: 09XX XXX XXXX or +63 XXX XXX XXXX)
 * @param body.is_primary - Set as primary phone number (optional, auto-set if first number)
 * @returns { success: true, data: PhoneNumber } - Created phone number
 * @throws {ValidationError} - If invalid phone number format or validation fails
 * @throws {NotFoundError} - If client not found
 * @throws {ConflictError} - If phone number already exists for this client
 *
 * First phone number is automatically set as primary
 * Phone numbers must be unique per client (validated against existing numbers)
 */
// POST /api/clients/:id/phone-numbers - Create new phone number
phoneNumbers.post('/clients/:id/phone-numbers', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const userId = c.get('user')?.sub;
  const body = await c.req.json();

  // Validate input
  const validatedData = createPhoneSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid phone number data').addDetails({ errors: validatedData.error.errors });
  }

  const data = validatedData.data;

  // Verify client exists and user has access (I3: Security fix - verify ownership)
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  // Check for duplicate number
  const duplicateCheck = await pool.query(
    'SELECT id FROM phone_numbers WHERE client_id = $1 AND number = $2 AND deleted_at IS NULL',
    [clientId, data.number]
  );

  if (duplicateCheck.rows.length > 0) {
    throw new ValidationError('Phone number already exists for this client');
  }

  // If this is the first phone, automatically set as primary
  const existingCount = await pool.query(
    'SELECT COUNT(*) FROM phone_numbers WHERE client_id = $1 AND deleted_at IS NULL',
    [clientId]
  );

  const isPrimary = data.is_primary || existingCount.rows[0].count === '0';

  const result = await pool.query(
    `INSERT INTO phone_numbers (client_id, label, number, is_primary)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clientId, data.label, data.number, isPrimary]
  );

  // Invalidate cache for this client's phone numbers
  await invalidateClientPhoneNumbersCache(clientId);

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  }, 201);
});

// GET /api/clients/:id/phone-numbers/:phoneId - Get single phone number
phoneNumbers.get('/clients/:id/phone-numbers/:phoneId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');
  const userId = c.get('user')?.sub;

  // Verify user owns this client (I1: Security fix)
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  const result = await pool.query(
    'SELECT * FROM phone_numbers WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
    [phoneId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Phone number not found');
  }

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  });
});

/**
 * PUT /api/clients/:id/phone-numbers/:phoneId
 * Update an existing phone number
 *
 * @param id - Client ID
 * @param phoneId - Phone number ID
 * @param body - Partial phone number data to update
 * @returns { success: true, data: PhoneNumber } - Updated phone number
 * @throws {ValidationError} - If validation fails or no fields to update
 * @throws {NotFoundError} - If phone number not found
 * @throws {ConflictError} - If new phone number already exists for this client
 *
 * Only whitelisted fields can be updated: label, number, is_primary
 */
// PUT /api/clients/:id/phone-numbers/:phoneId - Update phone number
phoneNumbers.put('/clients/:id/phone-numbers/:phoneId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');
  const body = await c.req.json();

  if (!clientId || !phoneId) {
    throw new ValidationError('Client ID and Phone ID are required');
  }

  // Validate input
  const validatedData = updatePhoneSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid phone number data').addDetails({ errors: validatedData.error.errors });
  }

  const data = validatedData.data;

  // Check if phone exists
  const existing = await pool.query(
    'SELECT * FROM phone_numbers WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
    [phoneId, clientId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Phone number not found');
  }

  // Check for duplicate number (if updating number)
  if (data.number) {
    const duplicateCheck = await pool.query(
      'SELECT id FROM phone_numbers WHERE client_id = $1 AND number = $2 AND id != $3 AND deleted_at IS NULL',
      [clientId, data.number, phoneId]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new ValidationError('Phone number already exists for this client');
    }
  }

  // Build update query dynamically with whitelist
  const ALLOWED_UPDATE_FIELDS = ['label', 'number', 'is_primary'];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && ALLOWED_UPDATE_FIELDS.includes(key)) {
      updates.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  });

  if (updates.length === 0) {
    throw new ValidationError('No fields to update');
  }

  values.push(phoneId);

  const result = await pool.query(
    `UPDATE phone_numbers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  // Invalidate cache for this client's phone numbers and this specific phone number
  await invalidateClientPhoneNumbersCache(clientId);
  await invalidatePhoneNumberCache(phoneId);

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  });
});

/**
 * DELETE /api/clients/:id/phone-numbers/:phoneId
 * Soft delete a phone number (sets deleted_at timestamp)
 *
 * @param id - Client ID
 * @param phoneId - Phone number ID
 * @returns { success: true, message: string }
 * @throws {NotFoundError} - If phone number not found or doesn't belong to client
 *
 * Soft delete preserves data for recovery. Phone number won't appear in API responses.
 */
// DELETE /api/clients/:id/phone-numbers/:phoneId - Soft delete phone number
phoneNumbers.delete('/clients/:id/phone-numbers/:phoneId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');

  if (!clientId || !phoneId) {
    throw new ValidationError('Client ID and Phone ID are required');
  }

  const result = await pool.query(
    'UPDATE phone_numbers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING *',
    [phoneId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Phone number not found');
  }

  // Invalidate cache for this client's phone numbers and this specific phone number
  await invalidateClientPhoneNumbersCache(clientId);
  await invalidatePhoneNumberCache(phoneId);

  return c.json({
    success: true,
    message: 'Phone number deleted successfully',
  });
});

/**
 * PATCH /api/clients/:id/phone-numbers/:phoneId/primary
 * Set a phone number as the primary phone number for a client
 *
 * @param id - Client ID
 * @param phoneId - Phone number ID to set as primary
 * @returns { success: true, data: PhoneNumber } - Updated primary phone number
 * @throws {NotFoundError} - If client not found, access denied, or phone number not found
 *
 * Database trigger automatically unsets is_primary on all other phone numbers for this client
 * Only one primary phone number per client is allowed
 */
// PATCH /api/clients/:id/phone-numbers/:phoneId/primary - Set as primary
phoneNumbers.patch('/clients/:id/phone-numbers/:phoneId/primary', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');
  const userId = c.get('user')?.sub;

  if (!clientId || !phoneId) {
    throw new ValidationError('Client ID and Phone ID are required');
  }

  // Verify user owns this client
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  // Check if phone exists and belongs to client
  const existing = await pool.query(
    'SELECT * FROM phone_numbers WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
    [phoneId, clientId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Phone number not found');
  }

  // Set as primary (trigger will handle unsetting others)
  const result = await pool.query(
    'UPDATE phone_numbers SET is_primary = true WHERE id = $1 RETURNING *',
    [phoneId]
  );

  // Invalidate cache for this client's phone numbers (all phone numbers affected by primary change)
  await invalidateClientPhoneNumbersCache(clientId);

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  });
});

export default phoneNumbers;
