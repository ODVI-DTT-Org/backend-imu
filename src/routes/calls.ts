import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { callService } from '../services/call.service';

const calls = new Hono();

// Get all calls (with filters)
calls.get('/', authenticate, authorize('calls', 'read'), async (c) => {
  const userId = c.get('userId');
  const filters = c.req.query();
  const calls = await callService.findAll(userId, filters);
  return c.json(calls);
});

// Get call by ID
calls.get('/:id', authenticate, authorize('calls', 'read'), async (c) => {
  const id = c.req.param('id');
  const call = await callService.findById(id);
  if (!call) return c.json({ error: 'Call not found' }, 404);
  return c.json(call);
});

// Create call
calls.post('/',
  authenticate,
  authorize('calls', 'create'),
  validateBody,
  async (c) => {
    const userId = c.get('userId');
    const data = await c.req.json();
    const call = await callService.create({ ...data, user_id: userId });
    return c.json(call, 201);
  }
);

// Update call
calls.patch('/:id',
  authenticate,
  authorize('calls', 'update'),
  validateBody,
  async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const call = await callService.update(id, data);
    if (!call) return c.json({ error: 'Call not found' }, 404);
    return c.json(call);
  }
);

// Delete call
calls.delete('/:id',
  authenticate,
  authorize('calls', 'delete'),
  async (c) => {
    const id = c.req.param('id');
    await callService.delete(id);
    return c.json({ success: true });
  }
);

export default calls;
