/**
 * Integration Tests: Touchpoint Summary Updates on Modify/Delete
 *
 * Tests that the denormalized touchpoint_summary, touchpoint_number,
 * and next_touchpoint columns are correctly updated when touchpoints
 * are modified or deleted.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/index.js';
import { validateTouchpointSequence, validateRoleBasedTouchpoint } from '../../services/touchpoint-validation.js';

describe('Touchpoint Summary Updates - Modify/Delete', () => {
  let testUserId: string;
  let testClientId: string;
  let testTouchpointId: string;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (id, email, full_name, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      ['00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test User', 'admin', 'hash']
    );
    testUserId = userResult.rows[0].id;

    // Create test client
    const clientResult = await pool.query(
      `INSERT INTO clients (id, first_name, last_name, email, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name
       RETURNING id`,
      ['00000000-0000-0000-0000-000000000001', 'John', 'Doe', 'john@example.com', testUserId]
    );
    testClientId = clientResult.rows[0].id;

    // Create initial touchpoint
    const touchpointResult = await pool.query(
      `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING id`,
      [testClientId, testUserId, 1, 'Visit']
    );
    testTouchpointId = touchpointResult.rows[0].id;

    // Wait for async updateClientTouchpointSummary to complete
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM touchpoints WHERE client_id = $1', [testClientId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  describe('PUT /api/touchpoints/:id - Update Touchpoint', () => {
    test('should update touchpoint_summary when touchpoint type changes', async () => {
      // Get initial state
      const initialClient = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      const initialSummary = initialClient.rows[0].touchpoint_summary;
      const initialTouchpointNumber = initialClient.rows[0].touchpoint_number;
      const initialNextTouchpoint = initialClient.rows[0].next_touchpoint;

      expect(initialSummary).not.toBeNull();
      expect(initialTouchpointNumber).toBe(2); // Next should be 2
      expect(initialNextTouchpoint).toBe('Call'); // Type 2 is Call

      // Update touchpoint type (this is an admin-only operation for testing)
      await pool.query(
        `UPDATE touchpoints SET type = 'Call', updated_at = NOW() WHERE id = $1`,
        [testTouchpointId]
      );

      // Manually call updateClientTouchpointSummary (in real API this happens automatically)
      const { updateClientTouchpointSummary } = await import('../../services/touchpoint-summary.js');
      await updateClientTouchpointSummary(testClientId);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify touchpoint_summary was updated
      const updatedClient = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      const updatedSummary = updatedClient.rows[0].touchpoint_summary;
      const updatedTouchpointNumber = updatedClient.rows[0].touchpoint_number;
      const updatedNextTouchpoint = updatedClient.rows[0].next_touchpoint;

      expect(updatedSummary).not.toBeNull();
      expect(Array.isArray(updatedSummary)).toBe(true);
      expect(updatedSummary.length).toBe(1);
      expect(updatedSummary[0].type).toBe('Call'); // Should be updated to Call

      // touchpoint_number and next_touchpoint should remain the same
      // (only the type changed, not the count)
      expect(updatedTouchpointNumber).toBe(2);
      expect(updatedNextTouchpoint).toBe('Call');
    });

    test('should update touchpoint_summary when touchpoint rejection_reason changes', async () => {
      // Update rejection_reason
      await pool.query(
        `UPDATE touchpoints SET rejection_reason = 'Not interested', updated_at = NOW() WHERE id = $1`,
        [testTouchpointId]
      );

      // Manually call updateClientTouchpointSummary
      const { updateClientTouchpointSummary } = await import('../../services/touchpoint-summary.js');
      await updateClientTouchpointSummary(testClientId);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify touchpoint_summary was updated
      const client = await pool.query(
        'SELECT touchpoint_summary FROM clients WHERE id = $1',
        [testClientId]
      );
      const summary = client.rows[0].touchpoint_summary;

      expect(summary).not.toBeNull();
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBe(1);
      expect(summary[0].rejection_reason).toBe('Not interested');
    });
  });

  describe('DELETE /api/touchpoints/:id - Delete Touchpoint', () => {
    test('should update touchpoint_summary when touchpoint is deleted', async () => {
      // Create a second touchpoint first
      const secondTouchpointResult = await pool.query(
        `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         RETURNING id`,
        [testClientId, testUserId, 2, 'Call']
      );
      const secondTouchpointId = secondTouchpointResult.rows[0].id;

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify we have 2 touchpoints
      const clientBeforeDelete = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      expect(clientBeforeDelete.rows[0].touchpoint_summary.length).toBe(2);
      expect(clientBeforeDelete.rows[0].touchpoint_number).toBe(3);
      expect(clientBeforeDelete.rows[0].next_touchpoint).toBe('Call');

      // Delete the second touchpoint
      await pool.query('DELETE FROM touchpoints WHERE id = $1', [secondTouchpointId]);

      // Manually call updateClientTouchpointSummary
      const { updateClientTouchpointSummary } = await import('../../services/touchpoint-summary.js');
      await updateClientTouchpointSummary(testClientId);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify touchpoint_summary was updated (should only have 1 touchpoint now)
      const clientAfterDelete = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      const summaryAfterDelete = clientAfterDelete.rows[0].touchpoint_summary;
      const touchpointNumberAfterDelete = clientAfterDelete.rows[0].touchpoint_number;
      const nextTouchpointAfterDelete = clientAfterDelete.rows[0].next_touchpoint;

      expect(summaryAfterDelete).not.toBeNull();
      expect(Array.isArray(summaryAfterDelete)).toBe(true);
      expect(summaryAfterDelete.length).toBe(1); // Should only have 1 touchpoint now
      expect(touchpointNumberAfterDelete).toBe(2); // Next should be 2
      expect(nextTouchpointAfterDelete).toBe('Call'); // Type 2 is Call

      // Cleanup
      await pool.query('DELETE FROM touchpoints WHERE id = $1', [secondTouchpointId]);
    });

    test('should reset touchpoint_number to 1 when all touchpoints are deleted', async () => {
      // Delete all touchpoints for the client
      await pool.query('DELETE FROM touchpoints WHERE client_id = $1', [testClientId]);

      // Manually call updateClientTouchpointSummary
      const { updateClientTouchpointSummary } = await import('../../services/touchpoint-summary.js');
      await updateClientTouchpointSummary(testClientId);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify touchpoint_summary was reset
      const client = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      const summary = client.rows[0].touchpoint_summary;
      const touchpointNumber = client.rows[0].touchpoint_number;
      const nextTouchpoint = client.rows[0].next_touchpoint;

      expect(summary).not.toBeNull();
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBe(0); // No touchpoints
      expect(touchpointNumber).toBe(1); // Reset to 1
      expect(nextTouchpoint).toBe('Visit'); // Type 1 is Visit

      // Re-create initial touchpoint for subsequent tests
      await pool.query(
        `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
        [testClientId, testUserId, 1, 'Visit']
      );

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent touchpoint updates', async () => {
      // Create multiple touchpoints
      const touchpointIds: string[] = [];
      for (let i = 2; i <= 5; i++) {
        const result = await pool.query(
          `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
           VALUES ($1, $2, $3, $4, CURRENT_DATE)
           RETURNING id`,
          [testClientId, testUserId, i, i === 2 || i === 3 || i === 5 ? 'Call' : 'Visit']
        );
        touchpointIds.push(result.rows[0].id);
      }

      // Wait for async updates
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify we have 5 touchpoints
      const client = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number FROM clients WHERE id = $1',
        [testClientId]
      );
      expect(client.rows[0].touchpoint_summary.length).toBe(5);
      expect(client.rows[0].touchpoint_number).toBe(6);

      // Update multiple touchpoints concurrently
      await Promise.all([
        pool.query('UPDATE touchpoints SET rejection_reason = Reason 1 WHERE id = $1', [touchpointIds[0]]),
        pool.query('UPDATE touchpoints SET rejection_reason = Reason 2 WHERE id = $1', [touchpointIds[1]]),
        pool.query('UPDATE touchpoints SET rejection_reason = Reason 3 WHERE id = $1', [touchpointIds[2]]),
      ]);

      // Manually call updateClientTouchpointSummary once
      const { updateClientTouchpointSummary } = await import('../../services/touchpoint-summary.js');
      await updateClientTouchpointSummary(testClientId);

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify final state
      const finalClient = await pool.query(
        'SELECT touchpoint_summary, touchpoint_number, next_touchpoint FROM clients WHERE id = $1',
        [testClientId]
      );
      expect(finalClient.rows[0].touchpoint_summary.length).toBe(5);
      expect(finalClient.rows[0].touchpoint_number).toBe(6);
      expect(finalClient.rows[0].next_touchpoint).toBe('Call'); // Type 6 is Call

      // Cleanup
      for (const id of touchpointIds) {
        await pool.query('DELETE FROM touchpoints WHERE id = $1', [id]);
      }

      // Reset to initial state
      await pool.query('DELETE FROM touchpoints WHERE client_id = $1', [testClientId]);
      await pool.query(
        `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
        [testClientId, testUserId, 1, 'Visit']
      );

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    test('should handle touchpoint with missing optional fields', async () => {
      // Create touchpoint with minimal required fields
      const minimalTouchpoint = await pool.query(
        `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         RETURNING id`,
        [testClientId, testUserId, 2, 'Call']
      );

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify touchpoint_summary includes touchpoint with null optional fields
      const client = await pool.query(
        'SELECT touchpoint_summary FROM clients WHERE id = $1',
        [testClientId]
      );
      const summary = client.rows[0].touchpoint_summary;

      expect(summary).not.toBeNull();
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBe(2);

      // Find the newly created touchpoint
      const newTouchpoint = summary.find((t: any) => t.id === minimalTouchpoint.rows[0].id);
      expect(newTouchpoint).toBeDefined();
      expect(newTouchpoint.rejection_reason).toBeNull();
      expect(newTouchpoint.visit_id).toBeNull();
      expect(newTouchpoint.call_id).toBeNull();

      // Cleanup
      await pool.query('DELETE FROM touchpoints WHERE id = $1', [minimalTouchpoint.rows[0].id]);

      // Reset to initial state
      await pool.query('DELETE FROM touchpoints WHERE client_id = $1', [testClientId]);
      await pool.query(
        `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
        [testClientId, testUserId, 1, 'Visit']
      );

      // Wait for async update
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  });
});
