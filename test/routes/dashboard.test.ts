import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock pool BEFORE importing the router
vi.mock('../../src/db/index.js', () => {
  const mockQuery = vi.fn()
  return { pool: { query: mockQuery } }
})

vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', { sub: 'user-uuid-1', role: 'admin' })
    await next()
  }),
}))

vi.mock('../../src/middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (_c: any, next: any) => { await next() }),
  requireAnyPermission: vi.fn(() => async (_c: any, next: any) => { await next() }),
  requireAllPermissions: vi.fn(() => async (_c: any, next: any) => { await next() }),
  getUserPermissions: vi.fn(),
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
  clearPermissionCache: vi.fn(),
  clearAllPermissionCache: vi.fn(),
}))

vi.mock('../../src/middleware/audit.js', () => ({
  auditMiddleware: vi.fn(() => async (_c: any, next: any) => { await next() }),
}))

vi.mock('../../src/routes/dashboard-endpoints.js', () => ({
  getTargetProgress: vi.fn(),
  getTeamPerformance: vi.fn(),
  getActionItems: vi.fn(),
  refreshActionItems: vi.fn(),
  getActionItemsLastRefresh: vi.fn(),
}))

vi.mock('../../src/services/kpi-calculator.js', () => ({
  kpiCalculatorService: { calculateAllKPIs: vi.fn() },
}))

import { pool } from '../../src/db/index.js'
import { authMiddleware } from '../../src/middleware/auth.js'
import dashboardRouter from '../../src/routes/dashboard.js'

const mockPoolQuery = pool.query as ReturnType<typeof vi.fn>

describe('GET /api/dashboard', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/', dashboardRouter)
  })

  it('returns 200 with full response shape for admin', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ total: '412', visits: '198', calls: '214' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1', name: 'Juan dela Cruz', visits: '42' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'u2', name: 'Maria Santos', calls: '87' }] })
      .mockResolvedValueOnce({ rows: [{ group_id: 'g1', name: 'Group Alpha', caravan_name: 'Juan dela Cruz', total_touchpoints: '130' }] })

    const res = await app.request('/?start_date=2026-01-01&end_date=2026-04-18')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.period).toEqual({ start_date: '2026-01-01', end_date: '2026-04-18' })
    expect(body.summary).toEqual({ total_touchpoints: 412, visits: 198, calls: 214 })
    expect(body.top_caravans).toHaveLength(1)
    expect(body.top_caravans[0]).toEqual({ user_id: 'u1', name: 'Juan dela Cruz', visits: 42 })
    expect(body.top_teles).toHaveLength(1)
    expect(body.top_teles[0]).toEqual({ user_id: 'u2', name: 'Maria Santos', calls: 87 })
    expect(body.top_groups).toHaveLength(1)
    expect(body.top_groups[0]).toEqual({ group_id: 'g1', name: 'Group Alpha', caravan_name: 'Juan dela Cruz', total_touchpoints: 130 })
  })

  it('defaults to current month when no dates provided', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ total: '0', visits: '0', calls: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    const today = new Date()
    const expectedStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    expect(body.period.start_date).toBe(expectedStart)
  })

  it('returns caravan-filtered summary and empty leaderboards for caravan role', async () => {
    vi.mocked(authMiddleware).mockImplementationOnce(async (c: any, next: any) => {
      c.set('user', { sub: 'caravan-uuid', role: 'caravan' })
      await next()
    })

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: '10', visits: '10', calls: '0' }] })

    const res = await app.request('/?start_date=2026-04-01&end_date=2026-04-18')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary).toEqual({ total_touchpoints: 10, visits: 10, calls: 0 })
    expect(body.top_caravans).toEqual([])
    expect(body.top_teles).toEqual([])
    expect(body.top_groups).toEqual([])
  })

  it('returns empty arrays when no leaderboard data exists', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ total: '0', visits: '0', calls: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/?start_date=2026-01-01&end_date=2026-01-01')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.top_caravans).toEqual([])
    expect(body.top_teles).toEqual([])
    expect(body.top_groups).toEqual([])
  })
})
