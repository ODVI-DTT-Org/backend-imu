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

// Mock the permission middleware to bypass permission checks
vi.mock('../../src/middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
  requireAnyPermission: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
  requireAllPermissions: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
  getUserPermissions: vi.fn(),
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
  clearPermissionCache: vi.fn(),
  clearAllPermissionCache: vi.fn(),
}));

// Mock the GPS validation service
vi.mock('../../src/services/gps-validation.js', () => ({
  validateTouchpointLocation: vi.fn(),
}));

import touchpointsRouter from '../../src/routes/touchpoints.js';
import { pool } from '../../src/db/index.js';
import { validateTouchpointLocation } from '../../src/services/gps-validation.js';

// Create test app
const app = new Hono();
app.route('/api/touchpoints', touchpointsRouter);

describe('Touchpoints GPS Validation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate touchpoint location and return distance', async () => {
    // Setup mock responses
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('FROM touchpoints t')) {
        return {
          rows: [{
            id: 'touchpoint-123',
            time_in_gps_lat: 14.6095,
            time_in_gps_lng: 120.9942,
            time_in_gps_address: '123 Test Street',
            client_latitude: 14.5995,
            client_longitude: 120.9842,
          }],
        };
      }
      return { rows: [] };
    });

    (validateTouchpointLocation as any).mockResolvedValue({
      touchpointId: 'touchpoint-123',
      clientLocation: {
        lat: 14.5995,
        lng: 120.9842,
        address: null,
      },
      touchpointLocation: {
        lat: 14.6095,
        lng: 120.9942,
        address: '123 Test Street',
      },
      distance: 1523.45,
      status: 'offsite',
      mapUrl: 'https://www.google.com/maps/dir/?api=1&origin=14.5995,120.9842&destination=14.6095,120.9942',
    });

    const response = await app.request('/api/touchpoints/touchpoint-123/gps-validate', {
      method: 'GET',
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('distance');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('clientLocation');
    expect(data).toHaveProperty('touchpointLocation');
    expect(data.distance).toBe(1523.45);
    expect(data.status).toBe('offsite');
  });

  it('should return 404 for non-existent touchpoint', async () => {
    (pool.query as any).mockReturnValue({ rows: [] });

    const response = await app.request('/api/touchpoints/00000000-0000-0000-0000-000000000000/gps-validate', {
      method: 'GET',
    });

    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toBe('Touchpoint not found');
  });

  it('should handle GPS validation service errors', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('FROM touchpoints t')) {
        return {
          rows: [{
            id: 'touchpoint-123',
            time_in_gps_lat: 14.6095,
            time_in_gps_lng: 120.9942,
            time_in_gps_address: '123 Test Street',
            client_latitude: 14.5995,
            client_longitude: 120.9842,
          }],
        };
      }
      return { rows: [] };
    });

    (validateTouchpointLocation as any).mockRejectedValue(new Error('GPS service error'));

    const response = await app.request('/api/touchpoints/touchpoint-123/gps-validate', {
      method: 'GET',
    });

    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toBe('Failed to validate GPS location');
  });

  it('should handle touchpoints without client address', async () => {
    (pool.query as any).mockImplementation((query: string, params?: any[]) => {
      if (query.includes('FROM touchpoints t')) {
        return {
          rows: [{
            id: 'touchpoint-123',
            time_in_gps_lat: 14.6095,
            time_in_gps_lng: 120.9942,
            time_in_gps_address: '123 Test Street',
            client_latitude: null,
            client_longitude: null,
          }],
        };
      }
      return { rows: [] };
    });

    (validateTouchpointLocation as any).mockResolvedValue({
      touchpointId: 'touchpoint-123',
      clientLocation: {
        lat: null,
        lng: null,
        address: null,
      },
      touchpointLocation: {
        lat: 14.6095,
        lng: 120.9942,
        address: '123 Test Street',
      },
      distance: null,
      status: 'unknown',
      mapUrl: '',
    });

    const response = await app.request('/api/touchpoints/touchpoint-123/gps-validate', {
      method: 'GET',
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('unknown');
    expect(data.distance).toBeNull();
  });
});
