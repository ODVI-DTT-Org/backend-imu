import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../index';

describe('POST /api/itineraries - Multiple Clients', () => {
  let authToken: string;
  let testUserId: string;
  let testClientIds: string[];

  beforeAll(async () => {
    // Create test user and get auth token
    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });

    if (loginResponse.status !== 200) {
      throw new Error('Failed to login test user');
    }

    const loginData = await loginResponse.json();
    authToken = loginResponse.token || loginData.token;
    testUserId = loginData.user?.id;

    if (!authToken || !testUserId) {
      throw new Error('Failed to get auth token or user ID');
    }

    // Create test clients
    const clients = [];
    for (let i = 0; i < 3; i++) {
      const clientResponse = await app.request('/api/clients', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: `Test${i}`,
          last_name: `Client${i}`,
          email: `test${i}@example.com`,
          phone: '1234567890',
          province: 'CEBU',
          municipality: 'CEBU CITY'
        })
      });

      if (clientResponse.status !== 201) {
        throw new Error(`Failed to create test client ${i}`);
      }

      const clientData = await clientResponse.json();
      clients.push(clientData.data || clientData);
    }
    testClientIds = clients.map(c => c.id);
  });

  it('should create itinerary with multiple client IDs', async () => {
    const response = await app.request('/api/itineraries', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: testUserId,
        client_ids: testClientIds,  // Array of client IDs
        scheduled_date: '2026-04-08',
        scheduled_time: '09:00',
        status: 'pending',
        priority: 'normal'
      })
    });

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.itineraries).toBeDefined();
    expect(data.itineraries).toHaveLength(3);
    expect(data.count).toBe(3);
  });

  it('should validate at least one client ID is provided', async () => {
    const response = await app.request('/api/itineraries', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: testUserId,
        client_ids: [],  // Empty array
        scheduled_date: '2026-04-08'
      })
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error || data.message).toMatch(/at least one client/i);
  });

  it('should use transaction for all-or-nothing insertion', async () => {
    // Try to create with one valid and one invalid client ID
    const invalidClientId = '00000000-0000-0000-0000-000000000000';

    const response = await app.request('/api/itineraries', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: testUserId,
        client_ids: [testClientIds[0], invalidClientId],
        scheduled_date: '2026-04-08'
      })
    });

    // Should fail completely or succeed completely
    expect([201, 400, 404]).toContain(response.status);

    // If it failed, no itineraries should be created
    if (response.status !== 201) {
      const checkResponse = await app.request(
        `/api/itineraries?client_id=${testClientIds[0]}&scheduled_date=2026-04-08`,
        {
          headers: { 'authorization': `Bearer ${authToken}` }
        }
      );

      const checkData = await checkResponse.json();
      expect(checkData.itineraries || checkData.data).toHaveLength(0);
    }
  });
});
