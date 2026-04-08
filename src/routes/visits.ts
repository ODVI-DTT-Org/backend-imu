import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { visitService, createVisitSchema, updateVisitSchema } from '../services/visit.service.js';
import { ValidationError } from '../errors/index.js';

const visits = new Hono();

// Get all visits (with filters)
visits.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  const visits = await visitService.findAll(user.sub, filters);
  return c.json(visits);
});

// Get visit by ID
visits.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const visit = await visitService.findById(id);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);
  return c.json(visit);
});

// Create visit
visits.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const data = await c.req.json();
    const visit = await visitService.create({ ...data, user_id: user.sub });
    return c.json(visit, 201);
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

// Update visit
visits.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const visit = await visitService.update(id, data);
    if (!visit) return c.json({ error: 'Visit not found' }, 404);
    return c.json(visit);
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

// Delete visit
visits.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await visitService.delete(id);
  return c.json({ success: true });
});

export default visits;
