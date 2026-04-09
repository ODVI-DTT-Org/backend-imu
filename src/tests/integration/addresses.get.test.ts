// src/tests/integration/addresses.get.test.ts

/**
 * Integration Tests: Addresses GET endpoints
 *
 * @file addresses.get.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup/integration-setup.js';
import { testTokens } from './fixtures/tokens.js';
import { mockClient, mockAddressList } from './fixtures/addresses.js';
import { mockPSGC } from './fixtures/psgc.js';

describe('Addresses GET Integration Tests', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/addresses', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/addresses', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.message).toContain('Unauthorized');
    });
  });

  describe('GET /api/addresses/:clientId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/addresses/${mockClient.id}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.message).toContain('Unauthorized');
    });

    it('should return client\'s addresses with authentication', async () => {
      const response = await app.request(`/api/addresses/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json).toHaveProperty('addresses');
      expect(Array.isArray(json.addresses)).toBe(true);
      expect(json.addresses.length).toBeGreaterThan(0);

      // Verify address structure
      const address = json.addresses[0];
      expect(address).toHaveProperty('id');
      expect(address).toHaveProperty('client_id');
      expect(address).toHaveProperty('label');
      expect(address).toHaveProperty('street_address');
      expect(address).toHaveProperty('postal_code');
    });

    it('should include PSGC data when available', async () => {
      const response = await app.request(`/api/addresses/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.addresses.length).toBeGreaterThan(0);

      // Check if first address has PSGC data
      const firstAddress = json.addresses[0];
      if (firstAddress.psgc_id) {
        expect(firstAddress).toHaveProperty('psgc');
        expect(firstAddress.psgc).toHaveProperty('region');
        expect(firstAddress.psgc).toHaveProperty('province');
        expect(firstAddress.psgc).toHaveProperty('city_municipality');
        expect(firstAddress.psgc).toHaveProperty('barangay');
      }
    });

    it('should filter out deleted addresses', async () => {
      const response = await app.request(`/api/addresses/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      // All returned addresses should not be deleted
      json.addresses.forEach((address: any) => {
        expect(address.deleted_at).toBeNull();
      });
    });

    it('should return empty array for client with no addresses', async () => {
      // Use a client ID that doesn't have addresses
      const unknownClientId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/addresses/${unknownClientId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.addresses).toEqual([]);
    });
  });
});
