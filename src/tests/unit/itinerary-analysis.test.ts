import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { ReportJobType } from '../../queues/jobs/job-types.js'
import {
  countWorkingDays,
  calcConversionPct,
  calcAchievementPct,
  calcAvgQualityVisit,
  buildWorkbook,
  fetchItineraryAnalysisData,
  type ItineraryFilters,
} from '../../queues/processors/handlers/itinerary-analysis-handler.js'

describe('Itinerary Analysis job type registration', () => {
  it('REPORT_ITINERARY_ANALYSIS is defined in ReportJobType enum', () => {
    expect(ReportJobType.REPORT_ITINERARY_ANALYSIS).toBe('report_itinerary_analysis')
  })
})

describe('countWorkingDays', () => {
  it('March 2026 has 22 working days', () => {
    const from = new Date('2026-03-01')
    const to   = new Date('2026-03-31')
    expect(countWorkingDays(from, to)).toBe(22)
  })

  it('counts Mon-Fri in a full ISO week', () => {
    // 2026-05-11 (Mon) to 2026-05-17 (Sun) = 5 working days
    const from = new Date('2026-05-11')
    const to   = new Date('2026-05-17')
    expect(countWorkingDays(from, to)).toBe(5)
  })

  it('single Monday is 1 working day', () => {
    const d = new Date('2026-05-18') // Monday
    expect(countWorkingDays(d, d)).toBe(1)
  })

  it('Saturday/Sunday are not counted', () => {
    const from = new Date('2026-05-16') // Saturday
    const to   = new Date('2026-05-17') // Sunday
    expect(countWorkingDays(from, to)).toBe(0)
  })
})

describe('calcConversionPct', () => {
  it('returns 0 when visits is 0', () => {
    expect(calcConversionPct(5, 0)).toBe(0)
  })

  it('calculates releases / visits × 100', () => {
    expect(calcConversionPct(5, 20)).toBe(25)
  })

  it('calculates correctly for non-round numbers', () => {
    expect(calcConversionPct(3, 10)).toBe(30.0)
  })
})

describe('calcAchievementPct', () => {
  it('returns 0 when target is 0', () => {
    expect(calcAchievementPct(5, 0)).toBe(0)
  })

  it('calculates actual / target × 100', () => {
    expect(calcAchievementPct(8, 10)).toBe(80)
  })

  it('calculates over-achievement correctly', () => {
    expect(calcAchievementPct(120, 100)).toBe(120.0)
  })
})

describe('calcAvgQualityVisit', () => {
  it('returns 0 when workingDays is 0', () => {
    expect(calcAvgQualityVisit(10, 0)).toBe(0)
  })

  it('calculates quality / workingDays', () => {
    expect(calcAvgQualityVisit(11, 22)).toBe(0.5)
  })

  it('calculates average correctly', () => {
    expect(calcAvgQualityVisit(10, 4)).toBe(2.5)
  })
})

// ─── Shared test fixtures ─────────────────────────────────────────────────────

function makeAgent(overrides: Partial<{
  user_id: string; agent_nickname: string; agent_full_name: string; team_name: string;
  total_visits: number; total_releases: number; quality_visits: number; absent_weekdays: number;
  r_deceased: number; r_for_processing: number; r_for_verification: number;
  r_interested: number; r_loan_inquiry: number; r_moved_out: number; r_borrowed: number;
  r_not_around: number; r_not_interested: number; r_overaged: number; r_poor_health: number;
  r_undecided: number; r_with_existing_loan: number;
}> = {}) {
  return {
    user_id:              overrides.user_id              ?? 'user-1',
    agent_nickname:       overrides.agent_nickname       ?? 'ACRUZ',
    agent_full_name:      overrides.agent_full_name      ?? 'CRUZ, ANA',
    team_name:            overrides.team_name            ?? 'TEAM ALPHA',
    total_visits:         overrides.total_visits         ?? 10,
    total_releases:       overrides.total_releases       ?? 2,
    quality_visits:       overrides.quality_visits       ?? 5,
    absent_weekdays:      overrides.absent_weekdays      ?? 0,
    r_deceased:           overrides.r_deceased           ?? 0,
    r_for_processing:     overrides.r_for_processing     ?? 0,
    r_for_verification:   overrides.r_for_verification   ?? 0,
    r_interested:         overrides.r_interested         ?? 3,
    r_loan_inquiry:       overrides.r_loan_inquiry       ?? 2,
    r_moved_out:          overrides.r_moved_out          ?? 0,
    r_borrowed:           overrides.r_borrowed           ?? 0,
    r_not_around:         overrides.r_not_around         ?? 0,
    r_not_interested:     overrides.r_not_interested     ?? 3,
    r_overaged:           overrides.r_overaged           ?? 0,
    r_poor_health:        overrides.r_poor_health        ?? 0,
    r_undecided:          overrides.r_undecided          ?? 2,
    r_with_existing_loan: overrides.r_with_existing_loan ?? 0,
  }
}

const SAMPLE_AGENTS = [
  makeAgent({ user_id: 'u1', agent_nickname: 'ACRUZ',    team_name: 'TEAM ALPHA', total_visits: 10 }),
  makeAgent({ user_id: 'u2', agent_nickname: 'BSANTOS',  team_name: 'TEAM ALPHA', total_visits: 8  }),
  makeAgent({ user_id: 'u3', agent_nickname: 'CREYES',   team_name: 'TEAM BRAVO', total_visits: 6  }),
]

const SAMPLE_VISITS = [
  { id: 'v1', created_at: '2026-06-01', agent_nickname: 'ACRUZ', agent_full_name: 'CRUZ, ANA', team_name: 'TEAM ALPHA', client_name: 'CLIENT A', visit_reason: 'Interested', reason_category: 'Favorable', remarks: null },
  { id: 'v2', created_at: '2026-06-02', agent_nickname: 'BSANTOS', agent_full_name: 'SANTOS, BOB', team_name: 'TEAM ALPHA', client_name: 'CLIENT B', visit_reason: 'Not Interested', reason_category: 'Unfavorable', remarks: null },
  { id: 'v3', created_at: '2026-06-03', agent_nickname: 'CREYES', agent_full_name: 'REYES, CARL', team_name: 'TEAM BRAVO', client_name: 'CLIENT C', visit_reason: 'Loan Inquiry', reason_category: 'Favorable', remarks: null },
]

// ─── buildWorkbook: sheet order + Insights sheet ─────────────────────────────

describe('buildWorkbook', () => {
  it('first sheet is Insights', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    expect(wb.worksheets[0].name).toBe('Insights')
  })

  it('sheet order is Insights → Summary → team sheets → Visit Detail', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const names = wb.worksheets.map(s => s.name)
    expect(names[0]).toBe('Insights')
    expect(names[1]).toBe('Summary')
    expect(names[names.length - 1]).toBe('Visit Detail')
  })

  it('Insights sheet contains COUNTIFS formula referencing Visit Detail', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const insights = wb.getWorksheet('Insights')!

    let foundFormula = false
    insights.eachRow(row => {
      row.eachCell(cell => {
        const val = cell.value as any
        if (val && typeof val === 'object' && 'formula' in val) {
          const f: string = val.formula
          if (f.includes("'Visit Detail'") && f.includes('COUNTIF')) {
            foundFormula = true
          }
        }
      })
    })
    expect(foundFormula).toBe(true)
  })

  it('Insights has formula cells with both team and caravan COUNTIFS for favorable breakdown', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const insights = wb.getWorksheet('Insights')!

    let foundCaravanFormula = false
    insights.eachRow(row => {
      row.eachCell(cell => {
        const val = cell.value as any
        if (val && typeof val === 'object' && 'formula' in val) {
          const f: string = val.formula
          // Caravan-level formula must reference both D (team) and B (caravan nickname) columns
          if (
            f.includes("'Visit Detail'!$D:$D") &&
            f.includes("'Visit Detail'!$B:$B") &&
            f.includes("'Visit Detail'!$F:$F")
          ) {
            foundCaravanFormula = true
          }
        }
      })
    })
    expect(foundCaravanFormula).toBe(true)
  })

  it('Summary sheet has autoFilter set', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const summary = wb.getWorksheet('Summary')!
    expect(summary.autoFilter).toBeDefined()
  })

  it('Visit Detail sheet has autoFilter set', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const detail = wb.getWorksheet('Visit Detail')!
    expect(detail.autoFilter).toBeDefined()
  })

  it('per-team sheet has autoFilter set', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    const teamSheet = wb.getWorksheet('TEAM ALPHA')!
    expect(teamSheet).toBeDefined()
    expect(teamSheet.autoFilter).toBeDefined()
  })

  it('produces a non-empty buffer', async () => {
    const buf = await buildWorkbook(SAMPLE_AGENTS, SAMPLE_VISITS, 22)
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it('handles empty agents gracefully', async () => {
    const buf = await buildWorkbook([], [], 22)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as Buffer)
    expect(wb.getWorksheet('Insights')).toBeDefined()
    expect(wb.getWorksheet('Summary')).toBeDefined()
  })
})

// ─── fetchItineraryAnalysisData: filter SQL plumbing ─────────────────────────

describe('fetchItineraryAnalysisData filter plumbing', () => {
  function makeMockPool(mockRows: { agents: any[]; visits: any[] } = { agents: [], visits: [] }) {
    let callCount = 0
    const queries: { text: string; values: any[] }[] = []

    const mockPool = {
      query: vi.fn(async (text: string, values: any[]) => {
        queries.push({ text, values })
        callCount++
        // First call = agent query, second = visit detail query
        if (callCount === 1) return { rows: mockRows.agents }
        return { rows: mockRows.visits }
      }),
      _queries: queries,
    }
    return mockPool as any
  }

  it('passes null for group_ids when filter is empty (include-all)', async () => {
    const pool = makeMockPool()
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', {})
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    // Both queries: param index 2 (0-based) = group_ids
    expect(calls[0][1][2]).toBeNull()
    expect(calls[1][1][2]).toBeNull()
  })

  it('passes group_ids array when filter has values', async () => {
    const pool = makeMockPool()
    const filters: ItineraryFilters = { group_ids: ['g1', 'g2'] }
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', filters)
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1][2]).toEqual(['g1', 'g2'])
    expect(calls[1][1][2]).toEqual(['g1', 'g2'])
  })

  it('passes user_ids array when filter has values', async () => {
    const pool = makeMockPool()
    const filters: ItineraryFilters = { user_ids: ['u1', 'u2'] }
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', filters)
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1][3]).toEqual(['u1', 'u2'])
    expect(calls[1][1][3]).toEqual(['u1', 'u2'])
  })

  it('passes reason_category string when filter has value', async () => {
    const pool = makeMockPool()
    const filters: ItineraryFilters = { reason_category: 'Favorable' }
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', filters)
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1][4]).toBe('Favorable')
    expect(calls[1][1][4]).toBe('Favorable')
  })

  it('passes null for reason_category when filter is empty string', async () => {
    const pool = makeMockPool()
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', { reason_category: '' })
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1][4]).toBeNull()
  })

  it('SQL contains parameterized ANY clause (no string interpolation) for group filter', async () => {
    const pool = makeMockPool()
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', { group_ids: ['g1'] })
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    const sql: string = calls[0][0]
    // Must use $3 placeholder for group_ids (not direct interpolation)
    expect(sql).toContain('ANY($3)')
    expect(sql).not.toContain("ANY('g1')")
  })

  it('SQL contains parameterized ANY clause for user filter', async () => {
    const pool = makeMockPool()
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', { user_ids: ['u1'] })
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    const sql: string = calls[0][0]
    expect(sql).toContain('ANY($4)')
    expect(sql).not.toContain("ANY('u1')")
  })

  it('SQL contains parameterized clause for category filter', async () => {
    const pool = makeMockPool()
    await fetchItineraryAnalysisData(pool, '2026-06-01', '2026-06-30', { reason_category: 'General' })
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    const sql: string = calls[0][0]
    expect(sql).toContain('$5')
    expect(sql).not.toContain('"General"')
  })
})
