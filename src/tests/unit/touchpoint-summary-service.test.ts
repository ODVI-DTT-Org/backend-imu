import { beforeEach, describe, expect, test, vi } from 'vitest';
import { updateClientTouchpointSummary } from '../../services/touchpoint-summary.js';
import { pool } from '../../db/index.js';

vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

function updateArgs() {
  return (pool.query as any).mock.calls.find((call: any[]) =>
    String(call[0]).includes('UPDATE clients')
  )?.[1];
}

describe('Touchpoint Summary Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('updates a client with no touchpoints to an empty summary', async () => {
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ touchpoint_summary: [] }] })
      .mockResolvedValueOnce({ rows: [] });

    await updateClientTouchpointSummary('client-123');

    expect(updateArgs()).toEqual(['[]', 0, 'client-123']);
  });

  test('preserves legacy-only entries and appends live entries using nested visit schema', async () => {
    const legacy = {
      id: 'legacy-1',
      type: 'Visit',
      touchpoint_number: 1,
      date: '2025-01-01',
      status: 'Completed',
      visit: { id: 'legacy-visit-1', status: 'completed' },
      call: null,
      is_legacy: true,
    };

    (pool.query as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'live-2',
            type: 'Visit',
            touchpoint_number: 2,
            date: '2026-05-19',
            status: null,
            user_id: 'user-1',
            is_legacy: false,
            created_at: '2026-05-19T01:00:00+00:00',
            updated_at: '2026-05-19T02:00:00+00:00',
            rejection_reason: 'FOR_PROCESSING',
            visit_id: 'visit-2',
            visit_type: 'regular_visit',
            visit_notes: 'notes',
            visit_reason: 'FOR_PROCESSING',
            visit_source: 'IMU',
            visit_status: 'completed',
            visit_address: 'Bacolod',
            visit_remarks: 'remarks',
            visit_time_in: '2026-05-19T01:00:00+00:00',
            visit_time_out: '2026-05-19T02:00:00+00:00',
            visit_latitude: 10.1,
            visit_longitude: 122.1,
            visit_photo_url: 'photo.jpg',
            visit_odometer_arrival: '1',
            visit_odometer_departure: '2',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ touchpoint_summary: [legacy] }] })
      .mockResolvedValueOnce({ rows: [] });

    await updateClientTouchpointSummary('client-123');

    const [summaryJson, count, clientId] = updateArgs();
    const summary = JSON.parse(summaryJson);

    expect(count).toBe(2);
    expect(clientId).toBe('client-123');
    expect(summary[0]).toEqual(legacy);
    expect(summary[1]).toMatchObject({
      id: 'live-2',
      call: null,
      type: 'Visit',
      status: 'Completed',
      touchpoint_number: 2,
      visit: {
        id: 'visit-2',
        reason: 'FOR_PROCESSING',
        status: 'completed',
        address: 'Bacolod',
      },
    });
    expect(summary[1]).not.toHaveProperty('number');
  });

  test('writes live call entries with nested call schema', async () => {
    (pool.query as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'call-tp-1',
            type: 'Call',
            touchpoint_number: 1,
            date: '2026-05-19',
            status: null,
            user_id: 'user-1',
            is_legacy: false,
            call_id: 'call-1',
            call_type: 'regular_call',
            call_notes: 'called',
            call_reason: 'L2_NOT_AROUND',
            call_source: 'IMU',
            call_status: 'completed',
            call_remarks: 'called',
            call_phone_number: '9272190259',
            call_dial_time: '2026-05-19T01:00:00+00:00',
            call_duration: 120,
            call_photo_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ touchpoint_summary: [] }] })
      .mockResolvedValueOnce({ rows: [] });

    await updateClientTouchpointSummary('client-123');

    const [summaryJson, count, clientId] = updateArgs();
    const summary = JSON.parse(summaryJson);

    expect(count).toBe(1);
    expect(clientId).toBe('client-123');
    expect(summary[0]).toMatchObject({
      id: 'call-tp-1',
      visit: null,
      type: 'Call',
      status: 'Completed',
      touchpoint_number: 1,
      call: {
        id: 'call-1',
        reason: 'L2_NOT_AROUND',
        status: 'completed',
        phone_number: '9272190259',
      },
    });
    expect(summary[0]).not.toHaveProperty('number');
  });

  test('handles database errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (pool.query as any).mockRejectedValueOnce(new Error('Database connection failed'));

    await updateClientTouchpointSummary('client-123');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update touchpoint summary'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
