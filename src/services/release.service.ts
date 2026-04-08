import { pool } from '../db/index.js';
import { z } from 'zod';

// Validation schemas
export const createReleaseSchema = z.object({
  client_id: z.string().uuid('Invalid client ID format'),
  user_id: z.string().uuid('Invalid user ID format'),
  visit_id: z.string().uuid('Invalid visit ID format'),
  product_type: z.enum(['PUSU', 'LIKA', 'SUB2K'], {
    errorMap: () => ({ message: 'Product type must be one of: PUSU, LIKA, SUB2K' })
  }),
  loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM'], {
    errorMap: () => ({ message: 'Loan type must be one of: NEW, ADDITIONAL, RENEWAL, PRETERM' })
  }),
  amount: z.number().positive('Amount must be positive').max(999999999.99, 'Amount exceeds maximum'),
  approval_notes: z.string().max(2000).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'disbursed']).default('pending'),
});

export const updateReleaseSchema = createReleaseSchema.partial().extend({
  approved_by: z.string().uuid().optional(),
  approved_at: z.coerce.date().optional(),
});

export interface Release {
  id?: string;
  client_id: string;
  user_id: string;
  visit_id: string;
  product_type: 'PUSU' | 'LIKA' | 'SUB2K';
  loan_type: 'NEW' | 'ADDITIONAL' | 'RENEWAL' | 'PRETERM';
  amount: number;
  approval_notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'disbursed';
  approved_by?: string;  // User ID of approver
  approved_at?: Date;    // Approval timestamp
  created_at?: Date;
  updated_at?: Date;
}

// Allowlist of updateable fields to prevent SQL injection
const UPDATEABLE_RELEASE_FIELDS = [
  'product_type',
  'loan_type',
  'amount',
  'approval_notes',
  'status',
  'approved_by',
  'approved_at',
];

export const releaseService = {
  async findAll(userId: string, filters: any = {}): Promise<Release[]> {
    const { client_id, status, product_type, loan_type, limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM releases WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (client_id) {
      query += ` AND client_id = $${paramIndex++}`;
      params.push(client_id);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (product_type) {
      query += ` AND product_type = $${paramIndex++}`;
      params.push(product_type);
    }
    if (loan_type) {
      query += ` AND loan_type = $${paramIndex++}`;
      params.push(loan_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Release | null> {
    const result = await pool.query('SELECT * FROM releases WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Release, 'id' | 'created_at' | 'updated_at' | 'approved_by' | 'approved_at'>): Promise<Release> {
    // Validate input data
    const validated = createReleaseSchema.parse(data);

    const result = await pool.query(
      `INSERT INTO releases (client_id, user_id, visit_id, product_type, loan_type, amount, approval_notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [validated.client_id, validated.user_id, validated.visit_id, validated.product_type,
       validated.loan_type, validated.amount, validated.approval_notes, validated.status]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Release>): Promise<Release | null> {
    // Validate input data (allows audit fields too)
    const validated = updateReleaseSchema.parse(data);

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Only allow updates to fields in the allowlist
    Object.entries(validated).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        // Validate field name against allowlist to prevent SQL injection
        if (!UPDATEABLE_RELEASE_FIELDS.includes(key)) {
          throw new Error(`Invalid field name: ${key}`);
        }
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await pool.query(
      `UPDATE releases SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async approve(id: string, userId: string, notes?: string): Promise<Release | null> {
    return this.update(id, { status: 'approved', approved_by: userId, approved_at: new Date() });
  },

  async reject(id: string, userId: string, notes?: string): Promise<Release | null> {
    return this.update(id, { status: 'rejected', approved_by: userId, approved_at: new Date() });
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM releases WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
