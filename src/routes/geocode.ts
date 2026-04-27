/**
 * Geocoding routes — reverse-geocode coordinates to a structured address.
 *
 * Strategy: Mapbox first (when MAPBOX_ACCESS_TOKEN is set), falling back to
 * the bundled PSGC table (nearest barangay by haversine distance) when
 * Mapbox is unavailable or returns nothing useful.
 *
 * Mobile clients can call this instead of holding the Mapbox token
 * themselves; offline clients keep their own local PSGC chain.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const geocode = new Hono();

interface GeocodeAddress {
  fullAddress: string;
  street: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  region: string | null;
  country: string | null;
  source: 'Mapbox' | 'PSGC' | 'Coordinates';
  lat: number;
  lng: number;
}

const MAPBOX_TIMEOUT_MS = 6000;

async function reverseGeocodeMapbox(
  lat: number,
  lng: number,
  token: string,
): Promise<GeocodeAddress | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&types=address,place,region,postcode,country&limit=5`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MAPBOX_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[geocode] Mapbox ${res.status} for (${lat},${lng})`);
      return null;
    }
    const data = await res.json() as { features?: Array<Record<string, any>> };
    const features = data.features ?? [];
    if (features.length === 0) return null;

    let street: string | null = null;
    let barangay: string | null = null;
    let municipality: string | null = null;
    let province: string | null = null;
    let region: string | null = null;
    let country: string | null = null;
    const fullAddress = (features[0]?.place_name as string | undefined) ?? null;

    for (const f of features) {
      const placeType = f.place_type as string[] | undefined;
      const text = f.text as string | undefined;
      if (!placeType || !text) continue;

      if ((placeType.includes('address') || placeType.includes('street')) && !street) {
        street = text;
      } else if (placeType.includes('locality') && !barangay) {
        barangay = text;
      } else if (placeType.includes('place') && !municipality) {
        municipality = text;
      } else if (placeType.includes('region')) {
        // Disambiguate Philippine "region" (e.g. Central Luzon, NCR, CAR)
        // from "province" (e.g. Bulacan) the same way the mobile parser does.
        const isRegion =
          /Luzon|Visayas|Mindanao|Region|NCR|CAR/i.test(text);
        if (isRegion && !region) {
          region = text;
        } else if (!isRegion && !province) {
          province = text;
        }
      } else if (placeType.includes('country') && !country) {
        country = text;
      }
    }

    return {
      fullAddress:
        fullAddress ??
        [street, barangay, municipality, province, region, country]
          .filter((p): p is string => !!p)
          .join(', '),
      street,
      barangay,
      municipality,
      province,
      region,
      country: country ?? 'Philippines',
      source: 'Mapbox',
      lat,
      lng,
    };
  } catch (err) {
    console.warn(`[geocode] Mapbox fetch failed for (${lat},${lng}):`, err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function reverseGeocodePsgc(
  lat: number,
  lng: number,
): Promise<GeocodeAddress | null> {
  // Coarse bounding-box pre-filter to keep the haversine scan small.
  // PSGC has ~42k barangay rows; ±0.5° usually narrows to a few hundred,
  // and we widen if nothing is found.
  for (const radiusDeg of [0.5, 2.0, 5.0]) {
    const result = await pool.query(
      `
      SELECT
        region,
        province,
        mun_city AS municipality,
        barangay,
        6371.0 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians((pin_location->>'latitude')::float8)) *
            cos(radians((pin_location->>'longitude')::float8) - radians($2)) +
            sin(radians($1)) * sin(radians((pin_location->>'latitude')::float8))
          ))
        ) AS distance_km
      FROM psgc
      WHERE pin_location IS NOT NULL
        AND (pin_location->>'latitude') IS NOT NULL
        AND (pin_location->>'longitude') IS NOT NULL
        AND (pin_location->>'latitude')::float8  BETWEEN $1 - $3 AND $1 + $3
        AND (pin_location->>'longitude')::float8 BETWEEN $2 - $3 AND $2 + $3
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, radiusDeg],
    );

    if (result.rows.length > 0) {
      const r = result.rows[0];
      const parts = [r.barangay, r.municipality, r.province, r.region, 'Philippines']
        .filter((p: string | null) => !!p);
      return {
        fullAddress: parts.join(', '),
        street: null,
        barangay: r.barangay ?? null,
        municipality: r.municipality ?? null,
        province: r.province ?? null,
        region: r.region ?? null,
        country: 'Philippines',
        source: 'PSGC',
        lat,
        lng,
      };
    }
  }
  return null;
}

/**
 * GET /api/geocode/reverse?lat=14.5&lng=121.0
 *
 * Returns a structured address resolved via Mapbox, falling back to PSGC
 * nearest-barangay. Always returns 200 with a `source` field so callers
 * can tell which tier responded; 'Coordinates' means everything failed
 * and only the input lat/lng are echoed back.
 */
geocode.get('/reverse', authMiddleware, async (c) => {
  const latRaw = c.req.query('lat');
  const lngRaw = c.req.query('lng');
  const lat = latRaw !== undefined ? Number(latRaw) : NaN;
  const lng = lngRaw !== undefined ? Number(lngRaw) : NaN;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return c.json(
      { message: 'lat and lng query params are required and must be valid coordinates' },
      400,
    );
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    const mapboxResult = await reverseGeocodeMapbox(lat, lng, mapboxToken);
    if (mapboxResult) return c.json(mapboxResult);
  }

  const psgcResult = await reverseGeocodePsgc(lat, lng);
  if (psgcResult) return c.json(psgcResult);

  return c.json<GeocodeAddress>({
    fullAddress: `${lat}, ${lng}`,
    street: null,
    barangay: null,
    municipality: null,
    province: null,
    region: null,
    country: null,
    source: 'Coordinates',
    lat,
    lng,
  });
});

export default geocode;
