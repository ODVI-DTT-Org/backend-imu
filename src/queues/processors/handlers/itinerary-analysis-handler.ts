import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { formatClientName, formatCaravanFullName, caravanNickname } from '../../../utils/name-format.js';
import { clampEndDate } from '../../../utils/dashboard-helpers.js';

// ─── Pure helpers (also tested directly in unit tests) ───────────────────────

export function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function calcConversionPct(releases: number, visits: number): number {
  if (visits === 0) return 0;
  return parseFloat((releases / visits * 100).toFixed(1));
}

export function calcAchievementPct(actual: number, target: number): number {
  if (target === 0) return 0;
  return parseFloat((actual / target * 100).toFixed(1));
}

export function calcAvgQualityVisit(qualityVisits: number, workingDays: number): number {
  if (workingDays === 0) return 0;
  return parseFloat((qualityVisits / workingDays).toFixed(2));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_VISITS_PER_DAY = 15;
const TARGET_WORKING_DAYS   = 25;

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface ItineraryFilters {
  group_ids?: string[];
  user_ids?: string[];
  reason_category?: string;
}

// ─── Row types ────────────────────────────────────────────────────────────────

interface AgentRow {
  user_id: string;
  /** Nickname: first initial + surname, e.g. "MMORSIQUILLO" */
  agent_nickname: string;
  /** Full formatted name: "SURNAME, FIRSTNAME MIDDLENAME" */
  agent_full_name: string;
  team_name: string;
  total_visits: number;
  total_releases: number;
  r_deceased: number;
  r_for_processing: number;
  r_for_verification: number;
  r_interested: number;
  r_loan_inquiry: number;
  r_moved_out: number;
  r_borrowed: number;
  r_not_around: number;
  r_not_interested: number;
  r_overaged: number;
  r_poor_health: number;
  r_undecided: number;
  r_with_existing_loan: number;
  quality_visits: number;
  absent_weekdays: number;
}

interface VisitDetailRow {
  id: string;
  created_at: string;
  /** Caravan nickname */
  agent_nickname: string;
  /** Caravan full formatted name */
  agent_full_name: string;
  team_name: string;
  /** Formatted client name */
  client_name: string;
  visit_reason: string | null;
  reason_category: string | null;
  remarks: string | null;
}

// ─── Data fetch helper (shared by queue worker and preview endpoint) ──────────

export async function fetchItineraryAnalysisData(
  db: Pool,
  from: string,
  to: string,
  filters?: ItineraryFilters
): Promise<{ agents: AgentRow[]; visitDetails: VisitDetailRow[]; workingDays: number }> {
  // Clamp to never extend past today (fixes future-date bug for current-month reports)
  const clampedTo = clampEndDate(to);

  const fromDate = new Date(from);
  const toDate   = new Date(clampedTo);
  const workingDays = countWorkingDays(fromDate, toDate);

  // Normalize filters: null means "no filter" (include all)
  const groupIds   = filters?.group_ids?.length   ? filters.group_ids   : null;
  const userIds    = filters?.user_ids?.length     ? filters.user_ids    : null;
  const reasonCat  = filters?.reason_category      ? filters.reason_category : null;

  const [agentResult, visitDetailResult] = await Promise.all([
    // ── Agent summary query ──────────────────────────────────────────────────
    //
    // Team linkage comes from group_role_members (role_in_group='caravan').
    // Caravans without a group assignment fall back to 'UNASSIGNED'.
    // Raw name parts are selected so TypeScript can format them consistently.
    //
    // Filter params:
    //   $1 = from date, $2 = to date (clamped)
    //   $3 = group_ids  (uuid[]  | NULL = all)
    //   $4 = user_ids   (uuid[]  | NULL = all)
    //   $5 = reason_cat (text    | NULL = all categories)
    //
    db.query<{
      user_id: string;
      first_name: string; middle_name: string | null; last_name: string;
      team_name: string;
      total_visits: string; total_releases: string;
      r_deceased: string; r_for_processing: string; r_for_verification: string;
      r_interested: string; r_loan_inquiry: string; r_moved_out: string;
      r_borrowed: string; r_not_around: string; r_not_interested: string;
      r_overaged: string; r_poor_health: string; r_undecided: string;
      r_with_existing_loan: string; quality_visits: string; absent_weekdays: string;
    }>(`
      WITH weekdays AS (
        SELECT d::date AS day
        FROM generate_series($1::date, $2::date, '1 day') d
        WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
      ),
      visit_days AS (
        SELECT user_id, date(time_in) AS day, COUNT(*) AS n
        FROM visits
        WHERE time_in::date BETWEEN $1 AND $2
        GROUP BY user_id, date(time_in)
      )
      SELECT
        u.id                                                              AS user_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        COALESCE(g.name, 'UNASSIGNED')                                    AS team_name,
        COUNT(DISTINCT v.id)                                              AS total_visits,
        COUNT(DISTINCT r.id)                                              AS total_releases,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('DECEASED','L3_DECEASED'))                                    AS r_deceased,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('FOR_PROCESSING','FOR_ADA_COMPLIANCE','FOR_UPDATE'))          AS r_for_processing,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason = 'FOR_VERIFICATION')                                            AS r_for_verification,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('INTERESTED','L1_INTERESTED'))                               AS r_interested,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('LOAN_INQUIRY','L1_LOAN_INQUIRY'))                           AS r_loan_inquiry,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason = 'MOVED_OUT')                                                   AS r_moved_out,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason = 'L1_BORROWED')                                                 AS r_borrowed,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('NOT_AROUND','L2_NOT_AROUND'))                               AS r_not_around,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('NOT_INTERESTED','L1_NOT_INTERESTED'))                       AS r_not_interested,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('OVERAGE','L3_DISQUALIFIED','L3_NOT_QUALIFIED'))             AS r_overaged,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason = 'POOR_HEALTH')                                                 AS r_poor_health,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('UNDECIDED','L1_UNDECIDED'))                                 AS r_undecided,
        COUNT(DISTINCT v.id) FILTER (WHERE v.reason IN ('WITH_OTHER_LENDING','L2_WITH_OTHER_LENDING'))               AS r_with_existing_loan,
        COUNT(DISTINCT v.id) FILTER (
          WHERE tr.category IN ('Favorable', 'Processing')
        )                                                                 AS quality_visits,
        (SELECT COUNT(*) FROM weekdays w
         WHERE NOT EXISTS (
           SELECT 1 FROM visit_days vd WHERE vd.user_id = u.id AND vd.day = w.day
         ))                                                               AS absent_weekdays
      FROM users u
      LEFT JOIN group_role_members grm
             ON grm.user_id = u.id
            AND grm.role_in_group = 'caravan'
            AND grm.deleted_at IS NULL
      LEFT JOIN groups g ON g.id = grm.group_id
      LEFT JOIN visits v ON v.user_id = u.id
        AND v.time_in::date BETWEEN $1 AND $2
      LEFT JOIN touchpoint_reasons tr ON tr.reason_code = v.reason
      LEFT JOIN releases r ON r.user_id = u.id
        AND r.created_at::date BETWEEN $1 AND $2
        AND r.status IN ('approved', 'released')
      WHERE u.role = 'caravan'
        AND ($3::uuid[] IS NULL OR g.id = ANY($3))
        AND ($4::uuid[] IS NULL OR u.id = ANY($4))
        AND ($5::text IS NULL OR tr.category = $5)
      GROUP BY u.id, u.first_name, u.middle_name, u.last_name, g.name
      ORDER BY team_name, u.last_name, u.first_name
    `, [from, clampedTo, groupIds, userIds, reasonCat]),

    // ── Visit detail query ───────────────────────────────────────────────────
    //
    // Team linkage via group_role_members (role_in_group='caravan').
    // Raw name parts returned for TypeScript formatting.
    //
    // Filter params:
    //   $1 = from date, $2 = to date (clamped)
    //   $3 = group_ids  (uuid[]  | NULL = all)
    //   $4 = user_ids   (uuid[]  | NULL = all)
    //   $5 = reason_cat (text    | NULL = all categories)
    //
    db.query<{
      id: string; created_at: string;
      u_first_name: string; u_middle_name: string | null; u_last_name: string;
      team_name: string;
      c_first_name: string | null; c_middle_name: string | null;
      c_last_name: string | null; c_ext_name: string | null;
      visit_reason: string | null;
      reason_category: string | null; remarks: string | null;
    }>(`
      SELECT
        v.id,
        v.time_in::text                              AS created_at,
        u.first_name                                 AS u_first_name,
        u.middle_name                                AS u_middle_name,
        u.last_name                                  AS u_last_name,
        COALESCE(g.name, 'UNASSIGNED')              AS team_name,
        c.first_name                                 AS c_first_name,
        c.middle_name                                AS c_middle_name,
        c.last_name                                  AS c_last_name,
        c.ext_name                                   AS c_ext_name,
        tr.label                                     AS visit_reason,
        tr.category                                  AS reason_category,
        v.remarks
      FROM visits v
      JOIN users u ON u.id = v.user_id
      LEFT JOIN group_role_members grm
             ON grm.user_id = u.id
            AND grm.role_in_group = 'caravan'
            AND grm.deleted_at IS NULL
      LEFT JOIN groups g ON g.id = grm.group_id
      LEFT JOIN clients c ON c.id = v.client_id
      LEFT JOIN touchpoint_reasons tr ON tr.reason_code = v.reason
      WHERE v.time_in::date BETWEEN $1 AND $2
        AND u.role = 'caravan'
        AND ($3::uuid[] IS NULL OR g.id = ANY($3))
        AND ($4::uuid[] IS NULL OR u.id = ANY($4))
        AND ($5::text IS NULL OR tr.category = $5)
      ORDER BY team_name, u.last_name, u.first_name, v.time_in ASC
    `, [from, clampedTo, groupIds, userIds, reasonCat]),
  ]);

  const agents: AgentRow[] = agentResult.rows.map(r => ({
    user_id:              r.user_id,
    agent_nickname:       caravanNickname({ first_name: r.first_name, last_name: r.last_name }),
    agent_full_name:      formatCaravanFullName({ first_name: r.first_name, middle_name: r.middle_name, last_name: r.last_name }),
    team_name:            r.team_name,
    total_visits:         parseInt(r.total_visits),
    total_releases:       parseInt(r.total_releases),
    r_deceased:           parseInt(r.r_deceased),
    r_for_processing:     parseInt(r.r_for_processing),
    r_for_verification:   parseInt(r.r_for_verification),
    r_interested:         parseInt(r.r_interested),
    r_loan_inquiry:       parseInt(r.r_loan_inquiry),
    r_moved_out:          parseInt(r.r_moved_out),
    r_borrowed:           parseInt(r.r_borrowed),
    r_not_around:         parseInt(r.r_not_around),
    r_not_interested:     parseInt(r.r_not_interested),
    r_overaged:           parseInt(r.r_overaged),
    r_poor_health:        parseInt(r.r_poor_health),
    r_undecided:          parseInt(r.r_undecided),
    r_with_existing_loan: parseInt(r.r_with_existing_loan),
    quality_visits:       parseInt(r.quality_visits),
    absent_weekdays:      parseInt(r.absent_weekdays),
  }));

  const visitDetails: VisitDetailRow[] = visitDetailResult.rows.map(r => ({
    id:             r.id,
    created_at:     r.created_at,
    agent_nickname: caravanNickname({ first_name: r.u_first_name, last_name: r.u_last_name }),
    agent_full_name: formatCaravanFullName({ first_name: r.u_first_name, middle_name: r.u_middle_name, last_name: r.u_last_name }),
    team_name:      r.team_name,
    client_name:    formatClientName({ first_name: r.c_first_name, middle_name: r.c_middle_name, last_name: r.c_last_name, ext_name: r.c_ext_name }),
    visit_reason:   r.visit_reason,
    reason_category: r.reason_category,
    remarks:        r.remarks,
  }));

  return { agents, visitDetails, workingDays };
}

// ─── Main export function ─────────────────────────────────────────────────────

export type ProgressCallback = (pct: number, message: string) => Promise<void>;

export async function generateItineraryAnalysisReport(
  db: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  from: string,
  to: string,
  onProgress?: ProgressCallback,
  filters?: ItineraryFilters
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string; rowCount: number }> {
  await onProgress?.(5, 'Preparing query…');
  await onProgress?.(20, 'Fetching data…');
  // clampEndDate is also applied inside fetchItineraryAnalysisData, but clamp
  // the fileName's `to` here too so file names are honest.
  const clampedTo = clampEndDate(to);
  const { agents, visitDetails, workingDays } = await fetchItineraryAnalysisData(db, from, to, filters);
  await onProgress?.(60, 'Processing rows…');

  const buffer = await buildWorkbook(agents, visitDetails, workingDays);
  await onProgress?.(80, 'Uploading…');

  const fileName    = `itinerary-analysis-${from}-${clampedTo}-${Date.now()}.xlsx`;
  const downloadUrl = await uploadToS3(s3Client, s3Bucket, fileName, buffer);
  await onProgress?.(95, 'Finalizing…');

  // rowCount = visit detail rows (the most data-dense sheet)
  const rowCount = visitDetails.length;

  return { buffer, fileName, downloadUrl, rowCount };
}

// ─── Column headers (A–AG, 33 columns) ───────────────────────────────────────
//
// Column layout (0-indexed):
//  0  A  TEAM'S
//  1  B  Caravan          (nickname, e.g. "MMORSIQUILLO")
//  2  C  Caravan Name     (NEW: full formatted name, e.g. "MORSIQUILLO, MARK BAUTISTA")
//  3  D  Total Production UDI Amount
//  4  E  Total Production No. of acc.
//  5  F  Deceased
//  6  G  For Processing
//  7  H  For Verification
//  8  I  Interested
//  9  J  Loan Inquiry
// 10  K  Moved Out
// 11  L  Borrowed
// 12  M  Not Around
// 13  N  Not Interested
// 14  O  Overaged
// 15  P  Poor Health
// 16  Q  Undecided
// 17  R  With Existing Loan
// 18  S  Grand Total
// 19  T  Borrowed (releases duplicate)
// 20  U  Target Itinerary
// 21  V  Total Deficit
// 22  W  Less Releases
// 23  X  Adjusted Target
// 24  Y  Adjusted Deficit
// 25  Z  Final Target
// 26  AA Final Deficit
// 27  AB Achievement %
// 28  AC Leave/Meeting/Absent
// 29  AD Quality Visit
// 30  AE Quality Visit vs Itinerary %
// 31  AF % Conversion
// 32  AG Average Quality Visit

const HEADERS = [
  "TEAM'S",                       // A [0]
  "Caravan",                      // B [1]  — was "Caravan's"
  "Caravan Name",                  // C [2]  — NEW column
  "Total Production UDI Amount",   // D [3]
  "Total Production No. of acc.",  // E [4]
  "Deceased",                      // F [5]
  "For Processing",                // G [6]
  "For Verification",              // H [7]
  "Interested",                    // I [8]
  "Loan Inquiry",                  // J [9]
  "Moved Out",                     // K [10]
  "Borrowed",                      // L [11]
  "Not Around",                    // M [12]
  "Not Interested",                // N [13]
  "Overaged",                      // O [14]
  "Poor Health",                   // P [15]
  "Undecided",                     // Q [16]
  "With Existing Loan",            // R [17]
  "Grand Total",                   // S [18]
  "Borrowed",                      // T [19]
  "Target Itinerary",              // U [20]
  "Total Deficit",                 // V [21]
  "Less Releases",                 // W [22]
  "Adjusted Target",               // X [23]
  "Adjusted Deficit",              // Y [24]
  "Final Target",                  // Z [25]
  "Final Deficit",                 // AA [26]
  "Achievement %",                 // AB [27]
  "Leave/Meeting/Absent",          // AC [28]
  "Quality Visit",                 // AD [29]
  "Quality Visit vs Itinerary %",  // AE [30]
  "% Conversion",                  // AF [31]
  "Average Quality Visit",         // AG [32]
];

// ─── Row builders ─────────────────────────────────────────────────────────────

function buildAgentRowValues(agent: AgentRow, _workingDays: number): (string | number)[] {
  const R  = agent.total_visits;
  const D  = agent.total_releases;
  const AB = agent.absent_weekdays;
  const T  = TARGET_VISITS_PER_DAY * TARGET_WORKING_DAYS;   // 375
  const V  = D * TARGET_VISITS_PER_DAY;                     // Less Releases credit
  const W  = (T - V) - AB * TARGET_VISITS_PER_DAY;          // Adjusted Target
  const X  = W === 0 ? 0 : parseFloat((W / TARGET_VISITS_PER_DAY).toFixed(2)); // Effective working days
  const Y  = X === 0 ? 0 : parseFloat((R / X).toFixed(2));  // Daily avg (stored in "Final Target" col)
  const Z  = W - R;                                          // Adjusted/Final deficit
  const AA = calcAchievementPct(R, T);                       // Achievement %
  const AC = agent.quality_visits;
  const AD = R === 0 ? 0 : parseFloat(((AC / R) * 100).toFixed(1));
  const AE = AC === 0 ? 0 : parseFloat(((D / AC) * 100).toFixed(1)); // % Conversion = releases / quality_visits
  const AF = parseFloat((AC / TARGET_WORKING_DAYS).toFixed(2));

  return [
    agent.team_name,        // A  [0]
    agent.agent_nickname,   // B  [1]: Caravan (nickname)
    agent.agent_full_name,  // C  [2]: Caravan Name (NEW)
    0,                      // D  [3]: UDI Amount (placeholder)
    D,                      // E  [4]: acc count = releases
    agent.r_deceased,               // F  [5]
    agent.r_for_processing,         // G  [6]
    agent.r_for_verification,       // H  [7]
    agent.r_interested,             // I  [8]
    agent.r_loan_inquiry,           // J  [9]
    agent.r_moved_out,              // K  [10]
    agent.r_borrowed,               // L  [11]
    agent.r_not_around,             // M  [12]
    agent.r_not_interested,         // N  [13]
    agent.r_overaged,               // O  [14]
    agent.r_poor_health,            // P  [15]
    agent.r_undecided,              // Q  [16]
    agent.r_with_existing_loan,     // R  [17]
    R,                      // S  [18]: Grand Total = total_visits
    D,                      // T  [19]: Borrowed duplicate = D (releases)
    T,                      // U  [20]: Target Itinerary = 375
    T - R,                  // V  [21]: Total Deficit
    V,                      // W  [22]: Less Releases
    W,                      // X  [23]: Adjusted Target
    X,                      // Y  [24]: Adjusted Deficit (effective working days)
    Y,                      // Z  [25]: Final Target (daily avg)
    Z,                      // AA [26]: Final Deficit
    AA,                     // AB [27]: Achievement %
    AB,                     // AC [28]: Leave/Meeting/Absent (absent weekdays)
    AC,                     // AD [29]: Quality Visit
    AD,                     // AE [30]: Quality Visit vs Itinerary %
    AE,                     // AF [31]: % Conversion
    AF,                     // AG [32]: Average Quality Visit
  ];
}

function buildTeamTotalRow(teamName: string, teamAgents: AgentRow[], _workingDays: number): (string | number)[] {
  const sum = (key: keyof AgentRow) =>
    teamAgents.reduce((acc, a) => acc + (a[key] as number), 0);

  const R  = sum('total_visits');
  const D  = sum('total_releases');
  const AB = sum('absent_weekdays');
  const T  = TARGET_VISITS_PER_DAY * TARGET_WORKING_DAYS;
  const V  = D * TARGET_VISITS_PER_DAY;
  const W  = (T - V) - AB * TARGET_VISITS_PER_DAY;
  const X  = W === 0 ? 0 : parseFloat((W / TARGET_VISITS_PER_DAY).toFixed(2));
  const Y  = X === 0 ? 0 : parseFloat((R / X).toFixed(2));
  const Z  = W - R;
  const AA = calcAchievementPct(R, T);
  const AC = sum('quality_visits');
  const AD = R === 0 ? 0 : parseFloat(((AC / R) * 100).toFixed(1));
  const AE = AC === 0 ? 0 : parseFloat(((D / AC) * 100).toFixed(1));
  const AF = parseFloat((AC / TARGET_WORKING_DAYS).toFixed(2));

  return [
    teamName, 'TOTAL', '',         // A=team, B=TOTAL, C=empty (Caravan Name)
    0, D,
    sum('r_deceased'), sum('r_for_processing'), sum('r_for_verification'),
    sum('r_interested'), sum('r_loan_inquiry'), sum('r_moved_out'), sum('r_borrowed'),
    sum('r_not_around'), sum('r_not_interested'), sum('r_overaged'),
    sum('r_poor_health'), sum('r_undecided'), sum('r_with_existing_loan'),
    R, D, T, T - R, V,
    W, X, Y, Z,
    AA, AB, AC, AD, AE, AF,
  ];
}

// ─── Sheet styling helpers ────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' },
};
const TEAM_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' },
};
const SECTION_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' },
};
const SUB_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' },
};

function applyHeaderRow(sheet: ExcelJS.Worksheet): void {
  const row = sheet.getRow(1);
  HEADERS.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  row.commit();
  sheet.getRow(1).height = 40;
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

function setColumnWidths(sheet: ExcelJS.Worksheet): void {
  sheet.getColumn(1).width = 20;  // A: Team
  sheet.getColumn(2).width = 18;  // B: Caravan (nickname)
  sheet.getColumn(3).width = 30;  // C: Caravan Name (NEW — full formatted)
  sheet.getColumn(4).width = 15;  // D: UDI Amount
  sheet.getColumn(5).width = 10;  // E: Acc count
  for (let i = 6; i <= 19; i++) sheet.getColumn(i).width = 12;   // F–S (reason breakdown + Grand Total)
  for (let i = 20; i <= 27; i++) sheet.getColumn(i).width = 12;  // T–AA (target/deficit math)
  for (let i = 28; i <= 33; i++) sheet.getColumn(i).width = 14;  // AB–AG (achievement/quality cols)
}

function addDataRows(
  sheet: ExcelJS.Worksheet,
  agents: AgentRow[],
  workingDays: number,
  isSummarySheet: boolean
): void {
  const teamMap = new Map<string, AgentRow[]>();
  for (const agent of agents) {
    if (!teamMap.has(agent.team_name)) teamMap.set(agent.team_name, []);
    teamMap.get(agent.team_name)!.push(agent);
  }

  if (isSummarySheet) {
    for (const [teamName, teamAgents] of teamMap) {
      for (const agent of teamAgents) {
        sheet.addRow(buildAgentRowValues(agent, workingDays)).commit();
      }
      const totalRow = sheet.addRow(buildTeamTotalRow(teamName, teamAgents, workingDays));
      totalRow.eachCell(cell => { cell.fill = TEAM_FILL; cell.font = { bold: true }; });
      totalRow.commit();
    }
    const allAgents = [...teamMap.values()].flat();
    const grandRow = sheet.addRow(buildTeamTotalRow('GRAND TOTAL', allAgents, workingDays));
    grandRow.eachCell(cell => { cell.fill = TOTAL_FILL; cell.font = { bold: true }; });
    grandRow.commit();
  } else {
    for (const agent of agents) {
      sheet.addRow(buildAgentRowValues(agent, workingDays)).commit();
    }
    const totalRow = sheet.addRow(buildTeamTotalRow(agents[0]?.team_name ?? '', agents, workingDays));
    totalRow.eachCell(cell => { cell.fill = TEAM_FILL; cell.font = { bold: true }; });
    totalRow.commit();
  }
}

// ─── Insights sheet builder ───────────────────────────────────────────────────
//
// Visit Detail columns (1-indexed):
//   A(1)=Date, B(2)=Caravan(nickname), C(3)=Caravan Name,
//   D(4)=Team, E(5)=Client, F(6)=Reason(label), G(7)=Category, H(8)=Remarks
//
// Formulas reference '$D:$D' for Team, '$B:$B' for Caravan nickname,
// '$G:$G' for Category, '$F:$F' for Reason label.

// Favorable reason labels as they appear in touchpoint_reasons.label
const FAVORABLE_REASON_LABELS = [
  'Interested',
  'Loan Inquiry',
  'Telemarketing',
  'Undecided',
] as const;

function buildInsightsSheet(
  wb: ExcelJS.Workbook,
  agents: AgentRow[],
): void {
  const sheet = wb.addWorksheet('Insights');

  // Collect unique teams in insertion order
  const teamMap = new Map<string, AgentRow[]>();
  for (const agent of agents) {
    if (!teamMap.has(agent.team_name)) teamMap.set(agent.team_name, []);
    teamMap.get(agent.team_name)!.push(agent);
  }
  const teamNames = [...teamMap.keys()];

  // ── Section 1: Category matrix ────────────────────────────────────────────
  //
  // Row 1: blank (section title)
  // Row 2: column headers (Team | Favorable | Processing | Unfavorable | General | Total Visits | Quality Visits)
  // Rows 3..N+2: one row per team
  // Row N+3: GRAND TOTAL

  const MATRIX_HEADERS = ['Team', 'Favorable', 'Processing', 'Unfavorable', 'General', 'Total Visits', 'Quality Visits'];
  const CATEGORIES: Array<string | null> = ['Favorable', 'Processing', 'Unfavorable', 'General', null, null];

  // Section title row
  {
    const titleRow = sheet.addRow(['CATEGORY BREAKDOWN BY TEAM']);
    titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).fill = SECTION_HEADER_FILL;
    titleRow.getCell(1).alignment = { horizontal: 'left' };
    // Merge A1:G1
    sheet.mergeCells(titleRow.number, 1, titleRow.number, MATRIX_HEADERS.length);
    titleRow.commit();
  }

  // Header row
  const matrixHeaderRowNum = sheet.rowCount + 1;
  {
    const hRow = sheet.addRow(MATRIX_HEADERS);
    hRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', wrapText: true };
      if (colNum === 1) cell.alignment = { horizontal: 'left' };
    });
    hRow.height = 30;
    hRow.commit();
  }

  // Data rows (one per team) — start at matrixHeaderRowNum + 1
  const firstTeamDataRow = sheet.rowCount + 1;
  for (const teamName of teamNames) {
    const rowNum = sheet.rowCount + 1;
    const row = sheet.addRow([teamName]);
    // B: Favorable  = COUNTIFS('Visit Detail'!$D:$D,A{rowNum},'Visit Detail'!$G:$G,"Favorable")
    // C: Processing = COUNTIFS('Visit Detail'!$D:$D,A{rowNum},'Visit Detail'!$G:$G,"Processing")
    // D: Unfavorable
    // E: General
    // F: Total Visits = COUNTIFS('Visit Detail'!$D:$D,A{rowNum})
    // G: Quality Visits = B{rowNum}+C{rowNum}
    row.getCell(2).value = { formula: `COUNTIFS('Visit Detail'!$D:$D,A${rowNum},'Visit Detail'!$G:$G,"Favorable")` };
    row.getCell(3).value = { formula: `COUNTIFS('Visit Detail'!$D:$D,A${rowNum},'Visit Detail'!$G:$G,"Processing")` };
    row.getCell(4).value = { formula: `COUNTIFS('Visit Detail'!$D:$D,A${rowNum},'Visit Detail'!$G:$G,"Unfavorable")` };
    row.getCell(5).value = { formula: `COUNTIFS('Visit Detail'!$D:$D,A${rowNum},'Visit Detail'!$G:$G,"General")` };
    row.getCell(6).value = { formula: `COUNTIF('Visit Detail'!$D:$D,A${rowNum})` };
    row.getCell(7).value = { formula: `B${rowNum}+C${rowNum}` };
    row.getCell(1).alignment = { horizontal: 'left' };
    for (let c = 2; c <= 7; c++) row.getCell(c).alignment = { horizontal: 'center' };
    row.commit();
  }

  // Grand Total row
  const grandTotalRowNum = sheet.rowCount + 1;
  {
    const firstDataRow = firstTeamDataRow;
    const lastDataRow = grandTotalRowNum - 1;
    const tRow = sheet.addRow(['GRAND TOTAL']);
    if (teamNames.length > 0) {
      tRow.getCell(2).value = { formula: `SUM(B${firstDataRow}:B${lastDataRow})` };
      tRow.getCell(3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` };
      tRow.getCell(4).value = { formula: `SUM(D${firstDataRow}:D${lastDataRow})` };
      tRow.getCell(5).value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})` };
      tRow.getCell(6).value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})` };
      tRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})` };
    } else {
      for (let c = 2; c <= 7; c++) tRow.getCell(c).value = 0;
    }
    tRow.eachCell(cell => { cell.fill = TOTAL_FILL; cell.font = { bold: true }; });
    tRow.getCell(1).alignment = { horizontal: 'left' };
    for (let c = 2; c <= 7; c++) tRow.getCell(c).alignment = { horizontal: 'center' };
    tRow.commit();
  }

  // ── Section 2: Favorable Reasons Breakdown ────────────────────────────────
  //
  // Layout:
  //   separator blank row
  //   Section title row
  //   Column headers: Team | Caravan | Interested | Loan Inquiry | Telemarketing | Undecided | Total Favorable
  //   Per-team block:
  //     Team total row (team, "TOTAL", formula per reason)
  //     Per-caravan rows (team, nickname, formula per reason)

  // blank separator
  sheet.addRow([]).commit();

  // Section title row
  {
    const titleRow = sheet.addRow(['FAVORABLE REASONS BREAKDOWN']);
    const totalCols = 2 + FAVORABLE_REASON_LABELS.length + 1; // Team+Caravan + reasons + Total
    titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleRow.getCell(1).fill = SECTION_HEADER_FILL;
    titleRow.getCell(1).alignment = { horizontal: 'left' };
    sheet.mergeCells(titleRow.number, 1, titleRow.number, totalCols);
    titleRow.commit();
  }

  // Column headers
  const favHeaderCols = ['Team', 'Caravan', ...FAVORABLE_REASON_LABELS, 'Total Favorable'];
  {
    const hRow = sheet.addRow(favHeaderCols);
    hRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = SUB_HEADER_FILL;
      cell.alignment = colNum <= 2 ? { horizontal: 'left' } : { horizontal: 'center', wrapText: true };
    });
    hRow.height = 30;
    hRow.commit();
  }

  // Per-team: team-total row first, then per-caravan rows
  for (const [teamName, teamAgents] of teamMap) {
    // Team total row
    const teamTotalRowNum = sheet.rowCount + 1;
    const tRow = sheet.addRow([teamName, 'TOTAL']);
    // Cols 3..3+n-1 = reason COUNTIFS scoped to team only (col D for team)
    FAVORABLE_REASON_LABELS.forEach((label, idx) => {
      const colNum = 3 + idx;
      tRow.getCell(colNum).value = {
        formula: `COUNTIFS('Visit Detail'!$D:$D,"${teamName}",'Visit Detail'!$F:$F,"${label}")`,
      };
    });
    // Total Favorable = sum of reason cols
    const totalColNum = 3 + FAVORABLE_REASON_LABELS.length;
    const firstReasonCol = 3;
    const lastReasonCol = totalColNum - 1;
    // Convert col numbers to letters: 3=C, 4=D, ...
    const colLetter = (n: number) => {
      let s = '';
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };
    tRow.getCell(totalColNum).value = {
      formula: `SUM(${colLetter(firstReasonCol)}${teamTotalRowNum}:${colLetter(lastReasonCol)}${teamTotalRowNum})`,
    };
    tRow.eachCell(cell => { cell.fill = TEAM_FILL; cell.font = { bold: true }; });
    tRow.getCell(1).alignment = { horizontal: 'left' };
    tRow.getCell(2).alignment = { horizontal: 'left' };
    for (let c = 3; c <= totalColNum; c++) tRow.getCell(c).alignment = { horizontal: 'center' };
    tRow.commit();

    // Per-caravan rows
    for (const agent of teamAgents) {
      const caravanRowNum = sheet.rowCount + 1;
      const aRow = sheet.addRow([agent.team_name, agent.agent_nickname]);
      FAVORABLE_REASON_LABELS.forEach((label, idx) => {
        const colNum = 3 + idx;
        // Match both team (col D) and caravan nickname (col B) to avoid nickname collisions
        aRow.getCell(colNum).value = {
          formula: `COUNTIFS('Visit Detail'!$D:$D,"${agent.team_name}",'Visit Detail'!$B:$B,"${agent.agent_nickname}",'Visit Detail'!$F:$F,"${label}")`,
        };
      });
      aRow.getCell(totalColNum).value = {
        formula: `SUM(${colLetter(firstReasonCol)}${caravanRowNum}:${colLetter(lastReasonCol)}${caravanRowNum})`,
      };
      aRow.getCell(1).alignment = { horizontal: 'left' };
      aRow.getCell(2).alignment = { horizontal: 'left' };
      for (let c = 3; c <= totalColNum; c++) aRow.getCell(c).alignment = { horizontal: 'center' };
      aRow.commit();
    }
  }

  // ── Column widths ─────────────────────────────────────────────────────────
  sheet.getColumn(1).width = 22;  // Team
  sheet.getColumn(2).width = 20;  // Caravan nickname
  sheet.getColumn(3).width = 14;  // Favorable / Interested
  sheet.getColumn(4).width = 14;  // Processing / Loan Inquiry
  sheet.getColumn(5).width = 14;  // Unfavorable / Telemarketing
  sheet.getColumn(6).width = 14;  // General / Undecided
  sheet.getColumn(7).width = 14;  // Total Visits / Total Favorable

  // Freeze the first two rows (section title + column header)
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: matrixHeaderRowNum }];

  // AutoFilter on Category matrix header row
  sheet.autoFilter = {
    from: { row: matrixHeaderRowNum, column: 1 },
    to:   { row: matrixHeaderRowNum, column: MATRIX_HEADERS.length },
  };
}

// ─── Workbook builder ─────────────────────────────────────────────────────────

export async function buildWorkbook(
  agents: AgentRow[],
  visitDetails: VisitDetailRow[],
  workingDays: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IMU System';
  wb.created = new Date();

  // ── Sheet 1: Insights (FIRST) ─────────────────────────────────────────────
  buildInsightsSheet(wb, agents);

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Summary');
  setColumnWidths(summary);
  applyHeaderRow(summary);
  addDataRows(summary, agents, workingDays, true);
  // AutoFilter on header row, full column span (A–AG = 33 cols)
  summary.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: HEADERS.length },
  };

  // ── Per-team sheets ───────────────────────────────────────────────────────
  const teamMap = new Map<string, AgentRow[]>();
  for (const agent of agents) {
    if (!teamMap.has(agent.team_name)) teamMap.set(agent.team_name, []);
    teamMap.get(agent.team_name)!.push(agent);
  }
  for (const [teamName, teamAgents] of teamMap) {
    const sheet = wb.addWorksheet(teamName.substring(0, 31)); // Excel max sheet name = 31 chars
    setColumnWidths(sheet);
    applyHeaderRow(sheet);
    addDataRows(sheet, teamAgents, workingDays, false);
    // AutoFilter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: HEADERS.length },
    };
  }

  // ── Visit Detail sheet ────────────────────────────────────────────────────
  // Columns: Date | Caravan (nickname) | Caravan Name (full) | Team | Client | Reason | Category | Remarks
  const detail = wb.addWorksheet('Visit Detail');
  detail.columns = [
    { header: 'Date',         key: 'created_at',      width: 20 },
    { header: 'Caravan',      key: 'agent_nickname',   width: 18 },
    { header: 'Caravan Name', key: 'agent_full_name',  width: 30 },
    { header: 'Team',         key: 'team_name',        width: 20 },
    { header: 'Client',       key: 'client_name',      width: 30 },
    { header: 'Reason',       key: 'visit_reason',     width: 20 },
    { header: 'Category',     key: 'reason_category',  width: 15 },
    { header: 'Remarks',      key: 'remarks',          width: 40 },
  ];
  const detailHeader = detail.getRow(1);
  detailHeader.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
  });
  detailHeader.commit();
  detail.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  for (const v of visitDetails) {
    detail.addRow({
      created_at:      v.created_at,
      agent_nickname:  v.agent_nickname,
      agent_full_name: v.agent_full_name,
      team_name:       v.team_name,
      client_name:     v.client_name,
      visit_reason:    v.visit_reason ?? '',
      reason_category: v.reason_category ?? '',
      remarks:         v.remarks ?? '',
    }).commit();
  }

  // AutoFilter on Visit Detail header row (A–H = 8 cols)
  detail.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: 8 },
  };

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ─── S3 upload ────────────────────────────────────────────────────────────────

async function uploadToS3(
  s3Client: S3Client,
  s3Bucket: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const key = `reports/${fileName}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key:    key,
    Body:   Uint8Array.from(buffer),
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
    { expiresIn: 3600 }
  );
}
