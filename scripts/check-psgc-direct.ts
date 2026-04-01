/**
 * Check PSGC table structure and sample data
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
        ? { rejectUnauthorized: false }
        : false,
});

async function checkPsgcTable() {
    try {
        // Check table structure
        const columnsResult = await pool.query(`
            SELECT column_name, data_type, character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'psgc'
            ORDER BY ordinal_position
        `);

        console.log('\n📋 PSGC Table Structure:');
        console.log('='.repeat(60));
        console.table(columnsResult.rows);

        // Get row count
        const countResult = await pool.query('SELECT COUNT(*) as count FROM psgc');
        console.log(`\n📊 Total rows: ${countResult.rows[0].count}`);

        // Get sample data
        const sampleResult = await pool.query('SELECT * FROM psgc LIMIT 10');
        console.log('\n📝 Sample Data:');
        console.log('='.repeat(60));
        console.table(sampleResult.rows);

        // Get records by mun_city_kind
        const kindsResult = await pool.query(`
            SELECT DISTINCT mun_city_kind, COUNT(*) as count
            FROM psgc
            GROUP BY mun_city_kind
            ORDER BY count DESC
        `);
        console.log('\n📊 Records by Municipality/City Kind:');
        console.table(kindsResult.rows);

        // Get unique regions count
        const regionsResult = await pool.query(`
            SELECT COUNT(DISTINCT region) as region_count FROM psgc
        `);
        console.log(`\n📊 Unique Regions: ${regionsResult.rows[0].region_count}`);

        // Get unique provinces count
        const provincesResult = await pool.query(`
            SELECT COUNT(DISTINCT province) as province_count FROM psgc
        `);
        console.log(`📊 Unique Provinces: ${provincesResult.rows[0].province_count}`);

        // Get unique municipalities/cities count
        const munCityResult = await pool.query(`
            SELECT COUNT(DISTINCT mun_city) as mun_city_count FROM psgc
        `);
        console.log(`📊 Unique Municipalities/Cities: ${munCityResult.rows[0].mun_city_count}`);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkPsgcTable();
