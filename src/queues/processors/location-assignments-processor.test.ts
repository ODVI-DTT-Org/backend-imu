import { pool } from '../../db/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationAssignmentsProcessor } from './location-assignments-processor.js'

vi.mock('../../db/index.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}))

describe('LocationAssignmentsProcessor', () => {
  let processor: LocationAssignmentsProcessor

  beforeEach(() => {
    processor = new LocationAssignmentsProcessor()
    vi.clearAllMocks()
  })

  it('processes PSGC matching in 500-client chunks with progress updates', async () => {
    const job = {
      id: 'job-1',
      data: {
        type: 'psgc_matching',
        userId: 'user-1',
        items: Array.from({ length: 1001 }, (_, index) => `client-${index + 1}`),
        params: undefined,
      },
    } as any

    const updateProgress = vi
      .spyOn(processor as any, 'updateProgress')
      .mockResolvedValue(undefined)

    const processBatch = vi
      .spyOn(processor as any, 'processBatch')
      .mockImplementation(async (ids: string[]) => ({
        succeeded: ids,
        failed: [],
      }))

    const result = await processor.process(job)

    expect(processBatch).toHaveBeenCalledTimes(3)
    expect(processBatch.mock.calls[0][0]).toHaveLength(500)
    expect(processBatch.mock.calls[1][0]).toHaveLength(500)
    expect(processBatch.mock.calls[2][0]).toHaveLength(1)

    expect(updateProgress).toHaveBeenCalledTimes(3)
    expect(updateProgress.mock.calls[0][1]).toMatchObject({
      progress: 0,
      total: 1001,
      message: 'Processing batch 1 of 3',
    })
    expect(updateProgress.mock.calls[1][1]).toMatchObject({
      progress: 33,
      total: 1001,
      message: 'Processing batch 2 of 3',
    })
    expect(updateProgress.mock.calls[2][1]).toMatchObject({
      progress: 66,
      total: 1001,
      message: 'Processing batch 3 of 3',
    })
    expect(result.succeeded).toHaveLength(1001)
  })

  it('bulk-updates matched clients once per PSGC batch', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    const release = vi.fn()

    vi.mocked(pool.connect).mockResolvedValue({
      query,
      release,
    } as any)

    const resolvePsgcMatch = vi
      .spyOn(processor as any, 'resolvePsgcMatch')
      .mockImplementation(async (_client: any, clientId: string) => ({
        clientId,
        psgcId: `psgc-${clientId}`,
        region: 'REGION IX',
        province: 'ZAMBOANGA DEL NORTE',
        municipality: 'SIOCON',
        barangay: null,
      }))

    const bulkUpdateMatchedClients = vi.spyOn(processor as any, 'bulkUpdateMatchedClients')

    const result = await (processor as any).processBatch(
      ['client-1', 'client-2', 'client-3'],
      'psgc_matching',
      'user-1',
      undefined
    )

    expect(resolvePsgcMatch).toHaveBeenCalledTimes(3)
    expect(bulkUpdateMatchedClients).toHaveBeenCalledTimes(1)
    expect(bulkUpdateMatchedClients).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          clientId: 'client-1',
          psgcId: 'psgc-client-1',
          region: 'REGION IX',
          province: 'ZAMBOANGA DEL NORTE',
          municipality: 'SIOCON',
          barangay: null,
        },
        {
          clientId: 'client-2',
          psgcId: 'psgc-client-2',
          region: 'REGION IX',
          province: 'ZAMBOANGA DEL NORTE',
          municipality: 'SIOCON',
          barangay: null,
        },
        {
          clientId: 'client-3',
          psgcId: 'psgc-client-3',
          region: 'REGION IX',
          province: 'ZAMBOANGA DEL NORTE',
          municipality: 'SIOCON',
          barangay: null,
        },
      ]
    )
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN')
    expect(query.mock.calls[1][0]).toContain('UPDATE clients AS c')
    expect(query.mock.calls[1][0]).toContain('VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ($13, $14, $15, $16, $17, $18)')
    expect(query.mock.calls[1][1]).toEqual([
      'client-1',
      'psgc-client-1',
      'REGION IX',
      'ZAMBOANGA DEL NORTE',
      'SIOCON',
      null,
      'client-2',
      'psgc-client-2',
      'REGION IX',
      'ZAMBOANGA DEL NORTE',
      'SIOCON',
      null,
      'client-3',
      'psgc-client-3',
      'REGION IX',
      'ZAMBOANGA DEL NORTE',
      'SIOCON',
      null,
    ])
    expect(query).toHaveBeenNthCalledWith(3, 'COMMIT')
    expect(release).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toEqual(['client-1', 'client-2', 'client-3'])
    expect(result.failed).toEqual([])
  })
})
