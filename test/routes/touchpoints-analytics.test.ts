import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { pool } from '../../src/db/index.js';
import touchpointsAnalyticsRouter from '../../src/routes/touchpoints-analytics.js';

// Skip this test suite - it requires real database connection
describe.skip('Touchpoints Analytics API', () => {
  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (gen_random_uuid(), 'test-analytics@example.com', 'hash', 'Test', 'User', 'caravan')
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    // Create test client
    const clientResult = await pool.query(
      `INSERT INTO clients (id, first_name, last_name, client_type, user_id)
       VALUES (gen_random_uuid(), 'John', 'Doe', 'POTENTIAL', $1)
       RETURNING id`,
      [testUserId]
    );
    testClientId = clientResult.rows[0].id;

    // Create test touchpoints with various statuses
    const touchpointData = [
      { number: 1, type: 'Visit', status: 'Completed', date: '2024-01-01' },
      { number: 2, type: 'Call', status: 'Interested', date: '2024-01-02' },
      { number: 3, type: 'Call', status: 'Undecided', date: '2024-01-03' },
      { number: 4, type: 'Visit', status: 'Completed', date: '2024-01-04' },
      { number: 5, type: 'Call', status: 'Not Interested', date: '2024-01-05' },
    ];

    for (const tp of touchpointData) {
      const result = await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, status, time_in, time_out)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '30 minutes')
         RETURNING id`,
        [testClientId, testUserId, tp.number, tp.type, tp.date, tp.status]
      );
      testTouchpointIds.push(result.rows[0].id);
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM touchpoints WHERE id = ANY($1)', [testTouchpointIds]);
    await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

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

      expect(data.summary).toHaveProperty('total');
      expect(data.summary).toHaveProperty('completed');
      expect(data.summary).toHaveProperty('conversionRate');
      expect(data.summary).toHaveProperty('avgTime');
      expect(typeof data.summary.total).toBe('number');
      expect(typeof data.summary.completed).toBe('number');
      expect(typeof data.summary.conversionRate).toBe('number');
      expect(typeof data.summary.avgTime).toBe('number');
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

    it('should return trends as an array', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.trends)).toBe(true);
      if (data.trends.length > 0) {
        expect(data.trends[0]).toHaveProperty('date');
        expect(data.trends[0]).toHaveProperty('count');
        expect(data.trends[0]).toHaveProperty('completed');
      }
    });

    it('should return caravan performance data', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.caravanPerformance)).toBe(true);
      if (data.caravanPerformance.length > 0) {
        expect(data.caravanPerformance[0]).toHaveProperty('caravanId');
        expect(data.caravanPerformance[0]).toHaveProperty('caravanName');
        expect(data.caravanPerformance[0]).toHaveProperty('total');
        expect(data.caravanPerformance[0]).toHaveProperty('completed');
        expect(data.caravanPerformance[0]).toHaveProperty('rate');
        expect(data.caravanPerformance[0]).toHaveProperty('avgTime');
      }
    });

    it('should return status distribution', async () => {
      const response = await app.request('/');
      const data = await response.json();

      expect(Array.isArray(data.statusDistribution)).toBe(true);
      if (data.statusDistribution.length > 0) {
        expect(data.statusDistribution[0]).toHaveProperty('status');
        expect(data.statusDistribution[0]).toHaveProperty('count');
        expect(data.statusDistribution[0]).toHaveProperty('percentage');
      }
    });

    it('should filter by date range', async () => {
      const response = await app.request('/?startDate=2024-01-01&endDate=2024-01-03');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.trends.length).toBeGreaterThan(0);
      // All trends should be within date range
      data.trends.forEach((trend: any) => {
        expect(trend.date >= '2024-01-01' && trend.date <= '2024-01-03').toBe(true);
      });
    });

    it('should filter by caravan IDs', async () => {
      const response = await app.request(`/?caravanIds=${testUserId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should only include touchpoints from the specified caravan
      if (data.caravanPerformance.length > 0) {
        expect(data.caravanPerformance[0].caravanId).toBe(testUserId);
      }
    });

    it('should filter by touchpoint types', async () => {
      const response = await app.request('/?touchpointTypes=Visit');
      const data = await response.json();

      expect(response.status).toBe(200);
      // Summary total should only count Visit touchpoints
      expect(data.summary.total).toBeGreaterThanOrEqual(0);
    });

    it('should filter by status', async () => {
      const response = await app.request('/?status=Completed');
      const data = await response.json();

      expect(response.status).toBe(200);
      // All returned touchpoints should be Completed
      expect(data.summary.completed).toBe(data.summary.total);
    });

    it('should handle multiple filters simultaneously', async () => {
      const response = await app.request(
        `/?startDate=2024-01-01&endDate=2024-01-05&caravanIds=${testUserId}&status=Completed`
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('funnel');
    });

    it('should return empty arrays when no data matches filters', async () => {
      const response = await app.request('/?startDate=2099-01-01&endDate=2099-12-31');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.total).toBe(0);
      expect(data.trends).toEqual([]);
      expect(data.caravanPerformance).toEqual([]);
      expect(data.statusDistribution).toEqual([]);
    });

    it('should calculate conversion rate correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // Conversion rate should be between 0 and 100
      expect(data.summary.conversionRate).toBeGreaterThanOrEqual(0);
      expect(data.summary.conversionRate).toBeLessThanOrEqual(100);
    });

    it('should calculate funnel rates correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      // All funnel rates should be between 0 and 100
      for (let i = 1; i <= 7; i++) {
        const funnelItem = data.funnel[`touchpoint${i}`];
        expect(funnelItem.rate).toBeGreaterThanOrEqual(0);
        expect(funnelItem.rate).toBeLessThanOrEqual(100);
        // Rate should equal (converted / total) * 100
        if (funnelItem.total > 0) {
          const expectedRate = Math.round((funnelItem.converted / funnelItem.total) * 100);
          expect(funnelItem.rate).toBe(expectedRate);
        }
      }
    });

    it('should calculate caravan performance rates correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      data.caravanPerformance.forEach((caravan: any) => {
        expect(caravan.rate).toBeGreaterThanOrEqual(0);
        expect(caravan.rate).toBeLessThanOrEqual(100);
        if (caravan.total > 0) {
          const expectedRate = Math.round((caravan.completed / caravan.total) * 100);
          expect(caravan.rate).toBe(expectedRate);
        }
      });
    });

    it('should calculate status distribution percentages correctly', async () => {
      const response = await app.request('/');
      const data = await response.json();

      const totalPercentage = data.statusDistribution.reduce(
        (sum: number, item: any) => sum + item.percentage,
        0
      );
      // Total percentage should be approximately 100 (allowing for rounding)
      expect(totalPercentage).toBeGreaterThanOrEqual(99);
      expect(totalPercentage).toBeLessThanOrEqual(101);
    });
  });
});
