import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';

const addresses = new Hono();

// Validation schemas
const createAddressSchema = z.object({
  psgc_id: z.number().int().positive(),
  label: z.enum(['Home', 'Work', 'Relative', 'Other']),
  street_address: z.string().min(1).max(500),
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
    label: row.label,
    street_address: row.street_address,
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

// GET /api/clients/:id/addresses - List all addresses for client
addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const userId = c.get('user')?.sub;

  // Verify user has access to this client
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND (user_id = $2 OR deleted_at IS NOT NULL)',
    [clientId, userId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found or access denied');
  }

  const result = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.client_id = $1 AND a.deleted_at IS NULL
     ORDER BY a.is_primary DESC, a.created_at ASC`,
    [clientId]
  );

  return c.json({
    success: true,
    data: result.rows.map(mapRowToAddress),
  });
});

// POST /api/clients/:id/addresses - Create new address
addresses.post('/clients/:id/addresses', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const userId = c.get('user')?.sub;
  const body = await c.req.json();

  // Validate input
  const validatedData = createAddressSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid address data').addDetails({ errors: validatedData.error.errors });
  }

  const data = validatedData.data;

  // Verify client exists and user has access
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1',
    [clientId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // If this is the first address, automatically set as primary
  const existingCount = await pool.query(
    'SELECT COUNT(*) FROM addresses WHERE client_id = $1 AND deleted_at IS NULL',
    [clientId]
  );

  const isPrimary = data.is_primary || existingCount.rows[0].count === '0';

  const result = await pool.query(
    `INSERT INTO addresses (client_id, psgc_id, label, street_address, postal_code, latitude, longitude, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [clientId, data.psgc_id, data.label, data.street_address, data.postal_code, data.latitude, data.longitude, isPrimary]
  );

  // Fetch with PSGC data
  const fullResult = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0].id]
  );

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  }, 201);
});

// GET /api/clients/:id/addresses/:addressId - Get single address
addresses.get('/clients/:id/addresses/:addressId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');

  const result = await pool.query(
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.municipality, p.barangay
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

// PUT /api/clients/:id/addresses/:addressId - Update address
addresses.put('/clients/:id/addresses/:addressId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
  const body = await c.req.json();

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

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
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
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0].id]
  );

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  });
});

// DELETE /api/clients/:id/addresses/:addressId - Soft delete address
addresses.delete('/clients/:id/addresses/:addressId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');

  const result = await pool.query(
    'UPDATE addresses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING *',
    [addressId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Address not found');
  }

  return c.json({
    success: true,
    message: 'Address deleted successfully',
  });
});

// PATCH /api/clients/:id/addresses/:addressId/primary - Set as primary
addresses.patch('/clients/:id/addresses/:addressId/primary', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');

  // Check if address exists
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
    `SELECT a.*, p.code as psgc_code, p.region, p.province, p.municipality, p.barangay
     FROM addresses a
     LEFT JOIN psgc p ON a.psgc_id = p.id
     WHERE a.id = $1`,
    [result.rows[0].id]
  );

  return c.json({
    success: true,
    data: mapRowToAddress(fullResult.rows[0]),
  });
});

export default addresses;
