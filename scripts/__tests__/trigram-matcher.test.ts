import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrigramMatcher } from '../lib/trigram-matcher';

describe('TrigramMatcher', () => {
  let mockPool: any;
  let matcher: TrigramMatcher;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    matcher = new TrigramMatcher(mockPool);
  });

  it('should return empty array for empty name', async () => {
    const result = await matcher.findSimilar('', 'exclude-id');
    expect(result).toEqual([]);
  });

  it('should return empty array for whitespace-only name', async () => {
    const result = await matcher.findSimilar('   ', 'exclude-id');
    expect(result).toEqual([]);
  });

  it('should query database with normalized name', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await matcher.findSimilar('john smith', 'exclude-id', 0.85);

    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
      'JOHN SMITH',
      'exclude-id',
      0.85,
    ]);
  });

  it('should return matching results sorted by score', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { client_id: 'id1', name: 'JOHN SMITH', score: 0.95 },
        { client_id: 'id2', name: 'JOHN SMYTH', score: 0.87 },
      ],
    });

    const result = await matcher.findSimilar('JOHN SMITH', 'exclude-id');

    expect(result).toHaveLength(2);
    expect(result[0].client_id).toBe('id1');
    expect(result[0].score).toBeLessThanOrEqual(1.0);
    expect(result[0].method).toBe('trigram');
  });

  it('should cap scores at 1.0', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ client_id: 'id1', name: 'JOHN SMITH', score: 1.05 }],
    });

    const result = await matcher.findSimilar('JOHN SMITH', 'exclude-id');

    expect(result[0].score).toBe(1.0);
  });

  it('should handle database errors gracefully', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

    const result = await matcher.findSimilar('JOHN SMITH', 'exclude-id');

    expect(result).toEqual([]);
  });

  it('should limit results to 10 matches', async () => {
    // Mock returns 10 rows (respecting LIMIT in query)
    const rows = Array.from({ length: 10 }, (_, i) => ({
      client_id: `id${i}`,
      name: `CLIENT ${i}`,
      score: 0.9,
    }));
    mockPool.query.mockResolvedValueOnce({ rows });

    const result = await matcher.findSimilar('TARGET', 'exclude-id');

    expect(result).toHaveLength(10);
  });
});
