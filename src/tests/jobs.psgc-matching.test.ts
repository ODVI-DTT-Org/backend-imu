import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', { sub: 'user-1', role: 'admin', email: 'admin@test.com' })
    await next()
  }),
  requireRole: vi.fn(() => async (_c: any, next: any) => await next()),
  requireAnyRole: vi.fn(() => async (_c: any, next: any) => await next()),
  optionalAuthMiddleware: vi.fn(async (_c: any, next: any) => await next()),
}))

vi.mock('../middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (_c: any, next: any) => await next()),
}))

vi.mock('../middleware/audit.js', () => ({
  auditMiddleware: vi.fn(() => async (_c: any, next: any) => await next()),
}))

const { addLocationJob, query } = vi.hoisted(() => ({
  addLocationJob: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../queues/utils/job-helpers.js', () => ({
  addLocationJob,
  addReportJob: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  pool: {
    query,
    connect: vi.fn(),
  },
}))

import { app } from '../index.js'

describe('POST /api/jobs/psgc/matching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addLocationJob.mockResolvedValue({ id: 'job-psgc-1' })
  })

  it('enqueues unmatched client ids for PSGC matching', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'client-1' },
        { id: 'client-2' },
      ],
    })

    const res = await app.request('/api/jobs/psgc/matching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const data = await res.json() as any

    expect(res.status).toBe(201)
    expect(addLocationJob).toHaveBeenCalledWith(
      'psgc_matching',
      'user-1',
      ['client-1', 'client-2'],
      { dry_run: undefined }
    )
    expect(data.job_id).toBe('job-psgc-1')
  })
})
