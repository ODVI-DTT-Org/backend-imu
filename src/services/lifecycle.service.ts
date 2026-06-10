/**
 * lifecycle.service.ts
 *
 * Handles client lifecycle transitions triggered by touchpoints and loan releases.
 * Called from route handlers inside an open transaction so that the touchpoint/release
 * INSERT, the clients UPDATE, and the client_status_history INSERT are all atomic.
 *
 * The DB trigger (migration 1104) serves as a backstop: if the handler path runs
 * successfully, the trigger's NOT EXISTS guard prevents duplicate history rows.
 */

import { PoolClient } from 'pg';

/** Map a touchpoint_reasons.category value to the new client_type_enum value */
function categoryToClientType(category: string | null | undefined): string | null {
  if (!category) return null;
  const c = category.toUpperCase();
  if (c === 'FAVORABLE' || c === 'LEVEL 1 FAVORABLE' || c === 'LEVEL 2 FAVORABLE') {
    return 'FAVORABLE';
  }
  if (c === 'UNFAVORABLE' || c === 'LEVEL 1 UNFAVORABLE' || c === 'LEVEL 2 UNFAVORABLE' || c === 'LEVEL 3 UNFAVORABLE') {
    return 'UNFAVORABLE';
  }
  if (c === 'PROCESSING') return 'PROCESSING';
  if (c === 'GENERAL') return 'GENERAL';
  return null;
}

/** Compute the new market_type after a touch event */
function touchedMarketType(current: string | null): string {
  if (current === 'VIRGIN' || current === 'TOUCHED' || current === null) {
    return 'TOUCHED';
  }
  return current; // FULLY-PAID, EXISTING remain unchanged on touch
}

/** Compute the new market_type after a release event */
function releasedMarketType(current: string | null): string {
  switch (current) {
    case 'VIRGIN':    return 'FULLY-PAID'; // edge case
    case 'TOUCHED':   return 'FULLY-PAID';
    case 'FULLY-PAID': return 'EXISTING';
    case 'EXISTING':  return 'EXISTING';
    default:          return 'FULLY-PAID'; // NULL / unknown -> first release
  }
}

/**
 * Apply lifecycle transition after a touchpoint insert.
 * Must be called within an open transaction (client.query, not pool.query).
 *
 * @param db         - Active PoolClient with an open transaction
 * @param touchpointId - The newly inserted touchpoint ID
 * @param clientId   - The client being touched
 * @param userId     - The user performing the action (for history row)
 * @param visitId    - The linked visit ID (to look up reason)
 * @param callId     - The linked call ID (to look up reason)
 */
export async function applyTouchpointLifecycle(
  db: PoolClient,
  touchpointId: string,
  clientId: string,
  userId: string,
  visitId: string | null | undefined,
  callId: string | null | undefined,
): Promise<void> {
  // Load current client row (lock for update to prevent race conditions)
  const clientResult = await db.query(
    `SELECT id, client_type, market_type FROM clients WHERE id = $1 FOR UPDATE`,
    [clientId],
  );
  if (clientResult.rows.length === 0) return;
  const client = clientResult.rows[0];

  // Resolve reason_code from the linked visit or call
  let reasonCode: string | null = null;
  if (visitId) {
    const vr = await db.query(`SELECT reason FROM visits WHERE id = $1`, [visitId]);
    reasonCode = vr.rows[0]?.reason ?? null;
  } else if (callId) {
    const cr = await db.query(`SELECT reason FROM calls WHERE id = $1`, [callId]);
    reasonCode = cr.rows[0]?.reason ?? null;
  }

  // Resolve category from touchpoint_reasons
  let category: string | null = null;
  if (reasonCode) {
    const rr = await db.query(
      `SELECT category FROM touchpoint_reasons WHERE reason_code = $1 LIMIT 1`,
      [reasonCode],
    );
    category = rr.rows[0]?.category ?? null;
  }

  const newClientType = categoryToClientType(category);
  const newMarketType = touchedMarketType(client.market_type);

  const clientTypeChanged = newClientType !== null && newClientType !== client.client_type;
  const marketTypeChanged = newMarketType !== client.market_type;

  if (!clientTypeChanged && !marketTypeChanged) return;

  // Snapshot client BEFORE update (pre-change state)
  const snapshotResult = await db.query(
    `SELECT row_to_json(c) AS snap FROM clients c WHERE c.id = $1`,
    [clientId],
  );
  const snapshot = snapshotResult.rows[0]?.snap ?? null;

  // Apply changes to clients table
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (clientTypeChanged) {
    updates.push(`client_type = $${idx++}::client_type_enum`);
    params.push(newClientType);
  }
  if (marketTypeChanged) {
    updates.push(`market_type = $${idx++}::market_type_enum`);
    params.push(newMarketType);
  }
  updates.push(`updated_at = NOW()`);
  params.push(clientId);
  await db.query(
    `UPDATE clients SET ${updates.join(', ')} WHERE id = $${idx}`,
    params,
  );

  // Insert history rows
  if (clientTypeChanged) {
    await db.query(
      `INSERT INTO client_status_history
         (client_id, field, old_value, new_value, changed_by_user_id, trigger_touchpoint_id, client_snapshot, changed_at)
       VALUES ($1, 'client_type', $2, $3, $4, $5, $6, NOW())`,
      [clientId, client.client_type ?? null, newClientType, userId, touchpointId, snapshot],
    );
  }
  if (marketTypeChanged) {
    await db.query(
      `INSERT INTO client_status_history
         (client_id, field, old_value, new_value, changed_by_user_id, trigger_touchpoint_id, client_snapshot, changed_at)
       VALUES ($1, 'market_type', $2, $3, $4, $5, $6, NOW())`,
      [clientId, client.market_type ?? null, newMarketType, userId, touchpointId, snapshot],
    );
  }
}

/**
 * Apply lifecycle transition after a release insert.
 * Must be called within an open transaction (client.query, not pool.query).
 */
export async function applyReleaseLifecycle(
  db: PoolClient,
  releaseId: string,
  clientId: string,
  userId: string,
): Promise<void> {
  // Load current client row (lock for update)
  const clientResult = await db.query(
    `SELECT id, market_type FROM clients WHERE id = $1 FOR UPDATE`,
    [clientId],
  );
  if (clientResult.rows.length === 0) return;
  const client = clientResult.rows[0];

  const newMarketType = releasedMarketType(client.market_type);

  if (newMarketType === client.market_type) return;

  // Snapshot BEFORE update
  const snapshotResult = await db.query(
    `SELECT row_to_json(c) AS snap FROM clients c WHERE c.id = $1`,
    [clientId],
  );
  const snapshot = snapshotResult.rows[0]?.snap ?? null;

  // Apply market_type change
  await db.query(
    `UPDATE clients SET market_type = $1::market_type_enum, updated_at = NOW() WHERE id = $2`,
    [newMarketType, clientId],
  );

  // Insert history row
  await db.query(
    `INSERT INTO client_status_history
       (client_id, field, old_value, new_value, changed_by_user_id, trigger_release_id, client_snapshot, changed_at)
     VALUES ($1, 'market_type', $2, $3, $4, $5, $6, NOW())`,
    [clientId, client.market_type ?? null, newMarketType, userId, releaseId, snapshot],
  );
}
