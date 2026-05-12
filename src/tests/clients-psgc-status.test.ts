import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { pool } from '../db/index.js';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', {
      sub: '00000000-0000-0000-0000-000000000123',
      email: 'admin-psgc@imu.test',
      first_name: 'Admin',
      last_name: 'Tester',
      role: 'admin',
    });
    await next();
  }),
}));

vi.mock('../middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (_c: any, next: any) => {
    await next();
  }),
}));

vi.mock('../middleware/audit.js', () => ({
  auditMiddleware: vi.fn(() => async (_c: any, next: any) => {
    await next();
  }),
}));

import clientsRoutes from '../routes/clients.js';

describe('GET /api/clients/psgc/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(pool.query).mockImplementation((queryText: string) => {
      const q = queryText.trim().toLowerCase();

      if (q.includes('count(*) as total_clients') && q.includes('from clients c')) {
        return Promise.resolve({
          rows: q.includes('deleted_at is null')
            ? [{ total_clients: '10', with_psgc: '7', without_psgc: '3' }]
            : [{ total_clients: '311500', with_psgc: '23', without_psgc: '311477' }],
        } as any);
      }

      if (q.includes('count(*) as total') && q.includes('where c.psgc_id is null')) {
        return Promise.resolve({
          rows: q.includes('deleted_at is null')
            ? [{ total: '3' }]
            : [{ total: '311477' }],
        } as any);
      }

      if (q.includes('from clients c') && q.includes('where c.psgc_id is null') && q.includes('limit $1 offset $2')) {
        return Promise.resolve({
          rows: q.includes('deleted_at is null')
            ? [
                {
                  id: 'client-1',
                  first_name: 'Active',
                  last_name: 'Client',
                  region: 'REGION IX',
                  province: 'ZAMBOANGA DEL NORTE',
                  municipality: 'SIOCON',
                  barangay: null,
                },
              ]
            : Array.from({ length: 20 }, (_, i) => ({
                id: `deleted-${i}`,
                first_name: 'Deleted',
                last_name: `Client ${i}`,
                region: 'REGION IX',
                province: 'ZAMBOANGA DEL NORTE',
                municipality: 'SIOCON',
                barangay: null,
              })),
        } as any);
      }

      if (q.includes('from psgc')) {
        return Promise.resolve({ rows: [] } as any);
      }

      if (q.includes('count(*) as total') && q.includes('inner join psgc psg on psg.id = c.psgc_id')) {
        return Promise.resolve({
          rows: q.includes('deleted_at is null')
            ? [{ total: '7' }]
            : [{ total: '23' }],
        } as any);
      }

      if (q.includes('select') && q.includes('inner join psgc psg on psg.id = c.psgc_id') && q.includes('limit $1 offset $2')) {
        return Promise.resolve({
          rows: q.includes('deleted_at is null')
            ? [
                {
                  id: 'matched-1',
                  first_name: 'Matched',
                  last_name: 'Client',
                  region: 'REGION IX',
                  province: 'ZAMBOANGA DEL NORTE',
                  municipality: 'SIOCON',
                  barangay: null,
                  matched_region: 'REGION IX',
                  matched_province: 'ZAMBOANGA DEL NORTE',
                  matched_municipality: 'SIOCON',
                  matched_barangay: null,
                  matched_at: '2026-05-11T00:00:00.000Z',
                },
              ]
            : [],
        } as any);
      }

      return Promise.resolve({ rows: [] } as any);
    });
  });

  it('excludes soft-deleted clients from PSGC status totals and unmatched samples', async () => {
    const app = new Hono();
    app.route('/api/clients', clientsRoutes);

    const response = await app.request('/api/clients/psgc/status');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.without_psgc).toBe('3');
    expect(data.stats.total_clients).toBe('10');
    expect(data.unmatched).toHaveLength(1);
    expect(data.unmatched[0].id).toBe('client-1');
    expect(data.unmatched_pagination.total).toBe(3);
    expect(data.unmatched_pagination.totalPages).toBe(1);
    expect(data.recently_matched_pagination.total).toBe(7);
    expect(data.recently_matched).toHaveLength(1);
  });
});
