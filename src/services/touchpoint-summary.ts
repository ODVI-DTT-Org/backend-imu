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
    // Fetch touchpoints from the touchpoints table for this client
    const touchpointsResult = await pool.query(
      `SELECT
        t.id,
        t.touchpoint_number as number,
        t.type,
        t.date,
        COALESCE(v.reason, ca.reason) as reason,
        t.status,
        t.user_id,
        v.time_in,
        v.time_out,
        CASE
          WHEN COALESCE(v.latitude, t.latitude) IS NOT NULL THEN
            jsonb_build_object(
              'latitude', COALESCE(v.latitude, t.latitude),
              'longitude', COALESCE(v.longitude, t.longitude),
              'address', COALESCE(v.address, t.address)
            )
          ELSE NULL
        END as location
      FROM touchpoints t
      LEFT JOIN visits v ON v.id = t.visit_id
      LEFT JOIN calls ca ON ca.id = t.call_id
      WHERE t.client_id = $1
      ORDER BY t.date ASC`,
      [clientId]
    );

    const dbTouchpoints: TouchpointSummaryItem[] = touchpointsResult.rows;
    const dbIds = new Set(dbTouchpoints.map((t) => t.id));

    // Fetch existing touchpoint_summary to preserve legacy JSONB entries that have
    // no corresponding row in the touchpoints table (imported from PCNICMS/legacy systems).
    // Without this merge, recording any new touchpoint would wipe all legacy history.
    const existingResult = await pool.query(
      `SELECT touchpoint_summary FROM clients WHERE id = $1`,
      [clientId]
    );
    const existingRaw = existingResult.rows[0]?.touchpoint_summary ?? [];
    const existing: TouchpointSummaryItem[] = Array.isArray(existingRaw)
      ? existingRaw
      : (typeof existingRaw === 'string' ? JSON.parse(existingRaw) : []);

    // Keep only legacy entries whose IDs are not in the touchpoints table
    const legacyEntries = existing.filter((t: any) => t.id && !dbIds.has(t.id));

    // Merge legacy entries with live touchpoints table rows, sorted by date
    const allTouchpoints = [...legacyEntries, ...dbTouchpoints].sort((a: any, b: any) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    const count = allTouchpoints.length;

    // Cyclic touchpoint sequence — repeats after 7 (unlimited touchpoints)
    const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;
    const nextTouchpoint: 'Visit' | 'Call' = TOUCHPOINT_SEQUENCE[count % TOUCHPOINT_SEQUENCE.length];

    await pool.query(
      `UPDATE clients
       SET touchpoint_summary = $1::jsonb,
           touchpoint_number = $2,
           next_touchpoint = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(allTouchpoints), count, nextTouchpoint, clientId]
    );
  } catch (error) {
    console.error(`Failed to update touchpoint summary for client ${clientId}:`, error);
  }
}
