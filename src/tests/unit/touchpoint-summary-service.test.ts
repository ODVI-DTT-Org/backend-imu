/**
 * Unit Tests: Touchpoint Summary Service
 *
 * Tests the updateClientTouchpointSummary service function
 * to ensure it correctly updates denormalized touchpoint data.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateClientTouchpointSummary } from '../../services/touchpoint-summary.js';

// Mock the database pool
vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../db/index.js';

describe('Touchpoint Summary Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateClientTouchpointSummary', () => {
    test('should update client with no touchpoints', async () => {
      // Mock touchpoints query to return empty array
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      // Mock UPDATE query
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      await updateClientTouchpointSummary('client-123');

      // Verify touchpoints query was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['client-123']
      );

      // Verify UPDATE query was called with correct parameters
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clients'),
        ['[]', 1, 'Visit', 'client-123'] // touchpoint_summary, touchpoint_number, next_touchpoint, client_id
      );
    });

    test('should update client with 1 touchpoint (Visit)', async () => {
      // Mock touchpoints query to return 1 touchpoint
      (pool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tp-1',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 1,
            type: 'Visit',
            date: '2026-04-16',
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
        ],
      });

      // Mock UPDATE query
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      await updateClientTouchpointSummary('client-123');

      // Verify UPDATE query was called with correct parameters
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clients'),
        [expect.stringContaining('Visit'), 2, 'Call', 'client-123'] // touchpoint_summary, touchpoint_number, next_touchpoint, client_id
      );
    });

    test('should update client with 3 touchpoints (mixed types)', async () => {
      // Mock touchpoints query to return 3 touchpoints
      (pool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tp-1',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 1,
            type: 'Visit',
            date: '2026-04-14',
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
          {
            id: 'tp-2',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 2,
            type: 'Call',
            date: '2026-04-15',
            reason: 'Not interested',
            status: 'Not Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
          {
            id: 'tp-3',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 3,
            type: 'Call',
            date: '2026-04-16',
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
        ],
      });

      // Mock UPDATE query
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      await updateClientTouchpointSummary('client-123');

      // Verify UPDATE query was called with correct parameters
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clients'),
        [expect.stringContaining('Call'), 4, 'Visit', 'client-123'] // touchpoint_summary, touchpoint_number, next_touchpoint, client_id
      );
    });

    test('should update client with 7 touchpoints (completed)', async () => {
      // Mock touchpoints query to return 7 touchpoints
      (pool.query as any).mockResolvedValueOnce({
        rows: Array.from({ length: 7 }, (_, i) => ({
          id: `tp-${i + 1}`,
          client_id: 'client-123',
          user_id: 'user-1',
          touchpoint_number: i + 1,
          type: [1, 4, 7].includes(i + 1) ? 'Visit' : 'Call',
          date: `2026-04-${10 + i}`,
          reason: null,
          status: 'Interested',
          time_in: null,
          time_out: null,
          location: null,
        })),
      });

      // Mock UPDATE query
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      await updateClientTouchpointSummary('client-123');

      // Verify UPDATE query was called with correct parameters
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE clients'),
        [expect.stringContaining('Visit'), 8, null, 'client-123'] // touchpoint_summary, touchpoint_number (8 = 7 + 1), next_touchpoint (null), client_id
      );
    });

    test('should handle database errors gracefully', async () => {
      // Mock touchpoints query to throw error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (pool.query as any).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      // Should not throw - service catches errors and logs them
      await updateClientTouchpointSummary('client-123');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update touchpoint summary'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test('should preserve touchpoint order by date', async () => {
      // Mock touchpoints query to return touchpoints in specific order
      (pool.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'tp-1',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 1,
            type: 'Visit',
            date: '2026-04-10',
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
          {
            id: 'tp-3',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 3,
            type: 'Call',
            date: '2026-04-12', // Later date
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
          {
            id: 'tp-2',
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: 2,
            type: 'Call',
            date: '2026-04-11', // Earlier date than tp-3
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          },
        ],
      });

      // Mock UPDATE query
      (pool.query as any).mockResolvedValueOnce({
        rows: [],
      });

      await updateClientTouchpointSummary('client-123');

      // Verify touchpoints query was called with ORDER BY date ASC
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date ASC'),
        ['client-123']
      );

      // Verify UPDATE query was called
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('Touchpoint Sequence Validation', () => {
    test('should calculate correct next_touchpoint for each count', async () => {
      const testCases = [
        { count: 0, expected: 'Visit', touchpoint_number: 1 },  // 1st: Visit
        { count: 1, expected: 'Call', touchpoint_number: 2 },   // 2nd: Call
        { count: 2, expected: 'Call', touchpoint_number: 3 },   // 3rd: Call
        { count: 3, expected: 'Visit', touchpoint_number: 4 },  // 4th: Visit
        { count: 4, expected: 'Call', touchpoint_number: 5 },   // 5th: Call
        { count: 5, expected: 'Call', touchpoint_number: 6 },   // 6th: Call
        { count: 6, expected: 'Visit', touchpoint_number: 7 },  // 7th: Visit
        { count: 7, expected: null, touchpoint_number: 8 },     // Completed (next would be 8, but we're done)
      ];

      for (const { count, expected, touchpoint_number } of testCases) {
        // Clear all mocks before each test case
        vi.clearAllMocks();

        // Mock touchpoints query
        (pool.query as any).mockResolvedValueOnce({
          rows: Array.from({ length: count }, (_, i) => ({
            id: `tp-${i + 1}`,
            client_id: 'client-123',
            user_id: 'user-1',
            touchpoint_number: i + 1,
            type: [0, 3, 6].includes(i) ? 'Visit' : 'Call',
            date: `2026-04-${10 + i}`,
            reason: null,
            status: 'Interested',
            time_in: null,
            time_out: null,
            location: null,
          })),
        });

        // Mock UPDATE query
        (pool.query as any).mockResolvedValueOnce({
          rows: [],
        });

        await updateClientTouchpointSummary('client-123');

        // Verify both SELECT and UPDATE queries were called
        expect(pool.query).toHaveBeenCalledTimes(2);

        // Get the second call (UPDATE query)
        const updateCall = (pool.query as any).mock.calls[1];

        // Verify the UPDATE query was called with correct parameters
        expect(updateCall[0]).toContain('UPDATE clients');
        expect(updateCall[1][1]).toBe(touchpoint_number); // touchpoint_number
        expect(updateCall[1][2]).toBe(expected); // next_touchpoint
        expect(updateCall[1][3]).toBe('client-123'); // client_id
      }
    });
  });
});
