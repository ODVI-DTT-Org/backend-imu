import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { requirePermission } from '../middleware/permissions.js';
import { apiRateLimit } from '../middleware/rate-limit.js';
import { getCacheService, CACHE_PREFIX, CACHE_TTL } from '../services/cache/redis-cache.js';
import { getCacheMetrics } from '../services/cache/cache-metrics.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';

const addresses = new Hono();

// Apply rate limiting to all addresses routes
addresses.use('/*', apiRateLimit);

// Validation schemas
const createAddressSchema = z.object({
  psgc_id: z.number().int().positive().optional(),
  type: z.enum(['Home', 'Work', 'Relative', 'Other']),
  street: z.string().min(1).max(500),
  barangay: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  province: z.string().max(200).optional(),
  postal_code: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  is_primary: z.boolean().default(false),
});

const updateAddressSchema = createAddressSchema.partial();

// Helper to map DB row to Address type
function mapRowToAddress(row: Record<string, any>) {
  return {
    id: row.id,
    client_id: row.client_id,
    psgc_id: row.psgc_id,
    type: row.type,
    street: row.street,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    postal_code: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    is_primary: row.is_primary,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Include PSGC data
    psgc: row.psgc_code ? {
      id: row.psgc_id,
      code: row.psgc_code,
      region: row.region,
      province: row.province,
      municipality: row.municipality,
      barangay: row.barangay,
    } : null,
  };
}

// Cache helpers
const cache = getCacheService();
const metrics = getCacheMetrics();

/**
 * Generate cache key for client addresses
 */
function getAddressesCacheKey(clientId: string, page: number, limit: number): string {
  return `${CACHE_PREFIX.ADDRESSES}client:${clientId}:page:${page}:limit:${limit}`;
}

/**
 * Generate cache key for single address
 */
function getAddressCacheKey(addressId: string): string {
  return `${CACHE_PREFIX.ADDRESSES}${addressId}`;
}

/**
 * Invalidate all address caches for a client
 */
async function invalidateClientAddressesCache(clientId: string): Promise<void> {
  try {
    await cache.delPattern(`${CACHE_PREFIX.ADDRESSES}client:${clientId}:*`);
    metrics.recordDelete('addresses');
  } catch (error) {
    console.error('[Addresses Cache] Invalidation error:', error);
  }
}

/**
 * Invalidate single address cache
 */
async function invalidateAddressCache(addressId: string): Promise<void> {
  try {
    await cache.del(getAddressCacheKey(addressId));
    metrics.recordDelete('addresses');
  } catch (error) {
    console.error('[Addresses Cache] Invalidation error:', error);
  }
}

/**
 * GET /api/clients/:id/addresses
 * List all addresses for a specific client
 *
 * @param id - Client ID
 * @param page - Page number (optional, default: 1)
 * @param limit - Items per page (optional, default: 50, max: 100)
 * @returns { success: true, data: Address[], pagination: object } - Paginated addresses with PSGC data
 * @throws {NotFoundError} - If client not found or access denied
 * @throws {ValidationError} - If pagination parameters are invalid
 *
 * Addresses are ordered by is_primary DESC, created_at ASC
 * Only returns active addresses (deleted_at IS NULL)
 */
addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  if (!clientId) {
    throw new ValidationError('Client ID is required');
  }
  const userId = c.get('user')?.sub;

  // Parse pagination parameters
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  // Check cache first
  const cacheKey = getAddressesCacheKey(clientId, page, limit);
  const cached = await cache.get(cacheKey);

  if (cached) {
    metrics.recordHit('addresses');
    return c.json(cached);
  }

  metrics.recordMiss('addresses');

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
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.mun_city as municipality, p.barangay,
            COUNT(*) OVER() as total_count
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.client_id = $1 AND a.deleted_at IS NULL
     ORDER BY a.is_primary DESC, a.created_at ASC
     LIMIT $2 OFFSET $3`,
    [clientId, limit, offset]
  );

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
  const totalPages = Math.ceil(totalCount / limit);

  const response = {
    success: true,
    data: result.rows.map(mapRowToAddress),
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
  metrics.recordSet('addresses');

  return c.json(response);
});

/**
 * POST /api/clients/:id/addresses
 * Create a new address for a client
 *
 * @param id - Client ID
 * @param body - Address data
 * @param body.label - Address label (Home, Work, Relative, Other)
 * @param body.street_address - Street address
 * @param body.postal_code - Postal code (optional)
 * @param body.psgc_id - PSGC ID (must exist in PSGC table)
 * @param body.latitude - GPS latitude (optional)
 * @param body.longitude - GPS longitude (optional)
 * @param body.is_primary - Set as primary address (optional, auto-set if first address)
 * @returns { success: true, data: Address } - Created address with PSGC data
 * @throws {ValidationError} - If invalid PSGC ID or validation fails
 * @throws {NotFoundError} - If client not found
 *
 * First address is automatically set as primary
 * Only one address per label per client (enforced by unique constraint)
 */
// POST /api/clients/:id/addresses - Create new address
addresses.post('/clients/:id/addresses', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const userId = c.get('user')?.sub;
  const body = await c.req.json();

  if (!clientId) {
    throw new ValidationError('Client ID is required');
  }

  // Validate input
  const validatedData = createAddressSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid address data').addDetails({ errors: validatedData.error.errors });
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

  // Verify PSGC exists
  const psgcCheck = await pool.query(
    'SELECT id FROM psgc WHERE id = $1',
    [data.psgc_id]
  );

  if (psgcCheck.rows.length === 0) {
    throw new ValidationError('Invalid PSGC ID - geographic location not found');
  }

  // If this is the first address, automatically set as primary
  const existingCount = await pool.query(
    'SELECT COUNT(*) FROM addresses WHERE client_id = $1 AND deleted_at IS NULL',
    [clientId]
  );

  const isPrimary = data.is_primary || existingCount.rows[0].count === '0';

  const result = await pool.query(
    `INSERT INTO addresses (client_id, type, street, barangay, city, province, postal_code, latitude, longitude, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [clientId, data.type, data.street, data.barangay, data.city, data.province, data.postal_code, data.latitude, data.longitude, isPrimary]
  );

  // Fetch with PSGC data
  const fullResult = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.mun_city as municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0]!.id!]
  );

  // Invalidate cache for this client's addresses
  await invalidateClientAddressesCache(clientId);

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  }, 201);
});

// GET /api/clients/:id/addresses/:addressId - Get single address
addresses.get('/clients/:id/addresses/:addressId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
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
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.mun_city as municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1 AND a.client_id = $2 AND a.deleted_at IS NULL`,
    [addressId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Address not found');
  }

  return c.json({
    success: true,
    data: mapRowToAddress(result.rows[0]),
  });
});

/**
 * PUT /api/clients/:id/addresses/:addressId
 * Update an existing address
 *
 * @param id - Client ID
 * @param addressId - Address ID
 * @param body - Partial address data to update
 * @returns { success: true, data: Address } - Updated address with PSGC data
 * @throws {ValidationError} - If validation fails or no fields to update
 * @throws {NotFoundError} - If address not found
 *
 * Only whitelisted fields can be updated: label, street_address, postal_code, latitude, longitude, is_primary
 */
// PUT /api/clients/:id/addresses/:addressId - Update address
addresses.put('/clients/:id/addresses/:addressId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
  const body = await c.req.json();

  if (!clientId || !addressId) {
    throw new ValidationError('Client ID and Address ID are required');
  }

  // Validate input
  const validatedData = updateAddressSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid address data').addDetails({ errors: validatedData.error.errors });
  }

  const data = validatedData.data;

  // Check if address exists
  const existing = await pool.query(
    'SELECT * FROM addresses WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
    [addressId, clientId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Address not found');
  }

  // Build update query dynamically with whitelist
  const ALLOWED_UPDATE_FIELDS = ['type', 'street', 'barangay', 'city', 'province', 'postal_code', 'latitude', 'longitude', 'is_primary'];
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

  values.push(addressId);

  const result = await pool.query(
    `UPDATE addresses SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  // Fetch with PSGC data
  const fullResult = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.mun_city as municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0]!.id!]
  );

  // Invalidate cache for this client's addresses and this specific address
  await invalidateClientAddressesCache(clientId);
  await invalidateAddressCache(addressId);

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  });
});

/**
 * DELETE /api/clients/:id/addresses/:addressId
 * Soft delete an address (sets deleted_at timestamp)
 *
 * @param id - Client ID
 * @param addressId - Address ID
 * @returns { success: true, message: string }
 * @throws {NotFoundError} - If address not found or doesn't belong to client
 *
 * Soft delete preserves data for recovery. Address won't appear in API responses.
 */
// DELETE /api/clients/:id/addresses/:addressId - Soft delete address
addresses.delete('/clients/:id/addresses/:addressId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');

  if (!clientId || !addressId) {
    throw new ValidationError('Client ID and Address ID are required');
  }

  const result = await pool.query(
    'UPDATE addresses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING *',
    [addressId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Address not found');
  }

  // Invalidate cache for this client's addresses and this specific address
  await invalidateClientAddressesCache(clientId);
  await invalidateAddressCache(addressId);

  return c.json({
    success: true,
    message: 'Address deleted successfully',
  });
});

/**
 * PATCH /api/clients/:id/addresses/:addressId/primary
 * Set an address as the primary address for a client
 *
 * @param id - Client ID
 * @param addressId - Address ID to set as primary
 * @returns { success: true, data: Address } - Updated primary address with PSGC data
 * @throws {NotFoundError} - If client not found, access denied, or address not found
 *
 * Database trigger automatically unsets is_primary on all other addresses for this client
 * Only one primary address per client is allowed
 */
// PATCH /api/clients/:id/addresses/:addressId/primary - Set as primary
addresses.patch('/clients/:id/addresses/:addressId/primary', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
  const userId = c.get('user')?.sub;

  if (!clientId || !addressId) {
    throw new ValidationError('Client ID and Address ID are required');
  }

  // Verify user owns this client
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  // Check if address exists and belongs to client
  const existing = await pool.query(
    'SELECT * FROM addresses WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
    [addressId, clientId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Address not found');
  }

  // Set as primary (trigger will handle unsetting others)
  const result = await pool.query(
    'UPDATE addresses SET is_primary = true WHERE id = $1 RETURNING *',
    [addressId]
  );

  // Fetch with PSGC data
  const fullResult = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.mun_city as municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0]!.id!]
  );

  // Invalidate cache for this client's addresses (all addresses affected by primary change)
  await invalidateClientAddressesCache(clientId);

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  });
});

export default addresses;
