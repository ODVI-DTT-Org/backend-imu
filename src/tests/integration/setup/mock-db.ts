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
  // Information schema queries (for audit middleware)
  // ============================================

  // Check if table exists
  if (q.includes('select') && q.includes('from information_schema.tables')) {
    return Promise.resolve({ rows: [{ exists: false }] });
  }

  // Check if column exists
  if (q.includes('select') && q.includes('from information_schema.columns')) {
    return Promise.resolve({ rows: [{ exists: false }] });
  }

  // Check if constraint exists
  if (q.includes('select') && q.includes('from information_schema.table_constraints')) {
    return Promise.resolve({ rows: [] });
  }

  // CREATE TABLE for audit logs (just succeed, don't actually create)
  if (q.includes('create table') && q.includes('audit_logs')) {
    return Promise.resolve({ rows: [] });
  }

  // CREATE TRIGGER for audit notifications (just succeed)
  if (q.includes('create trigger') && q.includes('audit_log_notification')) {
    return Promise.resolve({ rows: [] });
  }

  // Insert into audit_logs (just succeed)
  if (q.includes('insert into audit_logs')) {
    return Promise.resolve({ rows: [] });
  }

  // ============================================
  // Address queries
  // ============================================

  // Count addresses by client ID
  if (q.includes('select count(*)') && q.includes('from addresses') && q.includes('client_id')) {
    const clientId = params?.[0];
    const count = testData.addresses.filter(a => a.client_id === clientId && !a.deleted_at).length;
    return Promise.resolve({ rows: [{ count: String(count) }] });
  }

  // Check if PSGC exists
  if (q.includes('select id from psgc') && q.includes('where id')) {
    const psgcId = params?.[0];
    const psgc = testData.psgc.find(p => p.id === psgcId);
    if (!psgc) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [{ id: psgc.id }] });
  }

  // Get address by ID (most specific, must come before client_id handler)
  if (q.includes('select') && q.includes('from addresses') && (q.includes('where id') || q.includes('where a.id'))) {
    const addressId = params?.[0];
    let address = testData.addresses.find(a => a.id === addressId && !a.deleted_at);

    // Also check client_id if present in query
    if (address && q.includes('client_id')) {
      // Try to find the parameter index for client_id
      const clientIdMatch = q.match(/client_id\s*=\s*\$(\d+)/);
      if (clientIdMatch) {
        const paramIndex = parseInt(clientIdMatch[1]) - 1; // Convert to 0-based index
        const clientId = params?.[paramIndex];
        if (address.client_id !== clientId) {
          return Promise.resolve({ rows: [] });
        }
      }
    }

    if (!address) {
      return Promise.resolve({ rows: [] });
    }

    // If joining with PSGC (multiple patterns)
    if (q.includes('psgc.id') || q.includes('left join psgc') || q.includes('on a.psgc_id') ||
        q.includes('psgc_code') || q.includes('p.code') || q.includes('p.region')) {
      const psgc = testData.psgc.find(p => p.id === address.psgc_id);
      return Promise.resolve({
        rows: [{
          ...address,
          psgc_code: psgc?.code,
          // Add PSGC properties directly to row for mapRowToAddress()
          region: psgc?.region,
          province: psgc?.province,
          municipality: psgc?.city_municipality,
          barangay: psgc?.barangay,
        }]
      });
    }

    return Promise.resolve({ rows: [address] });
  }

  // Get addresses by client ID (more permissive pattern matching, must come after ID handler)
  if (q.includes('select') && q.includes('from addresses') && q.includes('client_id')) {
    const clientId = params?.[0];
    const addresses = getAddressesByClientId(clientId);

    // If joining with PSGC (check for PSGC columns or LEFT JOIN)
    if (q.toLowerCase().includes('psgc.id') || q.toLowerCase().includes('left join psgc') ||
        q.toLowerCase().includes('p.code') || q.toLowerCase().includes('p.region')) {
      const addressesWithPSGC = addresses.map(addr => {
        const psgc = testData.psgc.find(p => p.id === addr.psgc_id);
        return {
          ...addr,
          psgc_code: psgc?.code,
          // Add PSGC properties directly to row for mapRowToAddress()
          region: psgc?.region,
          province: psgc?.province,
          municipality: psgc?.city_municipality,
          barangay: psgc?.barangay,
        };
      });
      return Promise.resolve({ rows: addressesWithPSGC });
    }

    return Promise.resolve({ rows: addresses });
  }

  // Specific handler for the UPDATE address check query (more flexible pattern matching)
  if (q.toLowerCase().includes('select') && q.toLowerCase().includes('from addresses') &&
      q.toLowerCase().includes('where') && q.toLowerCase().includes('id') && params && params.length >= 2) {
    const addressId = params?.[0];
    const clientId = params?.[1];

    // Find address by ID and client_id
    const address = testData.addresses.find(a =>
      a.id === addressId && a.client_id === clientId && !a.deleted_at
    );

    if (!address) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [address] });
  }

  // Specific handler for the UPDATE address check query
  if (q.includes('select * from addresses') && q.includes('where id = $1') && q.includes('client_id = $2')) {
    const addressId = params?.[0];
    const clientId = params?.[1];
    const address = testData.addresses.find(a => a.id === addressId && a.client_id === clientId && !a.deleted_at);

    if (!address) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [address] });
  }

  // Insert address
  if (q.includes('insert into addresses') && q.includes('returning')) {
    const newAddress = {
      id: generateId(), // Auto-generated
      client_id: params?.[0],  // $1
      psgc_id: params?.[1],    // $2
      label: params?.[2],      // $3
      street_address: params?.[3],  // $4
      postal_code: params?.[4],     // $5
      latitude: params?.[5],        // $6
      longitude: params?.[6],       // $7
      is_primary: params?.[7] || false,  // $8
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

  // Soft delete address (more specific pattern matching, must come before general UPDATE handler)
  if (q.toLowerCase().includes('update addresses') && q.toLowerCase().includes('deleted_at') &&
      q.toLowerCase().includes('where id') && q.toLowerCase().includes('client_id')) {
    const addressId = params?.[0];
    const clientId = params?.[1];
    const addressIndex = testData.addresses.findIndex(a => a.id === addressId && a.client_id === clientId);

    if (addressIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    testData.addresses[addressIndex].deleted_at = new Date().toISOString();
    testData.addresses[addressIndex].updated_at = new Date().toISOString();

    return Promise.resolve({ rows: [testData.addresses[addressIndex]] });
  }

  // Update address (exclude soft delete queries)
  if (q.includes('update addresses') && q.includes('where id') && !q.includes('deleted_at')) {
    const addressId = params?.[params.length - 1]; // ID is usually last param
    const addressIndex = testData.addresses.findIndex(a => a.id === addressId && !a.deleted_at);

    if (addressIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    // Update fields
    const updated = { ...testData.addresses[addressIndex] };

    // Handle different UPDATE patterns
    if (q.includes('set label =') && q.includes('street_address =')) {
      // UPDATE addresses SET label = $1, street_address = $2 WHERE id = $3
      updated.label = params?.[0];
      updated.street_address = params?.[1];
    } else if (q.includes('set label =')) {
      // UPDATE addresses SET label = $1 WHERE id = $2
      updated.label = params?.[0];
    } else if (q.includes('set street_address =')) {
      // UPDATE addresses SET street_address = $1 WHERE id = $2
      updated.street_address = params?.[0];
    } else if (q.includes('set is_primary = true')) {
      // UPDATE addresses SET is_primary = true WHERE id = $1
      // Unset other primaries for this client
      testData.addresses.forEach(a => {
        if (a.client_id === updated.client_id && a.id !== addressId) {
          a.is_primary = false;
        }
      });
      updated.is_primary = true;
    } else if (q.includes('set is_primary =')) {
      // UPDATE addresses SET is_primary = $1 WHERE id = $2
      const isPrimary = params?.[0];
      if (isPrimary) {
        // Unset other primaries for this client
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

  // ============================================
  // Phone number queries
  // ============================================

  // Count phone numbers by client ID
  if (q.includes('select count(*)') && q.includes('from phone_numbers') && q.includes('client_id')) {
    const clientId = params?.[0];
    const count = testData.phoneNumbers.filter(p => p.client_id === clientId && !p.deleted_at).length;
    return Promise.resolve({ rows: [{ count: String(count) }] });
  }

  // Check for duplicate phone number
  if (q.includes('select id from phone_numbers') && q.includes('where client_id') && q.includes('and number')) {
    const clientId = params?.[0];
    const number = params?.[1];
    const existing = testData.phoneNumbers.find(p => p.client_id === clientId && p.number === number && !p.deleted_at);
    if (!existing) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [{ id: existing.id }] });
  }

  // Get phone number by ID (more specific, must come before client_id handler)
  if (q.includes('select') && q.includes('from phone_numbers') && q.includes('where id')) {
    const phoneId = params?.[0];
    let phone = testData.phoneNumbers.find(p => p.id === phoneId && !p.deleted_at);

    // Also check client_id if present in query
    if (phone && q.includes('client_id')) {
      // Try to find the parameter index for client_id
      const clientIdMatch = q.match(/client_id\s*=\s*\$(\d+)/);
      if (clientIdMatch) {
        const paramIndex = parseInt(clientIdMatch[1]) - 1; // Convert to 0-based index
        const clientId = params?.[paramIndex];
        if (phone.client_id !== clientId) {
          return Promise.resolve({ rows: [] });
        }
      }
    }

    if (!phone) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [phone] });
  }

  // Get phone numbers by client ID (more permissive pattern matching, must come after ID handler)
  if (q.toLowerCase().includes('select') && q.toLowerCase().includes('from phone_numbers') && q.toLowerCase().includes('client_id')) {
    const clientId = params?.[0];
    const phoneNumbers = getPhoneNumbersByClientId(clientId);
    return Promise.resolve({ rows: phoneNumbers });
  }

  // Insert phone number
  if (q.includes('insert into phone_numbers') && q.includes('returning')) {
    const newPhone = {
      id: generateId(), // Auto-generated
      client_id: params?.[0],  // $1
      label: params?.[1],      // $2
      number: params?.[2],     // $3
      is_primary: params?.[3] || false,  // $4
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

  // Update phone number (exclude DELETE queries with deleted_at)
  if (q.includes('update phone_numbers') && q.includes('where id') && !q.includes('deleted_at')) {
    const phoneId = params?.[params.length - 1];
    const phoneIndex = testData.phoneNumbers.findIndex(p => p.id === phoneId && !p.deleted_at);

    if (phoneIndex === -1) {
      return Promise.resolve({ rows: [] });
    }

    const updated = { ...testData.phoneNumbers[phoneIndex] };

    // Handle different UPDATE patterns
    if (q.includes('set label =') && q.includes('number =')) {
      // UPDATE phone_numbers SET label = $1, number = $2 WHERE id = $3
      updated.label = params?.[0];
      updated.number = params?.[1];
    } else if (q.includes('set label =')) {
      // UPDATE phone_numbers SET label = $1 WHERE id = $2
      updated.label = params?.[0];
    } else if (q.includes('set number =')) {
      // UPDATE phone_numbers SET number = $1 WHERE id = $2
      updated.number = params?.[0];
    } else if (q.includes('set is_primary = true')) {
      // UPDATE phone_numbers SET is_primary = true WHERE id = $1
      // Unset other primaries for this client
      testData.phoneNumbers.forEach(p => {
        if (p.client_id === updated.client_id && p.id !== phoneId) {
          p.is_primary = false;
        }
      });
      updated.is_primary = true;
    } else if (q.includes('set is_primary =')) {
      // UPDATE phone_numbers SET is_primary = $1 WHERE id = $2
      const isPrimary = params?.[0];
      if (isPrimary) {
        // Unset other primaries for this client
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

  // Soft delete phone number (more specific pattern matching)
  if (q.toLowerCase().includes('update phone_numbers') && q.toLowerCase().includes('deleted_at') &&
      q.toLowerCase().includes('where id') && q.toLowerCase().includes('client_id')) {
    const phoneId = params?.[0];
    const clientId = params?.[1];
    const phoneIndex = testData.phoneNumbers.findIndex(p => p.id === phoneId && p.client_id === clientId);

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
  // Client queries
  // ============================================

  // Check if client exists and user has access
  if (q.includes('select') && q.includes('from clients') && q.includes('where id') && q.includes('user_id')) {
    const clientId = params?.[0];
    const userId = params?.[1];

    // Admin users can access any client
    const isAdmin = userId?.startsWith('admin-');
    const client = testData.clients.find(
      c => c.id === clientId && (isAdmin || c.user_id === userId) && !c.deleted_at
    );

    if (!client) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [{ id: client.id }] });
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
