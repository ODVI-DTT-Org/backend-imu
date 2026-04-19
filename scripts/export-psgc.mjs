// Run from backend-imu/: node scripts/export-psgc.mjs
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const { rows } = await pool.query(`
  SELECT
    id::text,
    region,
    province,
    mun_city        AS municipality,
    mun_city_kind   AS municipality_kind,
    barangay,
    zip_code,
    pin_location
  FROM psgc
  ORDER BY region, province, mun_city, barangay
`);

await pool.end();

const outPath = path.join(__dirname, '../../frontend-mobile-imu/imu_flutter/assets/data/psgc.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(rows, null, 0));

console.log(`Wrote ${rows.length} records to ${outPath}`);
