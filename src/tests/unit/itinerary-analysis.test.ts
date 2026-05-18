import { describe, it, expect } from 'vitest'
import { LocationJobType, ReportJobType } from '../../queues/jobs/job-types.js'

/**
 * Helper stubs — extracted here so we can test them without spinning up
 * a real queue or DB connection.
 */
function countWorkingDays(from: Date, to: Date): number {
  let count = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (cursor <= end) {
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function calcConversionPct(releases: number, visits: number): number | null {
  if (visits === 0) return null
  return parseFloat(((releases / visits) * 100).toFixed(1))
}

function calcAchievementPct(actual: number, target: number): number | null {
  if (target === 0) return null
  return parseFloat(((actual / target) * 100).toFixed(1))
}

function calcAvgQualityVisit(qualityVisits: number, workingDays: number): number | null {
  if (workingDays === 0) return null
  return parseFloat((qualityVisits / workingDays).toFixed(2))
}

describe('Itinerary Analysis job type registration', () => {
  it('REPORT_ITINERARY_ANALYSIS is defined in ReportJobType enum', () => {
    expect(ReportJobType.REPORT_ITINERARY_ANALYSIS).toBe('report_itinerary_analysis')
  })
})

describe('countWorkingDays', () => {
  it('counts Mon-Fri in a full ISO week', () => {
    // 2026-05-11 (Mon) to 2026-05-17 (Sun) = 5 working days
    const from = new Date('2026-05-11')
    const to   = new Date('2026-05-17')
    expect(countWorkingDays(from, to)).toBe(5)
  })

  it('returns 1 for a single weekday', () => {
    const d = new Date('2026-05-13') // Wednesday
    expect(countWorkingDays(d, d)).toBe(1)
  })

  it('returns 0 for a weekend-only range', () => {
    const from = new Date('2026-05-16') // Saturday
    const to   = new Date('2026-05-17') // Sunday
    expect(countWorkingDays(from, to)).toBe(0)
  })
})

describe('calcConversionPct', () => {
  it('returns null when visits is 0', () => {
    expect(calcConversionPct(5, 0)).toBeNull()
  })

  it('calculates percentage correctly', () => {
    expect(calcConversionPct(3, 10)).toBe(30.0)
  })
})

describe('calcAchievementPct', () => {
  it('returns null when target is 0', () => {
    expect(calcAchievementPct(5, 0)).toBeNull()
  })

  it('calculates over-achievement correctly', () => {
    expect(calcAchievementPct(120, 100)).toBe(120.0)
  })
})

describe('calcAvgQualityVisit', () => {
  it('returns null when workingDays is 0', () => {
    expect(calcAvgQualityVisit(10, 0)).toBeNull()
  })

  it('calculates average correctly', () => {
    expect(calcAvgQualityVisit(10, 4)).toBe(2.5)
  })
})
