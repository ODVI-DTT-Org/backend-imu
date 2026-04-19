/**
 * CMS (MySQL) → IMU (PostgreSQL) Migration Script
 *
 * Uses bulk INSERT (500 rows/query) and in-memory ID maps for performance.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate-from-cms.ts
 *
 * Prerequisites:
 *   - MariaDB running locally with pcnicms database loaded
 *   - QA3 PostgreSQL with COMPLETE_SCHEMA.sql already applied
 */

// Digital Ocean uses a self-signed cert chain
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import mysql from 'mysql2/promise';
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const BATCH_SIZE = 500;
const DEFAULT_PASSWORD_HASH = await bcrypt.hash('Password123', 10);

// ── Connections ───────────────────────────────────────────────────────────────

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

const cms = await mysql.createPool({
  socketPath: '/run/mysqld/mysqld.sock',
  user: 'migrator',
  password: 'migrate123',
  database: 'pcnicms',
  multipleStatements: false,
});

// ── In-memory ID maps (old int → new UUID) ────────────────────────────────────
// Loaded once per step, avoids per-row round trips to migration_mappings

const userMap = new Map<number, string>();    // cms user id → imu uuid
const clientMap = new Map<number, string>();  // cms master_list id → imu uuid

async function loadMap(table: string, map: Map<number, string>) {
  map.clear();
  const res = await pg.query(
    'SELECT old_id, new_id FROM migration_mappings WHERE table_name = $1',
    [table]
  );
  for (const row of res.rows) map.set(Number(row.old_id), row.new_id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logStep(name: string, status: string, processed: number, error?: string) {
  await pg.query(
    `INSERT INTO migration_log (script_name, status, records_processed, error_message, completed_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [name, status, processed, error ?? null]
  );
}

async function bulkLogErrors(rows: Array<{ script: string; type: string; oldId: number | null; msg: string }>) {
  if (!rows.length) return;
  const vals: any[] = [];
  const placeholders = rows.map((r, i) => {
    const b = i * 4;
    vals.push(r.script, r.type, r.oldId, r.msg);
    return `($${b+1},$${b+2},$${b+3},$${b+4})`;
  });
  await pg.query(
    `INSERT INTO migration_errors (script_name, error_type, old_id, error_message) VALUES ${placeholders.join(',')}`,
    vals
  );
}

function normalizeClientType(raw: string | null): string {
  if (!raw) return 'POTENTIAL';
  const v = raw.trim().toLowerCase();
  if (v === 'existing') return 'EXISTING';
  return 'POTENTIAL';
}

function toTs(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Build a parameterized bulk INSERT and execute it. Returns rows inserted. */
async function bulkInsert(
  client: Pool | PoolClient,
  table: string,
  columns: string[],
  rowValues: any[][]
): Promise<number> {
  if (!rowValues.length) return 0;
  const params: any[] = [];
  const placeholders = rowValues.map(row => {
    const start = params.length + 1;
    params.push(...row);
    return `(${row.map((_, i) => `$${start + i}`).join(',')})`;
  });
  await client.query(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
    params
  );
  return rowValues.length;
}

/** Build bulk INSERT returning id column and old_id for mapping. */
async function bulkInsertReturning(
  table: string,
  columns: string[],
  rowValues: any[][]
): Promise<{ id: string }[]> {
  if (!rowValues.length) return [];
  const params: any[] = [];
  const placeholders = rowValues.map(row => {
    const start = params.length + 1;
    params.push(...row);
    return `(${row.map((_, i) => `$${start + i}`).join(',')})`;
  });
  const res = await pg.query(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')} RETURNING id`,
    params
  );
  return res.rows;
}

/** Save a batch of mappings. */
async function saveMappingsBatch(tableName: string, pairs: Array<[number, string]>) {
  if (!pairs.length) return;
  const params: any[] = [];
  const placeholders = pairs.map(([oldId, newId]) => {
    const b = params.length;
    params.push(tableName, oldId, newId);
    return `($${b+1},$${b+2},$${b+3})`;
  });
  await pg.query(
    `INSERT INTO migration_mappings (table_name, old_id, new_id) VALUES ${placeholders.join(',')}
     ON CONFLICT (table_name, old_id) DO NOTHING`,
    params
  );
}

// ── 1. USERS ─────────────────────────────────────────────────────────────────

async function migrateUsers() {
  console.log('\n[1/8] Migrating users...');
  const STEP = 'migrate_users';
  let processed = 0;
  const errors: any[] = [];

  const [rows] = await cms.query<any[]>(
    `SELECT id, email, firstname, middlename, lastname,
            user_type, deactivated, hide
     FROM users
     WHERE user_type IN ('caravan','admin','tele','uncategorized')
     ORDER BY id`
  );

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const insertRows: any[][] = [];
    const cmsIds: number[] = [];

    const seenEmails = new Set<string>();
    for (const row of batch) {
      const role = row.user_type === 'uncategorized' ? 'caravan' : row.user_type;
      const isActive = row.user_type === 'uncategorized'
        ? false
        : (row.deactivated !== '1' && row.hide !== '1');
      let email = row.email?.trim() || `user_${row.id}@cms.legacy`;
      // Deduplicate: append CMS id to make email unique
      if (seenEmails.has(email)) email = `${email}_${row.id}`;
      seenEmails.add(email);
      insertRows.push([email, DEFAULT_PASSWORD_HASH, row.firstname ?? '', row.middlename ?? null, row.lastname ?? '', role, isActive]);
      cmsIds.push(row.id);
    }

    try {
      const inserted = await bulkInsertReturning(
        'users',
        ['email','password_hash','first_name','middle_name','last_name','role','is_active'],
        insertRows
      );

      const mappings: Array<[number, string]> = [];
      const profileRows: any[][] = [];

      inserted.forEach((r, idx) => {
        const cmsRow = batch[idx];
        mappings.push([cmsRow.id, r.id]);
        userMap.set(cmsRow.id, r.id);
        const name = [cmsRow.firstname, cmsRow.lastname].filter(Boolean).join(' ');
        const email = cmsRow.email?.trim() || `user_${cmsRow.id}@cms.legacy`;
        const role = cmsRow.user_type === 'uncategorized' ? 'caravan' : cmsRow.user_type;
        profileRows.push([r.id, name, email, role]);
      });

      await saveMappingsBatch('users', mappings);
      await bulkInsert(pg, 'user_profiles', ['user_id','name','email','role'], profileRows);
      processed += inserted.length;
    } catch (err: any) {
      errors.push({ script: STEP, type: 'batch_insert', oldId: null, msg: err.message });
    }
  }

  if (errors.length) await bulkLogErrors(errors);
  console.log(`  ✓ ${processed} users migrated`);
  await logStep(STEP, 'completed', processed);
}

// ── 2. CLIENTS (master_list) ──────────────────────────────────────────────────

async function migrateClients() {
  console.log('\n[2/8] Migrating clients (master_list)...');
  const STEP = 'migrate_clients';
  let processed = 0;
  let offset = 0;

  while (true) {
    const [rows] = await cms.query<any[]>(
      `SELECT id, first_name, last_name, middle_name, ext_name, fullname,
              barangay, client_type, municipal_city, province, region, full_address,
              account_code, contact_number, account_number, rank,
              monthly_pension_amount, monthly_pension_gross,
              atm_number, applicable_republic_act, unit_code, pension_type,
              pcni_acct_code, dob, \`3G_company\`, \`3G_status\`,
              market_type, product_type, DMVAL_code, DMVAL_name,
              client_status, created_at, created_by, PAN
       FROM master_list
       ORDER BY id
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const insertRows: any[][] = [];
    const cmsIds: number[] = [];

    for (const row of rows) {
      const createdByUuid = row.created_by ? (userMap.get(row.created_by) ?? null) : null;
      const fullName = row.fullname || [row.first_name, row.last_name].filter(Boolean).join(' ');
      insertRows.push([
        row.first_name ?? '',
        row.last_name ?? '',
        row.middle_name || null,
        row.ext_name || null,
        row.fullname || null,
        fullName,
        row.barangay || null,
        row.municipal_city || null,
        row.province || null,
        row.region || null,
        row.full_address || null,
        row.account_code || null,
        row.contact_number || null,
        row.account_number || null,
        row.rank || null,
        row.monthly_pension_amount ?? null,
        row.monthly_pension_gross ?? null,
        row.atm_number || null,
        row.applicable_republic_act || null,
        row.unit_code || null,
        row.pension_type || null,
        row.pcni_acct_code || null,
        row.dob || null,
        row['3G_company'] || null,
        row['3G_status'] || null,
        row.market_type || null,
        row.product_type || null,
        row.DMVAL_code || null,
        row.DMVAL_name || null,
        normalizeClientType(row.client_type),
        row.client_status || 'active',
        row.PAN || null,
        createdByUuid,
        toTs(row.created_at),
      ]);
      cmsIds.push(row.id);
    }

    try {
      const inserted = await bulkInsertReturning(
        'clients',
        [
          'first_name','last_name','middle_name','ext_name','fullname','full_name',
          'barangay','municipality','province','region','full_address',
          'account_code','phone','account_number','rank',
          'monthly_pension_amount','monthly_pension_gross',
          'atm_number','applicable_republic_act','unit_code','pension_type',
          'pcni_acct_code','dob','g_company','g_status',
          'market_type','product_type','dmval_code','dmval_name',
          'client_type','status','pan','created_by','created_at',
        ],
        insertRows
      );

      const mappings: Array<[number, string]> = inserted.map((r, idx) => [cmsIds[idx], r.id]);
      await saveMappingsBatch('clients', mappings);
      mappings.forEach(([old, newId]) => clientMap.set(old, newId));
      processed += inserted.length;
    } catch (err: any) {
      await bulkLogErrors([{ script: STEP, type: 'batch_insert', oldId: null, msg: err.message }]);
    }

    offset += rows.length;
    if (offset % 50000 === 0) console.log(`  ... ${offset.toLocaleString()} processed`);
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`  ✓ ${processed.toLocaleString()} clients migrated`);
  await logStep(STEP, 'completed', processed);
}

// ── 3. ADDRESSES (address_list) ───────────────────────────────────────────────

async function migrateAddresses() {
  console.log('\n[3/8] Migrating addresses...');
  const STEP = 'migrate_addresses';
  let processed = 0;
  let offset = 0;
  const primarySeen = new Set<string>();

  while (true) {
    const [rows] = await cms.query<any[]>(
      `SELECT id, client_id, barangay, municipal_city, province,
              geopoint_x, geopoint_y, created_at
       FROM address_list
       ORDER BY client_id, id
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const insertRows: any[][] = [];

    for (const row of rows) {
      const clientUuid = clientMap.get(row.client_id);
      if (!clientUuid) continue;

      const isPrimary = !primarySeen.has(clientUuid);
      primarySeen.add(clientUuid);

      insertRows.push([
        clientUuid,
        'primary',
        row.barangay || null,
        row.municipal_city || null,
        row.province || null,
        row.geopoint_y ? parseFloat(row.geopoint_y) : null,
        row.geopoint_x ? parseFloat(row.geopoint_x) : null,
        isPrimary,
        toTs(row.created_at),
      ]);
    }

    try {
      await bulkInsert(pg, 'addresses',
        ['client_id','type','barangay','city','province','latitude','longitude','is_primary','created_at'],
        insertRows
      );
      processed += insertRows.length;
    } catch (err: any) {
      await bulkLogErrors([{ script: STEP, type: 'batch_insert', oldId: null, msg: err.message }]);
    }

    offset += rows.length;
    if (offset % 20000 === 0) console.log(`  ... ${offset.toLocaleString()} processed`);
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`  ✓ ${processed.toLocaleString()} addresses migrated`);
  await logStep(STEP, 'completed', processed);
}

// ── 4. PHONE NUMBERS ──────────────────────────────────────────────────────────

async function migratePhoneNumbers() {
  console.log('\n[4/8] Migrating phone numbers...');
  const STEP = 'migrate_phone_numbers';
  let processed = 0;
  let offset = 0;
  const primarySeen = new Set<string>();

  while (true) {
    const [rows] = await cms.query<any[]>(
      `SELECT id, client_id, type, number, created_at
       FROM contact_number_list
       ORDER BY client_id, id
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const insertRows: any[][] = [];

    for (const row of rows) {
      const clientUuid = clientMap.get(row.client_id);
      if (!clientUuid) continue;

      const isPrimary = !primarySeen.has(clientUuid);
      primarySeen.add(clientUuid);

      insertRows.push([clientUuid, row.number ?? '', row.type ?? 'mobile', isPrimary, toTs(row.created_at)]);
    }

    try {
      await bulkInsert(pg, 'phone_numbers', ['client_id','number','label','is_primary','created_at'], insertRows);
      processed += insertRows.length;
    } catch (err: any) {
      await bulkLogErrors([{ script: STEP, type: 'batch_insert', oldId: null, msg: err.message }]);
    }

    offset += rows.length;
    if (offset % 20000 === 0) console.log(`  ... ${offset.toLocaleString()} processed`);
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`  ✓ ${processed.toLocaleString()} phone numbers migrated`);
  await logStep(STEP, 'completed', processed);
}

// ── 5. VISITS ─────────────────────────────────────────────────────────────────

async function migrateVisits() {
  console.log('\n[5/8] Migrating visits...');
  const STEP = 'migrate_visits';
  let processed = 0;
  let skipped = 0;
  let offset = 0;

  while (true) {
    const [rows] = await cms.query<any[]>(
      `SELECT id, client_id, caravan_id, created_by,
              timeofarrival, timeofdeparture,
              tachometeronarrival, tachometerondeparture,
              client_reason, remark_comment, secondary_address_remarks,
              created_at
       FROM visits
       ORDER BY id
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const insertRows: any[][] = [];
    const cmsIds: number[] = [];

    for (const row of rows) {
      const clientUuid = clientMap.get(row.client_id);
      if (!clientUuid) { skipped++; continue; }

      const agentCmsId = row.caravan_id ?? row.created_by;
      const userUuid = agentCmsId ? (userMap.get(agentCmsId) ?? null) : null;
      if (!userUuid) { skipped++; continue; }

      // Columns: client_id, user_id, type, time_in, time_out, odometer_arrival, odometer_departure, reason, notes, source, created_at
      insertRows.push([
        clientUuid,
        userUuid,
        'regular_visit',
        toTs(row.timeofarrival),
        toTs(row.timeofdeparture),
        row.tachometeronarrival != null ? String(row.tachometeronarrival) : null,
        row.tachometerondeparture != null ? String(row.tachometerondeparture) : null,
        row.client_reason || null,
        row.secondary_address_remarks || row.remark_comment || null,
        'CMS',
        toTs(row.created_at),
      ]);
      cmsIds.push(row.id);
    }

    try {
      const inserted = await bulkInsertReturning(
        'visits',
        ['client_id','user_id','type','time_in','time_out',
         'odometer_arrival','odometer_departure','reason','notes','source','created_at'],
        insertRows
      );

      const mappings: Array<[number, string]> = inserted.map((r, idx) => [cmsIds[idx], r.id]);
      await saveMappingsBatch('visits', mappings);
      processed += inserted.length;
    } catch (err: any) {
      await bulkLogErrors([{ script: STEP, type: 'batch_insert', oldId: null, msg: err.message }]);
    }

    offset += rows.length;
    if (offset % 50000 === 0) console.log(`  ... ${offset.toLocaleString()} processed (${skipped.toLocaleString()} skipped)`);
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`  ✓ ${processed.toLocaleString()} visits migrated, ${skipped.toLocaleString()} skipped`);
  await logStep(STEP, 'completed', processed);
}

// ── 6. CALLS (call_logs) ──────────────────────────────────────────────────────

async function migrateCalls() {
  console.log('\n[6/8] Migrating calls...');
  const STEP = 'migrate_calls';
  let processed = 0;
  let skipped = 0;
  let offset = 0;

  while (true) {
    const [rows] = await cms.query<any[]>(
      `SELECT cl.id, cl.client_id, cl.telemarketer_id,
              cl.call_date, cl.call_time_start, cl.call_time_end,
              cl.client_reason, cl.remark_comment, cl.created_at,
              ml.contact_number
       FROM call_logs cl
       LEFT JOIN master_list ml ON ml.id = cl.client_id
       ORDER BY cl.id
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const insertRows: any[][] = [];
    const cmsIds: number[] = [];

    for (const row of rows) {
      const clientUuid = row.client_id ? (clientMap.get(row.client_id) ?? null) : null;
      if (!clientUuid) { skipped++; continue; }

      const userUuid = row.telemarketer_id ? (userMap.get(row.telemarketer_id) ?? null) : null;
      if (!userUuid) { skipped++; continue; }

      let dialTime: Date | null = null;
      if (row.call_date && row.call_time_start) {
        const dateStr = (row.call_date instanceof Date ? row.call_date : new Date(row.call_date))
          .toISOString().split('T')[0];
        const timeStr = row.call_time_start instanceof Date
          ? row.call_time_start.toTimeString().split(' ')[0]
          : String(row.call_time_start);
        dialTime = toTs(`${dateStr}T${timeStr}`);
      }

      let duration: number | null = null;
      if (row.call_time_start && row.call_time_end) {
        const toSecs = (t: any): number => {
          const s = t instanceof Date ? t.toTimeString().split(' ')[0] : String(t);
          const [h, m, sec] = s.split(':').map(Number);
          return h * 3600 + m * 60 + (sec || 0);
        };
        const diff = toSecs(row.call_time_end) - toSecs(row.call_time_start);
        duration = diff >= 0 ? diff : null;
      }

      // Columns: client_id, user_id, phone_number, type, dial_time, duration, reason, notes, source, created_at
      insertRows.push([
        clientUuid,
        userUuid,
        row.contact_number?.trim() || 'UNKNOWN',
        'regular_call',
        dialTime,
        duration,
        row.client_reason || null,
        row.remark_comment || null,
        'CMS',
        toTs(row.created_at),
      ]);
      cmsIds.push(row.id);
    }

    try {
      const inserted = await bulkInsertReturning(
        'calls',
        ['client_id','user_id','phone_number','type','dial_time','duration','reason','notes','source','created_at'],
        insertRows
      );

      const mappings: Array<[number, string]> = inserted.map((r, idx) => [cmsIds[idx], r.id]);
      await saveMappingsBatch('calls', mappings);
      processed += inserted.length;
    } catch (err: any) {
      await bulkLogErrors([{ script: STEP, type: 'batch_insert', oldId: null, msg: err.message }]);
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`  ✓ ${processed.toLocaleString()} calls migrated, ${skipped.toLocaleString()} skipped`);
  await logStep(STEP, 'completed', processed);
}

// ── 7. GROUPS ─────────────────────────────────────────────────────────────────

async function migrateGroups(): Promise<Map<string, string>> {
  console.log('\n[7/8] Migrating groups...');
  const STEP = 'migrate_groups';
  const groupMap = new Map<string, string>();

  const [rows] = await cms.query<any[]>('SELECT group_id, group_name, created_at FROM group_names ORDER BY id');

  const insertRows = rows.map(r => [r.group_name ?? r.group_id, toTs(r.created_at)]);

  const inserted = await bulkInsertReturning('groups', ['name','created_at'], insertRows);
  inserted.forEach((r, idx) => groupMap.set(rows[idx].group_id, r.id));

  console.log(`  ✓ ${inserted.length} groups migrated`);
  await logStep(STEP, 'completed', inserted.length);
  return groupMap;
}

// ── 8. GROUP MEMBERS ──────────────────────────────────────────────────────────

async function migrateGroupMembers(groupMap: Map<string, string>) {
  console.log('\n[8/8] Migrating group members...');
  const STEP = 'migrate_group_members';
  let skipped = 0;

  const [rows] = await cms.query<any[]>('SELECT id, user_id, group_id, created_at FROM group_members ORDER BY id');

  const insertRows: any[][] = [];
  for (const row of rows) {
    const groupUuid = groupMap.get(row.group_id);
    const userUuid = userMap.get(row.user_id);
    if (!groupUuid || !userUuid) { skipped++; continue; }
    // IMU group_members.client_id stores user UUIDs (legacy naming)
    insertRows.push([groupUuid, userUuid, toTs(row.created_at)]);
  }

  await bulkInsert(pg, 'group_members', ['group_id','client_id','joined_at'], insertRows);

  console.log(`  ✓ ${insertRows.length} group members migrated, ${skipped} skipped`);
  await logStep(STEP, 'completed', insertRows.length);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function stepDone(stepName: string): Promise<boolean> {
  const res = await pg.query(
    `SELECT COUNT(*) FROM migration_log
     WHERE script_name = $1 AND status = 'completed' AND records_processed > 0`,
    [stepName]
  );
  return Number(res.rows[0].count) > 0;
}

async function main() {
  console.log('=== CMS → IMU Migration ===');
  console.log(`Started: ${new Date().toISOString()}`);

  try {
    if (await stepDone('migrate_users')) {
      console.log('\n[1/8] Users already migrated — loading map...');
      await loadMap('users', userMap);
    } else {
      await migrateUsers();
      await loadMap('users', userMap);
    }

    if (await stepDone('migrate_clients')) {
      console.log('\n[2/8] Clients already migrated — loading map...');
      await loadMap('clients', clientMap);
    } else {
      await migrateClients();
      await loadMap('clients', clientMap);
    }

    if (await stepDone('migrate_addresses')) {
      console.log('\n[3/8] Addresses already migrated — skipping.');
    } else {
      await migrateAddresses();
    }

    if (await stepDone('migrate_phone_numbers')) {
      console.log('\n[4/8] Phone numbers already migrated — skipping.');
    } else {
      await migratePhoneNumbers();
    }

    if (await stepDone('migrate_visits')) {
      console.log('\n[5/8] Visits already migrated — skipping.');
    } else {
      await migrateVisits();
    }

    if (await stepDone('migrate_calls')) {
      console.log('\n[6/8] Calls already migrated — skipping.');
    } else {
      await migrateCalls();
    }

    const groupMap = await migrateGroups();
    await migrateGroupMembers(groupMap);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n=== Migration Complete in ${elapsed} minutes ===`);

    const errors = await pg.query('SELECT COUNT(*) FROM migration_errors');
    const mappings = await pg.query(
      'SELECT table_name, COUNT(*) as cnt FROM migration_mappings GROUP BY table_name ORDER BY table_name'
    );

    console.log(`\nErrors logged: ${errors.rows[0].count}`);
    if (Number(errors.rows[0].count) > 0) {
      console.log('  → SELECT * FROM migration_errors ORDER BY created_at;');
    }

    console.log('\nRecords migrated:');
    mappings.rows.forEach(r => console.log(`  ${r.table_name}: ${Number(r.cnt).toLocaleString()}`));

  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  } finally {
    await pg.end();
    await cms.end();
  }
}

const startTime = Date.now();
main();
