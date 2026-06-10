/**
 * agents.ts
 *
 * CRUD endpoints for the agents table (loan release agents).
 *
 * GET  /api/agents        — list active agents (any authenticated user)
 * POST /api/agents        — create agent (admin only)
 * PATCH /api/agents/:id  — toggle is_active or rename (admin only)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { ValidationError } from '../errors/index.js';

const agents = new Hono();

const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
});

// GET /api/agents — list active agents
agents.get('/', authMiddleware, async (c) => {
  const result = await pool.query(
    `SELECT id, name, is_active, created_at, updated_at
     FROM agents
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return c.json(result.rows);
});

// POST /api/agents — create agent (admin only)
agents.post('/', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const body = await c.req.json();
    const validated = createAgentSchema.parse(body);

    const result = await pool.query(
      `INSERT INTO agents (name, is_active)
       VALUES ($1, true)
       RETURNING id, name, is_active, created_at, updated_at`,
      [validated.name],
    );
    return c.json(result.rows[0], 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const ve = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        ve.addFieldError(String(err.path[0] ?? 'unknown'), err.message);
      });
      throw ve;
    }
    // Unique constraint violation (duplicate active name)
    if (error?.code === '23505' && error?.constraint === 'agents_active_name_uniq') {
      return c.json({ error: 'DUPLICATE_AGENT_NAME', message: 'An active agent with that name already exists.' }, 409);
    }
    throw error;
  }
});

// PATCH /api/agents/:id — rename or toggle is_active (admin only)
agents.patch('/:id', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    const validated = updateAgentSchema.parse(body);

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (validated.name !== undefined) {
      fields.push(`name = $${idx++}`);
      params.push(validated.name);
    }
    if (validated.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      params.push(validated.is_active);
    }

    if (fields.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, is_active, created_at, updated_at`,
      params,
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json(result.rows[0]);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const ve = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        ve.addFieldError(String(err.path[0] ?? 'unknown'), err.message);
      });
      throw ve;
    }
    if (error?.code === '23505' && error?.constraint === 'agents_active_name_uniq') {
      return c.json({ error: 'DUPLICATE_AGENT_NAME', message: 'An active agent with that name already exists.' }, 409);
    }
    throw error;
  }
});

export default agents;
