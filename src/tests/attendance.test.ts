/**
 * Attendance Endpoint Tests
 *
 * @file attendance.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/index.js';
import attendance from '../routes/attendance.js';
import { generateTestToken } from './test-helpers.js';

describe('GET /attendance/:id', () => {
  let testUserId: string;
  let testAttendanceId: string;
  let authToken: string;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (gen_random_uuid(), 'test-attendance@example.com', '$2a$10$test', 'Test', 'User', 'caravan')
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;
    authToken = generateTestToken({
      id: testUserId,
      email: 'test-attendance@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'caravan'
    });

    // Create test attendance record
    const attendanceResult = await pool.query(
      `INSERT INTO attendance (id, user_id, date, time_in, location_in_lat, location_in_lng)
       VALUES (gen_random_uuid(), $1, CURRENT_DATE, CURRENT_TIME, 14.5995, 120.9842)
       RETURNING id`,
      [testUserId]
    );
    testAttendanceId = attendanceResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  it('should return attendance record by ID for owner', async () => {
    const res = await attendance.request(`/attendance/${testAttendanceId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(testAttendanceId);
    expect(data.user_id).toBe(testUserId);
  });

  it('should return 404 for non-existent attendance record', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await attendance.request(`/attendance/${fakeId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(res.status).toBe(404);
  });

  it('should return 401 without auth token', async () => {
    const res = await attendance.request(`/attendance/${testAttendanceId}`);

    expect(res.status).toBe(401);
  });

  it('should include user information in response', async () => {
    const res = await attendance.request(`/attendance/${testAttendanceId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('user');
    expect(data.user).toHaveProperty('first_name');
    expect(data.user).toHaveProperty('last_name');
  });
});
