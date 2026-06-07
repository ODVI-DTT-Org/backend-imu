// backend-imu/src/utils/assignment-audit.ts
import { pool } from '../db/index.js';

export interface AuditEntry {
  actorUserId: string;
  action: string;                  // e.g. 'member.assign', 'caravan_municipalities.replace'
  targetUserId?: string | null;
  targetGroupId?: string | null;
  targetProvince?: string | null;
  targetMunicipality?: string | null;
  payload?: unknown;
}

export async function writeAssignmentAudit(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO assignment_audit
       (actor_user_id, action, target_user_id, target_group_id,
        target_province, target_municipality, payload_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorUserId,
      entry.action,
      entry.targetUserId ?? null,
      entry.targetGroupId ?? null,
      entry.targetProvince ?? null,
      entry.targetMunicipality ?? null,
      entry.payload != null ? JSON.stringify(entry.payload) : null,
    ],
  );
}
