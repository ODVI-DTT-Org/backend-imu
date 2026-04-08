import { db } from '../db/database';

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
  created_at?: Date;
  updated_at?: Date;
}

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

    const result = await db.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Release | null> {
    const result = await db.query('SELECT * FROM releases WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Release, 'id' | 'created_at' | 'updated_at'>): Promise<Release> {
    const result = await db.query(
      `INSERT INTO releases (client_id, user_id, visit_id, product_type, loan_type, amount, approval_notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.client_id, data.user_id, data.visit_id, data.product_type,
       data.loan_type, data.amount, data.approval_notes, data.status || 'pending']
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Release>): Promise<Release | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const result = await db.query(
      `UPDATE releases SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async approve(id: string, userId: string, notes?: string): Promise<Release | null> {
    return this.update(id, { status: 'approved' });
  },

  async reject(id: string, userId: string, notes?: string): Promise<Release | null> {
    return this.update(id, { status: 'rejected' });
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM releases WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
