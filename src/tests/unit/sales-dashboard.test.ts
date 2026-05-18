import { describe, it, expect } from 'vitest'
import { getDashboardDateRange, calcChangePct } from '../../utils/dashboard-helpers.js'

describe('getDashboardDateRange', () => {
  const may17 = new Date('2026-05-17T12:00:00Z')

  it('month: from = May 1, elapsed days = 17', () => {
    const { from, to, prevFrom, prevTo } = getDashboardDateRange('month', may17)
    expect(from.getDate()).toBe(1)
    expect(from.getMonth()).toBe(4) // May
    const currentDays = Math.round((to.getTime() - from.getTime()) / 86400000)
    const prevDays    = Math.round((prevTo.getTime() - prevFrom.getTime()) / 86400000)
    expect(prevDays).toBe(currentDays)
  })

  it('week: from = Monday of the week containing may17', () => {
    const { from } = getDashboardDateRange('week', may17)
    expect(from.getDay()).toBe(1) // Monday
  })

  it('quarter: from = April 1 (Q2 start)', () => {
    const { from } = getDashboardDateRange('quarter', may17)
    expect(from.getMonth()).toBe(3) // April
    expect(from.getDate()).toBe(1)
  })

  it('year: from = Jan 1', () => {
    const { from } = getDashboardDateRange('year', may17)
    expect(from.getMonth()).toBe(0)
    expect(from.getDate()).toBe(1)
  })

  it('previous period has same elapsed-day length as current', () => {
    for (const period of ['week', 'month', 'quarter', 'year'] as const) {
      const { from, to, prevFrom, prevTo } = getDashboardDateRange(period, may17)
      const curr = to.getTime() - from.getTime()
      const prev = prevTo.getTime() - prevFrom.getTime()
      expect(Math.abs(curr - prev)).toBeLessThan(1000)
    }
  })
})

describe('calcChangePct', () => {
  it('returns null when previous is 0', () => {
    expect(calcChangePct(42, 0)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(calcChangePct(0, 0)).toBeNull()
  })

  it('calculates positive change', () => {
    expect(calcChangePct(42, 37)).toBe(13.5)
  })

  it('calculates negative change', () => {
    expect(calcChangePct(380, 391)).toBe(-2.8)
  })

  it('calculates exact zero change', () => {
    expect(calcChangePct(100, 100)).toBe(0)
  })
})
