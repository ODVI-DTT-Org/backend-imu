/**
 * Clamp an ISO date string (YYYY-MM-DD) so it never exceeds today.
 * Pass-through if the date is already ≤ today.
 */
export function clampEndDate(to: string, today: Date = new Date()): string {
  const todayStr = today.toISOString().slice(0, 10)
  return to > todayStr ? todayStr : to
}

export function getDashboardDateRange(period: string, today: Date = new Date()): {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
} {
  // Never extend the end of the current period beyond today.
  const to = new Date(today)
  to.setHours(23, 59, 59, 999)

  let from: Date

  if (period === 'week') {
    const dow = today.getDay() || 7 // Mon=1 … Sun=7
    from = new Date(today)
    from.setDate(today.getDate() - (dow - 1))
  } else if (period === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1)
  } else if (period === 'quarter') {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3
    from = new Date(today.getFullYear(), quarterStart, 1)
  } else {
    from = new Date(today.getFullYear(), 0, 1)
  }
  from.setHours(0, 0, 0, 0)

  const elapsedMs = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  prevTo.setHours(23, 59, 59, 999)
  const prevFrom = new Date(prevTo.getTime() - elapsedMs)
  prevFrom.setHours(0, 0, 0, 0)

  return { from, to, prevFrom, prevTo }
}

// Month-anchored range used by the redesigned monthly snapshot dashboard.
// monthStr is `YYYY-MM`; previous range is the entire previous calendar month.
export function getDashboardDateRangeForMonth(monthStr: string): {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
} {
  const m = /^(\d{4})-(\d{2})$/.exec(monthStr)
  if (!m) throw new Error(`Invalid month: ${monthStr}, expected YYYY-MM`)
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10) // 1-12

  const now = new Date()
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0)
  // Clamp to today when the calendar end would be in the future.
  const calendarEnd = new Date(year, month, 0, 23, 59, 59, 999) // day 0 of next month = last day of this month
  const to = calendarEnd > now ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) : calendarEnd

  const prevFrom = new Date(year, month - 2, 1, 0, 0, 0, 0)
  const prevTo = new Date(year, month - 1, 0, 23, 59, 59, 999)

  return { from, to, prevFrom, prevTo }
}

export function calcChangePct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return parseFloat(((current - previous) / previous * 100).toFixed(1))
}
