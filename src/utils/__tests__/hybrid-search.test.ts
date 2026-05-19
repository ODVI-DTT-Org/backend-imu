import { describe, expect, it } from 'vitest';
import { buildHybridSearchClause, parseHybridSearchQuery } from '../hybrid-search.js';

describe('buildHybridSearchClause - fulltext branch', () => {
  it('uses full-text search for 1-word query', () => {
    const parsed = parseHybridSearchQuery('juan');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);

    expect(result.params).toEqual(['juan']);
    expect(result.whereClause).toContain('search_vector');
    expect(result.whereClause).toContain('plainto_tsquery');
    expect(result.whereClause).not.toContain('full_name %');
  });

  it('uses full-text search for 2-word query', () => {
    const parsed = parseHybridSearchQuery('juan cruz');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);

    expect(result.params).toEqual(['juan cruz']);
    expect(result.whereClause).toContain('search_vector');
    expect(result.whereClause).toContain('plainto_tsquery');
  });

  it('returns a single WHERE clause and single param for 3-word query', () => {
    const parsed = parseHybridSearchQuery('juan dela cruz');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);

    expect(result.params).toHaveLength(1);
    expect(result.whereClause).toContain('search_vector');
    expect(result.whereClause).toContain('plainto_tsquery');
    expect(result.whereClause).not.toContain('OR');
    expect(result.newParamIndex).toBe(2);
  });

  it('returns a single WHERE clause for 4-word query', () => {
    const parsed = parseHybridSearchQuery('juan santos dela cruz');
    expect(parsed.strategy).toBe('fulltext');

    const result = buildHybridSearchClause(parsed, 1);

    expect(result.params).toHaveLength(1);
    expect(result.whereClause).not.toContain('OR');
  });

  it('keeps trgm branch available when a caller explicitly raises full-text threshold', () => {
    const parsed = parseHybridSearchQuery('juan', { fullTextThreshold: 3 });
    expect(parsed.strategy).toBe('trgm');

    const result = buildHybridSearchClause(parsed, 1);

    expect(result.whereClause).toContain('full_name %');
    expect(result.params).toHaveLength(1);
  });
});
