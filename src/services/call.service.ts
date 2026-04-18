import { pool } from '../db/index.js';
import { z } from 'zod';

// Validation schemas
export const createCallSchema = z.object({
  client_id: z.string().uuid('Invalid client ID format'),
  user_id: z.string().uuid('Invalid user ID format'),
  phone_number: z.string().min(10, 'Phone number must be at least 10 digits').max(20),
  dial_time: z.coerce.date().optional(),
  duration: z.number().int().min(0).max(7200).optional(),  // Max 2 hours in seconds
  notes: z.string().max(5000).optional(),
  reason: z.string().max(500).optional(),
  status: z.string().max(100).optional(),
  photo_url: z.string().max(2048).optional().nullable(),
});

export const updateCallSchema = createCallSchema.partial();

export interface Call {
  id?: string;
  client_id: string;
  user_id: string;
  phone_number: string;
  dial_time?: Date;
  duration?: number;
  notes?: string;
  reason?: string;
  status?: string;
  photo_url?: string | null;
  source?: string;
  created_at?: Date;
  updated_at?: Date;
}

// Allowlist of updateable fields to prevent SQL injection
const UPDATEABLE_CALL_FIELDS = [
  'dial_time',
  'duration',
  'notes',
  'reason',
  'status',
  'photo_url',
];

export const callService = {
  async findAll(userId: string, filters: any = {}): Promise<Call[]> {
    const { limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM calls WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    query += ` ORDER BY dial_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  async findByClientId(clientId: string, filters: any = {}): Promise<Call[]> {
    const { source, limit = 100, offset = 0 } = filters;

    let query = `
      SELECT c.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name
      FROM calls c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.client_id = $1
    `;
    const params: any[] = [clientId];
    let paramIndex = 2;

    if (source) {
      query += ` AND c.source = $${paramIndex++}`;
      params.push(source);
    }

    query += ` ORDER BY c.dial_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Call | null> {
    const result = await pool.query('SELECT * FROM calls WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Call, 'id' | 'created_at' | 'updated_at'>): Promise<Call> {
    // Validate input data
    const validated = createCallSchema.parse(data);

    const result = await pool.query(
      `INSERT INTO calls (client_id, user_id, phone_number, dial_time, duration, notes, reason, status, photo_url, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'IMU')
       RETURNING *`,
      [validated.client_id, validated.user_id, validated.phone_number, validated.dial_time,
       validated.duration, validated.notes, validated.reason, validated.status, validated.photo_url ?? null]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Call>): Promise<Call | null> {
    // Validate input data
    const validated = updateCallSchema.parse(data);

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Only allow updates to fields in the allowlist
    Object.entries(validated).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        // Validate field name against allowlist to prevent SQL injection
        if (!UPDATEABLE_CALL_FIELDS.includes(key)) {
          throw new Error(`Invalid field name: ${key}`);
        }
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await pool.query(
      `UPDATE calls SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM calls WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
