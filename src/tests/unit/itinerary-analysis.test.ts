import { describe, it, expect } from 'vitest'
import { ReportJobType } from '../../queues/jobs/job-types.js'
import {
  countWorkingDays,
  calcConversionPct,
  calcAchievementPct,
  calcAvgQualityVisit,
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
