import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { visitService } from '../services/visit.service';

const visits = new Hono();

// Get all visits (with filters)
visits.get('/', authenticate, authorize('visits', 'read'), async (c) => {
  const userId = c.get('userId');
  const filters = c.req.query();
  const visits = await visitService.findAll(userId, filters);
  return c.json(visits);
});

// Get visit by ID
visits.get('/:id', authenticate, authorize('visits', 'read'), async (c) => {
  const id = c.req.param('id');
  const visit = await visitService.findById(id);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);
  return c.json(visit);
});

// Create visit
visits.post('/',
  authenticate,
  authorize('visits', 'create'),
  validateBody,
  async (c) => {
    const userId = c.get('userId');
    const data = await c.req.json();
    const visit = await visitService.create({ ...data, user_id: userId });
    return c.json(visit, 201);
  }
);

// Update visit
visits.patch('/:id',
  authenticate,
  authorize('visits', 'update'),
  validateBody,
  async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const visit = await visitService.update(id, data);
    if (!visit) return c.json({ error: 'Visit not found' }, 404);
    return c.json(visit);
  }
);

// Delete visit
visits.delete('/:id',
  authenticate,
  authorize('visits', 'delete'),
  async (c) => {
    const id = c.req.param('id');
    await visitService.delete(id);
    return c.json({ success: true });
  }
);

export default visits;
