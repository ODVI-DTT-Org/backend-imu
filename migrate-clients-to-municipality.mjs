import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== MIGRATING CLIENTS FROM caravan_id TO municipality ===\n');

    // Step 1: Check current clients table structure
    console.log('Step 1: Checking current clients table structure...');
    const columnsCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'clients'
      AND column_name IN ('caravan_id', 'municipality')
      ORDER BY ordinal_position
    `);

    console.log('Current columns:');
    columnsCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Step 2: Get unique regions from PSGC
    console.log('\nStep 2: Getting regions from PSGC...');
    const regions = await client.query(`
      SELECT DISTINCT region
      FROM psgc
      WHERE region IS NOT NULL AND mun_city IS NOT NULL
      ORDER BY region
    `);

    console.log(`Found ${regions.rows.length} regions:`);
    regions.rows.forEach(row => {
      console.log(`  - ${row.region}`);
    });

    // Step 3: Add municipality column if it doesn't exist
    console.log('\nStep 3: Adding municipality column...');
    const municipalityColumnExists = columnsCheck.rows.some(row => row.column_name === 'municipality');

    if (!municipalityColumnExists) {
      await client.query(`ALTER TABLE clients ADD COLUMN municipality text`);
      console.log('✓ Added municipality column');
    } else {
      console.log('✓ municipality column already exists');
    }

    // Step 4: Get all clients
    console.log('\nStep 4: Getting all clients...');
    const clientsResult = await client.query(`SELECT id, caravan_id FROM clients`);
    console.log(`Found ${clientsResult.rows.length} clients`);

    // Step 5: For each region, get sample municipalities
    console.log('\nStep 5: Getting municipalities for each region...');
    const municipalitiesByRegion = {};

    for (const region of regions.rows) {
      const municipalities = await client.query(`
        SELECT DISTINCT mun_city, province
        FROM psgc
        WHERE region = $1
        AND mun_city IS NOT NULL
        LIMIT 50
      `, [region.region]);

      municipalitiesByRegion[region.region] = municipalities.rows;
      console.log(`  - ${region.region}: ${municipalities.rows.length} municipalities`);
    }

    // Step 6: Update clients with random municipalities (distributed across all regions)
    console.log('\nStep 6: Updating clients with random municipalities...');
    let updateCount = 0;
    const clientsPerRegion = Math.ceil(clientsResult.rows.length / regions.rows.length);

    for (const region of regions.rows) {
      const municipalities = municipalitiesByRegion[region.region];
      const clientsForRegion = clientsResult.rows.slice(updateCount, updateCount + clientsPerRegion);

      for (const clientRecord of clientsForRegion) {
        if (municipalities.length > 0) {
          const randomMunicipality = municipalities[Math.floor(Math.random() * municipalities.length)];
          const municipalityValue = `${randomMunicipality.province}-${randomMunicipality.mun_city}`;

          await client.query(`
            UPDATE clients
            SET municipality = $1
            WHERE id = $2
          `, [municipalityValue, clientRecord.id]);

          updateCount++;
        }
      }

      console.log(`  ✓ Updated ${updateCount} clients so far (${region.region} done)`);
    }

    // Step 7: Drop caravan_id column
    console.log('\nStep 7: Dropping caravan_id column...');
    const caravanIdColumnExists = columnsCheck.rows.some(row => row.column_name === 'caravan_id');

    if (caravanIdColumnExists) {
      await client.query(`ALTER TABLE clients DROP COLUMN caravan_id`);
      console.log('✓ Dropped caravan_id column');
    } else {
      console.log('✓ caravan_id column already removed');
    }

    // Step 8: Verify the migration
    console.log('\nStep 8: Verifying migration...');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as total_clients,
        COUNT(municipality) as clients_with_municipality,
        COUNT(DISTINCT SPLIT_PART(municipality, '-', 1)) as distinct_provinces
      FROM clients
    `);

    console.log('Migration results:');
    console.log(`  - Total clients: ${verifyResult.rows[0].total_clients}`);
    console.log(`  - Clients with municipality: ${verifyResult.rows[0].clients_with_municipality}`);
    console.log(`  - Distinct provinces: ${verifyResult.rows[0].distinct_provinces}`);

    // Show sample of updated clients
    console.log('\nSample of updated clients:');
    const sampleClients = await client.query(`
      SELECT first_name, last_name, municipality
      FROM clients
      WHERE municipality IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    sampleClients.rows.forEach(row => {
      console.log(`  - ${row.first_name} ${row.last_name}: ${row.municipality}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
})();
