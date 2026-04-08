import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { releaseService } from '../services/release.service';

const releases = new Hono();

// Get all releases (with filters)
releases.get('/', authenticate, authorize('releases', 'read'), async (c) => {
  const userId = c.get('userId');
  const filters = c.req.query();
  const releases = await releaseService.findAll(userId, filters);
  return c.json(releases);
});

// Get release by ID
releases.get('/:id', authenticate, authorize('releases', 'read'), async (c) => {
  const id = c.req.param('id');
  const release = await releaseService.findById(id);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Create release
releases.post('/',
  authenticate,
  authorize('releases', 'create'),
  validateBody,
  async (c) => {
    const userId = c.get('userId');
    const data = await c.req.json();
    const release = await releaseService.create({ ...data, user_id: userId });
    return c.json(release, 201);
  }
);

// Update release
releases.patch('/:id',
  authenticate,
  authorize('releases', 'update'),
  validateBody,
  async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const release = await releaseService.update(id, data);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    return c.json(release);
  }
);

// Approve release
releases.post('/:id/approve',
  authenticate,
  authorize('releases', 'approve'),
  async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const notes = await c.req.json().then(b => b?.notes);
    const release = await releaseService.approve(id, userId, notes);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    return c.json(release);
  }
);

// Reject release
releases.post('/:id/reject',
  authenticate,
  authorize('releases', 'approve'),
  async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const notes = await c.req.json().then(b => b?.notes);
    const release = await releaseService.reject(id, userId, notes);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    return c.json(release);
  }
);

// Delete release
releases.delete('/:id',
  authenticate,
  authorize('releases', 'delete'),
  async (c) => {
    const id = c.req.param('id');
    await releaseService.delete(id);
    return c.json({ success: true });
  }
);

export default releases;
