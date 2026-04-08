import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
} from '../errors/index.js';

const phoneNumbers = new Hono();

// Validation schemas
const createPhoneSchema = z.object({
  label: z.enum(['Mobile', 'Home', 'Work']),
  number: z.string().min(1).max(20).regex(/^[\d\s\-\+\(\)]+$/),
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

// GET /api/clients/:id/phone-numbers - List all phone numbers for client
phoneNumbers.get('/clients/:id/phone-numbers', authMiddleware, async (c) => {
  const clientId = c.req.param('id');

  const result = await pool.query(
    `SELECT * FROM phone_numbers
     WHERE client_id = $1 AND deleted_at IS NULL
     ORDER BY is_primary DESC, created_at ASC`,
    [clientId]
  );

  return c.json({
    success: true,
    data: result.rows.map(mapRowToPhoneNumber),
  });
});

// POST /api/clients/:id/phone-numbers - Create new phone number
phoneNumbers.post('/clients/:id/phone-numbers', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const body = await c.req.json();

  // Validate input
  const validatedData = createPhoneSchema.safeParse(body);
  if (!validatedData.success) {
    throw new ValidationError('Invalid phone number data').addDetails({ errors: validatedData.error.errors });
  }

  const data = validatedData.data;

  // Verify client exists
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1',
    [clientId]
  );

  if (clientCheck.rows.length === 0) {
    throw new NotFoundError('Client not found');
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

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  }, 201);
});

// GET /api/clients/:id/phone-numbers/:phoneId - Get single phone number
phoneNumbers.get('/clients/:id/phone-numbers/:phoneId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');

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

// PUT /api/clients/:id/phone-numbers/:phoneId - Update phone number
phoneNumbers.put('/clients/:id/phone-numbers/:phoneId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');
  const body = await c.req.json();

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

  values.push(phoneId);

  const result = await pool.query(
    `UPDATE phone_numbers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  });
});

// DELETE /api/clients/:id/phone-numbers/:phoneId - Soft delete phone number
phoneNumbers.delete('/clients/:id/phone-numbers/:phoneId', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');

  const result = await pool.query(
    'UPDATE phone_numbers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING *',
    [phoneId, clientId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Phone number not found');
  }

  return c.json({
    success: true,
    message: 'Phone number deleted successfully',
  });
});

// PATCH /api/clients/:id/phone-numbers/:phoneId/primary - Set as primary
phoneNumbers.patch('/clients/:id/phone-numbers/:phoneId/primary', authMiddleware, auditMiddleware('client'), async (c) => {
  const clientId = c.req.param('id');
  const phoneId = c.req.param('phoneId');

  // Check if phone exists
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

  return c.json({
    success: true,
    data: mapRowToPhoneNumber(result.rows[0]),
  });
});

export default phoneNumbers;
