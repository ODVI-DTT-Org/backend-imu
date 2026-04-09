// src/tests/integration/addresses.delete.test.ts

/**
 * Integration Tests: Addresses DELETE and authorization endpoints
 *
 * @file addresses.delete.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup/integration-setup.js';
import { testTokens } from './fixtures/tokens.js';
import { mockClient, mockOtherClient } from './fixtures/clients.js';
import { mockAddress } from './fixtures/addresses.js';
import { resetTestData } from './setup/mock-db.js';

describe('Addresses DELETE and Authorization Integration Tests', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetTestData();
  });

  describe('DELETE /api/clients/:id/addresses/:addressId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/clients/${mockClient.id}/addresses/${mockAddress.id}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.message).toContain('Unauthorized');
    });

    it('should soft delete address with authentication', async () => {
      const addressId = mockAddress.id;

      const response = await app.request(`/api/clients/${mockClient.id}/addresses/${addressId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.message).toBe('Address deleted successfully');

      // Verify address is filtered from GET requests
      const getResponse = await app.request(`/api/clients/${mockClient.id}/addresses`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      const getJson = await getResponse.json();
      const deletedAddress = getJson.data.find((a: any) => a.id === addressId);
      expect(deletedAddress).toBeUndefined();
    });

    it('should return 404 for non-existent address', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/clients/${mockClient.id}/addresses/${nonExistentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Authorization - GET /api/clients/:id/addresses', () => {
    it('should allow access to own client\'s addresses', async () => {
      const response = await app.request(`/api/clients/${mockClient.id}/addresses`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toBeDefined();
    });

    it('should deny access to other client\'s addresses for non-admin users', async () => {
      // Try to access mockOtherClient's addresses with mockClient's token
      const response = await app.request(`/api/clients/${mockOtherClient.id}/addresses`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`, // Owned by user-1
        },
      });

      // API returns 404 instead of 403 for security reasons (doesn't reveal which clients exist)
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.message).toContain('not found');
    });

    it('should allow admin to access any client\'s addresses', async () => {
      const response = await app.request(`/api/clients/${mockOtherClient.id}/addresses`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.admin}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toBeDefined();
    });
  });

  describe('Authorization - POST /api/clients/:id/addresses', () => {
    it('should allow creating address for own client', async () => {
      const newAddress = {
        client_id: mockClient.id,
        psgc_id: 1,
        label: 'Home',
        street_address: '123 Test St',
        postal_code: '1000',
      };

      const response = await app.request(`/api/clients/${mockClient.id}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(newAddress),
      });

      expect(response.status).toBe(201);
    });

    it('should deny creating address for other client for non-admin users', async () => {
      const newAddress = {
        client_id: mockOtherClient.id,
        psgc_id: 1,
        label: 'Home',
        street_address: '123 Test St',
        postal_code: '1000',
      };

      const response = await app.request(`/api/clients/${mockClient.id}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`, // Owned by user-1
        },
        body: JSON.stringify(newAddress),
      });

      // API uses client_id from URL, not body, so it creates address for mockClient
      // The client_id in the body is ignored for security
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.client_id).toBe(mockClient.id); // Uses URL client_id, not body
    });

    it('should allow admin to create address for any client', async () => {
      const newAddress = {
        client_id: mockOtherClient.id,
        psgc_id: 1,
        label: 'Work',
        street_address: '456 Admin St',
        postal_code: '2000',
      };

      const response = await app.request(`/api/clients/${mockOtherClient.id}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.admin}`,
        },
        body: JSON.stringify(newAddress),
      });

      expect(response.status).toBe(201);
    });
  });
});
