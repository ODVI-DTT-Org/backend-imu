import { describe, expect, it } from 'vitest';
import { buildClientFilters } from '../clients.js';

describe('buildClientFilters', () => {
  it('builds a barangay filter against the client barangay field', () => {
    const result = buildClientFilters({
      barangay: ['Barangay 1', 'all', '', '  Barangay 2  '],
    } as any);

    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0]).toContain('c.normalized_barangay');
    expect(result.conditions[0]).not.toContain('c.psgc_barangay');
    expect(result.params).toEqual([['barangay 1', 'barangay 2']]);
    expect(result.nextIdx).toBe(2);
  });

  it('builds an indexed address search filter', () => {
    const result = buildClientFilters({
      address_search: 'Alangilan Bacolod',
    } as any);

    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0]).toContain('c.address_search_vector');
    expect(result.conditions[0]).toContain('plainto_tsquery');
    expect(result.params).toEqual(['alangilan bacolod']);
    expect(result.nextIdx).toBe(2);
  });

  it('ignores one-character address search words', () => {
    const result = buildClientFilters({
      address_search: 'A Bacolod',
    } as any);

    expect(result.conditions).toHaveLength(1);
    expect(result.params).toEqual(['bacolod']);
    expect(result.nextIdx).toBe(2);
  });

  it('uses materialized touchpoint filter columns instead of per-row touchpoint subqueries', () => {
    const result = buildClientFilters({
      touchpoint_reason_codes: ['Loan Inquiry', 'Undecided'],
      touchpoint_date_from: '2026-05-01',
      touchpoint_date_to: '2026-05-19',
    } as any);

    expect(result.conditions.join('\n')).toContain('c.touchpoint_reason_values');
    expect(result.conditions.join('\n')).toContain('c.touchpoint_dates');
    expect(result.conditions.join('\n')).not.toContain('FROM touchpoints');
    expect(result.params).toEqual([
      ['loan inquiry', 'undecided'],
      [
        '2026-05-01',
        '2026-05-02',
        '2026-05-03',
        '2026-05-04',
        '2026-05-05',
        '2026-05-06',
        '2026-05-07',
        '2026-05-08',
        '2026-05-09',
        '2026-05-10',
        '2026-05-11',
        '2026-05-12',
        '2026-05-13',
        '2026-05-14',
        '2026-05-15',
        '2026-05-16',
        '2026-05-17',
        '2026-05-18',
        '2026-05-19',
      ],
    ]);
    expect(result.nextIdx).toBe(3);
  });
});
