import { pool } from '../db/index.js';
import { z } from 'zod';

/**
 * Thrown when a new visit's odometer_arrival is less than the most-recent
 * non-null odometer_arrival for the same user on the same Manila day.
 */
export class OdometerBelowPreviousError extends Error {
  public readonly previous: string;
  public readonly current: string;

  constructor(previous: string, current: string) {
    super(`Odometer arrival must be at least ${previous}.`);
    this.name = 'OdometerBelowPreviousError';
    this.previous = previous;
    this.current = current;
  }
}

/**
 * Compute server-side odometer fields for a new visit per spec:
 *
 * First visit of the day (no prior same-day visit by this user):
 *   kilometers_traveled = '0'
 *
 * Subsequent visits:
 *   kilometers_traveled = current.arrival - previous.arrival
 *
 * odometer_departure is always null — it is no longer stored.
 *
 * "Same day" is scoped by time_in::date; falls back to CURRENT_DATE when
 * time_in is not provided.
 */
export async function computeOdometerFields(
  userId: string,
  currentArrival: string | null | undefined,
  visitDate: Date | string | undefined,
  dbClient: { query: (text: string, values?: any[]) => Promise<{ rows: any[] }> } = pool,
): Promise<{ departure: null; km: string }> {
  // If arrival is absent we cannot compute anything meaningful.
  if (!currentArrival || currentArrival.trim() === '') {
    console.warn(`[visit.service] odometer_arrival is blank for user ${userId} — leaving km as '0'`);
    return { departure: null, km: '0' };
  }

  // Determine the calendar date to scope the query.
  let dateParam: string | null = null;
  if (visitDate) {
    const d = typeof visitDate === 'string' ? new Date(visitDate) : visitDate;
    if (!isNaN(d.getTime())) {
      dateParam = d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    }
  }

  const result = await dbClient.query(
    `SELECT odometer_arrival
     FROM visits
     WHERE user_id = $1
       AND (
         CASE WHEN $2::date IS NULL
              THEN time_in::date = CURRENT_DATE
              ELSE time_in::date = $2::date
         END
       )
       AND odometer_arrival IS NOT NULL
       AND odometer_arrival != ''
     ORDER BY time_in DESC, created_at DESC
     LIMIT 1`,
    [userId, dateParam],
  );

  // No prior same-day visit → first visit of the day.
  if (result.rows.length === 0) {
    return { departure: null, km: '0' };
  }

  const prevArrivalRaw = result.rows[0].odometer_arrival as string;
  const prevArrival = parseFloat(prevArrivalRaw);
  const currArrival = parseFloat(currentArrival);

  if (!Number.isFinite(prevArrival) || !Number.isFinite(currArrival)) {
    return { departure: null, km: '0' };
  }

  // Monotonic odometer check: new arrival must not be less than previous.
  if (currArrival < prevArrival) {
    throw new OdometerBelowPreviousError(prevArrivalRaw, currentArrival);
  }

  // km = current.arrival - previous.arrival (first-principles spec).
  const km = currArrival - prevArrival;

  return {
    departure: null,
    km: km.toString(),
  };
}

/**
 * Kept for backward compatibility with touchpoints.ts which imports this.
 * Delegates to computeOdometerFields internally.
 *
 * @deprecated Use computeOdometerFields() directly for new code.
 */
export async function computeOdometerDeparture(
  userId: string,
  visitDate: Date | string | undefined,
  dbClient: { query: (text: string, values?: any[]) => Promise<{ rows: any[] }> } = pool,
): Promise<string> {
  // Legacy callers don't have currentArrival available here, so we can only
  // return the previous visit's arrival (the old behaviour). This shim exists
  // so touchpoints.ts doesn't need a simultaneous refactor.
  let dateParam: string | null = null;
  if (visitDate) {
    const d = typeof visitDate === 'string' ? new Date(visitDate) : visitDate;
    if (!isNaN(d.getTime())) {
      dateParam = d.toISOString().slice(0, 10);
    }
  }
  const result = await dbClient.query(
    `SELECT odometer_arrival
     FROM visits
     WHERE user_id = $1
       AND (
         CASE WHEN $2::date IS NULL
              THEN time_in::date = CURRENT_DATE
              ELSE time_in::date = $2::date
         END
       )
       AND odometer_arrival IS NOT NULL
       AND odometer_arrival != ''
     ORDER BY time_in DESC, created_at DESC
     LIMIT 1`,
    [userId, dateParam],
  );
  return result.rows.length > 0 ? (result.rows[0].odometer_arrival as string) : '0';
}

/**
 * @deprecated Use computeOdometerFields() which computes both values together.
 */
export function computeKilometersTraveled(
  currentArrival: string | null | undefined,
  departure: string | null | undefined,
): string {
  if (!currentArrival || !departure) return '0';
  const arr = parseFloat(currentArrival);
  const dep = parseFloat(departure);
  if (!Number.isFinite(arr) || !Number.isFinite(dep)) return '0';
  const delta = arr - dep;
  return (delta > 0 ? delta : 0).toString();
}

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
  // Structured location fields from PSGC data
  barangay: z.preprocess(v => (v === '' ? null : v), z.string().max(200).nullish()),
  municipality: z.preprocess(v => (v === '' ? null : v), z.string().max(200).nullish()),
  province: z.preprocess(v => (v === '' ? null : v), z.string().max(200).nullish()),
  region: z.preprocess(v => (v === '' ? null : v), z.string().max(200).nullish()),
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
  // Structured location fields
  barangay?: string;
  municipality?: string;
  province?: string;
  region?: string;
  created_at?: Date;
  updated_at?: Date;
}

// Allowlist of updateable fields to prevent SQL injection.
// NOTE: odometer_departure is intentionally excluded — it is server-computed
// on create and should not be overwritten by client-supplied values.
const UPDATEABLE_VISIT_FIELDS = [
  'time_in',
  'time_out',
  'odometer_arrival',
  'photo_url',
  'notes',
  'remarks',
  'reason',
  'status',
  'address',
  'latitude',
  'longitude',
  'source',
  // Structured location fields
  'barangay',
  'municipality',
  'province',
  'region',
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

    // Auto-compute odometer fields per spec. Client-supplied departure is ignored.
    const { departure: computedDeparture, km: computedKm } = await computeOdometerFields(
      validated.user_id as string,
      validated.odometer_arrival as string | null | undefined,
      validated.time_in,
    );

    const result = await pool.query(
      `INSERT INTO visits (id, client_id, user_id, type, time_in, time_out,
        odometer_arrival, odometer_departure, kilometers_traveled, photo_url, remarks, reason, status,
        address, latitude, longitude, source, barangay, municipality, province, region)
       VALUES (COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       ON CONFLICT (id) DO UPDATE SET updated_at = visits.updated_at
       RETURNING *`,
      [
        validated.id ?? null,
        validated.client_id, validated.user_id, validated.type, validated.time_in, validated.time_out,
        validated.odometer_arrival, null /* odometer_departure: always null per spec */, computedKm, validated.photo_url,
        validated.remarks ?? validated.notes ?? null, validated.reason, validated.status, validated.address,
        validated.latitude, validated.longitude, validated.source ?? 'IMU',
        validated.barangay, validated.municipality, validated.province, validated.region
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
