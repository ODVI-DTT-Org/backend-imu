import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../index';
import { pool } from '../lib/db';

describe('GET /api/clients - Area Filtering', () => {
  let adminToken: string;
  let caravanToken: string;
  let areaManagerToken: string;
  let teleToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create admin user and get token
    const adminRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@imu.test',
        password: 'admin123'
      })
    });
    const adminData = await adminRes.json();
    adminToken = adminData.token;

    // Create caravan user
    const caravanRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: 'caravan-test@imu.test',
        password: 'test123',
        first_name: 'Test',
        last_name: 'Caravan',
        role: 'caravan'
      })
    });
    const caravanData = await caravanRes.json();
    testUserId = caravanData.user.id;

    // Login as caravan to get token
    const caravanLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'caravan-test@imu.test',
        password: 'test123'
      })
    });
    const caravanLoginData = await caravanLoginRes.json();
    caravanToken = caravanLoginData.token;

    // Assign caravan user to BOHOL-TAGBILARAN
    await pool.query(
      'INSERT INTO user_locations (user_id, province, municipality, assigned_by) VALUES ($1, $2, $3, $4)',
      [testUserId, 'BOHOL', 'TAGBILARAN', adminData.user.id]
    );

    // Create test clients
    await pool.query(
      `INSERT INTO clients (id, first_name, last_name, province, municipality, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['bohol-client-1', 'Bohol', 'Client 1', 'BOHOL', 'TAGBILARAN', adminData.user.id]
    );

    await pool.query(
      `INSERT INTO clients (id, first_name, last_name, province, municipality, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['cebu-client-1', 'Cebu', 'Client 1', 'CEBU', 'CEBU CITY', adminData.user.id]
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM user_locations WHERE user_id = $1', [testUserId]);
    await pool.query("DELETE FROM clients WHERE id IN ('bohol-client-1', 'cebu-client-1')");
    await pool.query("DELETE FROM users WHERE email = 'caravan-test@imu.test'");
  });

  it('should return only clients in user\'s assigned areas for caravan role', async () => {
    const response = await app.request('/api/clients', {
      headers: { Authorization: `Bearer ${caravanToken}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();

    // Should only see BOHOL client, not CEBU client
    const boholClient = data.items.find((c: any) => c.id === 'bohol-client-1');
    const cebuClient = data.items.find((c: any) => c.id === 'cebu-client-1');

    expect(boholClient).toBeDefined();
    expect(cebuClient).toBeUndefined();
  });

  it('should return all clients for admin role (no area filter)', async () => {
    const response = await app.request('/api/clients', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(1); // Should see both BOHOL and CEBU clients
  });

  it('should return all clients for area manager role (no area filter)', async () => {
    // Create area manager user
    const amRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: 'area-manager-test@imu.test',
        password: 'test123',
        first_name: 'Test',
        last_name: 'Area Manager',
        role: 'area_manager'
      })
    });
    const amData = await amRes.json();

    // Login as area manager
    const amLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'area-manager-test@imu.test',
        password: 'test123'
      })
    });
    const amLoginData = await amLoginRes.json();

    const response = await app.request('/api/clients', {
      headers: { Authorization: `Bearer ${amLoginData.token}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(1); // Should see all clients

    // Cleanup
    await pool.query("DELETE FROM users WHERE email = 'area-manager-test@imu.test'");
  });

  it('should filter by assigned areas for tele role', async () => {
    // Create tele user
    const teleRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: 'tele-test@imu.test',
        password: 'test123',
        first_name: 'Test',
        last_name: 'Tele',
        role: 'tele'
      })
    });
    const teleData = await teleRes.json();

    // Login as tele
    const teleLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tele-test@imu.test',
        password: 'test123'
      })
    });
    const teleLoginData = await teleLoginRes.json();

    // Assign tele user to BOHOL-TAGBILARAN
    await pool.query(
      'INSERT INTO user_locations (user_id, province, municipality, assigned_by) VALUES ($1, $2, $3, $4)',
      [teleData.user.id, 'BOHOL', 'TAGBILARAN', adminData.user.id]
    );

    const response = await app.request('/api/clients', {
      headers: { Authorization: `Bearer ${teleLoginData.token}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();

    // Should only see BOHOL client
    const boholClient = data.items.find((c: any) => c.id === 'bohol-client-1');
    const cebuClient = data.items.find((c: any) => c.id === 'cebu-client-1');

    expect(boholClient).toBeDefined();
    expect(cebuClient).toBeUndefined();

    // Cleanup
    await pool.query('DELETE FROM user_locations WHERE user_id = $1', [teleData.user.id]);
    await pool.query("DELETE FROM users WHERE email = 'tele-test@imu.test'");
  });

  it('should handle clients with no area assignments', async () => {
    // Create caravan user without area assignments
    const noAreaRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        email: 'caravan-no-area@imu.test',
        password: 'test123',
        first_name: 'Test',
        last_name: 'No Area',
        role: 'caravan'
      })
    });
    const noAreaData = await noAreaRes.json();

    // Login as caravan without areas
    const noAreaLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'caravan-no-area@imu.test',
        password: 'test123'
      })
    });
    const noAreaLoginData = await noAreaLoginRes.json();

    const response = await app.request('/api/clients', {
      headers: { Authorization: `Bearer ${noAreaLoginData.token}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toBeDefined();
    expect(data.items).toHaveLength(0); // No clients should be visible without area assignments

    // Cleanup
    await pool.query("DELETE FROM users WHERE email = 'caravan-no-area@imu.test'");
  });
});
