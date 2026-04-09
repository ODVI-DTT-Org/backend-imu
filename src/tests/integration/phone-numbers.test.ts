// src/tests/integration/phone-numbers.test.ts

/**
 * Integration Tests: Phone Numbers endpoints
 *
 * @file phone-numbers.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup/integration-setup.js';
import { testTokens } from './fixtures/tokens.js';
import { mockClient, mockOtherClient } from './fixtures/clients.js';
import { mockPhoneNumber } from './fixtures/phone-numbers.js';
import { resetTestData } from './setup/mock-db.js';

describe('Phone Numbers Integration Tests', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    resetTestData();
  });

  describe('GET /api/phone-numbers/:clientId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/phone-numbers/${mockClient.id}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.message).toContain('Unauthorized');
    });

    it('should return client\'s phone numbers with authentication', async () => {
      const response = await app.request(`/api/phone-numbers/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json).toHaveProperty('phone_numbers');
      expect(Array.isArray(json.phone_numbers)).toBe(true);
      expect(json.phone_numbers.length).toBeGreaterThan(0);

      // Verify phone number structure
      const phone = json.phone_numbers[0];
      expect(phone).toHaveProperty('id');
      expect(phone).toHaveProperty('client_id');
      expect(phone).toHaveProperty('label');
      expect(phone).toHaveProperty('number');
      expect(phone).toHaveProperty('is_primary');
    });

    it('should filter out deleted phone numbers', async () => {
      const response = await app.request(`/api/phone-numbers/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      // All returned phone numbers should not be deleted
      json.phone_numbers.forEach((phone: any) => {
        expect(phone.deleted_at).toBeNull();
      });
    });

    it('should return empty array for client with no phone numbers', async () => {
      const unknownClientId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/phone-numbers/${unknownClientId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.phone_numbers).toEqual([]);
    });
  });

  describe('POST /api/phone-numbers', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockClient.id,
          label: 'Mobile',
          number: '09181234567',
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should create new phone number with authentication', async () => {
      const newPhone = {
        client_id: mockClient.id,
        label: 'Work',
        number: '09187654321',
      };

      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(newPhone),
      });

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json).toHaveProperty('id');
      expect(json.client_id).toBe(newPhone.client_id);
      expect(json.label).toBe(newPhone.label);
      expect(json.number).toBe(newPhone.number);
      expect(json).toHaveProperty('created_at');
      expect(json).toHaveProperty('updated_at');
    });

    it('should set primary flag correctly when creating primary phone number', async () => {
      const primaryPhone = {
        client_id: mockClient.id,
        label: 'Primary Mobile',
        number: '09191234567',
        is_primary: true,
      };

      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(primaryPhone),
      });

      expect(response.status).toBe(201);
      const json = await response.json();

      expect(json.is_primary).toBe(true);
    });

    it('should return 400 for invalid phone number data', async () => {
      const invalidPhone = {
        client_id: mockClient.id,
        // Missing required fields
      };

      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
        body: JSON.stringify(invalidPhone),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toHaveProperty('message');
    });
  });

  describe('PUT /api/phone-numbers/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/phone-numbers/${mockPhoneNumber.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: 'Updated' }),
      });

      expect(response.status).toBe(401);
    });

    it('should update phone number with authentication', async () => {
      const phoneId = mockPhoneNumber.id;
      const updates = {
        label: 'Updated Mobile',
        number: '09201234567',
      };

      const response = await app.request(`/api/phone-numbers/${phoneId}`, {
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
      expect(json.number).toBe(updates.number);
      expect(json).toHaveProperty('updated_at');
    });

    it('should return 404 for non-existent phone number', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/phone-numbers/${nonExistentId}`, {
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

  describe('PUT /api/phone-numbers/:id/primary', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/phone-numbers/${mockPhoneNumber.id}/primary`, {
        method: 'PUT',
      });

      expect(response.status).toBe(401);
    });

    it('should set phone number as primary with authentication', async () => {
      const phoneId = '223e4567-e89b-12d3-a456-426614174201'; // Home phone

      const response = await app.request(`/api/phone-numbers/${phoneId}/primary`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.is_primary).toBe(true);

      // Verify other phone numbers are not primary
      const getResponse = await app.request(`/api/phone-numbers/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      const getJson = await getResponse.json();
      const primaryCount = getJson.phone_numbers.filter((p: any) => p.is_primary).length;
      expect(primaryCount).toBe(1);
    });

    it('should return 404 for non-existent phone number', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/phone-numbers/${nonExistentId}/primary`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/phone-numbers/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request(`/api/phone-numbers/${mockPhoneNumber.id}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.message).toContain('Unauthorized');
    });

    it('should soft delete phone number with authentication', async () => {
      const phoneId = mockPhoneNumber.id;

      const response = await app.request(`/api/phone-numbers/${phoneId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json).toHaveProperty('id');
      expect(json.deleted_at).not.toBeNull();

      // Verify phone number is filtered from GET requests
      const getResponse = await app.request(`/api/phone-numbers/${mockClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      const getJson = await getResponse.json();
      const deletedPhone = getJson.phone_numbers.find((p: any) => p.id === phoneId);
      expect(deletedPhone).toBeUndefined();
    });

    it('should return 404 for non-existent phone number', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await app.request(`/api/phone-numbers/${nonExistentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`,
        },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Authorization - Phone Numbers', () => {
    it('should deny access to other client\'s phone numbers for non-admin users', async () => {
      const response = await app.request(`/api/phone-numbers/${mockOtherClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.clientOwner}`, // Owned by user-1
        },
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toContain('Forbidden');
    });

    it('should allow admin to access any client\'s phone numbers', async () => {
      const response = await app.request(`/api/phone-numbers/${mockOtherClient.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.admin}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.phone_numbers).toBeDefined();
    });

    it('should deny creating phone number for other client for non-admin users', async () => {
      const newPhone = {
        client_id: mockOtherClient.id,
        label: 'New Phone',
        number: '09211234567',
      };

      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.clientOwner}`, // Owned by user-1
        },
        body: JSON.stringify(newPhone),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toContain('Forbidden');
    });

    it('should allow admin to create phone number for any client', async () => {
      const newPhone = {
        client_id: mockOtherClient.id,
        label: 'Admin Phone',
        number: '09221234567',
      };

      const response = await app.request('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testTokens.admin}`,
        },
        body: JSON.stringify(newPhone),
      });

      expect(response.status).toBe(201);
    });
  });
});
