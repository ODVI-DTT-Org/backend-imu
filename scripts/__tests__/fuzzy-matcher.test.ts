import { describe, it, expect, beforeEach } from 'vitest';
import { FuzzyMatcher } from '../lib/fuzzy-matcher';

describe('FuzzyMatcher', () => {
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher();
  });

  it('should return empty array for empty target name', () => {
    const result = matcher.findSimilar('', [{ id: 'id1', name: 'JOHN SMITH' }]);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty candidates', () => {
    const result = matcher.findSimilar('JOHN SMITH', []);
    expect(result).toEqual([]);
  });

  it('should find exact matches', () => {
    const result = matcher.findSimilar('JOHN SMITH', [{ id: 'id1', name: 'JOHN SMITH' }], 0.8);
    expect(result).toHaveLength(1);
    expect(result[0].client_id).toBe('id1');
    expect(result[0].score).toBe(1.0);
  });

  it('should find matches with typos', () => {
    const result = matcher.findSimilar('MARIA SANTOS', [{ id: 'id1', name: 'MARIA SANTO' }], 0.8);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThan(0.8);
  });

  it('should be case-insensitive', () => {
    const result1 = matcher.findSimilar('john smith', [{ id: 'id1', name: 'JOHN SMITH' }]);
    const result2 = matcher.findSimilar('JOHN SMITH', [{ id: 'id1', name: 'john smith' }]);

    expect(result1[0].score).toBe(result2[0].score);
  });

  it('should filter results below threshold', () => {
    const candidates = [
      { id: 'id1', name: 'JOHN SMITH' },
      { id: 'id2', name: 'JANE DOE' },
    ];
    const result = matcher.findSimilar('JOHN SMITH', candidates, 0.8);

    expect(result).toHaveLength(1);
    expect(result[0].client_id).toBe('id1');
  });

  it('should sort results by score descending', () => {
    const candidates = [
      { id: 'id1', name: 'JOHN SMITH' }, // Exact match
      { id: 'id2', name: 'JOHN SMYTH' }, // Close match
      { id: 'id3', name: 'JOHN JONES' }, // Partial match
    ];
    const result = matcher.findSimilar('JOHN SMITH', candidates, 0.5);

    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    expect(result[1].score).toBeGreaterThanOrEqual(result[2].score);
  });

  it('should limit results to 10 matches', () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      id: `id${i}`,
      name: 'JOHN SMITH',
    }));
    const result = matcher.findSimilar('JOHN SMITH', candidates, 0.5);

    expect(result).toHaveLength(10);
  });

  it('should set method to fuzzy', () => {
    const result = matcher.findSimilar('JOHN SMITH', [{ id: 'id1', name: 'JOHN SMITH' }]);

    expect(result[0].method).toBe('fuzzy');
  });
});
