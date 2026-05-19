import { describe, expect, it, vi, beforeEach } from 'vitest';
import { updateClientTouchpointSummary } from '../touchpoint-summary.js';
import { pool } from '../../db/index.js';

vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('updateClientTouchpointSummary shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes live visit touchpoints in the same nested schema as legacy summary entries', async () => {
    const legacyEntry = {
      id: 'legacy-1',
      call: null,
      date: '2025-03-25',
      type: 'Visit',
      visit: {
        id: 'legacy-visit-1',
        type: 'regular_visit',
        notes: 'Released',
        reason: '',
        source: 'CMS',
        status: 'completed',
        address: null,
        remarks: 'Released',
        time_in: '2025-03-25T03:22:00+00:00',
        latitude: null,
        time_out: '2025-03-25T03:22:00+00:00',
        longitude: null,
        photo_url: null,
        odometer_arrival: '1',
        odometer_departure: '2',
      },
      status: 'Completed',
      user_id: null,
      is_legacy: true,
      created_at: '2025-03-24T19:23:00+00:00',
      updated_at: '2025-03-24T19:23:00+00:00',
      rejection_reason: '',
      touchpoint_number: 37,
    };

    (pool.query as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'live-tp-1',
            client_id: 'client-1',
            user_id: 'user-1',
            touchpoint_number: 38,
            type: 'Visit',
            date: '2026-05-19',
            rejection_reason: 'FOR_PROCESSING',
            status: null,
            notes: 'Follow up',
            remarks: 'Follow up',
            created_at: '2026-05-19T09:00:00+00:00',
            updated_at: '2026-05-19T10:00:00+00:00',
            is_legacy: false,
            visit_id: 'visit-1',
            visit_type: 'regular_visit',
            visit_notes: 'Follow up',
            visit_reason: 'FOR_PROCESSING',
            visit_source: 'IMU',
            visit_status: 'completed',
            visit_address: '99 Capitol Hills Dr',
            visit_remarks: 'Follow up',
            visit_time_in: '2026-05-19T09:24:00+00:00',
            visit_time_out: '2026-05-19T11:29:00+00:00',
            visit_latitude: 10.662207,
            visit_longitude: 122.977745,
            visit_photo_url: 'photo.jpg',
            visit_odometer_arrival: '10',
            visit_odometer_departure: '20',
            call_id: null,
            call_phone_number: null,
            call_dial_time: null,
            call_duration: null,
            call_notes: null,
            call_reason: null,
            call_status: null,
            call_remarks: null,
            call_source: null,
            call_photo_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ touchpoint_summary: [legacyEntry] }] })
      .mockResolvedValueOnce({ rows: [] });

    await updateClientTouchpointSummary('client-1');

    const updateCall = (pool.query as any).mock.calls[2];
    const summary = JSON.parse(updateCall[1][0]);

    expect(summary).toHaveLength(2);
    expect(summary[0]).toEqual(legacyEntry);
    expect(summary[1]).toMatchObject({
      id: 'live-tp-1',
      call: null,
      type: 'Visit',
      status: 'Completed',
      user_id: 'user-1',
      is_legacy: false,
      rejection_reason: 'FOR_PROCESSING',
      touchpoint_number: 38,
      visit: {
        id: 'visit-1',
        type: 'regular_visit',
        notes: 'Follow up',
        reason: 'FOR_PROCESSING',
        source: 'IMU',
        status: 'completed',
        address: '99 Capitol Hills Dr',
        remarks: 'Follow up',
        time_in: '2026-05-19T09:24:00+00:00',
        time_out: '2026-05-19T11:29:00+00:00',
        latitude: 10.662207,
        longitude: 122.977745,
        photo_url: 'photo.jpg',
        odometer_arrival: '10',
        odometer_departure: '20',
      },
    });
    expect(summary[1]).not.toHaveProperty('number');
    expect(summary[1]).not.toHaveProperty('reason');
    expect(summary[1]).not.toHaveProperty('location');
  });
});
