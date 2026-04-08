import { db } from '../db/database';

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
  created_at?: Date;
  updated_at?: Date;
}

export const callService = {
  async findAll(userId: string, filters: any = {}): Promise<Call[]> {
    const { client_id, limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM calls WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (client_id) {
      query += ` AND client_id = $${paramIndex++}`;
      params.push(client_id);
    }

    query += ` ORDER BY dial_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Call | null> {
    const result = await db.query('SELECT * FROM calls WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Call, 'id' | 'created_at' | 'updated_at'>): Promise<Call> {
    const result = await db.query(
      `INSERT INTO calls (client_id, user_id, phone_number, dial_time, duration, notes, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data.client_id, data.user_id, data.phone_number, data.dial_time,
       data.duration, data.notes, data.reason, data.status]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Call>): Promise<Call | null> {
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
      `UPDATE calls SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM calls WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
