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

  it('builds an address search filter across address fields', () => {
    const result = buildClientFilters({
      address_search: 'Alangilan Bacolod',
    } as any);

    expect(result.conditions).toHaveLength(2);
    expect(result.conditions[0]).toContain('c.full_address');
    expect(result.conditions[0]).toContain('c.region');
    expect(result.conditions[0]).toContain('c.province');
    expect(result.conditions[0]).toContain('c.municipality');
    expect(result.conditions[0]).toContain('c.barangay');
    expect(result.conditions[1]).toContain('c.full_address');
    expect(result.conditions[1]).toContain('c.barangay');
    expect(result.params).toEqual(['%alangilan%', '%bacolod%']);
    expect(result.nextIdx).toBe(3);
  });
});
