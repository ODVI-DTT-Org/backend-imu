import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import { ReportsProcessor } from '../../queues/processors/reports-processor.js';
import { ReportJobType } from '../../queues/jobs/job-types.js';

function createJob(type = ReportJobType.REPORT_MARKET_SATURATION): Job<any> {
  return {
    data: {
      userId: 'user-1',
      type,
      reportType: type,
      params: {},
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<any>;
}

describe('ReportsProcessor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits CSV headers even when there are no market saturation rows', () => {
    const processor = new ReportsProcessor() as any;

    const csv = processor.rowsToCsv([], [
      'ID',
      'Full Name',
      'Category',
    ]);

    expect(csv).toBe('ID,Full Name,Category');
  });

  it('fails the job when CSV upload fails', async () => {
    const processor = new ReportsProcessor() as any;
    const job = createJob();

    vi.spyOn(processor, 'generateMarketSaturationReport').mockResolvedValue({
      reportType: 'market_saturation',
      generatedAt: new Date(),
      parameters: {},
      data: [{ ID: '1', 'Full Name': 'Jane Doe', Category: 'VIRGIN' }],
      csvHeaders: ['ID', 'Full Name', 'Category'],
    });
    vi.spyOn(processor, 'uploadCsvToS3').mockRejectedValue(new Error('s3 down'));

    await expect(processor.process(job)).rejects.toThrow('s3 down');
  });
});
