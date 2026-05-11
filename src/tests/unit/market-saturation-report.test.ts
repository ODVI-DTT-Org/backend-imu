/**
 * Unit tests for the Market Saturation report wiring.
 *
 * Scope: the Zod schema and the report-type → enum dispatch.
 *
 * SQL correctness (DISTINCT ON, the CASE expression that decides
 * EXISTING/VIRGIN/FAVORABLE/OTHERS, the assigned-team tiebreaker) is verified
 * manually against a seeded DB at implementation time, not here. A future
 * integration-level test against a real Postgres can be added once the
 * existing app-level test infrastructure is restored (see reports.test.ts
 * which currently references a missing `helpers/auth.js`).
 */

import { describe, it, expect } from 'vitest';
import { createReportJobSchema } from '../../routes/jobs.js';
import { ReportJobType } from '../../queues/jobs/job-types.js';

describe('Market Saturation report — Zod schema', () => {
  it('accepts a minimal market_saturation request (no filters)', () => {
    const result = createReportJobSchema.safeParse({
      report_type: 'market_saturation',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an array of valid filter values', () => {
    const result = createReportJobSchema.safeParse({
      report_type: 'market_saturation',
      team_ids: ['00000000-0000-0000-0000-000000000001'],
      categories: ['VIRGIN', 'EXISTING'],
      regions: ['REGION IX (ZAMBOANGA PENINSULA)'],
    });
    expect(result.success).toBe(true);
  });

  it('treats team_ids / categories / regions as optional', () => {
    const result = createReportJobSchema.safeParse({
      report_type: 'market_saturation',
      categories: ['FAVORABLE'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.team_ids).toBeUndefined();
      expect(result.data.regions).toBeUndefined();
    }
  });

  it('rejects category values outside the four allowed buckets', () => {
    const result = createReportJobSchema.safeParse({
      report_type: 'market_saturation',
      categories: ['HOT_LEAD'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID team_ids', () => {
    const result = createReportJobSchema.safeParse({
      report_type: 'market_saturation',
      team_ids: ['warriors'],
    });
    expect(result.success).toBe(false);
  });

  it('still accepts the pre-existing report types', () => {
    for (const type of ['agent_performance', 'client_activity', 'touchpoint_summary'] as const) {
      const r = createReportJobSchema.safeParse({ report_type: type });
      expect(r.success).toBe(true);
    }
  });

  it('rejects an unknown report_type', () => {
    const result = createReportJobSchema.safeParse({ report_type: 'made_up' });
    expect(result.success).toBe(false);
  });
});

describe('Market Saturation report — enum dispatch', () => {
  it('exposes REPORT_MARKET_SATURATION on ReportJobType', () => {
    expect(ReportJobType.REPORT_MARKET_SATURATION).toBe('report_market_saturation');
  });

  it('keeps the existing report-type enum values intact', () => {
    // Snapshot the values we depend on so adding new report types can't accidentally
    // rename one of these and break the route's dispatch map.
    expect(ReportJobType.REPORT_AGENT_PERFORMANCE).toBe('report_agent_performance');
    expect(ReportJobType.REPORT_CLIENT_ACTIVITY).toBe('report_client_activity');
    expect(ReportJobType.REPORT_TOUCHPOINT_SUMMARY).toBe('report_touchpoint_summary');
  });
});
