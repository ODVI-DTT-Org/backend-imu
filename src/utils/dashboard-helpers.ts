export function getDashboardDateRange(period: string, today: Date = new Date()): {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
} {
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

export function calcChangePct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return parseFloat(((current - previous) / previous * 100).toFixed(1))
}
