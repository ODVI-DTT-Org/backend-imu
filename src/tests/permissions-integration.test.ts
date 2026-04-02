/**
 * Permission System Integration Tests
 *
 * These tests verify the permission middleware, API endpoints,
 * and permission checking logic work correctly together.
 *
 * @file permissions-integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/index.js';
import {
  createTestApp,
  generateTestTokens,
  makeAuthenticatedRequest,
  parseJsonResponse,
  type TestUser,
} from './test-helpers.js';

describe('Permission System Integration Tests', () => {
  let testUsers: Record<string, TestUser>;
  let testTokens: {
    admin: string;
    areaManager: string;
    assistantAreaManager: string;
    caravan: string;
    tele: string;
  };
  let testApp: Hono;

  beforeAll(async () => {
    // Create test users
    const adminUser = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['integration-admin@test.imu', '$2a$10$EtlkOyxStJE9LNnxHNqiRu1yJxoguQGtd7yUPPwBtvnSyrNltECMC', 'Integration', 'Admin', 'admin']
    );

    const areaManagerUser = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['integration-areamgr@test.imu', '$2a$10$EtlkOyxStJE9LNnxHNqiRu1yJxoguQGtd7yUPPwBtvnSyrNltECMC', 'Integration', 'Area Manager', 'area_manager']
    );

    const assistantAreaManagerUser = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['integration-asstareamgr@test.imu', '$2a$10$EtlkOyxStJE9LNnxHNqiRu1yJxoguQGtd7yUPPwBtvnSyrNltECMC', 'Integration', 'Asst Area Manager', 'assistant_area_manager']
    );

    const caravanUser = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['integration-caravan@test.imu', '$2a$10$EtlkOyxStJE9LNnxHNqiRu1yJxoguQGtd7yUPPwBtvnSyrNltECMC', 'Integration', 'Caravan', 'caravan']
    );

    const teleUser = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['integration-tele@test.imu', '$2a$10$EtlkOyxStJE9LNnxHNqiRu1yJxoguQGtd7yUPPwBtvnSyrNltECMC', 'Integration', 'Tele', 'tele']
    );

    testUsers = {
      admin: {
        id: adminUser.rows[0].id,
        email: 'integration-admin@test.imu',
        first_name: 'Integration',
        last_name: 'Admin',
        role: 'admin',
      },
      areaManager: {
        id: areaManagerUser.rows[0].id,
        email: 'integration-areamgr@test.imu',
        first_name: 'Integration',
        last_name: 'Area Manager',
        role: 'area_manager',
      },
      assistantAreaManager: {
        id: assistantAreaManagerUser.rows[0].id,
        email: 'integration-asstareamgr@test.imu',
        first_name: 'Integration',
        last_name: 'Asst Area Manager',
        role: 'assistant_area_manager',
      },
      caravan: {
        id: caravanUser.rows[0].id,
        email: 'integration-caravan@test.imu',
        first_name: 'Integration',
        last_name: 'Caravan',
        role: 'caravan',
      },
      tele: {
        id: teleUser.rows[0].id,
        email: 'integration-tele@test.imu',
        first_name: 'Integration',
        last_name: 'Tele',
        role: 'tele',
      },
    };

    testTokens = generateTestTokens(testUsers);
    testApp = createTestApp();
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM users WHERE email LIKE 'integration-%@test.imu'");
  });

  describe('requirePermission middleware', () => {
    it('should allow admin to access clients read endpoint', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.admin
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Clients access granted');
    });

    it('should allow area manager to access clients read endpoint', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.areaManager
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow caravan to access clients read endpoint', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.caravan
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow tele to access clients read endpoint', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.tele
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should deny access without valid token', async () => {
      const response = await testApp.request('http://localhost/api/test/clients', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(response.status).toBe(401);
    });

    it('should deny access without token', async () => {
      const response = await testApp.request('http://localhost/api/test/clients');

      expect(response.status).toBe(401);
    });
  });

  describe('Client creation permissions', () => {
    it('should allow admin to create clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.admin,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow area manager to create clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.areaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow caravan to create clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.caravan,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should deny tele to create clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.tele,
        { method: 'POST' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });
  });

  describe('Client deletion permissions', () => {
    it('should allow admin to delete clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients/123',
        testTokens.admin,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow area manager to delete clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients/123',
        testTokens.areaManager,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should deny caravan to delete clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients/123',
        testTokens.caravan,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });

    it('should deny tele to delete clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients/123',
        testTokens.tele,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });
  });

  describe('Touchpoint creation permissions with constraints', () => {
    it('should allow admin to create visit touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/visit',
        testTokens.admin,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow admin to create call touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/call',
        testTokens.admin,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow area manager to create visit touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/visit',
        testTokens.areaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow area manager to create call touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/call',
        testTokens.areaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow caravan to create visit touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/visit',
        testTokens.caravan,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should deny caravan to create call touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/call',
        testTokens.caravan,
        { method: 'POST' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });

    it('should deny tele to create visit touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/visit',
        testTokens.tele,
        { method: 'POST' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });

    it('should allow tele to create call touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/call',
        testTokens.tele,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });
  });

  describe('Assistant Area Manager permissions', () => {
    it('should allow assistant area manager to create clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients',
        testTokens.assistantAreaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should deny assistant area manager to delete clients', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/clients/123',
        testTokens.assistantAreaManager,
        { method: 'DELETE' }
      );

      expect(response.status).toBe(403);

      const json = await parseJsonResponse<{ message: string }>(response);
      expect(json.message).toContain('Forbidden');
    });

    it('should allow assistant area manager to create visit touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/visit',
        testTokens.assistantAreaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });

    it('should allow assistant area manager to create call touchpoints', async () => {
      const response = await makeAuthenticatedRequest(
        testApp,
        '/api/test/touchpoints/call',
        testTokens.assistantAreaManager,
        { method: 'POST' }
      );

      expect(response.status).toBe(200);

      const json = await parseJsonResponse<{ success: boolean; message: string }>(response);
      expect(json.success).toBe(true);
    });
  });
});
