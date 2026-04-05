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

import touchpointsAnalyticsRouter from '../../src/routes/touchpoints-analytics.js';
import { pool } from '../../src/db/index.js';

// Create test app
const app = new Hono();
app.route('/', touchpointsAnalyticsRouter);

// Setup mock responses
const setupMockResponses = () => {
  (pool.query as any).mockImplementation((query: string, params?: any[]) => {
    // Return mock data based on query patterns
    if (query.includes('COUNT(*) as total') && !query.includes('GROUP BY')) {
      return {
        rows: [{
          total: 10,
          completed: 7,
          converted: 8,
          avg_time_minutes: 30.5,
        }],
      };
    }

    if (query.includes('touchpoint_number') && query.includes('GROUP BY')) {
      return {
        rows: [
          { touchpoint_number: 1, total: 10, converted: 8 },
          { touchpoint_number: 2, total: 8, converted: 6 },
          { touchpoint_number: 3, total: 6, converted: 4 },
          { touchpoint_number: 4, total: 5, converted: 3 },
          { touchpoint_number: 5, total: 4, converted: 2 },
          { touchpoint_number: 6, total: 3, converted: 1 },
          { touchpoint_number: 7, total: 2, converted: 1 },
        ],
      };
    }

    if (query.includes('t.date') && query.includes('GROUP BY t.date')) {
      return {
        rows: [
          { date: '2024-01-01', count: 5, completed: 3 },
          { date: '2024-01-02', count: 3, completed: 2 },
          { date: '2024-01-03', count: 2, completed: 2 },
        ],
      };
    }

    if (query.includes('t.user_id') && query.includes('GROUP BY t.user_id')) {
      return {
        rows: [
          {
            caravan_id: 'user-1',
            caravan_name: 'John Doe',
            total: 10,
            completed: 8,
            avg_time_minutes: 25.5,
          },
          {
            caravan_id: 'user-2',
            caravan_name: 'Jane Smith',
            total: 5,
            completed: 3,
            avg_time_minutes: 35.2,
          },
        ],
      };
    }

    if (query.includes('t.status') && query.includes('GROUP BY t.status')) {
      return {
        rows: [
          { status: 'Completed', count: 7 },
          { status: 'Interested', count: 2 },
          { status: 'Undecided', count: 1 },
          { status: 'Not Interested', count: 0 },
        ],
      };
    }

    return { rows: [] };
  });
};

beforeEach(() => {
  setupMockResponses();
});

describe('Touchpoints Analytics API (Unit Tests)', () => {
  describe('GET /api/touchpoints/analytics', () => {
    it('should return analytics data with all required properties', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('funnel');
      expect(data).toHaveProperty('trends');
      expect(data).toHaveProperty('caravanPerformance');
      expect(data).toHaveProperty('statusDistribution');
    });

    it('should return summary with correct structure', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(data.summary).toHaveProperty('total', 10);
      expect(data.summary).toHaveProperty('completed', 7);
      expect(data.summary).toHaveProperty('conversionRate');
      expect(data.summary).toHaveProperty('avgTime');
      expect(typeof data.summary.total).toBe('number');
      expect(typeof data.summary.completed).toBe('number');
      expect(typeof data.summary.conversionRate).toBe('number');
      expect(typeof data.summary.avgTime).toBe('number');
    });

    it('should calculate conversion rate correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Conversion rate = (8/10) * 100 = 80
      expect(data.summary.conversionRate).toBe(80);
    });

    it('should calculate average time correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Avg time = 30.5 minutes, rounded = 31
      expect(data.summary.avgTime).toBe(31);
    });

    it('should return funnel data for all 7 touchpoints', async () => {
      const response = await app.request('/');
      const data = await response.json();

      for (let i = 1; i <= 7; i++) {
        expect(data.funnel).toHaveProperty(`touchpoint${i}`);
        expect(data.funnel[`touchpoint${i}`]).toHaveProperty('total');
        expect(data.funnel[`touchpoint${i}`]).toHaveProperty('converted');
        expect(data.funnel[`touchpoint${i}`]).toHaveProperty('rate');
      }
    });

    it('should calculate funnel rates correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Touchpoint 1: 8/10 = 80%
      expect(data.funnel.touchpoint1.rate).toBe(80);
      // Touchpoint 2: 6/8 = 75%
      expect(data.funnel.touchpoint2.rate).toBe(75);
    });

    it('should return trends as an array', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.trends)).toBe(true);
      expect(data.trends.length).toBe(3);
      expect(data.trends[0]).toHaveProperty('date', '2024-01-01');
      expect(data.trends[0]).toHaveProperty('count', 5);
      expect(data.trends[0]).toHaveProperty('completed', 3);
    });

    it('should return caravan performance data', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.caravanPerformance)).toBe(true);
      expect(data.caravanPerformance.length).toBe(2);
      expect(data.caravanPerformance[0]).toHaveProperty('caravanId');
      expect(data.caravanPerformance[0]).toHaveProperty('caravanName');
      expect(data.caravanPerformance[0]).toHaveProperty('total');
      expect(data.caravanPerformance[0]).toHaveProperty('completed');
      expect(data.caravanPerformance[0]).toHaveProperty('rate');
      expect(data.caravanPerformance[0]).toHaveProperty('avgTime');
    });

    it('should calculate caravan performance rates correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Caravan 1: 8/10 = 80%
      expect(data.caravanPerformance[0].rate).toBe(80);
      // Caravan 2: 3/5 = 60%
      expect(data.caravanPerformance[1].rate).toBe(60);
    });

    it('should return status distribution', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.statusDistribution)).toBe(true);
      expect(data.statusDistribution.length).toBe(4);
      expect(data.statusDistribution[0]).toHaveProperty('status');
      expect(data.statusDistribution[0]).toHaveProperty('count');
      expect(data.statusDistribution[0]).toHaveProperty('percentage');
    });

    it('should calculate status distribution percentages correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Total = 7 + 2 + 1 = 10
      // Completed: 7/10 = 70%
      expect(data.statusDistribution[0].percentage).toBe(70);
      // Interested: 2/10 = 20%
      expect(data.statusDistribution[1].percentage).toBe(20);
      // Undecided: 1/10 = 10%
      expect(data.statusDistribution[2].percentage).toBe(10);

      const totalPercentage = data.statusDistribution.reduce(
        (sum: number, item: any) => sum + item.percentage,
        0
      );
      expect(totalPercentage).toBe(100);
    });

    it('should handle query parameters without errors', async () => {
      const response = await app.request('/?startDate=2024-01-01&endDate=2024-01-31');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('summary');
    });

    it('should handle caravanIds filter', async () => {
      const response = await app.request('/?caravanIds=user-1,user-2');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('caravanPerformance');
    });

    it('should handle clientTypes filter', async () => {
      const response = await app.request('/?clientTypes=POTENTIAL,EXISTING');
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should handle touchpointTypes filter', async () => {
      const response = await app.request('/?touchpointTypes=Visit,Call');
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should handle status filter', async () => {
      const response = await app.request('/?status=Completed,Interested');
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should handle all filters simultaneously', async () => {
      const response = await app.request(
        '/?startDate=2024-01-01&endDate=2024-01-31&caravanIds=user-1&clientTypes=POTENTIAL&touchpointTypes=Visit&status=Completed'
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('summary');
    });
  });

  describe('Role-based filtering', () => {
    it('should allow admin users to filter by caravanIds', async () => {
      const response = await app.request('/?caravanIds=user-1,user-2');
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should reject invalid date format', async () => {
      const response = await app.request('/?startDate=invalid-date');
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('Invalid startDate');
    });

    it('should accept valid endDate format with slashes (normalized)', async () => {
      const response = await app.request('/?endDate=2024/01/01');
      const data = await response.json();

      // JavaScript's new Date() accepts both YYYY-MM-DD and YYYY/MM/DD formats
      // The validation normalizes it to YYYY-MM-DD
      expect(response.status).toBe(200);
    });
  });

  describe('Input validation', () => {
    it('should accept valid date format (YYYY-MM-DD)', async () => {
      const response = await app.request('/?startDate=2024-01-01&endDate=2024-12-31');
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should handle empty comma-separated values', async () => {
      const response = await app.request('/?clientTypes=,,');
      const data = await response.json();

      // Empty values should be filtered out, not cause an error
      expect(response.status).toBe(200);
    });

    it('should trim whitespace from comma-separated values', async () => {
      const response = await app.request('/?clientTypes=POTENTIAL, EXISTING');
      const data = await response.json();

      expect(response.status).toBe(200);
    });
  });
});
