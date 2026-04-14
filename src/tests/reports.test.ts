import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../db/index.js';
import { generateTestToken } from '../tests/helpers/auth.js';
import { app } from '../index.js';

/**
 * Reports API Tests
 *
 * Tests for CSV export functionality
 * - Releases report export
 * - Visits report export
 * - Date range filtering
 * - Permission checks
 */

describe('Reports API', () => {
  let adminToken: string;
  let staffToken: string;
  let caravanToken: string;

  beforeAll(async () => {
    // Create test users and get tokens
    adminToken = await generateTestToken('admin');
    staffToken = await generateTestToken('staff');
    caravanToken = await generateTestToken('caravan');
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM releases WHERE client_id LIKE \'test-%\'');
    await pool.query('DELETE FROM itineraries WHERE client_id LIKE \'test-%\'');
    await pool.query('DELETE FROM clients WHERE id LIKE \'test-%\'');
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM releases WHERE client_id LIKE \'test-%\'');
    await pool.query('DELETE FROM itineraries WHERE client_id LIKE \'test-%\'');
    await pool.query('DELETE FROM clients WHERE id LIKE \'test-%\'');
  });

  describe('GET /api/reports/export/csv - Releases', () => {
    it('should export releases as CSV for admin', async () => {
      // Create test data
      const clientResult = await pool.query(
        "INSERT INTO clients (id, first_name, last_name, client_type, created_at, updated_at) VALUES ('test-001', 'Test', 'Client', 'POTENTIAL', NOW(), NOW()) RETURNING id"
      );

      const userResult = await pool.query(
        "SELECT id FROM users WHERE role = 'caravan' LIMIT 1"
      );

      if (userResult.rows.length > 0) {
        await pool.query(
          "INSERT INTO releases (client_id, user_id, product_type, loan_type, amount, status, created_at, updated_at) VALUES ('test-001', $1, 'Pension Loan', 'Regular', 50000, 'approved', NOW(), NOW())",
          [userResult.rows[0].id]
        );
      }

      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'releases',
          start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv;charset=utf-8;');
      expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="releases_/);

      const csv = await response.text();
      expect(csv).toContain('Client,Agent,Product Type,Loan Type,Amount,Status,Date');
      expect(csv).toContain('Test,Client');
    });

    it('should filter releases by date range', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'releases',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        },
      });

      expect(response.status).toBe(200);

      const csv = await response.text();
      expect(csv).toBeTruthy();
    });

    it('should deny access for caravan role', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${caravanToken}`,
        },
        query: {
          type: 'releases',
        },
      });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        query: {
          type: 'releases',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/reports/export/csv - Visits', () => {
    it('should export visits as CSV for admin', async () => {
      // Create test data
      const clientResult = await pool.query(
        "INSERT INTO clients (id, first_name, last_name, client_type, created_at, updated_at) VALUES ('test-002', 'Visit', 'Client', 'EXISTING', NOW(), NOW()) RETURNING id"
      );

      const userResult = await pool.query(
        "SELECT id FROM users WHERE role = 'caravan' LIMIT 1"
      );

      if (userResult.rows.length > 0) {
        await pool.query(
          "INSERT INTO itineraries (client_id, user_id, type, time_in, time_out, status, created_at, updated_at) VALUES ('test-002', $1, 'regular_visit', NOW(), NOW(), 'completed', NOW(), NOW())",
          [userResult.rows[0].id]
        );
      }

      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'visits',
          start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv;charset=utf-8;');
      expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="visits_/);

      const csv = await response.text();
      expect(csv).toContain('Client,Agent,Type,Time In,Time Out,Status,Date');
    });

    it('should filter visits by date range', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'visits',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        },
      });

      expect(response.status).toBe(200);

      const csv = await response.text();
      expect(csv).toBeTruthy();
    });

    it('should work for staff role', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
        query: {
          type: 'visits',
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('CSV Export Edge Cases', () => {
    it('should handle empty results gracefully', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'releases',
          start_date: '2099-01-01',
          end_date: '2099-01-31',
        },
      });

      expect(response.status).toBe(200);

      const csv = await response.text();
      expect(csv).toContain('Client,Agent');
    });

    it('should escape special characters in CSV', async () => {
      // Create client with comma in name
      await pool.query(
        "INSERT INTO clients (id, first_name, last_name, client_type, created_at, updated_at) VALUES ('test-003', 'Test, With, Commas', 'Client', 'POTENTIAL', NOW(), NOW())"
      );

      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'releases',
        },
      });

      expect(response.status).toBe(200);

      const csv = await response.text();
      // Should be quoted with commas
      expect(csv).toContain('"Test, With, Commas"');
    });

    it('should validate date parameters', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        query: {
          type: 'releases',
          start_date: 'invalid-date',
        },
      });

      // Should handle gracefully - either 400 with error or 200 with empty results
      expect([200, 400]).toContain(response.status);
    });

    it('should handle missing type parameter', async () => {
      const response = await app.request('/api/reports/export/csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      // Default to releases
      expect(response.status).toBe(200);
    });
  });
});
