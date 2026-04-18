import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BulkUploadProcessor } from './bulk-upload-processor.js'

vi.mock('../../db/index.js', () => ({
  pool: {
    connect: vi.fn(),
  }
}))

import { pool } from '../../db/index.js'

function makeJob(rows: any[], userRole = 'admin') {
  return {
    id: 'job-1',
    data: { userId: 'user-1', userRole, rows },
    updateProgress: vi.fn(),
    log: vi.fn(),
  } as any
}

function makeClient() {
  return {
    query: vi.fn(),
    release: vi.fn(),
  }
}

describe('BulkUploadProcessor', () => {
  let processor: BulkUploadProcessor

  beforeEach(() => {
    processor = new BulkUploadProcessor()
    vi.clearAllMocks()
  })

  it('inserts UNIQUE rows and returns successful result', async () => {
    const dbClient = makeClient()
    dbClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'new-id-1' }] }) // INSERT
      .mockResolvedValueOnce({}) // COMMIT

    vi.mocked(pool.connect).mockResolvedValueOnce(dbClient as any)

    const job = makeJob([{
      last_name: 'dela Cruz',
      first_name: 'Juan',
      pension_type: 'Retiree',
      client_type: 'POTENTIAL',
      _originalRow: {},
      _rowNumber: 2
    }])

    const result = await processor.process(job)

    expect(result.successful).toHaveLength(1)
    expect(result.successful[0].id).toBe('new-id-1')
    expect(result.failed).toHaveLength(0)
  })

  it('records failed rows without stopping the job', async () => {
    const dbClient = makeClient()
    dbClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('constraint violation')) // INSERT fails
      .mockResolvedValueOnce({}) // ROLLBACK
      .mockResolvedValueOnce({}) // BEGIN second chunk
      .mockResolvedValueOnce({ rows: [{ id: 'new-id-2' }] }) // INSERT succeeds
      .mockResolvedValueOnce({}) // COMMIT

    vi.mocked(pool.connect).mockResolvedValue(dbClient as any)

    const job = makeJob([
      { last_name: 'Bad', first_name: 'Row', pension_type: 'Retiree', client_type: 'POTENTIAL', _originalRow: {}, _rowNumber: 2 },
      { last_name: 'Good', first_name: 'Row', pension_type: 'Survivor', client_type: 'POTENTIAL', _originalRow: {}, _rowNumber: 3 },
    ])

    const result = await processor.process(job)

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].last_name).toBe('Bad')
    expect(result.successful).toHaveLength(1)
  })
})
