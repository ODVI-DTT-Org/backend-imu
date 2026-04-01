import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock the database pool BEFORE importing the router
vi.mock('../../src/db/index.js', () => {
  const mockQuery = vi.fn();
  return {
    pool: { query: mockQuery },
  };
});

// Mock the auth middleware to bypass authentication
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', {
      sub: 'test-user-id',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin',
    });
    await next();
  }),
}));

import searchRouter from '../../src/routes/search.js';
import { pool } from '../../src/db/index.js';

// Create test app
const app = new Hono();
app.route('/api/search', searchRouter);

describe('Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should perform full-text search on clients', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('COUNT(*) as count')) {
        return {
          rows: [{ count: 2 }],
        };
      }
      return {
        rows: [
          {
            id: 'client-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
            phone: '1234567890',
            client_type: 'POTENTIAL',
            market_type: 'RESIDENTIAL',
            region: 'NCR',
            province: 'Metro Manila',
            municipality: 'Manila',
            is_starred: false,
          },
          {
            id: 'client-2',
            first_name: 'Johnny',
            last_name: 'Smith',
            email: 'johnny@example.com',
            phone: '0987654321',
            client_type: 'EXISTING',
            market_type: 'COMMERCIAL',
            region: 'NCR',
            province: 'Metro Manila',
            municipality: 'Quezon City',
            is_starred: true,
          },
        ],
      };
    });

    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'clients',
        query: 'John',
        filters: {},
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('results');
    expect(data.results).toHaveLength(2);
    expect(data).toHaveProperty('total', 2);
    expect(data).toHaveProperty('limit', 20);
    expect(data).toHaveProperty('offset', 0);
    expect(data).toHaveProperty('hasMore', false);
  });

  it('should search touchpoints with role-based filtering', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('COUNT(*) as count')) {
        return {
          rows: [{ count: 1 }],
        };
      }
      return {
        rows: [
          {
            id: 'touchpoint-1',
            client_id: 'client-1',
            user_id: 'test-user-id',
            first_name: 'Jane',
            last_name: 'Smith',
            touchpoint_number: 1,
            type: 'Visit',
            status: 'Completed',
            notes: 'Follow up required',
            reason: 'Initial Visit',
          },
        ],
      };
    });

    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'touchpoints',
        query: 'Jane',
        filters: {},
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].first_name).toBe('Jane');
  });

  it('should validate search input', async () => {
    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'invalid',
        query: '',
      }),
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('message', 'Invalid input');
  });

  it('should apply filters to client search', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('COUNT(*) as count')) {
        return {
          rows: [{ count: 1 }],
        };
      }
      return {
        rows: [
          {
            id: 'client-1',
            first_name: 'John',
            last_name: 'Doe',
            client_type: 'POTENTIAL',
            market_type: 'RESIDENTIAL',
            is_starred: false,
          },
        ],
      };
    });

    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'clients',
        query: 'John',
        filters: {
          client_type: ['POTENTIAL'],
          market_type: ['RESIDENTIAL'],
        },
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].client_type).toBe('POTENTIAL');
  });

  it('should support pagination', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('COUNT(*) as count')) {
        return {
          rows: [{ count: 25 }],
        };
      }
      return {
        rows: Array(10).fill(null).map((_, i) => ({
          id: `client-${i}`,
          first_name: `Client${i}`,
          last_name: `Test${i}`,
          email: `client${i}@test.com`,
        })),
      };
    });

    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'clients',
        query: 'Client',
        filters: {},
        limit: 10,
        offset: 10,
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.results).toHaveLength(10);
    expect(data.total).toBe(25);
    expect(data.offset).toBe(10);
    expect(data.hasMore).toBe(true);
  });
});
