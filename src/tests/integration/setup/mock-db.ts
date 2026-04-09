// src/tests/integration/setup/mock-db.ts

/**
 * Mock Database Pool for Integration Tests
 *
 * Provides a mock pool that returns fixture data for addresses and phone numbers
 * This allows testing API endpoints without a real database connection
 *
 * @file mock-db.ts
 */

import { vi } from 'vitest';
import { mockClient, mockOtherClient } from '../fixtures/clients.js';
import { mockAddressList, mockAddressWithPSGC } from '../fixtures/addresses.js';
import { mockPhoneNumberList } from '../fixtures/phone-numbers.js';
import { mockPSGC, mockPSGCList } from '../fixtures/psgc.js';

// In-memory data store (can be modified during tests)
const testData = {
  clients: [
    mockClient,
    mockOtherClient,
  ],
  addresses: [
    ...mockAddressList,
  ],
  phoneNumbers: [
    ...mockPhoneNumberList,
  ],
  psgc: [
    ...mockPSGCList,
  ],
};

// Helper to reset test data
export function resetTestData(): void {
  testData.addresses = [...mockAddressList];
  testData.phoneNumbers = [...mockPhoneNumberList];
}

// Helper to get addresses by client ID
export function getAddressesByClientId(clientId: string): typeof mockAddressList {
  return testData.addresses.filter(a => a.client_id === clientId && !a.deleted_at);
}

// Helper to get phone numbers by client ID
export function getPhoneNumbersByClientId(clientId: string): typeof mockPhoneNumberList {
  return testData.phoneNumbers.filter(p => p.client_id === clientId && !p.deleted_at);
}

// Helper to get primary address
export function getPrimaryAddress(clientId: string): typeof mockAddressWithPSGC | undefined {
  const address = testData.addresses.find(
    a => a.client_id === clientId && a.is_primary && !a.deleted_at
  );
  if (!address) return undefined;

  // Attach PSGC data
  const psgc = testData.psgc.find(p => p.id === address.psgc_id);
  return { ...address, psgc: psgc || null };
}

// Helper to get primary phone number
export function getPrimaryPhoneNumber(clientId: string): typeof mockPhoneNumberList[0] | undefined {
  return testData.phoneNumbers.find(
    p => p.client_id === clientId && p.is_primary && !p.deleted_at
  );
}

// Smart query mock that handles actual database queries
const mockQuery = vi.fn((queryText: string, params?: any[]) => {
  const q = queryText.trim().toLowerCase();

  // ============================================
  // Address queries
  // ============================================

  // Get addresses by client ID
  if (q.includes('select') && q.includes('from addresses') && q.includes('client_id')) {
    const clientId = params?.[0];
    const addresses = getAddressesByClientId(clientId);

    // If joining with PSGC
    if (q.includes('psgc.id')) {
      const addressesWithPSGC = addresses.map(addr => {
        const psgc = testData.psgc.find(p => p.id === addr.psgc_id);
        return { ...addr, psgc: psgc || null };
      });
      return Promise.resolve({ rows: addressesWithPSGC });
    }

    return Promise.resolve({ rows: addresses });
  }

  // Get address by ID
  if (q.includes('select') && q.includes('from addresses') && q.includes('where id')) {
    const addressId = params?.[0];
    const address = testData.addresses.find(a => a.id === addressId && !a.deleted_at);

    if (!address) {
      return Promise.resolve({ rows: [] });
    }

    // If joining with PSGC
    if (q.includes('psgc.id')) {
      const psgc = testData.psgc.find(p => p.id === address.psgc_id);
      return Promise.resolve({ rows: [{ ...address, psgc: psgc || null }] });
    }

    return Promise.resolve({ rows: [address] });
  }

  // Insert address
  if (q.includes('insert into addresses') && q.includes('returning')) {
    const newAddress = {
      id: params?.[0] || generateId(),
      client_id: params?.[1],
      psgc_id: params?.[2],
      label: params?.[3],
      street_address: params?.[4],
      postal_code: params?.[5],
      latitude: params?.[6],
      longitude: params?.[7],
      is_primary: params?.[8] || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // If setting as primary, unset other primaries
    if (newAddress.is_primary) {
      testData.addresses.forEach(a => {
        if (a.client_id === newAddress.client_id) {
          a.is_primary = false;
        }
      });
    }

    testData.addresses.push(newAddress);
    return Promise.resolve({ rows: [newAddress] });
  }

  // Update address
  if (q.includes('update addresses') && q.includes('where id')) {
    const addressId = params?.[params.length - 1]; // ID is usually last param
    const addressIndex = testData.addresses.findIndex(a => a.id === addressId);

    if (addressIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    // Update fields
    const updated = { ...testData.addresses[addressIndex] };
    // Parse SET clause to update fields (simplified)
    if (q.includes('label=')) {
      updated.label = params?.[0];
    }
    if (q.includes('is_primary=')) {
      const isPrimary = params?.[q.includes('label=') ? 1 : 0];
      if (isPrimary) {
        // Unset other primaries
        testData.addresses.forEach(a => {
          if (a.client_id === updated.client_id && a.id !== addressId) {
            a.is_primary = false;
          }
        });
      }
      updated.is_primary = isPrimary;
    }

    updated.updated_at = new Date().toISOString();
    testData.addresses[addressIndex] = updated;

    return Promise.resolve({ rows: [updated] });
  }

  // Soft delete address
  if (q.includes('update addresses') && q.includes('deleted_at')) {
    const addressId = params?.[params.length - 1];
    const addressIndex = testData.addresses.findIndex(a => a.id === addressId);

    if (addressIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    testData.addresses[addressIndex].deleted_at = new Date().toISOString();
    testData.addresses[addressIndex].updated_at = new Date().toISOString();

    return Promise.resolve({ rows: [testData.addresses[addressIndex]] });
  }

  // ============================================
  // Phone number queries
  // ============================================

  // Get phone numbers by client ID
  if (q.includes('select') && q.includes('from phone_numbers') && q.includes('client_id')) {
    const clientId = params?.[0];
    const phoneNumbers = getPhoneNumbersByClientId(clientId);
    return Promise.resolve({ rows: phoneNumbers });
  }

  // Get phone number by ID
  if (q.includes('select') && q.includes('from phone_numbers') && q.includes('where id')) {
    const phoneId = params?.[0];
    const phone = testData.phoneNumbers.find(p => p.id === phoneId && !p.deleted_at);

    if (!phone) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [phone] });
  }

  // Insert phone number
  if (q.includes('insert into phone_numbers') && q.includes('returning')) {
    const newPhone = {
      id: params?.[0] || generateId(),
      client_id: params?.[1],
      label: params?.[2],
      number: params?.[3],
      is_primary: params?.[4] || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // If setting as primary, unset other primaries
    if (newPhone.is_primary) {
      testData.phoneNumbers.forEach(p => {
        if (p.client_id === newPhone.client_id) {
          p.is_primary = false;
        }
      });
    }

    testData.phoneNumbers.push(newPhone);
    return Promise.resolve({ rows: [newPhone] });
  }

  // Update phone number
  if (q.includes('update phone_numbers') && q.includes('where id')) {
    const phoneId = params?.[params.length - 1];
    const phoneIndex = testData.phoneNumbers.findIndex(p => p.id === phoneId);

    if (phoneIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    const updated = { ...testData.phoneNumbers[phoneIndex] };

    if (q.includes('label=')) {
      updated.label = params?.[0];
    }
    if (q.includes('is_primary=')) {
      const isPrimary = params?.[q.includes('label=') ? 1 : 0];
      if (isPrimary) {
        testData.phoneNumbers.forEach(p => {
          if (p.client_id === updated.client_id && p.id !== phoneId) {
            p.is_primary = false;
          }
        });
      }
      updated.is_primary = isPrimary;
    }

    updated.updated_at = new Date().toISOString();
    testData.phoneNumbers[phoneIndex] = updated;

    return Promise.resolve({ rows: [updated] });
  }

  // Soft delete phone number
  if (q.includes('update phone_numbers') && q.includes('deleted_at')) {
    const phoneId = params?.[params.length - 1];
    const phoneIndex = testData.phoneNumbers.findIndex(p => p.id === phoneId);

    if (phoneIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    testData.phoneNumbers[phoneIndex].deleted_at = new Date().toISOString();
    testData.phoneNumbers[phoneIndex].updated_at = new Date().toISOString();

    return Promise.resolve({ rows: [testData.phoneNumbers[phoneIndex]] });
  }

  // ============================================
  // PSGC queries
  // ============================================

  if (q.includes('select') && q.includes('from psgc')) {
    return Promise.resolve({ rows: testData.psgc });
  }

  // ============================================
  // Default response
  // ============================================

  return Promise.resolve({ rows: [] });
});

// Helper to generate UUID v4
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Mock pool
export const mockPool = {
  query: mockQuery,
  connect: vi.fn(() => Promise.resolve({
    query: mockQuery,
    release: vi.fn(),
  })),
  on: vi.fn(),
};

// Helper to create a mock client from pool
export async function getMockClient(): Promise<typeof mockPool> {
  return mockPool;
}
