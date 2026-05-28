import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { createNotification } from '../services/notification.service.js';

const geofence = new Hono();

// ---------------------------------------------------------------------------
// Table helpers (lazy-create)
// ---------------------------------------------------------------------------

let arrivalsTableEnsured = false;

async function ensureArrivalsTable(): Promise<void> {
  if (arrivalsTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geofence_arrivals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      agent_latitude DOUBLE PRECISION NOT NULL,
      agent_longitude DOUBLE PRECISION NOT NULL,
      client_latitude DOUBLE PRECISION NOT NULL,
      client_longitude DOUBLE PRECISION NOT NULL,
      distance_meters INTEGER NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 400,
      arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_geofence_arrivals_user_client_arrived
      ON geofence_arrivals(user_id, client_id, arrived_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geofence_arrivals_client_arrived
      ON geofence_arrivals(client_id, arrived_at DESC);
  `);
  // Add new columns idempotently
  await pool.query(`
    ALTER TABLE geofence_arrivals
      ADD COLUMN IF NOT EXISTS computed_distance_meters INT,
      ADD COLUMN IF NOT EXISTS dwell_seconds INT,
      ADD COLUMN IF NOT EXISTS proximity_id UUID REFERENCES geofence_proximity(id),
      ADD COLUMN IF NOT EXISTS resulted_in_touchpoint UUID REFERENCES touchpoints(id);
  `);
  arrivalsTableEnsured = true;
}

let proximityTableEnsured = false;

async function ensureProximityTable(): Promise<void> {
  if (proximityTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geofence_proximity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      distance_meters INT NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action_taken TEXT,
      acted_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_proximity_user_detected ON geofence_proximity(user_id, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proximity_client_detected ON geofence_proximity(client_id, detected_at DESC);
  `);
  proximityTableEnsured = true;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function displayName(row: Record<string, unknown>, fallback: string): string {
  const first = String(row.first_name ?? '').trim();
  const middle = String(row.middle_name ?? '').trim();
  const last = String(row.last_name ?? '').trim();
  const joined = [first, middle, last].filter(Boolean).join(' ');
  return joined || fallback;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ---------------------------------------------------------------------------
// POST /geofence/proximity
// ---------------------------------------------------------------------------

const proximitySchema = z.object({
  client_id: z.string().uuid(),
  distance_meters: z.number().int().nonnegative(),
});

geofence.post('/proximity', authMiddleware, async (c) => {
  await ensureProximityTable();
  const user = c.get('user');
  const body = proximitySchema.parse(await c.req.json());

  // 12h dedup per (user, client)
  const recent = await pool.query(
    `SELECT id FROM geofence_proximity
     WHERE user_id = $1 AND client_id = $2
       AND detected_at > NOW() - INTERVAL '12 hours'
     LIMIT 1`,
    [user.sub, body.client_id],
  );
  if (recent.rows.length > 0) {
    return c.json({ success: true, duplicate: true, id: recent.rows[0].id });
  }

  const result = await pool.query(
    `INSERT INTO geofence_proximity (user_id, client_id, distance_meters)
     VALUES ($1, $2, $3)
     RETURNING id, detected_at`,
    [user.sub, body.client_id, body.distance_meters],
  );

  return c.json(
    {
      success: true,
      duplicate: false,
      id: result.rows[0].id,
      detected_at: result.rows[0].detected_at,
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// POST /geofence/arrivals
// ---------------------------------------------------------------------------

const arrivalSchema = z.object({
  client_id: z.string().uuid(),
  agent_latitude: z.number().min(-90).max(90),
  agent_longitude: z.number().min(-180).max(180),
  dwell_seconds: z.number().int().min(90),
  proximity_id: z.string().uuid().optional(),
});

geofence.post('/arrivals', authMiddleware, async (c) => {
  await ensureProximityTable();  // proximity table must exist for FK reference
  await ensureArrivalsTable();

  const user = c.get('user');
  const body = arrivalSchema.parse(await c.req.json());

  // 1. Lookup client — fetch coords + names for server-side validation & notification
  const contextResult = await pool.query(
    `SELECT
       c.id AS client_id,
       c.latitude AS client_latitude,
       c.longitude AS client_longitude,
       c.first_name AS client_first_name,
       c.middle_name AS client_middle_name,
       c.last_name AS client_last_name,
       c.province,
       c.municipality,
       u.first_name AS agent_first_name,
       u.middle_name AS agent_middle_name,
       u.last_name AS agent_last_name,
       u.email AS agent_email
     FROM clients c
     JOIN users u ON u.id = $2
     WHERE c.id = $1
       AND c.deleted_at IS NULL`,
    [body.client_id, user.sub],
  );

  if (contextResult.rows.length === 0) {
    return c.json({ success: false, error: 'Client not found' }, 404);
  }

  const context = contextResult.rows[0];

  if (context.client_latitude == null || context.client_longitude == null) {
    return c.json({ success: false, error: 'Client has no known location' }, 400);
  }

  // 2. Server-compute distance
  const computed = haversineMeters(
    body.agent_latitude,
    body.agent_longitude,
    context.client_latitude as number,
    context.client_longitude as number,
  );

  // 3. Reject if too far (150m arrival radius + 100m GPS slop = 250m)
  if (computed > 250) {
    return c.json(
      { error: 'Outside arrival radius', computed_distance_meters: computed },
      422,
    );
  }

  // 4. 16h dedup per (user, client)
  const recentResult = await pool.query(
    `SELECT id
     FROM geofence_arrivals
     WHERE user_id = $1
       AND client_id = $2
       AND arrived_at > NOW() - INTERVAL '16 hours'
     LIMIT 1`,
    [user.sub, body.client_id],
  );

  if (recentResult.rows.length > 0) {
    return c.json({ success: true, duplicate: true, id: recentResult.rows[0].id });
  }

  // 5. Insert with server-set values
  const insertResult = await pool.query(
    `INSERT INTO geofence_arrivals (
       user_id, client_id,
       agent_latitude, agent_longitude,
       client_latitude, client_longitude,
       distance_meters, radius_meters,
       computed_distance_meters, dwell_seconds, proximity_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 150, $8, $9, $10)
     RETURNING id, arrived_at`,
    [
      user.sub,
      body.client_id,
      body.agent_latitude,
      body.agent_longitude,
      context.client_latitude,
      context.client_longitude,
      computed,
      computed,
      body.dwell_seconds,
      body.proximity_id ?? null,
    ],
  );

  // 6. Build names for notification
  const agentName = displayName(
    {
      first_name: context.agent_first_name,
      middle_name: context.agent_middle_name,
      last_name: context.agent_last_name,
    },
    context.agent_email ?? 'A caravan',
  );
  const clientName = displayName(
    {
      first_name: context.client_first_name,
      middle_name: context.client_middle_name,
      last_name: context.client_last_name,
    },
    'client location',
  );

  // 7. Fan-out to admins + managers in matching territory
  const recipientsResult = await pool.query(
    `SELECT DISTINCT u.id
     FROM users u
     WHERE u.is_active = true
       AND u.id <> $1
       AND (
         u.role = 'admin'
         OR (
           u.role IN ('area_manager', 'assistant_area_manager')
           AND EXISTS (
             SELECT 1
             FROM user_locations ul
             WHERE ul.user_id = u.id
               AND ul.deleted_at IS NULL
               AND ul.province = $2
               AND ul.municipality = $3
           )
         )
       )`,
    [user.sub, context.province, context.municipality],
  );

  const title = 'Arrival detected';
  const notificationBody = `${agentName} has arrived at ${clientName}`;
  await Promise.all(
    recipientsResult.rows.map((recipient) =>
      createNotification(recipient.id, 'geofence_alert', title, notificationBody, {
        arrival_id: insertResult.rows[0].id,
        user_id: user.sub,
        client_id: body.client_id,
        distance_meters: computed,
        radius_meters: 150,
      }),
    ),
  );

  return c.json(
    {
      success: true,
      duplicate: false,
      id: insertResult.rows[0].id,
      arrived_at: insertResult.rows[0].arrived_at,
      notified: recipientsResult.rows.length,
    },
    201,
  );
});

export default geofence;
