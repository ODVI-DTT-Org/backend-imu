import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const connectionString = process.env.DATABASE_URL;

function generateUUID() {
  return randomUUID();
}

async function seedDigitalOcean() {
  console.log('Seeding Digital Ocean database...');
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    // Read and execute the schema file
    const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('✅ Schema created');

    // Create publication
    await client.query('CREATE PUBLICATION IF NOT EXISTS powersync FOR ALL TABLES');
    console.log('✅ Publication created');

    // Seed clients
    const clients = [
      { first_name: 'Juan', last_name: 'Dela Cruz', middle_name: 'Santos', email: 'juan.delacruz@email.com', phone: '+639123456789', client_type: 'EXISTING', product_type: 'PENSION_LOAN', market_type: 'GOVERNMENT', pension_type: 'GSIS' },
      { first_name: 'Maria', last_name: 'Santos', middle_name: 'Reyes', email: 'maria.santos@email.com', phone: '+639234567890', client_type: 'EXISTING', product_type: 'PENSION_LOAN', market_type: 'GOVERNMENT', pension_type: 'SSS' },
      { first_name: 'Pedro', last_name: 'Garcia', middle_name: 'Cruz', email: 'pedro.garcia@email.com', phone: '+639345678901', client_type: 'POTENTIAL', product_type: 'CASH_LOAN', market_type: 'PRIVATE', pension_type: 'PRIVATE' },
    ];

    for (const client of clients) {
      const id = generateUUID();
      await client.query(
        `INSERT INTO clients (id, first_name, last_name, middle_name, email, phone, client_type, product_type, market_type, pension_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, client.first_name, client.last_name, client.middle_name, client.email, client.phone, client.client_type, client.product_type, client.market_type, client.pension_type]
      );
      console.log(`✅ Created client: ${client.first_name} ${client.last_name}`);
    }

    // Seed it caravans (field agents)
    const caravans = [
      { name: 'John Field Agent', email: 'john@imu.com', assigned_area: 'North Metro Manila' },
      { name: 'Jane Field Agent', email: 'jane@imu.com', assigned_area: 'South Metro Manila' },
    ];

    for (const caravan of caravans) {
      const id = generateUUID();
      await client.query(
        `INSERT INTO caravans (id, name, email, assigned_area)
        VALUES ($1, $2, $3)`,
        [id, caravan.name, caravan.email, caravan.assigned_area]
      );
      console.log(`✅ Created caravan: ${caravan.name}`);
    }

    // Seed it itineraries
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 1);
    const itineraries = [
      { scheduled_date: today, status: 'pending', priority: 'high' },
      { scheduled_date: today, status: 'pending', priority: 'normal' },
      { scheduled_date: tomorrow, status: 'pending', priority: 'normal' },
    ];

    for (const itinerary of itineraries) {
      const clientId = clients[Math.floor(Math.random() * clients.length)].id;
      const caravanId = caravans[Math.floor(Math.random() * caravans.length)].id;
      await client.query(
        `INSERT INTO itineraries (id, client_id, caravan_id, scheduled_date, status, priority)
        VALUES ($1, $2, $3, $4, $5)`,
        [generateUUID(), clientId, caravanId, itinerary.scheduled_date, itinerary.status, itinerary.priority]
      );
      console.log(`✅ Created itinerary for ${itinerary.scheduled_date}`);
    }

    console.log('✅ Seeding completed!');
    console.log('');
    console.log('Summary:');
    console.log(`  - Clients: ${clients.length}`);
    console.log(`  - Caravans: ${caravans.length}`);
    console.log(`  - Itineraries: ${itineraries.length}`);
    console.log('');

    await client.end();
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedDigitalOcean();
