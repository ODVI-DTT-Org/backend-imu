import { describe, it, expect, vi, beforeEach } from 'vitest'
import { app } from '../index.js'

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

vi.mock('../middleware/audit.js', () => ({
  auditMiddleware: vi.fn(() => async (c: any, next: any) => await next())
}))

const mockJob = {
  id: 'job-123',
  getState: vi.fn().mockResolvedValue('active'),
  progress: 50,
  returnvalue: null,
  failedReason: null,
}

vi.mock('../queues/index.js', () => ({
  getQueueManager: vi.fn(() => ({
    addJob: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJob: vi.fn().mockResolvedValue(mockJob),
    getQueue: vi.fn().mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
      getJob: vi.fn().mockResolvedValue(mockJob),
    }),
  })),
  QUEUE_NAMES: { BULK_UPLOAD: 'bulk-upload' },
  BulkJobType: { BULK_UPLOAD_CLIENTS: 'bulk_upload_clients' },
}))

vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn(),
  }
}))

describe('POST /api/clients/bulk-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues job and returns jobId', async () => {
    const res = await app.request('/api/clients/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{
          last_name: 'dela Cruz',
          first_name: 'Juan',
          pension_type: 'Retiree',
          client_type: 'POTENTIAL',
          _originalRow: {},
          _rowNumber: 2
        }]
      })
    })

    const data = await res.json() as any
    expect(res.status).toBe(200)
    expect(data.jobId).toBe('job-123')
  })

  it('returns 400 for empty rows array', async () => {
    const res = await app.request('/api/clients/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] })
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/clients/bulk-upload/:jobId/status', () => {
  it('returns job state and progress', async () => {
    const res = await app.request('/api/clients/bulk-upload/job-123/status', {
      method: 'GET',
    })

    const data = await res.json() as any
    expect(res.status).toBe(200)
    expect(data.state).toBe('active')
    expect(data.progress).toBe(50)
  })

  it('returns 404 for unknown jobId', async () => {
    const { getQueueManager } = await import('../queues/index.js')
    vi.mocked(getQueueManager).mockReturnValueOnce({
      addJob: vi.fn(),
      getJob: vi.fn().mockResolvedValue(null),
      getQueue: vi.fn().mockReturnValue({ getJob: vi.fn().mockResolvedValue(null) }),
    } as any)

    const res = await app.request('/api/clients/bulk-upload/unknown-id/status', {
      method: 'GET',
    })

    expect(res.status).toBe(404)
  })
})
