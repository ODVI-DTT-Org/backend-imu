import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { createNotification } from '../services/notification.service.js';

const geofence = new Hono();

const arrivalSchema = z.object({
  client_id: z.string().uuid(),
  agent_latitude: z.number().min(-90).max(90),
  agent_longitude: z.number().min(-180).max(180),
  client_latitude: z.number().min(-90).max(90),
  client_longitude: z.number().min(-180).max(180),
  distance_meters: z.number().int().nonnegative(),
  radius_meters: z.number().int().positive().default(400),
});

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
  arrivalsTableEnsured = true;
}

function displayName(row: Record<string, unknown>, fallback: string): string {
  const first = String(row.first_name ?? '').trim();
  const middle = String(row.middle_name ?? '').trim();
  const last = String(row.last_name ?? '').trim();
  const joined = [first, middle, last].filter(Boolean).join(' ');
  return joined || fallback;
}

geofence.post('/arrivals', authMiddleware, async (c) => {
  await ensureArrivalsTable();

  const user = c.get('user');
  const body = arrivalSchema.parse(await c.req.json());

  const contextResult = await pool.query(
    `SELECT
       c.id AS client_id,
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
     WHERE c.id = $1`,
    [body.client_id, user.sub],
  );

  if (contextResult.rows.length === 0) {
    return c.json({ success: false, error: 'Client not found' }, 404);
  }

  const context = contextResult.rows[0];
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

  const insertResult = await pool.query(
    `INSERT INTO geofence_arrivals (
       user_id, client_id, agent_latitude, agent_longitude,
       client_latitude, client_longitude, distance_meters, radius_meters
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, arrived_at`,
    [
      user.sub,
      body.client_id,
      body.agent_latitude,
      body.agent_longitude,
      body.client_latitude,
      body.client_longitude,
      body.distance_meters,
      body.radius_meters,
    ],
  );

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
        distance_meters: body.distance_meters,
        radius_meters: body.radius_meters,
      }),
    ),
  );

  return c.json({
    success: true,
    duplicate: false,
    id: insertResult.rows[0].id,
    arrived_at: insertResult.rows[0].arrived_at,
    notified: recipientsResult.rows.length,
  }, 201);
});

export default geofence;
