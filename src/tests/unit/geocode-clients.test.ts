import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeocodeClientsProcessor } from '../../queues/processors/geocode-clients-processor.js';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

import { pool } from '../../db/index.js';
import Anthropic from '@anthropic-ai/sdk';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

function makeJob(overrides: Partial<{ data: any; id: string }> = {}) {
  return {
    id: 'job-1',
    data: { type: 'geocode_clients', userId: 'user-1' },
    ...overrides,
  } as any;
}

const MAPBOX_SUCCESS = {
  features: [{ place_name: 'Brgy. Test, Zamboanga City, PH', relevance: 0.9, center: [122.076, 6.912] }],
};
const MAPBOX_LOW = {
  features: [{ place_name: 'Somewhere', relevance: 0.3, center: [122.076, 6.912] }],
};
const MAPBOX_EMPTY = { features: [] };

const CLIENT_WITH_PSGC = {
  id: 'c1', psgc_id: 42,
  province: 'Zamboanga del Sur', municipality: 'Pagadian', barangay: 'Poblacion',
};
const CLIENT_NO_PSGC = {
  id: 'c2', psgc_id: null,
  province: 'Zamboanga del Sur', municipality: 'Pagadian', barangay: 'Poblacion',
};
const CLIENT_EMPTY = { id: 'c3', psgc_id: null, province: null, municipality: null, barangay: null };

describe('GeocodeClientsProcessor — 3-step pipeline', () => {
  let processor: GeocodeClientsProcessor;
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // resetAllMocks clears both call history AND queued mockResolvedValueOnce values
    vi.resetAllMocks();

    processor = new GeocodeClientsProcessor();
    process.env.MAPBOX_ACCESS_TOKEN = 'mapbox-test-token';
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';

    // Fresh Anthropic mock for each test. Must use a regular function (not arrow) so `new` works.
    mockCreate = vi.fn();
    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(function (this: any) {
      this.messages = { create: mockCreate };
    });

    // Replace global fetch with a tracked mock
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.spyOn(processor as any, 'updateProgress').mockResolvedValue(undefined);
  });

  // ── Step 1: PSGC pin_location ────────────────────────────────────────

  describe('Step 1 — PSGC pin_location', () => {
    it('uses psgc.pin_location coords directly when psgc_id has pin_location', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_WITH_PSGC] })               // fetchPendingClients
        .mockResolvedValueOnce({ rows: [{ lat: '6.912', lng: '122.076' }] }) // lookupPsgcCoords
        .mockResolvedValueOnce({ rows: [] });                               // saveCoords UPDATE

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();

      const saveCall = mockPool.query.mock.calls[2];
      expect(saveCall[0]).toContain("geocode_status = 'success'");
      expect(saveCall[1]).toEqual([6.912, 122.076, 'c1']);
    });

    it('falls through to step 2 when psgc_id is set but pin_location is null', async () => {
      // Only 1 candidate with coords → skips Haiku, uses coords directly
      const candidates = [
        { id: 42, region: 'IX', province: 'Zamboanga del Sur', mun_city: 'Pagadian', barangay: 'Poblacion', has_coords: true },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_WITH_PSGC] })                // fetchPendingClients
        .mockResolvedValueOnce({ rows: [] })                                 // lookupPsgcCoords → null
        .mockResolvedValueOnce({ rows: candidates })                         // fetchPsgcCandidates
        .mockResolvedValueOnce({ rows: [{ lat: '6.912', lng: '122.076' }] }) // lookupPsgcCoords for candidate
        .mockResolvedValueOnce({ rows: [] })                                 // UPDATE psgc_id
        .mockResolvedValueOnce({ rows: [] });                                // saveCoords

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      // Single candidate with coords → no Haiku needed
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── Step 2: Haiku AI matching ────────────────────────────────────────

  describe('Step 2 — Haiku AI matching', () => {
    it('calls Haiku when multiple candidates exist and uses the selected psgc_id', async () => {
      const candidates = [
        { id: 10, region: 'IX', province: 'Zamboanga del Sur', mun_city: 'Pagadian', barangay: 'Poblacion', has_coords: true },
        { id: 20, region: 'IX', province: 'Zamboanga del Norte', mun_city: 'Dipolog', barangay: 'Poblacion', has_coords: true },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })                  // fetchPendingClients
        .mockResolvedValueOnce({ rows: candidates })                         // fetchPsgcCandidates
        .mockResolvedValueOnce({ rows: [{ lat: '6.912', lng: '122.076' }] }) // lookupPsgcCoords(10)
        .mockResolvedValueOnce({ rows: [] })                                 // UPDATE psgc_id
        .mockResolvedValueOnce({ rows: [] });                                // saveCoords

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '10' }],
      });

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c2']);
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockFetch).not.toHaveBeenCalled();

      const saveCall = mockPool.query.mock.calls.at(-1)!;
      expect(saveCall[0]).toContain("geocode_status = 'success'");
    });

    it('falls through to Mapbox when Haiku returns "none"', async () => {
      const candidates = [
        { id: 10, region: 'IX', province: 'Z', mun_city: 'P', barangay: 'B', has_coords: true },
        { id: 11, region: 'IX', province: 'Z', mun_city: 'P', barangay: 'B2', has_coords: true },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })  // fetchPendingClients
        .mockResolvedValueOnce({ rows: candidates })          // fetchPsgcCandidates
        .mockResolvedValueOnce({ rows: [] });                 // saveCoords (Mapbox path)

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'none' }],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c2']);
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('skips Haiku when ANTHROPIC_API_KEY is not set and falls through to Mapbox', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const candidates = [
        { id: 10, region: 'IX', province: 'Z', mun_city: 'P', barangay: 'B', has_coords: true },
        { id: 11, region: 'IX', province: 'Z', mun_city: 'P', barangay: 'B2', has_coords: true },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })
        .mockResolvedValueOnce({ rows: candidates })
        .mockResolvedValueOnce({ rows: [] }); // saveCoords

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);

      await processor.process(makeJob());

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  // ── Step 3: Mapbox fallback ──────────────────────────────────────────

  describe('Step 3 — Mapbox fallback', () => {
    it('geocodes with Mapbox when no psgc_id and no PSGC candidates found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })  // fetchPendingClients
        .mockResolvedValueOnce({ rows: [] })                  // fetchPsgcCandidates → empty
        .mockResolvedValueOnce({ rows: [] });                 // saveCoords

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c2']);
      expect(mockFetch).toHaveBeenCalledOnce();
      const saveCall = mockPool.query.mock.calls.at(-1)!;
      expect(saveCall[0]).toContain("geocode_status = 'success'");
    });

    it('marks failed when Mapbox returns low confidence', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // failed UPDATE

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_LOW,
      } as any);

      await processor.process(makeJob());

      const failCall = mockPool.query.mock.calls.at(-1)!;
      expect(failCall[0]).toContain("geocode_status = 'failed'");
    });

    it('marks failed when Mapbox returns no features', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_NO_PSGC] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_EMPTY,
      } as any);

      await processor.process(makeJob());

      const failCall = mockPool.query.mock.calls.at(-1)!;
      expect(failCall[0]).toContain("geocode_status = 'failed'");
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('marks skipped when all address fields and psgc_id are empty', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_EMPTY] })  // fetchPendingClients
        .mockResolvedValueOnce({ rows: [] });              // UPDATE skipped

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c3']);
      const call = mockPool.query.mock.calls[1];
      expect(call[0]).toContain("geocode_status = 'skipped'");
    });

    it('returns empty result when no pending clients exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.total).toBe(0);
      expect(result.succeeded).toEqual([]);
    });

    it('geocodes a single client when clientId is provided in job data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [CLIENT_WITH_PSGC] })                // fetchSingleClient
        .mockResolvedValueOnce({ rows: [{ lat: '6.912', lng: '122.076' }] }) // lookupPsgcCoords
        .mockResolvedValueOnce({ rows: [] });                                // saveCoords

      const result = await processor.process(
        makeJob({ data: { type: 'geocode_clients', userId: 'u1', clientId: 'c1' } })
      );

      expect(result.succeeded).toEqual(['c1']);
    });
  });
});
