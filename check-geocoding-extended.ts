import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const [cols, clientCoords, addrCount] = await Promise.all([
    pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clients'
        AND column_name IN ('latitude','longitude','full_address','geocode_status')
      ORDER BY column_name
    `),
    pool.query(`
      SELECT
        COUNT(*)                                                    AS total_clients,
        COUNT(*) FILTER (WHERE latitude  IS NOT NULL
                           AND longitude IS NOT NULL)              AS with_coords,
        COUNT(*) FILTER (WHERE latitude  IS NULL
                            OR longitude IS NULL)                  AS missing_coords
      FROM clients WHERE deleted_at IS NULL
    `),
    pool.query(`SELECT COUNT(*) AS total FROM addresses`),
  ]);

  console.log('\n=== RELEVANT COLUMNS ON clients TABLE ===');
  console.log(cols.rows.map((r: any) => r.column_name).join(', '));

  console.log('\n=== CLIENT-LEVEL COORDINATES ===');
  console.table(clientCoords.rows[0]);

  console.log('\n=== TOTAL ADDRESSES ROWS ===');
  console.log(addrCount.rows[0].total);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
