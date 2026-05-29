import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'admin',
    });
    await next();
  }),
}));

vi.mock('../../src/middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (_c: any, next: any) => next()),
  requireAnyPermission: vi.fn(() => async (_c: any, next: any) => next()),
  requireAllPermissions: vi.fn(() => async (_c: any, next: any) => next()),
  getUserPermissions: vi.fn(),
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
}));

let clientsRouter: any;

beforeEach(async () => {
  vi.resetModules();
  clientsRouter = (await import('../../src/routes/clients.js')).default;
});

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => c.json({ error: err.message }, 500));
  app.route('/api/clients', clientsRouter);
  return app;
}

describe('GET /api/clients/nearby — radius validation', () => {
  it('rejects radius above 15000 m with 400', async () => {
    const app = buildApp();
    const res = await app.request(
      '/api/clients/nearby?lat=14.5&lng=121.0&radius=15001',
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/15000/);
  });

  it('rejects radius of 500000 m (old limit) with 400', async () => {
    const app = buildApp();
    const res = await app.request(
      '/api/clients/nearby?lat=14.5&lng=121.0&radius=500000',
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/15000/);
  });

  it('accepts radius of exactly 15000 m without validation error', async () => {
    const { pool } = await import('../../src/db/index.js');
    (pool.query as any).mockResolvedValue({ rows: [] });
    const app = buildApp();
    const res = await app.request(
      '/api/clients/nearby?lat=14.5&lng=121.0&radius=15000',
    );
    expect(res.status).not.toBe(400);
  });

  it('rejects radius of 0 with 400', async () => {
    const app = buildApp();
    const res = await app.request(
      '/api/clients/nearby?lat=14.5&lng=121.0&radius=0',
    );
    expect(res.status).toBe(400);
  });
});
