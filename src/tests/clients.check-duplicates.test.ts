import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../index.js'

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', { sub: 'user-1', role: 'admin', email: 'admin@test.com' })
    await next()
  }),
  requireRole: vi.fn(() => async (c: any, next: any) => await next()),
  requireAnyRole: vi.fn(() => async (c: any, next: any) => await next()),
  optionalAuthMiddleware: vi.fn(async (c: any, next: any) => await next()),
}))

vi.mock('../middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (c: any, next: any) => await next())
}))

vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  }
}))

import { pool } from '../db/index.js'

describe('POST /api/clients/check-duplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty arrays when no duplicates', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { last_name: 'Reyes', first_name: 'Mario', middle_name: null, pension_type: 'Retiree' }
      ]
    } as any)

    const res = await app.request('/api/clients/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: 'dela cruz juan santos', pension_type: 'retiree' }]
      })
    })

    const data = await res.json() as any
    expect(res.status).toBe(200)
    expect(data.duplicates).toHaveLength(0)
    expect(data.nameConflicts).toHaveLength(0)
  })

  it('returns duplicate key when name+pension_type matches DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { last_name: 'dela Cruz', first_name: 'Juan', middle_name: 'Santos', pension_type: 'Retiree' }
      ]
    } as any)

    const res = await app.request('/api/clients/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: 'dela cruz juan santos', pension_type: 'retiree' }]
      })
    })

    const data = await res.json() as any
    expect(data.duplicates).toContain('dela cruz juan santos|retiree')
  })

  it('returns nameConflict when same name but different pension_type exists in DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        { last_name: 'dela Cruz', first_name: 'Juan', middle_name: 'Santos', pension_type: 'Survivor' }
      ]
    } as any)

    const res = await app.request('/api/clients/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: 'dela cruz juan santos', pension_type: 'retiree' }]
      })
    })

    const data = await res.json() as any
    expect(data.duplicates).toHaveLength(0)
    expect(data.nameConflicts).toContain('dela cruz juan santos')
  })
})
