import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationAssignmentsProcessor } from './location-assignments-processor.js'

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
})
