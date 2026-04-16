import { pool } from '../db/index.js';

export interface TouchpointSummaryItem {
  id: string;
  number: number;
  type: 'Visit' | 'Call';
  date: string;
  reason: string | null;
  status: 'Interested' | 'Undecided' | 'Not Interested' | 'Completed';
  user_id: string;
  time_in: string | null;
  time_out: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
  } | null;
}

export async function updateClientTouchpointSummary(clientId: string): Promise<void> {
  try {
    // Fetch all touchpoints for this client
    const touchpointsResult = await pool.query(
      `SELECT
        id,
        touchpoint_number as number,
        type,
        date,
        reason,
        status,
        user_id,
        time_in,
        time_out,
        CASE
          WHEN time_in_gps_lat IS NOT NULL THEN
            jsonb_build_object(
              'latitude', time_in_gps_lat,
              'longitude', time_in_gps_lng,
              'address', time_in_gps_address
            )
          ELSE NULL
        END as location
      FROM touchpoints
      WHERE client_id = $1
      ORDER BY date ASC`,
      [clientId]
    );

    const touchpoints: TouchpointSummaryItem[] = touchpointsResult.rows;
    const count = touchpoints.length;

    // Calculate next touchpoint based on pattern
    // Pattern: 1:Visit, 2:Call, 3:Call, 4:Visit, 5:Call, 6:Call, 7:Visit
    let nextTouchpoint: 'Visit' | 'Call' | null = 'Visit';
    if (count >= 7) {
      nextTouchpoint = null;
    } else if ([1, 2, 4, 5].includes(count)) {
      nextTouchpoint = 'Call';
    }

    // Update clients table
    await pool.query(
      `UPDATE clients
       SET touchpoint_summary = $1::jsonb,
           touchpoint_number = $2,
           next_touchpoint = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(touchpoints), count + 1, nextTouchpoint, clientId]
    );
  } catch (error) {
    // Log error but don't throw - touchpoint creation should still succeed
    console.error(`Failed to update touchpoint summary for client ${clientId}:`, error);
    // Optionally: send to monitoring service
  }
}
