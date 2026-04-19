import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { releaseService, createReleaseSchema, updateReleaseSchema } from '../services/release.service.js';
import { ValidationError } from '../errors/index.js';
import { pool } from '../db/index.js';

const releases = new Hono();

// Get all releases (with filters)
releases.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  const releases = await releaseService.findAll(user.sub, filters);
  return c.json(releases);
});

// Get release by ID
releases.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const release = await releaseService.findById(id);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Create release
releases.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const data = await c.req.json();
    const release = await releaseService.create({ ...data, user_id: user.sub });

    // Mark pending itineraries for this client as completed (non-blocking)
    if (release.client_id) {
      pool.query(
        `UPDATE itineraries SET status = 'completed', updated_at = NOW()
         WHERE client_id = $1 AND status = 'pending'`,
        [release.client_id]
      ).catch((err: any) => console.error('[Releases] Failed to update itineraries:', err.message));
    }

    return c.json(release, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    throw error;
  }
});

// Update release
releases.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const release = await releaseService.update(id, data);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    return c.json(release);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    throw error;
  }
});

// Approve release
releases.post('/:id/approve', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const notes = body?.notes;
  const release = await releaseService.approve(id, user.sub, notes);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Reject release
releases.post('/:id/reject', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const notes = body?.notes;
  const release = await releaseService.reject(id, user.sub, notes);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Delete release
releases.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await releaseService.delete(id);
  return c.json({ success: true });
});

export default releases;
