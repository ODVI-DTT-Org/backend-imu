import { describe, test, expect } from 'vitest';

/**
 * Tests for POST /api/clients/by-ids endpoint.
 *
 * NOTE: These tests require a running PostgreSQL database with seeded
 * test data. To run:
 *   1. Start the backend: pnpm dev
 *   2. Ensure DATABASE_URL points to a test DB with at least one
 *      non-deleted client and a valid caravan JWT in TEST_TOKEN env.
 *   3. Run: pnpm test src/routes/__tests__/clients.by-ids.test.ts
 *
 * Tests are .skip by default; remove .skip when ready to run.
 */

describe.skip('POST /api/clients/by-ids (Integration - requires database)', () => {
  test('rejects unauthenticated requests with 401', async () => {
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(401);
  });

  test('returns empty array for empty ids list', async () => {
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
      },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ clients: [] });
  });

  test('rejects more than 100 ids with 400', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
      },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(400);
  });

  test('returns full client records with embedded addresses and phones', async () => {
    const ids = [process.env.TEST_CLIENT_ID!];
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
      },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    const client = body.clients[0];
    expect(client.id).toBe(ids[0]);
    expect(client).toHaveProperty('first_name');
    expect(client).toHaveProperty('last_name');
    expect(client).toHaveProperty('addresses');
    expect(Array.isArray(client.addresses)).toBe(true);
    expect(client).toHaveProperty('phone_numbers');
    expect(Array.isArray(client.phone_numbers)).toBe(true);
  });

  test('excludes soft-deleted clients', async () => {
    const ids = [process.env.TEST_DELETED_CLIENT_ID!];
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
      },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(0);
  });

  test('rejects malformed body with 400', async () => {
    const res = await fetch('http://localhost:3000/api/clients/by-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
      },
      body: JSON.stringify({ wrong_key: ['x'] }),
    });
    expect(res.status).toBe(400);
  });
});
