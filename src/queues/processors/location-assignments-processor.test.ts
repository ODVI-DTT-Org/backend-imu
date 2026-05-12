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

    expect(updateProgress.mock.calls[0][1]).toMatchObject({
      progress: 0,
      total: 1001,
      message: 'Processing batch 1 of 3',
    })
    expect(updateProgress.mock.calls[1][1]).toMatchObject({
      progress: 49,
      total: 1001,
      message: 'Processing batch 1 of 3',
    })
    expect(updateProgress.mock.calls[2][1]).toMatchObject({
      progress: 49,
      total: 1001,
      message: 'Processing batch 2 of 3',
    })
    expect(updateProgress.mock.calls[3][1]).toMatchObject({
      progress: 99,
      total: 1001,
      message: 'Processing batch 2 of 3',
    })
    expect(updateProgress.mock.calls[4][1]).toMatchObject({
      progress: 99,
      total: 1001,
      message: 'Processing batch 3 of 3',
    })
    expect(updateProgress.mock.calls[5][1]).toMatchObject({
      progress: 99,
      total: 1001,
      message: 'Processing batch 3 of 3',
    })
    expect(updateProgress.mock.calls[6][1]).toMatchObject({
      progress: 100,
      total: 1001,
      message: 'PSGC matching completed',
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

    const resolvePsgcMatches = vi
      .spyOn(processor as any, 'resolvePsgcMatches')
      .mockResolvedValue({
        matches: [
          {
            clientId: 'client-1',
            psgcId: 101,
            region: 'REGION IX',
            province: 'ZAMBOANGA DEL NORTE',
            municipality: 'SIOCON',
            barangay: null,
          },
          {
            clientId: 'client-2',
            psgcId: 102,
            region: 'REGION IX',
            province: 'ZAMBOANGA DEL NORTE',
            municipality: 'SIOCON',
            barangay: null,
          },
          {
            clientId: 'client-3',
            psgcId: 103,
            region: 'REGION IX',
            province: 'ZAMBOANGA DEL NORTE',
            municipality: 'SIOCON',
            barangay: null,
          },
        ],
        failed: [],
      })

    const bulkUpdateMatchedClients = vi.spyOn(processor as any, 'bulkUpdateMatchedClients')

    const result = await (processor as any).processBatch(
      ['client-1', 'client-2', 'client-3'],
      'psgc_matching',
      'user-1',
      undefined
    )

    expect(resolvePsgcMatches).toHaveBeenCalledTimes(1)
    expect(resolvePsgcMatches).toHaveBeenCalledWith(
      expect.anything(),
      ['client-1', 'client-2', 'client-3'],
      undefined,
    )
    expect(bulkUpdateMatchedClients).toHaveBeenCalledTimes(1)
    expect(bulkUpdateMatchedClients).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          clientId: 'client-1',
          psgcId: 101,
          region: 'REGION IX',
          province: 'ZAMBOANGA DEL NORTE',
          municipality: 'SIOCON',
          barangay: null,
        },
        {
          clientId: 'client-2',
          psgcId: 102,
          region: 'REGION IX',
          province: 'ZAMBOANGA DEL NORTE',
          municipality: 'SIOCON',
          barangay: null,
        },
        {
          clientId: 'client-3',
          psgcId: 103,
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
    expect(query.mock.calls[1][0]).toContain('updates.client_id::uuid')
    expect(query.mock.calls[1][0]).toContain('updates.psgc_id::integer')
    expect(query.mock.calls[1][1]).toEqual([
      'client-1',
      101,
      'REGION IX',
      'ZAMBOANGA DEL NORTE',
      'SIOCON',
      null,
      'client-2',
      102,
      'REGION IX',
      'ZAMBOANGA DEL NORTE',
      'SIOCON',
      null,
      'client-3',
      103,
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

  it('resolves PSGC matches with batch queries instead of per-client lookups', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'client-1',
            municipality: 'SIOCON',
            province: 'ZAMBOANGA DEL NORTE',
            full_address: 'SIOCON, ZAMBOANGA DEL NORTE',
          },
          {
            client_id: 'client-2',
            municipality: 'CITY OF ILAGAN',
            province: 'ISABELA',
            full_address: 'CITY OF ILAGAN, ISABELA',
          },
          {
            client_id: 'client-3',
            municipality: 'UNKNOWN',
            province: 'UNKNOWN',
            full_address: 'CORDOVA, CEBU',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'client-1',
            psgc_id: 1,
            region: 'REGION IX',
            province: 'ZAMBOANGA DEL NORTE',
            municipality: 'SIOCON',
            barangay: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'client-2',
            psgc_id: 2,
            region: 'REGION II',
            province: 'ISABELA',
            municipality: 'ILAGAN',
            barangay: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            client_id: 'client-3',
            psgc_id: 3,
            region: 'REGION VII',
            province: 'CEBU',
            municipality: 'CORDOVA',
            barangay: null,
          },
        ],
      })

    const result = await (processor as any).resolvePsgcMatches(
      { query },
      ['client-1', 'client-2', 'client-3'],
      undefined,
    )

    expect(query).toHaveBeenCalledTimes(5)
    expect(query.mock.calls[0][0]).toContain('FROM clients')
    expect(query.mock.calls[1][0]).toContain('lower(p.mun_city) = lower(input.municipality)')
    expect(query.mock.calls[2][0]).toContain("regexp_replace(p.mun_city, '(^city of\\s+|^city\\s+|\\s+city$)', '', 'gi')")
    expect(query.mock.calls[3][0]).toContain('similarity(lower(p.mun_city), lower(input.municipality)) >= 0.35')
    expect(query.mock.calls[4][0]).toContain('normalized_full_address')
    expect(result.matches).toEqual([
      {
        clientId: 'client-1',
        psgcId: 1,
        region: 'REGION IX',
        province: 'ZAMBOANGA DEL NORTE',
        municipality: 'SIOCON',
        barangay: null,
      },
      {
        clientId: 'client-2',
        psgcId: 2,
        region: 'REGION II',
        province: 'ISABELA',
        municipality: 'ILAGAN',
        barangay: null,
      },
      {
        clientId: 'client-3',
        psgcId: 3,
        region: 'REGION VII',
        province: 'CEBU',
        municipality: 'CORDOVA',
        barangay: null,
      },
    ])
    expect(result.failed).toEqual([])
  })
})
