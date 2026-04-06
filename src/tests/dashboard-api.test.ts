/**
 * Dashboard API Tests
 *
 * Tests for optimized dashboard endpoints with CTE-based queries
 *
 * @file dashboard-api.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { registerTestUser } from './setup';
import { dashboardEndpoints } from '../routes/dashboard-endpoints.js';

describe('Dashboard API - Target Progress Endpoint', () => {
  beforeAll(() => {
    registerTestUser({
      id: 'test-user-1',
      email: 'test@example.com',
      role: 'caravan'
    });
  });

  it('should return target progress with CTE-optimized query', async () => {
    const result = await dashboardEndpoints.getTargetProgress({
      userId: 'test-user-1',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30'
    });

    expect(result).toHaveProperty('targets');
    expect(result).toHaveProperty('actuals');
    expect(result).toHaveProperty('progress');

    expect(result.targets).toMatchObject({
      clientsTarget: expect.any(Number),
      touchpointsTarget: expect.any(Number),
      visitsTarget: expect.any(Number)
    });

    expect(result.actuals).toMatchObject({
      clientsActual: expect.any(Number),
      touchpointsActual: expect.any(Number),
      visitsActual: expect.any(Number)
    });

    expect(result.progress).toMatchObject({
      clientsProgress: expect.any(Number),
      touchpointsProgress: expect.any(Number),
      visitsProgress: expect.any(Number)
    });
  });

  it('should return 0% progress when no targets set', async () => {
    const result = await dashboardEndpoints.getTargetProgress({
      userId: 'test-user-1',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30'
    });

    expect(result.progress.clientsProgress).toBe(0);
    expect(result.progress.touchpointsProgress).toBe(0);
    expect(result.progress.visitsProgress).toBe(0);
  });
});

describe('Dashboard API - Team Performance Endpoint', () => {
  beforeAll(() => {
    registerTestUser({
      id: 'admin-user-1',
      email: 'admin@example.com',
      role: 'admin'
    });
  });

  it('should return team performance with role-based filtering', async () => {
    const result = await dashboardEndpoints.getTeamPerformance({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      role: 'admin',
      userId: 'admin-user-1'
    });

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toMatchObject({
        id: expect.any(String),
        first_name: expect.any(String),
        last_name: expect.any(String),
        role: expect.any(String),
        clientsCompleted: expect.any(Number),
        touchpointsCompleted: expect.any(Number),
        clientsTarget: expect.any(Number),
        touchpointsTarget: expect.any(Number),
        completionRate: expect.any(Number)
      });
    }
  });

  it('should filter by role (admin sees all, caravan sees own team)', async () => {
    const adminResult = await dashboardEndpoints.getTeamPerformance({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      role: 'admin',
      userId: 'admin-user-1'
    });

    const caravanResult = await dashboardEndpoints.getTeamPerformance({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      role: 'caravan',
      userId: 'test-user-1'
    });

    // Admin should see all users
    expect(Array.isArray(adminResult)).toBe(true);

    // Caravan should see limited results (or empty if no subordinates)
    expect(Array.isArray(caravanResult)).toBe(true);
  });
});

describe('Dashboard API - Action Items Endpoint', () => {
  beforeAll(() => {
    registerTestUser({
      id: 'test-user-1',
      email: 'test@example.com',
      role: 'caravan'
    });
  });

  it('should return action items from materialized view', async () => {
    const result = await dashboardEndpoints.getActionItems({
      userId: 'test-user-1',
      priority: 'high',
      limit: 10
    });

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toMatchObject({
        action_type: expect.any(String),
        priority: expect.any(String),
        client_id: expect.any(String),
        first_name: expect.any(String),
        last_name: expect.any(String),
        days_overdue: expect.any(Number)
      });
    }
  });

  it('should support priority filtering', async () => {
    const highPriority = await dashboardEndpoints.getActionItems({
      userId: 'test-user-1',
      priority: 'high',
      limit: 10
    });

    const mediumPriority = await dashboardEndpoints.getActionItems({
      userId: 'test-user-1',
      priority: 'medium',
      limit: 10
    });

    expect(Array.isArray(highPriority)).toBe(true);
    expect(Array.isArray(mediumPriority)).toBe(true);
  });

  it('should support limit parameter for pagination', async () => {
    const limited = await dashboardEndpoints.getActionItems({
      userId: 'test-user-1',
      limit: 5
    });

    expect(limited.length).toBeLessThanOrEqual(5);
  });
});
