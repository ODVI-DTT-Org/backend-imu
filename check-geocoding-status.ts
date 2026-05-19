/**
 * Geocoding status check — run with:
 *   npx tsx check-geocoding-status.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // 1. Addresses with and without coordinates
  const addrResult = await pool.query(`
    SELECT
      COUNT(*)                                          AS total_addresses,
      COUNT(*) FILTER (WHERE latitude  IS NOT NULL
                         AND longitude IS NOT NULL)    AS with_coords,
      COUNT(*) FILTER (WHERE latitude  IS NULL
                          OR longitude IS NULL)        AS missing_coords,
      COUNT(*) FILTER (WHERE is_primary = true
                         AND latitude  IS NOT NULL
                         AND longitude IS NOT NULL
                         AND deleted_at IS NULL)       AS primary_geocoded
    FROM addresses
    WHERE deleted_at IS NULL
  `);
  const addr = addrResult.rows[0];

  // 2. Clients by geocode_status
  const statusResult = await pool.query(`
    SELECT
      COALESCE(geocode_status, 'null') AS status,
      COUNT(*)                         AS count
    FROM clients
    WHERE deleted_at IS NULL
    GROUP BY geocode_status
    ORDER BY count DESC
  `);

  // 3. Addresses missing coords, grouped by province
  const missingResult = await pool.query(`
    SELECT
      c.province,
      COUNT(*) AS missing_primary_coords
    FROM addresses a
    JOIN clients c ON c.id = a.client_id
    WHERE a.is_primary = true
      AND (a.latitude IS NULL OR a.longitude IS NULL)
      AND a.deleted_at IS NULL
      AND c.deleted_at IS NULL
    GROUP BY c.province
    ORDER BY missing_primary_coords DESC
    LIMIT 15
  `);

  console.log('\n=== ADDRESS COORDINATES ===');
  console.table(addr);

  console.log('\n=== CLIENT GEOCODE STATUS ===');
  console.table(statusResult.rows);

  console.log('\n=== TOP PROVINCES MISSING PRIMARY ADDRESS COORDS ===');
  if (missingResult.rows.length === 0) {
    console.log('  All primary addresses have coordinates!');
  } else {
    console.table(missingResult.rows);
  }

  const pct = addr.total_addresses > 0
    ? ((addr.with_coords / addr.total_addresses) * 100).toFixed(1)
    : '0';
  console.log(`\nSummary: ${addr.with_coords}/${addr.total_addresses} addresses geocoded (${pct}%)`);
  console.log(`         ${addr.primary_geocoded} primary addresses ready for geofencing\n`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
