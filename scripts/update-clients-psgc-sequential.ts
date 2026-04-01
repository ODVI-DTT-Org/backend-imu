/**
 * Update clients with PSGC location data sequentially
 * This script assigns PSGC locations to clients one by one
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

// Client location data to update
const clientLocations = [
  { region: 'Region VII (Central Visayas)', municipality: 'Barili', province: 'Cebu' },
  { region: 'Region V (Bicol Region)', municipality: 'Casiguran', province: 'Sorsogon' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'Cavinti', province: 'Laguna' },
  { region: 'Region VIII (Eastern Visayas)', municipality: 'Macarthur', province: 'Leyte' },
  { region: 'Region VII (Central Visayas)', municipality: 'Bantayan', province: 'Cebu' },
  { region: 'Region XI (Davao Region)', municipality: 'Compostela', province: 'Davao de Oro' },
  { region: 'Region VI (Western Visayas)', municipality: 'City of Himamaylan', province: 'Negros Occidental' },
  { region: 'Region I (Ilocos Region)', municipality: 'City of San Carlos', province: 'Pangasinan' },
  { region: 'Region V (Bicol Region)', municipality: 'Libmanan', province: 'Camarines Sur' },
  { region: 'National Capital Region (NCR)', municipality: 'City of Muntinlupa', province: 'Metro Manila' },
  { region: 'Region V (Bicol Region)', municipality: 'San Pascual', province: 'Masbate' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'Batangas City', province: 'Batangas' },
  { region: 'Cordillera Administrative Region (CAR)', municipality: 'Itogon', province: 'Benguet' },
  { region: 'Region XI (Davao Region)', municipality: 'Tarragona', province: 'Davao Oriental' },
  { region: 'Region VI (Western Visayas)', municipality: 'Igbaras', province: 'Iloilo' },
  { region: 'Region VII (Central Visayas)', municipality: 'City of Naga', province: 'Cebu' },
  { region: 'Region II (Cagayan Valley)', municipality: 'City of Cauayan', province: 'Isabela' },
  { region: 'MIMAROPA Region', municipality: 'Magdiwang', province: 'Romblon' },
  { region: 'MIMAROPA Region', municipality: 'Bansud', province: 'Oriental Mindoro' },
  { region: 'Region VIII (Eastern Visayas)', municipality: 'San Policarpo', province: 'Eastern Samar' },
  { region: 'Region II (Cagayan Valley)', municipality: 'Cabatuan', province: 'Isabela' },
  { region: 'Region I (Ilocos Region)', municipality: 'Pinili', province: 'Ilocos Norte' },
  { region: 'Region III (Central Luzon)', municipality: 'Mexico', province: 'Pampanga' },
  { region: 'Region VII (Central Visayas)', municipality: 'Tubigon', province: 'Bohol' },
  { region: 'Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)', municipality: 'Ampatuan', province: 'Maguindanao del Sur' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'Mulanay', province: 'Quezon' },
  { region: 'Region VIII (Eastern Visayas)', municipality: 'Pinabacdao', province: 'Samar' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'Mataasnakahoy', province: 'Batangas' },
  { region: 'Region VII (Central Visayas)', municipality: 'Vallehermoso', province: 'Negros Oriental' },
  { region: 'Region IX (Zamboanga Peninsula)', municipality: 'Diplahan', province: 'Zamboanga Sibugay' },
  { region: 'Cordillera Administrative Region (CAR)', municipality: 'Luna', province: 'Apayao' },
  { region: 'Region VI (Western Visayas)', municipality: 'Caluya', province: 'Antique' },
  { region: 'Region V (Bicol Region)', municipality: 'Siruma', province: 'Camarines Sur' },
  { region: 'Region I (Ilocos Region)', municipality: 'Bautista', province: 'Pangasinan' },
  { region: 'Region III (Central Luzon)', municipality: 'Santo Domingo', province: 'Nueva Ecija' },
  { region: 'Region IX (Zamboanga Peninsula)', municipality: 'Imelda', province: 'Zamboanga Sibugay' },
  { region: 'Region XI (Davao Region)', municipality: 'Mabini', province: 'Davao de Oro' },
  { region: 'Region VIII (Eastern Visayas)', municipality: 'San Julian', province: 'Eastern Samar' },
  { region: 'Region I (Ilocos Region)', municipality: 'Santa Lucia', province: 'Ilocos Sur' },
  { region: 'Region II (Cagayan Valley)', municipality: 'Ramon', province: 'Isabela' },
  { region: 'Region III (Central Luzon)', municipality: 'Mayantoc', province: 'Tarlac' },
  { region: 'Region VIII (Eastern Visayas)', municipality: 'Giporlos', province: 'Eastern Samar' },
  { region: 'Region I (Ilocos Region)', municipality: 'Agno', province: 'Pangasinan' },
  { region: 'Region III (Central Luzon)', municipality: 'San Clemente', province: 'Tarlac' },
  { region: 'MIMAROPA Region', municipality: 'Santa Cruz', province: 'Occidental Mindoro' },
  { region: 'Region XIII (Caraga)', municipality: 'City of Tandag', province: 'Surigao del Sur' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'Tuy', province: 'Batangas' },
  { region: 'Region XII (SOCCSKSARGEN)', municipality: 'Polomolok', province: 'South Cotabato' },
  { region: 'Region VI (Western Visayas)', municipality: 'Kalibo', province: 'Aklan' },
  { region: 'Region I (Ilocos Region)', municipality: 'Quirino', province: 'Ilocos Sur' },
  { region: 'Region VI (Western Visayas)', municipality: 'Estancia', province: 'Iloilo' },
  { region: 'Region VII (Central Visayas)', municipality: 'Boljoon', province: 'Cebu' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'City of Tanauan', province: 'Batangas' },
  { region: 'Region VI (Western Visayas)', municipality: 'Hamtic', province: 'Antique' },
  { region: 'Region IX (Zamboanga Peninsula)', municipality: 'Bayog', province: 'Zamboanga del Sur' },
  { region: 'Cordillera Administrative Region (CAR)', municipality: 'Bauko', province: 'Mountain Province' },
  { region: 'Region X (Northern Mindanao)', municipality: 'Jasaan', province: 'Misamis Oriental' },
  { region: 'Region IX (Zamboanga Peninsula)', municipality: 'Katipunan', province: 'Zamboanga del Norte' },
  { region: 'Region XII (SOCCSKSARGEN)', municipality: 'Banga', province: 'South Cotabato' },
  { region: 'Region VI (Western Visayas)', municipality: 'Sibunag', province: 'Guimaras' },
  { region: 'Region IV-A (CALABARZON)', municipality: 'General Luna', province: 'Quezon' },
];

async function updateClientsWithPSGC() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all clients
    const clientsResult = await client.query(
      `SELECT id, first_name, last_name
       FROM clients
       ORDER BY id
       LIMIT ${clientLocations.length}`
    );

    const clients = clientsResult.rows;
    console.log(`Found ${clients.length} clients to update`);

    let updateCount = 0;
    let skipCount = 0;

    for (let i = 0; i < Math.min(clients.length, clientLocations.length); i++) {
      const location = clientLocations[i];
      const clientRow = clients[i];

      // Find PSGC record
      const psgcResult = await client.query(
        `SELECT id, region, province, mun_city
         FROM psgc
         WHERE region = $1
         AND province = $2
         AND mun_city = $3
         LIMIT 1`,
        [location.region, location.province, location.municipality]
      );

      if (psgcResult.rows.length === 0) {
        console.log(`⚠️  PSGC not found: ${location.region} - ${location.municipality}, ${location.province}`);
        skipCount++;
        continue;
      }

      const psgc = psgcResult.rows[0];

      // Update client
      await client.query(
        `UPDATE clients
         SET region = $1,
             province = $2,
             municipality = $3,
             barangay = NULL,
             psgc_id = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [location.region, location.province, location.municipality, psgc.id, clientRow.id]
      );
      updateCount++;
      console.log(`✅ ${updateCount}. ${clientRow.first_name} ${clientRow.last_name} → ${location.municipality}, ${location.province}`);
    }

    await client.query('COMMIT');

    console.log('\n=== Summary ===');
    console.log(`✅ Successfully updated: ${updateCount} clients`);
    console.log(`⚠️  Skipped (PSGC not found): ${skipCount}`);
    console.log(`Total clients: ${clients.length}`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating clients:', error.message);
    throw error;
  } finally {
    await client.release();
    await pool.end();
  }
}

updateClientsWithPSGC()
  .then(() => {
    console.log('✅ Update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Update failed:', error);
    process.exit(1);
  });
