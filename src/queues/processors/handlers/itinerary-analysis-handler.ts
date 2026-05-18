import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

// ─── Row types ────────────────────────────────────────────────────────────────

interface AgentRow {
  user_id: string;
  agent_name: string;
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
  days_attended: number;
}

interface VisitDetailRow {
  id: string;
  created_at: string;
  agent_name: string;
  team_name: string;
  client_name: string;
  visit_reason: string | null;
  reason_category: string | null;
  remarks: string | null;
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function generateItineraryAnalysisReport(
  db: Pool,
  s3Client: S3Client,
  s3Bucket: string,
  from: string,
  to: string
): Promise<{ buffer: Buffer; fileName: string; downloadUrl: string }> {
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  const workingDays = countWorkingDays(fromDate, toDate);

  const [agentResult, visitDetailResult] = await Promise.all([
    db.query<{
      user_id: string; agent_name: string; team_name: string;
      total_visits: string; total_releases: string;
      r_deceased: string; r_for_processing: string; r_for_verification: string;
      r_interested: string; r_loan_inquiry: string; r_moved_out: string;
      r_borrowed: string; r_not_around: string; r_not_interested: string;
      r_overaged: string; r_poor_health: string; r_undecided: string;
      r_with_existing_loan: string; quality_visits: string; days_attended: string;
    }>(`
      SELECT
        u.id                                                              AS user_id,
        u.first_name || ' ' || u.last_name                               AS agent_name,
        g.name                                                            AS team_name,
        COUNT(DISTINCT v.id)                                              AS total_visits,
        COUNT(DISTINCT r.id)                                              AS total_releases,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Deceased')           AS r_deceased,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'For Processing')     AS r_for_processing,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'For Verification')   AS r_for_verification,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Interested')         AS r_interested,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Loan Inquiry')       AS r_loan_inquiry,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Moved Out')          AS r_moved_out,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Borrowed')           AS r_borrowed,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Not Around')         AS r_not_around,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Not Interested')     AS r_not_interested,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Overaged')           AS r_overaged,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Poor Health')        AS r_poor_health,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'Undecided')          AS r_undecided,
        COUNT(DISTINCT v.id) FILTER (WHERE tr.reason = 'With Existing Loan') AS r_with_existing_loan,
        COUNT(DISTINCT v.id) FILTER (
          WHERE tr.category IN ('Favorable', 'Processing')
        )                                                                 AS quality_visits,
        COUNT(DISTINCT a.date)                                            AS days_attended
      FROM users u
      JOIN group_members gm ON gm.client_id = u.id
      JOIN groups g          ON g.id         = gm.group_id
      LEFT JOIN visits v ON v.user_id = u.id
        AND v.created_at::date BETWEEN $1 AND $2
      LEFT JOIN touchpoint_reasons tr ON tr.reason_code = v.reason
      LEFT JOIN releases r ON r.user_id = u.id
        AND r.created_at::date BETWEEN $1 AND $2
        AND r.status IN ('approved', 'released')
      LEFT JOIN attendance a ON a.user_id = u.id
        AND a.date BETWEEN $1 AND $2
      WHERE u.role = 'Caravan'
      GROUP BY u.id, u.first_name, u.last_name, g.name
      ORDER BY g.name, u.last_name, u.first_name
    `, [from, to]),

    db.query<{
      id: string; created_at: string; agent_name: string; team_name: string;
      client_name: string; visit_reason: string | null;
      reason_category: string | null; remarks: string | null;
    }>(`
      SELECT
        v.id,
        v.created_at::text,
        u.first_name || ' ' || u.last_name  AS agent_name,
        g.name                               AS team_name,
        c.first_name || ' ' || c.last_name  AS client_name,
        tr.reason                            AS visit_reason,
        tr.category                          AS reason_category,
        v.remarks
      FROM visits v
      JOIN users u  ON u.id = v.user_id
      JOIN group_members gm ON gm.client_id = u.id
      JOIN groups g  ON g.id = gm.group_id
      LEFT JOIN clients c ON c.id = v.client_id
      LEFT JOIN touchpoint_reasons tr ON tr.reason_code = v.reason
      WHERE v.created_at::date BETWEEN $1 AND $2
      ORDER BY g.name, agent_name, v.created_at ASC
    `, [from, to]),
  ]);

  const agents: AgentRow[] = agentResult.rows.map(r => ({
    user_id:              r.user_id,
    agent_name:           r.agent_name,
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
    days_attended:        parseInt(r.days_attended),
  }));

  const visitDetails: VisitDetailRow[] = visitDetailResult.rows;

  const buffer = await buildWorkbook(agents, visitDetails, workingDays);

  const fileName    = `itinerary-analysis-${from}-${to}-${Date.now()}.xlsx`;
  const downloadUrl = await uploadToS3(s3Client, s3Bucket, fileName, buffer);

  return { buffer, fileName, downloadUrl };
}

// ─── Column headers (A–AF, 32 columns) ───────────────────────────────────────

const HEADERS = [
  "TEAM'S", "Caravan's", "Total Production UDI Amount", "Total Production No. of acc.",
  "Deceased", "For Processing", "For Verification", "Interested",
  "Loan Inquiry", "Moved Out", "Borrowed", "Not Around", "Not Interested",
  "Overaged", "Poor Health", "Undecided", "With Existing Loan",
  "Grand Total", "Borrowed", "Target Itinerary", "Total Deficit", "Less Releases",
  "Adjusted Target", "Adjusted Deficit", "Final Target", "Final Deficit",
  "Achievement %", "Leave/Meeting/Absent", "Quality Visit",
  "Quality Visit vs Itinerary %", "% Conversion", "Average Quality Visit",
];

// ─── Row builders ─────────────────────────────────────────────────────────────

function buildAgentRowValues(agent: AgentRow, workingDays: number): (string | number)[] {
  const R = agent.total_visits;
  const T = 0; // placeholder until targets feature is implemented
  return [
    agent.team_name,                                          // A
    agent.agent_name,                                         // B
    0,                                                        // C: UDI Amount (placeholder)
    agent.total_releases,                                     // D: acc count
    agent.r_deceased,                                         // E
    agent.r_for_processing,                                   // F
    agent.r_for_verification,                                 // G
    agent.r_interested,                                       // H
    agent.r_loan_inquiry,                                     // I
    agent.r_moved_out,                                        // J
    agent.r_borrowed,                                         // K
    agent.r_not_around,                                       // L
    agent.r_not_interested,                                   // M
    agent.r_overaged,                                         // N
    agent.r_poor_health,                                      // O
    agent.r_undecided,                                        // P
    agent.r_with_existing_loan,                               // Q
    R,                                                        // R: Grand Total
    0,                                                        // S: Borrowed (duplicate placeholder)
    T,                                                        // T: Target Itinerary
    T - R,                                                    // U: Total Deficit
    agent.total_releases,                                     // V: Less Releases
    0,                                                        // W: Adjusted Target
    0,                                                        // X: Adjusted Deficit
    0,                                                        // Y: Final Target
    0,                                                        // Z: Final Deficit
    calcAchievementPct(R, T),                                 // AA: Achievement %
    workingDays - agent.days_attended,                        // AB: Leave/Meeting/Absent
    agent.quality_visits,                                     // AC: Quality Visit
    calcAchievementPct(agent.quality_visits, R),              // AD: Quality Visit vs Itinerary %
    calcConversionPct(agent.total_releases, R),               // AE: % Conversion
    calcAvgQualityVisit(agent.quality_visits, workingDays),   // AF: Avg Quality Visit
  ];
}

function buildTeamTotalRow(teamName: string, teamAgents: AgentRow[], workingDays: number): (string | number)[] {
  const sum = (key: keyof AgentRow) =>
    teamAgents.reduce((acc, a) => acc + (a[key] as number), 0);

  const R = sum('total_visits');
  const T = 0;
  return [
    teamName, 'TOTAL',
    0, sum('total_releases'),
    sum('r_deceased'), sum('r_for_processing'), sum('r_for_verification'),
    sum('r_interested'), sum('r_loan_inquiry'), sum('r_moved_out'), sum('r_borrowed'),
    sum('r_not_around'), sum('r_not_interested'), sum('r_overaged'),
    sum('r_poor_health'), sum('r_undecided'), sum('r_with_existing_loan'),
    R, 0, T, T - R, sum('total_releases'),
    0, 0, 0, 0,
    calcAchievementPct(R, T),
    workingDays - sum('days_attended'),
    sum('quality_visits'),
    calcAchievementPct(sum('quality_visits'), R),
    calcConversionPct(sum('total_releases'), R),
    calcAvgQualityVisit(sum('quality_visits'), workingDays),
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
  sheet.getColumn(2).width = 25;  // B: Agent
  sheet.getColumn(3).width = 15;  // C: UDI
  sheet.getColumn(4).width = 10;  // D: Acc
  for (let i = 5; i <= 18; i++) sheet.getColumn(i).width = 12;   // E–R
  for (let i = 19; i <= 26; i++) sheet.getColumn(i).width = 12;  // S–Z
  for (let i = 27; i <= 32; i++) sheet.getColumn(i).width = 14;  // AA–AF
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

// ─── Workbook builder ─────────────────────────────────────────────────────────

async function buildWorkbook(
  agents: AgentRow[],
  visitDetails: VisitDetailRow[],
  workingDays: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IMU System';
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet('Summary');
  setColumnWidths(summary);
  applyHeaderRow(summary);
  addDataRows(summary, agents, workingDays, true);

  // One sheet per team
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
  }

  // Visit Detail sheet
  const detail = wb.addWorksheet('Visit Detail');
  detail.columns = [
    { header: 'Date',     key: 'created_at',      width: 20 },
    { header: 'Agent',    key: 'agent_name',       width: 25 },
    { header: 'Team',     key: 'team_name',        width: 20 },
    { header: 'Client',   key: 'client_name',      width: 25 },
    { header: 'Reason',   key: 'visit_reason',     width: 20 },
    { header: 'Category', key: 'reason_category',  width: 15 },
    { header: 'Remarks',  key: 'remarks',          width: 40 },
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
      agent_name:      v.agent_name,
      team_name:       v.team_name,
      client_name:     v.client_name,
      visit_reason:    v.visit_reason ?? '',
      reason_category: v.reason_category ?? '',
      remarks:         v.remarks ?? '',
    }).commit();
  }

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
