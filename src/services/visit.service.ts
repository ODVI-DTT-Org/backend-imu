import { db } from '../db/database';

export interface Visit {
  id?: string;
  client_id: string;
  user_id: string;
  type: 'regular_visit' | 'release_loan';
  time_in?: Date;
  time_out?: Date;
  odometer_arrival?: string;
  odometer_departure?: string;
  photo_url?: string;
  notes?: string;
  reason?: string;
  status?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  created_at?: Date;
  updated_at?: Date;
}

export const visitService = {
  async findAll(userId: string, filters: any = {}): Promise<Visit[]> {
    const { client_id, type, limit = 50, offset = 0 } = filters;

    let query = 'SELECT * FROM visits WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (client_id) {
      query += ` AND client_id = $${paramIndex++}`;
      params.push(client_id);
    }
    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  },

  async findById(id: string): Promise<Visit | null> {
    const result = await db.query('SELECT * FROM visits WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data: Omit<Visit, 'id' | 'created_at' | 'updated_at'>): Promise<Visit> {
    const result = await db.query(
      `INSERT INTO visits (client_id, user_id, type, time_in, time_out,
        odometer_arrival, odometer_departure, photo_url, notes, reason, status,
        address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        data.client_id, data.user_id, data.type, data.time_in, data.time_out,
        data.odometer_arrival, data.odometer_departure, data.photo_url,
        data.notes, data.reason, data.status, data.address, data.latitude, data.longitude
      ]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<Visit>): Promise<Visit | null> {
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
      `UPDATE visits SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM visits WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
};
