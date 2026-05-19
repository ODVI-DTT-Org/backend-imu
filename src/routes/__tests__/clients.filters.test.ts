import { describe, expect, it } from 'vitest';
import { buildClientFilters } from '../clients.js';

describe('buildClientFilters', () => {
  it('builds a barangay filter against client and PSGC barangay fields', () => {
    const result = buildClientFilters({
      barangay: ['Barangay 1', 'all', '', '  Barangay 2  '],
    } as any);

    expect(result.conditions).toHaveLength(1);
    expect(result.conditions[0]).toContain('c.barangay');
    expect(result.conditions[0]).toContain('c.psgc_barangay');
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
});
