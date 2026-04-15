import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/index.js';
import { updateClientTouchpointSummary } from '../services/touchpoint-summary.js';

describe('Touchpoint Summary Service', () => {
  let testClientId: string;

  beforeAll(async () => {
    // Create test client
    const result = await pool.query(
      `INSERT INTO clients (id, first_name, last_name, client_type)
       VALUES (gen_random_uuid(), 'Test', 'Client', 'POTENTIAL')
       RETURNING id`
    );
    testClientId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test client
    await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
  });

  it('should create empty summary for new client', async () => {
    await updateClientTouchpointSummary(testClientId);

    const result = await pool.query(
      'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
      [testClientId]
    );

    expect(result.rows[0].touchpoint_summary).toEqual('[]');
    expect(result.rows[0].touchpoint_number).toBe(1);
    expect(result.rows[0].next_touchpoint).toBe('Visit');
  });

  it('should update summary with one touchpoint', async () => {
    // Create a test touchpoint
    await pool.query(
      `INSERT INTO touchpoints (client_id, touchpoint_number, type, date, status, user_id)
       VALUES ($1, 1, 'Visit', '2026-04-16', 'Completed', gen_random_uuid())`,
      [testClientId]
    );

    await updateClientTouchpointSummary(testClientId);

    const result = await pool.query(
      'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
      [testClientId]
    );

    expect(result.rows[0].touchpoint_number).toBe(2);
    expect(result.rows[0].next_touchpoint).toBe('Call');
    expect(result.rows[0].touchpoint_summary).toHaveLength(1);
  });

  it('should handle service errors gracefully', async () => {
    // Invalid client ID should not throw
    await expect(
      updateClientTouchpointSummary('00000000-0000-0000-0000-000000000000')
    ).resolves.not.toThrow();
  });
});
