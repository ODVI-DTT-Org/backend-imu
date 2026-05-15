import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeocodeClientsProcessor } from '../../queues/processors/geocode-clients-processor.js';

// Mock the DB pool
vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Import pool after mock is set up
import { pool } from '../../db/index.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

// Helper to build a mock Job object
function makeJob(overrides: Partial<{ data: any; id: string }> = {}) {
  return {
    id: 'job-1',
    data: {
      type: 'geocode_clients',
      userId: 'user-1',
    },
    ...overrides,
  } as any;
}

// Successful Mapbox response for a PH coordinate
const MAPBOX_SUCCESS = {
  features: [
    {
      place_name: 'Brgy. Test, Zamboanga City, Philippines',
      relevance: 0.9,
      center: [122.076, 6.912], // [lng, lat] — valid PH coords
    },
  ],
};

// Low-confidence Mapbox response
const MAPBOX_LOW_CONFIDENCE = {
  features: [{ place_name: 'Somewhere', relevance: 0.3, center: [122.076, 6.912] }],
};

// Empty Mapbox response
const MAPBOX_EMPTY = { features: [] };

describe('GeocodeClientsProcessor', () => {
  let processor: GeocodeClientsProcessor;

  beforeEach(() => {
    processor = new GeocodeClientsProcessor();
    vi.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    // Default: updateProgress is a no-op
    vi.spyOn(processor as any, 'updateProgress').mockResolvedValue(undefined);
  });

  describe('batch processing', () => {
    it('fetches up to 50 pending clients and geocodes them', async () => {
      const clients = [
        { id: 'c1', psgc_id: null, province: 'Zamboanga del Sur', municipality: 'Pagadian', barangay: 'Poblacion' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      expect(result.failed).toEqual([]);
    });

    it('sets geocode_status = skipped when all address fields are empty', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: null, municipality: null, barangay: null }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients })
        .mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'skipped'");
    });

    it('sets geocode_status = failed when Mapbox returns empty features', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: 'Zamboanga', municipality: 'Pagadian', barangay: 'Pob' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_EMPTY,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'failed'");
    });

    it('sets geocode_status = failed when Mapbox relevance < 0.5', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: 'Z', municipality: 'P', barangay: 'B' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_LOW_CONFIDENCE,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'failed'");
    });

    it('uses psgc table names when psgc_id is present', async () => {
      const clients = [{ id: 'c1', psgc_id: 123, province: 'raw-prov', municipality: 'raw-mun', barangay: 'raw-brgy' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients })
        .mockResolvedValueOnce({ rows: [{ region: 'Region IX', province: 'Zamboanga del Sur', mun_city: 'Pagadian', brgy: 'Poblacion' }] })
        .mockResolvedValueOnce({ rows: [] });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);

      await processor.process(makeJob());

      const fetchUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchUrl).toContain('Poblacion');
      expect(fetchUrl).toContain('Pagadian');
      expect(fetchUrl).not.toContain('raw-brgy');
    });

    it('returns empty result when no pending clients exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.total).toBe(0);
      expect(result.succeeded).toEqual([]);
    });
  });

  describe('single-client geocoding', () => {
    it('geocodes a specific client when clientId is provided', async () => {
      const clients = [{ id: 'c99', psgc_id: null, province: 'Z', municipality: 'P', barangay: 'B' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(
        makeJob({ data: { type: 'geocode_clients', userId: 'user-1', clientId: 'c99' } })
      );

      expect(result.succeeded).toEqual(['c99']);
    });
  });

  describe('address building', () => {
    it('falls back to raw fields when psgc lookup returns no rows', async () => {
      const clients = [{ id: 'c1', psgc_id: 999, province: 'FallbackProv', municipality: 'FallbackMun', barangay: 'FallbackBrgy' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients })
        .mockResolvedValueOnce({ rows: [] }); // PSGC lookup → empty

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await processor.process(makeJob());

      const fetchUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchUrl).toContain('FallbackBrgy');
      expect(fetchUrl).toContain('FallbackMun');
    });
  });
});
