import { pool } from '../db/index.js';
import { z } from 'zod';

// Validation schemas
export const createVisitSchema = z.object({
  id: z.string().uuid('Invalid visit ID format').optional(),
  client_id: z.string().uuid('Invalid client ID format'),
  user_id: z.preprocess(v => (v === '' ? null : v), z.string().uuid('Invalid user ID format').nullish()),
  type: z.enum(['regular_visit', 'release_loan']).default('regular_visit'),
  time_in: z.coerce.date().optional(),
  time_out: z.coerce.date().optional(),
  odometer_arrival: z.preprocess(v => (v === '' ? null : v), z.string().max(50).nullish()),
  odometer_departure: z.preprocess(v => (v === '' ? null : v), z.string().max(50).nullish()),
  photo_url: z.preprocess(v => (v === '' || v == null ? '' : v), z.string()),
  notes: z.preprocess(v => (v === '' ? null : v), z.string().max(5000).nullish()),
  remarks: z.preprocess(v => (v === '' ? null : v), z.string().max(2000).nullish()),
  reason: z.preprocess(v => (v === '' ? null : v), z.string().max(500).nullish()),
  status: z.preprocess(v => (v === '' ? null : v), z.string().max(100).nullish()),
  address: z.preprocess(v => (v === '' ? null : v), z.string().max(500).nullish()),
  latitude: z.preprocess(v => (v === '' ? null : (typeof v === 'string' ? parseFloat(v as string) : v)), z.number().min(-90).max(90).nullish()),
  longitude: z.preprocess(v => (v === '' ? null : (typeof v === 'string' ? parseFloat(v as string) : v)), z.number().min(-180).max(180).nullish()),
  source: z.preprocess(v => (v === '' ? null : v), z.string().max(200).nullish()),
});

export const updateVisitSchema = createVisitSchema.partial();

export interface Visit {
  id?: string;
  client_id: string;
  user_id: string;
  type: 'regular_visit' | 'release_loan';
  time_in?: Date;
  time_out?: Date;
  odometer_arrival?: string;
  odometer_departure?: string;
  photo_url: string;
  notes?: string;
  remarks?: string;
  reason?: string;
  status?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  created_at?: Date;
  updated_at?: Date;
}

// Allowlist of updateable fields to prevent SQL injection
const UPDATEABLE_VISIT_FIELDS = [
  'time_in',
  'time_out',
  'odometer_arrival',
  'odometer_departure',
  'photo_url',
  'notes',
  'remarks',
  'reason',
  'status',
  'address',
  'latitude',
  'longitude',
  'source',
];

export const visitService = {
  async findAll(userId: string, filters: any = {}): Promise<Visit[]> {
    const { type, limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM visits WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  async findByClientId(clientId: string, filters: any = {}): Promise<Visit[]> {
    const { source, limit = 100, offset = 0 } = filters;

    let query = `
      SELECT v.*, u.first_name AS agent_first_name, u.last_name AS agent_last_name
      FROM visits v
      LEFT JOIN users u ON u.id = v.user_id
      WHERE v.client_id = $1
    `;
    const params: any[] = [clientId];
    let paramIndex = 2;

    if (source) {
      query += ` AND v.source = $${paramIndex++}`;
      params.push(source);
    }

    query += ` ORDER BY v.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Visit | null> {
    const result = await pool.query('SELECT * FROM visits WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Visit, 'created_at' | 'updated_at'>): Promise<Visit> {
    // Validate input data
    const validated = createVisitSchema.parse(data);

    const result = await pool.query(
      `INSERT INTO visits (id, client_id, user_id, type, time_in, time_out,
        odometer_arrival, odometer_departure, photo_url, notes, remarks, reason, status,
        address, latitude, longitude, source)
       VALUES (COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET updated_at = visits.updated_at
       RETURNING *`,
      [
        validated.id ?? null,
        validated.client_id, validated.user_id, validated.type, validated.time_in, validated.time_out,
        validated.odometer_arrival, validated.odometer_departure, validated.photo_url,
        validated.notes, validated.remarks ?? null, validated.reason, validated.status, validated.address,
        validated.latitude, validated.longitude, 'IMU'
      ]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Visit>): Promise<Visit | null> {
    // Validate input data
    const validated = updateVisitSchema.parse(data);

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Only allow updates to fields in the allowlist
    Object.entries(validated).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        // Validate field name against allowlist to prevent SQL injection
        if (!UPDATEABLE_VISIT_FIELDS.includes(key)) {
          throw new Error(`Invalid field name: ${key}`);
        }
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await pool.query(
      `UPDATE visits SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM visits WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
