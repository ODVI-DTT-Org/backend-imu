import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', { sub: 'user-1', role: 'admin', email: 'admin@test.com' })
    await next()
  }),
  requireRole: vi.fn(() => async (_c: any, next: any) => await next()),
}))

vi.mock('../middleware/permissions.js', () => ({
  requirePermission: vi.fn(() => async (_c: any, next: any) => await next()),
}))

const { getQueueManager, query } = vi.hoisted(() => ({
  getQueueManager: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../queues/index.js', () => ({
  getQueueManager,
}))

vi.mock('../queues/utils/job-helpers.js', () => ({
  addLocationJob: vi.fn(),
  addReportJob: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
}))

vi.mock('../services/actionItemsRefreshService.js', () => ({
  manualRefreshActionItems: vi.fn(),
}))

vi.mock('../services/cronScheduler.js', () => ({
  getSchedulerStatus: vi.fn(),
  triggerTask: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  pool: {
    query,
  },
}))

import jobsRoutes from '../routes/jobs.js'

function makeJob({
  id,
  state,
  timestamp,
  processedOn,
  finishedOn,
}: {
  id: string
  state: string
  timestamp?: number
  processedOn?: number
  finishedOn?: number
}) {
  return {
    id,
    name: state === 'waiting' ? 'psgc_matching' : 'report_agent_performance',
    data: { userId: 'user-1' },
    progress: 0,
    returnvalue: null,
    failedReason: null,
    processedOn,
    finishedOn,
    timestamp,
    attemptsMade: 0,
    getState: vi.fn().mockResolvedValue(state),
  }
}

describe('GET /api/jobs/queue/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const waitingJob = makeJob({
      id: 'waiting-1',
      state: 'waiting',
      timestamp: Date.parse('2026-05-12T06:29:40.000Z'),
    })

    const completedJobs = Array.from({ length: 100 }, (_, index) =>
      makeJob({
        id: `completed-${index + 1}`,
        state: 'completed',
        timestamp: Date.parse('2026-05-10T00:00:00.000Z') + index,
        processedOn: Date.parse('2026-05-10T00:10:00.000Z') + index,
        finishedOn: Date.parse('2026-05-10T00:20:00.000Z') + index,
      })
    )

    getQueueManager.mockReturnValue({
      getQueue: vi.fn((_config: { name: string }) => ({
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 1,
          active: 0,
          completed: 100,
          failed: 0,
          delayed: 0,
        }),
        getJobs: vi.fn((states: string[]) => {
          const [state] = states
          if (state === 'waiting') {
            return Promise.resolve([waitingJob])
          }
          if (state === 'completed') {
            return Promise.resolve(completedJobs)
          }
          return Promise.resolve([])
        }),
      })),
    })
  })

  it('keeps waiting jobs visible ahead of historical completed jobs', async () => {
    const app = new Hono()
    app.route('/api/jobs', jobsRoutes)

    const response = await app.request('/api/jobs/queue/jobs')
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data.jobs).toHaveLength(100)
    expect(data.jobs[0].id).toBe('waiting-1')
    expect(data.jobs.some((job: any) => job.id === 'waiting-1')).toBe(true)
  })
})
