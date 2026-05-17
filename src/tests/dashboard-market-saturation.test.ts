import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  pool: { query: vi.fn() },
}));

// Mock authMiddleware to inject a test user instead of verifying JWT
let testUserRole = 'admin';
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', { sub: 'user-1', role: testUserRole });
    await next();
  },
  requireRole: () => async (_c: any, next: any) => next(),
}));

import { pool } from '../db/index.js';
const mockPool = pool as { query: ReturnType<typeof vi.fn> };

import { Hono } from 'hono';
import marketSaturationRoutes from '../routes/dashboard-market-saturation.js';

function buildApp(role: string) {
  testUserRole = role;
  const app = new Hono();
  app.route('/', marketSaturationRoutes);
  return app;
}

const mockBreakdownRows = [
  {
    municipality: 'Caloocan',
    interested: '10', not_interested: '3', undecided: '5', untouched: '20', tp_total: '38',
    virgin: '20', favorable: '10', others: '3', existing: '5', cat_total: '38',
  },
  {
    municipality: null,
    interested: '10', not_interested: '3', undecided: '5', untouched: '20', tp_total: '38',
    virgin: '20', favorable: '10', others: '3', existing: '5', cat_total: '38',
  },
];

describe('GET /api/dashboard/market-saturation', () => {
  beforeAll(() => {
    mockPool.query.mockImplementation(async (sql: string) => {
      if (sql.includes('user_locations')) {
        return { rows: [{ municipality: 'Caloocan' }] };
      }
      return { rows: mockBreakdownRows };
    });
  });

  it('returns 403 for non-admin/area_manager roles', async () => {
    const app = buildApp('caravan');
    const res = await app.request('/');
    expect(res.status).toBe(403);
  });

  it('returns breakdown structure for admin', async () => {
    const app = buildApp('admin');
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('status_breakdown');
    expect(body).toHaveProperty('category_breakdown');
    expect(body).toHaveProperty('by_municipality');
    expect(body.clients).toBeNull();
  });

  it('status_breakdown has correct fields and types', async () => {
    const app = buildApp('admin');
    const res = await app.request('/');
    const body = await res.json() as any;
    const sb = body.status_breakdown;
    expect(sb.interested).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(sb.not_interested).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(sb.undecided).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(sb.untouched).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
  });

  it('category_breakdown has correct fields', async () => {
    const app = buildApp('admin');
    const res = await app.request('/');
    const body = await res.json() as any;
    const cb = body.category_breakdown;
    expect(cb.virgin).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(cb.favorable).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(cb.others).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
    expect(cb.existing).toMatchObject({ count: expect.any(Number), pct: expect.any(Number) });
  });

  it('by_municipality rows have all required fields', async () => {
    const app = buildApp('admin');
    const res = await app.request('/');
    const body = await res.json() as any;
    const row = body.by_municipality[0];
    expect(row).toMatchObject({
      municipality: expect.any(String),
      interested: expect.any(Number),
      not_interested: expect.any(Number),
      undecided: expect.any(Number),
      untouched: expect.any(Number),
      virgin: expect.any(Number),
      favorable: expect.any(Number),
      others: expect.any(Number),
      existing: expect.any(Number),
    });
  });

  it('returns empty response for area_manager with no territory', async () => {
    mockPool.query.mockImplementationOnce(async () => ({ rows: [] }));
    const app = buildApp('area_manager');
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.by_municipality).toHaveLength(0);
    expect(body.status_breakdown.interested.count).toBe(0);
  });
});
