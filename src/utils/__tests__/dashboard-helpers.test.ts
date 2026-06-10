import { describe, it, expect } from 'vitest'
import { clampEndDate, getDashboardDateRangeForMonth } from '../dashboard-helpers.js'
import { countWorkingDays } from '../../queues/processors/handlers/itinerary-analysis-handler.js'

describe('clampEndDate', () => {
  it('returns the date unchanged when it is before today', () => {
    const today = new Date('2026-06-10')
    expect(clampEndDate('2026-01-15', today)).toBe('2026-01-15')
  })

  it('returns today when the given date is in the future', () => {
    const today = new Date('2026-06-10')
    expect(clampEndDate('2026-06-30', today)).toBe('2026-06-10')
  })

  it('returns today when the given date equals today', () => {
    const today = new Date('2026-06-10')
    expect(clampEndDate('2026-06-10', today)).toBe('2026-06-10')
  })

  it('handles far-future dates', () => {
    const today = new Date('2026-06-10')
    expect(clampEndDate('2099-12-31', today)).toBe('2026-06-10')
  })
})

describe('getDashboardDateRangeForMonth — clamps to today for current/future months', () => {
  it('past month: to = last day of that month', () => {
    // May 2026 in full (run on June 10, 2026)
    const result = getDashboardDateRangeForMonth('2026-05')
    expect(result.to.getDate()).toBe(31)   // May has 31 days
    expect(result.to.getMonth()).toBe(4)   // 0-indexed May
  })

  it('current month: to does not exceed today', () => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const result = getDashboardDateRangeForMonth(monthStr)
    // to should be set to today at 23:59:59 — same calendar date as today
    expect(result.to.getDate()).toBe(now.getDate())
    expect(result.to.getMonth()).toBe(now.getMonth())
    expect(result.to.getFullYear()).toBe(now.getFullYear())
    // to must not be a future date
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    expect(result.to.getTime()).toBeLessThan(endOfTomorrow.getTime())
  })
})

describe('countWorkingDays / range clamp', () => {
  it('current-month range clamped to today has ≤ total weekdays in the month', () => {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { from, to } = getDashboardDateRangeForMonth(monthStr)
    const days = countWorkingDays(from, to)
    // Can't exceed total weekdays in month (max 23 for any month)
    expect(days).toBeLessThanOrEqual(23)
    // Must be at least 0
    expect(days).toBeGreaterThanOrEqual(0)
    // The end date of the range should be today or earlier
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    expect(to.getTime()).toBeLessThanOrEqual(today.getTime())
  })
})
