// src/tests/integration/addresses.post.test.ts

/**
 * Integration Tests: Addresses POST/PUT endpoints
 *
 * @file addresses.post.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup/integration-setup.js';
import { testTokens } from './fixtures/tokens.js';
import { mockClient } from './fixtures/clients.js';
import { mockPSGC } from './fixtures/psgc.js';
import { resetTestData } from './setup/mock-db.js';

describe('Addresses POST/PUT Integration Tests', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetTestData();
  });

  describe('POST /api/addresses', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockClient.id,
          psgc_id: mockPSGC.id,
          label: 'New Home',
          street_address: '456 New St',
          postal_code: '2000',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should create new address with authentication', async () => {
      const newAddress = {
        client_id: mockClient.id,
        psgc_id: mockPSGC.id,
        label: 'New Home',
        street_address: '456 New St',
        postal_code: '2000',
        latitude: 14.5995,
        longitude: 120.9842,
      };

      const response = await app.request('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(newAddress),
      });

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json).toHaveProperty('id');
      expect(json.client_id).toBe(newAddress.client_id);
      expect(json.label).toBe(newAddress.label);
      expect(json.street_address).toBe(newAddress.street_address);
      expect(json.postal_code).toBe(newAddress.postal_code);
      expect(json).toHaveProperty('created_at');
      expect(json).toHaveProperty('updated_at');
    });

    it('should set primary flag correctly when creating primary address', async () => {
      const primaryAddress = {
        client_id: mockClient.id,
        psgc_id: mockPSGC.id,
        label: 'Primary Home',
        street_address: '789 Primary St',
        postal_code: '3000',
        is_primary: true,
      };

      const response = await app.request('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(primaryAddress),
      });

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json.is_primary).toBe(true);
    });

    it('should return 400 for invalid address data', async () => {
      const invalidAddress = {
        client_id: mockClient.id,
        // Missing required fields
      };

      const response = await app.request('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(invalidAddress),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toHaveProperty('message');
    });
  });

  describe('PUT /api/addresses/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/addresses/123e4567-e89b-12d3-a456-426614174200', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: 'Updated' }),
      });

      expect(response.status).toBe(401);
    });

    it('should update address with authentication', async () => {
      const addressId = '123e4567-e89b-12d3-a456-426614174200';
      const updates = {
        label: 'Updated Home',
        street_address: '999 Updated St',
      };

      const response = await app.request(`/api/addresses/${addressId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(updates),
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.label).toBe(updates.label);
      expect(json.street_address).toBe(updates.street_address);
      expect(json).toHaveProperty('updated_at');
    });

    it('should return 404 for non-existent address', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/addresses/${nonExistentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify({ label: 'Updated' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/addresses/:id/primary', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/addresses/123e4567-e89b-12d3-a456-426614174200/primary', {
        method: 'PUT',
      });

      expect(response.status).toBe(401);
    });

    it('should set address as primary with authentication', async () => {
      const addressId = '123e4567-e89b-12d3-a456-426614174201'; // Work address

      const response = await app.request(`/api/addresses/${addressId}/primary`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.is_primary).toBe(true);

      // Verify other addresses are not primary
      const getResponse = await app.request(`/api/addresses/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      const getJson = await getResponse.json();
      const primaryCount = getJson.addresses.filter((a: any) => a.is_primary).length;
      expect(primaryCount).toBe(1);
    });

    it('should return 404 for non-existent address', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/addresses/${nonExistentId}/primary`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });
});
