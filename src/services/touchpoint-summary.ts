import { pool } from '../db/index.js';

export interface TouchpointSummaryItem {
  id: string;
  touchpoint_number: number;
  type: 'Visit' | 'Call';
  date: string;
  status: string;
  user_id: string | null;
  is_legacy: boolean;
  created_at: string | null;
  updated_at: string | null;
  rejection_reason: string;
  visit: Record<string, unknown> | null;
  call: Record<string, unknown> | null;
}

function normalizeTouchpointStatus(status: unknown): string {
  if (typeof status !== 'string' || status.trim().length === 0) {
    return '';
  }

  const normalized = status.trim().toLowerCase();
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'interested') return 'Interested';
  if (normalized === 'undecided') return 'Undecided';
  if (normalized === 'not interested') return 'Not Interested';

  return status.trim();
}

function formatTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapTouchpointRowToSummaryItem(row: Record<string, any>): TouchpointSummaryItem {
  const status = normalizeTouchpointStatus(row.visit_status ?? row.call_status ?? row.status);
  const isVisit = row.type === 'Visit';

  return {
    id: row.id,
    call: isVisit ? null : {
      id: row.call_id,
      type: row.call_type ?? 'regular_call',
      notes: row.call_notes ?? '',
      reason: row.call_reason ?? '',
      source: row.call_source ?? null,
      status: row.call_status ?? '',
      remarks: row.call_remarks ?? row.call_notes ?? '',
      phone_number: row.call_phone_number ?? null,
      dial_time: formatTimestamp(row.call_dial_time),
      duration: row.call_duration ?? null,
      photo_url: row.call_photo_url ?? null,
    },
    date: formatTimestamp(row.date) ?? '',
    type: row.type,
    visit: isVisit ? {
      id: row.visit_id,
      type: row.visit_type ?? 'regular_visit',
      notes: row.visit_notes ?? '',
      reason: row.visit_reason ?? '',
      source: row.visit_source ?? null,
      status: row.visit_status ?? '',
      address: row.visit_address ?? null,
      remarks: row.visit_remarks ?? row.visit_notes ?? '',
      time_in: formatTimestamp(row.visit_time_in),
      latitude: row.visit_latitude ?? null,
      time_out: formatTimestamp(row.visit_time_out),
      longitude: row.visit_longitude ?? null,
      photo_url: row.visit_photo_url ?? null,
      odometer_arrival: row.visit_odometer_arrival ?? null,
      odometer_departure: row.visit_odometer_departure ?? null,
    } : null,
    status,
    user_id: row.user_id ?? null,
    is_legacy: Boolean(row.is_legacy),
    created_at: formatTimestamp(row.created_at),
    updated_at: formatTimestamp(row.updated_at),
    rejection_reason: row.rejection_reason ?? '',
    touchpoint_number: Number(row.touchpoint_number) || 0,
  };
}

export async function updateClientTouchpointSummary(clientId: string): Promise<void> {
  try {
    // Fetch touchpoints from the touchpoints table for this client
    const touchpointsResult = await pool.query(
      `SELECT
        t.id,
        t.touchpoint_number,
        t.type,
        t.date,
        t.status,
        t.user_id,
        t.rejection_reason,
        t.notes,
        t.created_at,
        t.updated_at,
        t.is_legacy,
        t.visit_id,
        v.type as visit_type,
        v.notes as visit_notes,
        v.reason as visit_reason,
        v.source as visit_source,
        v.status as visit_status,
        v.address as visit_address,
        v.remarks as visit_remarks,
        v.time_in as visit_time_in,
        v.time_out as visit_time_out,
        v.latitude as visit_latitude,
        v.longitude as visit_longitude,
        v.photo_url as visit_photo_url,
        v.odometer_arrival as visit_odometer_arrival,
        v.odometer_departure as visit_odometer_departure,
        t.call_id,
        ca.type as call_type,
        ca.notes as call_notes,
        ca.reason as call_reason,
        ca.source as call_source,
        ca.status as call_status,
        ca.remarks as call_remarks,
        ca.phone_number as call_phone_number,
        ca.dial_time as call_dial_time,
        ca.duration as call_duration,
        ca.photo_url as call_photo_url
      FROM touchpoints t
      LEFT JOIN visits v ON v.id = t.visit_id
      LEFT JOIN calls ca ON ca.id = t.call_id
      WHERE t.client_id = $1
      ORDER BY t.date ASC`,
      [clientId]
    );

    const dbTouchpoints: TouchpointSummaryItem[] = touchpointsResult.rows.map(mapTouchpointRowToSummaryItem);
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

    await pool.query(
      `UPDATE clients
       SET touchpoint_summary = $1::jsonb,
           touchpoint_number = $2,
           next_touchpoint = NULL,
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(allTouchpoints), count, clientId]
    );
  } catch (error) {
    console.error(`Failed to update touchpoint summary for client ${clientId}:`, error);
  }
}
