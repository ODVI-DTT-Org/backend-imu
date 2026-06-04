import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';
import { getCacheService } from '../services/cache/redis-cache.js';

const itineraries = new Hono();

// Validation schemas
const createItinerarySchema = z.object({
  user_id: z.string().uuid(),
  client_ids: z.array(z.string().uuid()).min(1, 'At least one client is required'),
  scheduled_date: z.string(),
  scheduled_time: z.string().optional(),
  status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).default('pending'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  notes: z.string().optional(),
});

const updateItinerarySchema = createItinerarySchema.partial();

const bulkCreateItinerarySchema = z.object({
  caravan_ids: z.array(z.string().uuid()).min(1),
  client_ids: z.array(z.string().uuid()).min(1),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

// Helper to map DB row to Itinerary type
function mapRowToItinerary(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    client_id: row.client_id,
    title: row.title,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    is_recurring: row.is_recurring ?? false,
    recurring_pattern: row.recurring_pattern ?? undefined,
    created: row.created_at,
    updated: row.updated_at,
    created_by: row.created_by,
    expand: row.expand,
  };
}

// GET /api/itineraries - List itineraries with filters
itineraries.get('/', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const clientId = c.req.query('client_id');
    const status = c.req.query('status');
    const date = c.req.query('date');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const userId = c.req.query('user_id');
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Role-based filtering - filter by user_id or municipality
    if (user.role === 'caravan') {
      // Filter by user_id (itineraries assigned to this user)
      conditions.push(`i.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    } else if (userId) {
      // Managers can filter by user_id
      conditions.push(`i.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (clientId) {
      conditions.push(`i.client_id = $${paramIndex}`);
      params.push(clientId);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`i.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (date) {
      conditions.push(`i.scheduled_date = $${paramIndex}`);
      params.push(date);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`i.scheduled_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`i.scheduled_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (municipality) {
      conditions.push(`c.municipality_id = $${paramIndex}`);
      params.push(municipality);
      paramIndex++;
    }

    if (province) {
      conditions.push(`c.province = $${paramIndex}`);
      params.push(province);
      paramIndex++;
    }

    const caravanIdsParam = c.req.query('caravan_ids');
    if (caravanIdsParam) {
      const ids = caravanIdsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        conditions.push(`i.user_id = ANY($${paramIndex}::uuid[])`);
        params.push(ids);
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM itineraries i ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results with expanded relations
    const result = await pool.query(
      `SELECT i.*,
              c.first_name as client_first_name, c.last_name as client_last_name,
              c.middle_name as client_middle_name,
              c.municipality as client_municipality,
              c.full_address as client_full_address,
              c.region as client_region,
              c.province as client_province,
              c.barangay as client_barangay,
              u.first_name as user_first_name, u.last_name as user_last_name,
              cb.first_name as created_by_first_name, cb.last_name as created_by_last_name
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN users cb ON cb.id = i.created_by
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const items = result.rows.map(row => {
      // Calculate display_name for client: "Surname, First Name MiddleName"
      const middleName = row.client_middle_name || '';
      const nameParts = [row.client_first_name, middleName].filter((p: string) => p && p.trim().length > 0);
      const clientDisplayName = `${row.client_last_name}, ${nameParts.join(' ')}`;

      return {
        ...mapRowToItinerary(row),
        full_name: clientDisplayName, // ✅ ADD full_name at root level
        expand: {
          client_id: {
            id: row.client_id,
            first_name: row.client_first_name,
            last_name: row.client_last_name,
            middle_name: row.client_middle_name,
            display_name: clientDisplayName,
            full_address: row.client_full_address,
            region: row.client_region,
            province: row.client_province,
            municipality: row.client_municipality,
            barangay: row.client_barangay,
          },
          user_id: row.user_id ? {
            id: row.user_id,
            first_name: row.user_first_name,
            last_name: row.user_last_name,
          } : undefined,
          created_by: row.created_by ? {
            id: row.created_by,
            name: `${row.created_by_first_name} ${row.created_by_last_name}`,
          } : undefined,
        },
      };
    });

    return c.json({
      items,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch itineraries error:', error);
    throw new Error();
  }
});

// GET /api/itineraries/:id - Get single itinerary
itineraries.get('/:id', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT i.*,
              c.first_name as client_first_name, c.middle_name as client_middle_name, c.last_name as client_last_name,
              c.municipality as client_municipality,
              c.full_address as client_full_address,
              c.region as client_region,
              c.province as client_province,
              c.barangay as client_barangay,
              u.first_name as user_first_name, u.last_name as user_last_name,
              cb.first_name as created_by_first_name, cb.last_name as created_by_last_name
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN users cb ON cb.id = i.created_by
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = result.rows[0];

    // Role-based access check - caravans can only access their own itineraries
    if (user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only access your own itineraries');
      }
    }

    // Calculate display_name for client: "Surname, First Name MiddleName"
    const middleName = itinerary.client_middle_name || '';
    const nameParts = [itinerary.client_first_name, middleName].filter((p: string) => p && p.trim().length > 0);
    const clientDisplayName = `${itinerary.client_last_name}, ${nameParts.join(' ')}`;

    return c.json({
      ...mapRowToItinerary(itinerary),
      full_name: clientDisplayName, // ✅ ADD full_name at root level
      expand: {
        user_id: itinerary.user_id ? {
          id: itinerary.user_id,
          name: `${itinerary.user_first_name} ${itinerary.user_last_name}`,
        } : undefined,
        client_id: {
          id: itinerary.client_id,
          first_name: itinerary.client_first_name,
          middle_name: itinerary.client_middle_name,
          last_name: itinerary.client_last_name,
          display_name: clientDisplayName,
          full_address: itinerary.client_full_address,
          region: itinerary.client_region,
          province: itinerary.client_province,
          municipality: itinerary.client_municipality,
          barangay: itinerary.client_barangay,
        },
        created_by: itinerary.created_by ? {
          id: itinerary.created_by,
          name: `${itinerary.created_by_first_name} ${itinerary.created_by_last_name}`,
        } : undefined,
      },
    });
  } catch (error) {
    console.error('Fetch itinerary error:', error);
    throw new Error();
  }
});

// POST /api/itineraries/bulk - Create N×M itinerary records for manager bulk-assign
itineraries.post('/bulk', authMiddleware, requirePermission('itineraries', 'create'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = bulkCreateItinerarySchema.parse(body);

    const { caravan_ids, client_ids, scheduled_date, priority } = validated;

    // Fetch all existing combinations for this date in one query
    const existingResult = await pool.query(
      `SELECT user_id, client_id FROM itineraries
       WHERE user_id = ANY($1) AND client_id = ANY($2) AND scheduled_date = $3`,
      [caravan_ids, client_ids, scheduled_date]
    );
    const existingSet = new Set(
      existingResult.rows.map((r: any) => `${r.user_id}:${r.client_id}`)
    );

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    let skipped = 0;

    for (const caravanId of caravan_ids) {
      for (const clientId of client_ids) {
        if (existingSet.has(`${caravanId}:${clientId}`)) {
          skipped++;
          continue;
        }
        values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        params.push(caravanId, clientId, scheduled_date, priority, user.sub);
        idx += 5;
      }
    }

    if (values.length === 0) {
      return c.json({ created: 0, skipped }, 200);
    }

    await pool.query(
      `INSERT INTO itineraries (user_id, client_id, scheduled_date, priority, created_by)
       VALUES ${values.join(', ')}`,
      params
    );

    const created = values.length;
    return c.json({ created, skipped }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400);
    }
    console.error('Bulk create itineraries error:', error);
    throw new Error('Failed to bulk create itineraries');
  }
});

// POST /api/itineraries - Create new itinerary (supports multiple clients)
itineraries.post('/', authMiddleware, requirePermission('itineraries', 'create'), auditMiddleware('itinerary'), async (c) => {
  const client = await pool.connect();

  try {
    const user = c.get('user');
    const body = await c.req.json();

    // Debug logging
    console.log('[Itineraries POST] Request body:', JSON.stringify(body, null, 2));
    console.log('[Itineraries POST] user_id value:', body.user_id, 'type:', typeof body.user_id);
    console.log('[Itineraries POST] client_ids value:', body.client_ids, 'type:', typeof body.client_ids);

    // PowerSync sends client_id (string); REST callers send client_ids (array) — normalise
    if (!body.client_ids && body.client_id) {
      body.client_ids = [body.client_id];
    }

    const validated = createItinerarySchema.parse(body);
    const { user_id, client_ids, scheduled_date, scheduled_time, status, priority, notes } = validated;

    await client.query('BEGIN');

    const results = [];
    const errors = [];

    // Validate and insert each client individually
    for (const clientId of client_ids) {
      try {
        // Validate that client exists (loan released clients are allowed)
        const clientCheck = await client.query(
          `SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL`,
          [clientId]
        );

        if (clientCheck.rows.length === 0) {
          errors.push({ client_id: clientId, error: 'Client not found' });
          continue;
        }

        // Check if itinerary already exists for this client, user, and date
        const existingCheck = await client.query(
          `SELECT id FROM itineraries
           WHERE client_id = $1 AND user_id = $2 AND scheduled_date = $3`,
          [clientId, user_id, scheduled_date]
        );

        if (existingCheck.rows.length > 0) {
          errors.push({
            client_id: clientId,
            error: 'Client already has an itinerary for this date',
            existing_itinerary_id: existingCheck.rows[0].id
          });
          continue;
        }

        // Insert itinerary
        const result = await client.query(
          `INSERT INTO itineraries (
            id, user_id, client_id, scheduled_date, scheduled_time, status, priority, notes, created_by
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
          ) RETURNING *`,
          [
            user_id, clientId, scheduled_date,
            scheduled_time || null, status, priority,
            notes || null, user.sub
          ]
        );

        results.push(result.rows[0]);
      } catch (err) {
        // Record error but continue with other clients
        errors.push({
          client_id: clientId,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    // If we have any successes, commit the transaction
    if (results.length > 0) {
      await client.query('COMMIT');

      return c.json({
        success: true,
        itineraries: results,
        count: results.length,
        partial: errors.length > 0,
        errors: errors.length > 0 ? errors : undefined
      });
    } else {
      // All failed, rollback
      await client.query('ROLLBACK');

      return c.json({
        success: false,
        error: 'Failed to create any itineraries',
        errors: errors
      }, 400);
    }
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof z.ZodError) {
      // Log detailed Zod validation errors
      console.error('[Itineraries POST] Zod validation errors:');
      error.errors.forEach((err: any) => {
        console.error(`  Field: ${err.path[0] || 'unknown'}, Message: ${err.message}, Code: ${err.code}`);
        console.error(`  Received value:`, err.received);
      });

      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }

    console.error('Create itinerary error:', error);
    throw new Error('Failed to create itinerary');
  } finally {
    client.release();
  }
});

// PUT /api/itineraries/:id - Update itinerary
itineraries.put('/:id', authMiddleware, requirePermission('itineraries', 'update'), auditMiddleware('itinerary'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateItinerarySchema.parse(body);

    // Check if itinerary exists
    const existing = await pool.query(
      `SELECT i.*, c.municipality as client_municipality
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = existing.rows[0];

    // For caravans, verify they own this itinerary
    if (user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only modify your own itineraries');
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      user_id: 'user_id',
      client_id: 'client_id',
      scheduled_date: 'scheduled_date',
      scheduled_time: 'scheduled_time',
      status: 'status',
      priority: 'priority',
      notes: 'notes',
    };

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in validated) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push((validated as any)[key]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE itineraries SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    return c.json(mapRowToItinerary(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update itinerary error:', error);
    throw new Error('Failed to update itinerary');
  }
});

// DELETE /api/itineraries/:id - Delete itinerary
itineraries.delete('/:id', authMiddleware, requirePermission('itineraries', 'delete'), auditMiddleware('itinerary'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Check if itinerary exists and get client municipality
    const existing = await pool.query(
      `SELECT i.*, c.municipality as client_municipality
       FROM itineraries i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Itinerary');
    }

    const itinerary = existing.rows[0];

    // For caravans, verify they own this itinerary
    if (user.role === 'caravan') {
      if (itinerary.user_id !== user.sub) {
        throw new AuthorizationError('You can only modify your own itineraries');
      }
    }

    // Hard delete + tombstone so a stale PowerSync upload from mobile
    // doesn't resurrect the row via the sync-operations processor.
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('DELETE FROM itineraries WHERE id = $1', [id]);
      await dbClient.query(
        `INSERT INTO deleted_itineraries (id, deleted_by) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET deleted_at = NOW(), deleted_by = EXCLUDED.deleted_by`,
        [id, user.sub]
      );
      await dbClient.query('COMMIT');
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      dbClient.release();
    }
    return c.json({ message: 'Itinerary deleted successfully' });
  } catch (error) {
    console.error('Delete itinerary error:', error);
    throw new Error();
  }
});

// Bulk delete validation schema
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

// POST /api/itineraries/bulk-delete - Bulk delete itineraries
itineraries.post('/bulk-delete', authMiddleware, requirePermission('itineraries', 'delete'), auditMiddleware('itinerary', 'bulk_delete'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) throw new AuthorizationError('Unauthorized');

    const { ids } = bulkDeleteSchema.parse(await c.req.json());

    const dbClient = await pool.connect();
    let deleted: string[];
    try {
      await dbClient.query('BEGIN');
      const result = await dbClient.query(
        'DELETE FROM itineraries WHERE id = ANY($1::uuid[]) RETURNING id',
        [ids]
      );
      deleted = result.rows.map((r: any) => r.id);
      if (deleted.length > 0) {
        await dbClient.query(
          `INSERT INTO deleted_itineraries (id, deleted_by)
           SELECT UNNEST($1::uuid[]), $2
           ON CONFLICT (id) DO UPDATE SET deleted_at = NOW(), deleted_by = EXCLUDED.deleted_by`,
          [deleted, user.sub]
        );
      }
      await dbClient.query('COMMIT');
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      dbClient.release();
    }

    return c.json({
      success: deleted,
      failed: [],
      message: `${deleted.length} itinerary(s) deleted`,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk delete itineraries error:', error);
    throw new Error('Failed to bulk delete itineraries');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Haversine helpers (flat-Earth approximation sufficient for ≤ 1km corridor)
// ─────────────────────────────────────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentMeters(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineMeters(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t * dx, ny = ay + t * dy;
  return haversineMeters(px, py, nx, ny);
}

// The bucket-classification logic (mirrors /clients/pipeline)
const BUCKET_CASE_SQL = `
  CASE
    WHEN EXISTS(SELECT 1 FROM releases r WHERE r.client_id = c.id AND r.status = 'approved') THEN 'released'
    WHEN LOWER(TRIM(c.touchpoint_reason_values[array_length(c.touchpoint_reason_values, 1)])) IN (
      'loan release', 'released cheque for remaining change / differential'
    ) THEN 'released'
    WHEN LOWER(TRIM(c.touchpoint_reason_values[array_length(c.touchpoint_reason_values, 1)])) IN (
      'interested', 'loan inquiry',
      'for verification', 'for processing / approval / request',
      'for processing/approval/request', 'for processing',
      'for update', 'for ada authentication', 'for ada compliance',
      'apply for pusu membership', 'apply for pusu / lika membership'
    ) THEN 'hot'
    WHEN LOWER(TRIM(c.touchpoint_reason_values[array_length(c.touchpoint_reason_values, 1)])) = 'undecided' THEN 'warm'
    WHEN LOWER(TRIM(c.touchpoint_reason_values[array_length(c.touchpoint_reason_values, 1)])) IN (
      'not around', 'unlocated',
      'inaccessible / critical area', 'moved out'
    ) THEN 'cold'
    WHEN LOWER(TRIM(c.touchpoint_reason_values[array_length(c.touchpoint_reason_values, 1)])) IN (
      'not interested', 'deceased', 'overaged', 'abroad',
      'disapproved', 'backed out',
      'with existing loan in other lis', 'with existing loan to other li''s',
      'not amenable to our product criteria', 'poor health condition',
      'returned atm', 'not in the list',
      'interested, but declined due to family decision'
    ) THEN 'disqualified'
    ELSE NULL
  END AS bucket
`;

// GET /api/itineraries/route-suggestions
itineraries.get('/route-suggestions', authMiddleware, requirePermission('itineraries', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dateParam = c.req.query('date') || todayStr;
    const corridorMeters = Math.max(50, Math.min(5000, parseInt(c.req.query('corridor_meters') || '500')));
    const limit = Math.max(1, Math.min(50, parseInt(c.req.query('limit') || '20')));

    const cacheKey = `route_suggestions:${user.sub}:${dateParam}:${corridorMeters}`;
    const cache = getCacheService();
    const cached = await cache.get<object>(cacheKey);
    if (cached) return c.json(cached);

    // 1. Fetch today's itinerary stops with client coordinates, ordered by scheduled_time
    const stopsResult = await pool.query(
      `SELECT i.client_id, c.latitude, c.longitude
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id
       WHERE i.user_id = $1
         AND i.scheduled_date = $2::date
         AND c.latitude IS NOT NULL
         AND c.longitude IS NOT NULL
         AND c.deleted_at IS NULL
       ORDER BY i.scheduled_time NULLS LAST, i.created_at`,
      [user.sub, dateParam]
    );

    const stops = stopsResult.rows as Array<{ client_id: string; latitude: number; longitude: number }>;

    if (stops.length < 2) {
      const result = { suggestions: [], reason: 'insufficient_route_data', date: dateParam, corridor_meters: corridorMeters, stops_used: stops.length };
      await cache.set(cacheKey, result, 300);
      return c.json(result);
    }

    // Build bounding box across all segments with corridor margin
    // ~111,000m per degree of latitude; longitude varies but using same factor is fine at this scale
    const metersToDeg = corridorMeters / 111000;
    const lats = stops.map(s => s.latitude);
    const lngs = stops.map(s => s.longitude);
    const minLat = Math.min(...lats) - metersToDeg;
    const maxLat = Math.max(...lats) + metersToDeg;
    const minLng = Math.min(...lngs) - metersToDeg;
    const maxLng = Math.max(...lngs) + metersToDeg;

    // Get client IDs already in today's itinerary (to exclude)
    const existingInItinerary = new Set(stops.map(s => s.client_id));
    // Also fetch any itinerary clients that may not have coords (still want to exclude them)
    const allTodayResult = await pool.query(
      `SELECT client_id FROM itineraries WHERE user_id = $1 AND scheduled_date = $2::date`,
      [user.sub, dateParam]
    );
    for (const row of allTodayResult.rows) existingInItinerary.add(row.client_id);

    // 2. Territory filter — same ROLE_LEVELS pattern as /clients/pipeline
    const ROLE_LEVELS: Record<string, number> = {
      'admin': 100, 'area_manager': 50, 'assistant_area_manager': 40,
      'team_leader': 25, 'caravan': 20, 'tele': 15,
    };
    const userLevel = ROLE_LEVELS[user.role] || 0;
    const shouldFilterByArea = userLevel < 40 || ['caravan', 'tele'].includes(user.role);

    const areaParams: any[] = [];
    const areaConditions: string[] = [];
    let paramIndex = 1;

    if (shouldFilterByArea) {
      const areaResult = await pool.query(
        `SELECT
           COALESCE(ARRAY_AGG(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL), ARRAY[]::int[]) AS psgc_ids,
           COALESCE(
             ARRAY_AGG(DISTINCT LOWER(TRIM(ul.province)) || '|' || LOWER(TRIM(ul.municipality)))
             FILTER (WHERE p.id IS NULL), ARRAY[]::text[]
           ) AS fallback_area_keys
         FROM user_locations ul
         LEFT JOIN psgc p ON p.province = TRIM(ul.province) AND p.mun_city = TRIM(ul.municipality)
         WHERE ul.user_id = $1 AND ul.deleted_at IS NULL`,
        [user.sub]
      );
      const row = areaResult.rows[0];
      const psgcIds = (row?.psgc_ids || []).map((id: any) => Number(id));
      const fallbackKeys = (row?.fallback_area_keys || []).map((k: any) => String(k));

      if (psgcIds.length === 0 && fallbackKeys.length === 0) {
        const result = { suggestions: [], reason: 'no_territory_assigned', date: dateParam, corridor_meters: corridorMeters, stops_used: stops.length };
        await cache.set(cacheKey, result, 300);
        return c.json(result);
      }

      if (psgcIds.length > 0) {
        areaParams.push(psgcIds);
        areaConditions.push(`c.psgc_id = ANY($${paramIndex}::int[])`);
        paramIndex++;
      }
      if (fallbackKeys.length > 0) {
        areaParams.push(fallbackKeys);
        areaConditions.push(
          `(LOWER(TRIM(COALESCE(c.province, ''))) || '|' || LOWER(TRIM(COALESCE(c.municipality, '')))) = ANY($${paramIndex}::text[])`
        );
        paramIndex++;
      }
    }

    // 3. Candidate query with bounding-box pre-filter
    const bbParams = [...areaParams, minLat, maxLat, minLng, maxLng];
    const areaWhere = areaConditions.length > 0 ? `AND (${areaConditions.join(' OR ')})` : '';

    const candidatesResult = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.middle_name, c.full_address,
              c.latitude, c.longitude, c.touchpoint_number, c.last_touchpoint_date,
              c.loan_released, c.touchpoint_reason_values,
              ${BUCKET_CASE_SQL}
       FROM clients c
       WHERE c.deleted_at IS NULL
         AND c.loan_released IS NOT TRUE
         AND c.latitude IS NOT NULL
         AND c.longitude IS NOT NULL
         AND c.latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}
         AND c.longitude BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}
         ${areaWhere}`,
      [...bbParams]
    );
    paramIndex += 4;

    // 4. Compute perpendicular distance to route for each candidate
    const segments: Array<[number, number, number, number]> = [];
    for (let i = 0; i < stops.length - 1; i++) {
      segments.push([stops[i].latitude, stops[i].longitude, stops[i + 1].latitude, stops[i + 1].longitude]);
    }

    type Suggestion = {
      id: string;
      first_name: string;
      last_name: string;
      middle_name: string | null;
      full_address: string | null;
      latitude: number;
      longitude: number;
      distance_to_route_meters: number;
      bucket: string | null;
      touchpoint_number: number;
      last_touchpoint_date: string | null;
    };

    const suggestions: Suggestion[] = [];

    for (const row of candidatesResult.rows as any[]) {
      // Skip clients already in today's itinerary
      if (existingInItinerary.has(row.id)) continue;

      let minDist = Infinity;
      for (const [ax, ay, bx, by] of segments) {
        const d = pointToSegmentMeters(row.latitude, row.longitude, ax, ay, bx, by);
        if (d < minDist) minDist = d;
      }

      if (minDist <= corridorMeters) {
        suggestions.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          middle_name: row.middle_name ?? null,
          full_address: row.full_address ?? null,
          latitude: row.latitude,
          longitude: row.longitude,
          distance_to_route_meters: Math.round(minDist),
          bucket: row.bucket ?? null,
          touchpoint_number: row.touchpoint_number ?? 0,
          last_touchpoint_date: row.last_touchpoint_date ?? null,
        });
      }
    }

    // Sort by distance ascending, take top limit
    suggestions.sort((a, b) => a.distance_to_route_meters - b.distance_to_route_meters);
    const topSuggestions = suggestions.slice(0, limit);

    const result = {
      suggestions: topSuggestions,
      date: dateParam,
      corridor_meters: corridorMeters,
      stops_used: stops.length,
    };

    await cache.set(cacheKey, result, 300); // 5 min TTL
    return c.json(result);
  } catch (error) {
    console.error('[/itineraries/route-suggestions] Error:', error);
    throw new Error('Failed to compute route suggestions');
  }
});

export default itineraries;
