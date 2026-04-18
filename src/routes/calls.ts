import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { callService, createCallSchema, updateCallSchema } from '../services/call.service.js';
import { ValidationError } from '../errors/index.js';

const calls = new Hono();

// Get all calls (with filters)
calls.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  let result;
  if (filters.client_id) {
    result = await callService.findByClientId(filters.client_id, filters);
  } else {
    result = await callService.findAll(user.sub, filters);
  }
  return c.json(result);
});

// Get call by ID
calls.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const call = await callService.findById(id);
  if (!call) return c.json({ error: 'Call not found' }, 404);
  return c.json(call);
});

// Create call
calls.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const data = await c.req.json();
    const call = await callService.create({ ...data, user_id: user.sub });
    return c.json(call, 201);
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

// Update call
calls.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const call = await callService.update(id, data);
    if (!call) return c.json({ error: 'Call not found' }, 404);
    return c.json(call);
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

// Delete call
calls.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await callService.delete(id);
  return c.json({ success: true });
});

export default calls;
