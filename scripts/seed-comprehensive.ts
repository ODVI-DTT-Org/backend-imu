/**
 * Comprehensive Database Seeder for IMU
 * Generates complete dataset for testing all flows as Admin and Tele
 *
 * Usage: npx tsx scripts/seed-comprehensive.ts
 *
 * Features:
 * - Creates test users (admin, tele, caravan, managers)
 * - Creates agencies
 * - Creates user_locations for municipality assignments
 * - Creates clients with addresses and phone numbers
 * - Creates touchpoints with GPS data and various statuses
 * - Creates itineraries
 * - Creates approvals for UDI workflow
 * - Creates groups and targets
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

// ============================================
// DATA SETS
// ============================================

const FIRST_NAMES_MALE = [
  'Juan', 'Jose', 'Pedro', 'Manuel', 'Antonio', 'Francisco', 'Miguel', 'Ricardo',
  'Fernando', 'Eduardo', 'Carlos', 'Roberto', 'Andres', 'Rafael', 'Gabriel', 'Daniel'
];

const FIRST_NAMES_FEMALE = [
  'Maria', 'Ana', 'Rosa', 'Teresa', 'Elena', 'Carmen', 'Sofia', 'Isabella',
  'Valentina', 'Gabriela', 'Victoria', 'Camila', 'Andrea', 'Patricia', 'Jessica'
];

const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Gonzales',
  'Fernandez', 'Lopez', 'Perez', 'Martinez', 'Rodriguez', 'Ramos', 'Castillo', 'Flores'
];

const REGIONS = [
  { code: 'NCR', name: 'National Capital Region', municipalities: ['Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig'] },
  { code: 'R03', name: 'Central Luzon', municipalities: ['San Fernando', 'Angeles City', 'Balanga', 'Malolos', 'Cabanatuan'] },
  { code: 'R04A', name: 'CALABARZON', municipalities: ['Bacoor', 'Cavite City', 'Dasmariñas', 'Santa Rosa', 'San Pablo'] },
  { code: 'R07', name: 'Central Visayas', municipalities: ['Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay', 'Danao'] },
];

const CLIENT_TYPES = ['POTENTIAL', 'EXISTING'];
const PRODUCT_TYPES = ['PENSION_LOAN', 'CASH_LOAN', 'SALARY_LOAN', 'PERSONAL_LOAN'];
const MARKET_TYPES = ['GOVERNMENT', 'PRIVATE', 'MILITARY', 'SENIOR_CITIZEN'];
const PENSION_TYPES = ['GSIS', 'SSS', 'AFP', 'PNP', 'BFP', 'PRIVATE', 'NONE'];

const TOUCHPOINT_REASONS = [
  'Initial Contact', 'Follow-up Visit', 'Document Collection', 'Loan Application',
  'Verification', 'Payment Collection', 'Account Update', 'Referral Follow-up',
  'Complaint Resolution', 'Product Presentation', 'Contract Signing', 'Document Submission'
];

const TOUCHPOINT_STATUSES = ['Interested', 'Undecided', 'Not Interested', 'Completed'];

// Helper functions
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generatePhone(): string {
  const prefixes = ['917', '918', '919', '920', '921', '922', '923', '927', '928', '929'];
  return `+63${randomElement(prefixes)}${randomInt(100, 999)}${randomInt(1000, 9999)}`;
}

function generateEmail(firstName: string, lastName: string): string {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 999)}@gmail.com`;
}

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedUsers(client: any) {
  console.log('\n👥 Creating test users...');

  const users = [
    // Admin
    {
      email: 'admin@imu.test',
      password: 'admin123', // Will be hashed
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true
    },
    // Area Manager
    {
      email: 'areamanager@imu.test',
      password: 'manager123',
      firstName: 'Area',
      lastName: 'Manager',
      role: 'area_manager',
      isActive: true
    },
    // Assistant Area Manager
    {
      email: 'asstmanager@imu.test',
      password: 'manager123',
      firstName: 'Asst',
      lastName: 'Manager',
      role: 'assistant_area_manager',
      isActive: true
    },
    // Tele users (5 for testing)
    ...Array.from({ length: 5 }, (_, i) => ({
      email: `tele${i + 1}@imu.test`,
      password: 'tele123',
      firstName: randomElement(FIRST_NAMES_MALE),
      lastName: randomElement(LAST_NAMES),
      role: 'tele',
      isActive: true
    })),
    // Caravan/Field agents (10 for testing)
    ...Array.from({ length: 10 }, (_, i) => ({
      email: `caravan${i + 1}@imu.test`,
      password: 'caravan123',
      firstName: randomElement(FIRST_NAMES_MALE),
      lastName: randomElement(LAST_NAMES),
      role: 'caravan',
      isActive: Math.random() > 0.2 // 80% active
    }))
  ];

  const createdUsers: any[] = [];

  for (const user of users) {
    // Create simple hash (in production, use bcrypt)
    const passwordHash = `hash_${user.password}`;

    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = EXCLUDED.is_active
       RETURNING id, email, role`,
      [user.email, passwordHash, user.firstName, user.lastName, user.role, user.isActive]
    );

    createdUsers.push({ ...user, id: result.rows[0].id });
    console.log(`  ✓ ${user.role}: ${user.email}`);
  }

  return createdUsers;
}

async function seedAgencies(client: any) {
  console.log('\n🏢 Creating agencies...');

  const agencies = [
    { name: 'Philippine National Police', code: 'PNP', address: 'Camp Crame, Quezon City' },
    { name: 'Armed Forces of the Philippines', code: 'AFP', address: 'Camp Aguinaldo, Quezon City' },
    { name: 'Bureau of Fire Protection', code: 'BFP', address: 'Agham Road, Quezon City' },
    { name: 'Social Security System', code: 'SSS', address: 'Diliman, Quezon City' },
    { name: 'Government Service Insurance System', code: 'GSIS', address: 'Pasig City' },
  ];

  const createdAgencies: any[] = [];

  for (const agency of agencies) {
    const result = await client.query(
      `INSERT INTO agencies (id, name, code, address)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (code) DO NOTHING
       RETURNING id, name, code`,
      [agency.name, agency.code, agency.address]
    );

    if (result.rows.length > 0) {
      createdAgencies.push({ ...agency, id: result.rows[0].id });
      console.log(`  ✓ ${agency.name} (${agency.code})`);
    }
  }

  // If no new agencies were created (all existed), fetch existing ones
  if (createdAgencies.length === 0) {
    const existingAgencies = await client.query(
      'SELECT id, name, code FROM agencies WHERE code = ANY($1)',
      [agencies.map(a => a.code)]
    );
    existingAgencies.rows.forEach((row: any) => {
      const agency = agencies.find(a => a.code === row.code);
      if (agency) {
        createdAgencies.push({ ...agency, id: row.id });
      }
    });
    console.log(`  ✓ Using ${createdAgencies.length} existing agencies`);
  }

  return createdAgencies;
}

async function seedUserLocations(client: any, users: any[]) {
  console.log('\n📍 Creating user municipality assignments...');

  const teleUsers = users.filter(u => u.role === 'tele');
  const caravanUsers = users.filter(u => u.role === 'caravan');

  let count = 0;

  // Assign municipalities to tele users
  for (const tele of teleUsers) {
    const numMunicipalities = randomInt(2, 4);
    for (let i = 0; i < numMunicipalities; i++) {
      const region = randomElement(REGIONS);
      const municipality = randomElement(region.municipalities);

      await client.query(
        `INSERT INTO user_municipalities_simple (id, user_id, municipality_id, assigned_at, assigned_by)
         VALUES (gen_random_uuid(), $1, $2, NOW(), $3)
         ON CONFLICT (user_id, municipality_id) DO NOTHING`,
        [tele.id, municipality, randomElement(users.filter(u => u.role === 'admin')).id]
      );
      count++;
    }
  }

  // Assign municipalities to caravan users
  for (const caravan of caravanUsers) {
    const numMunicipalities = randomInt(3, 5);
    for (let i = 0; i < numMunicipalities; i++) {
      const region = randomElement(REGIONS);
      const municipality = randomElement(region.municipalities);

      await client.query(
        `INSERT INTO user_municipalities_simple (id, user_id, municipality_id, assigned_at, assigned_by)
         VALUES (gen_random_uuid(), $1, $2, NOW(), $3)
         ON CONFLICT (user_id, municipality_id) DO NOTHING`,
        [caravan.id, municipality, randomElement(users.filter(u => u.role === 'admin')).id]
      );
      count++;
    }
  }

  console.log(`  ✓ Created ${count} municipality assignments`);
}

async function seedClients(client: any, users: any[], agencies: any[], count: number = 200) {
  console.log(`\n👥 Creating ${count} clients...`);

  const caravanUsers = users.filter(u => u.role === 'caravan');
  const createdClients: any[] = [];

  for (let i = 0; i < count; i++) {
    const isMale = Math.random() > 0.5;
    const firstName = randomElement(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
    const lastName = randomElement(LAST_NAMES);
    const agency = randomElement(agencies);
    const clientType = randomElement(CLIENT_TYPES);

    const result = await client.query(
      `INSERT INTO clients (
        id, first_name, last_name, middle_name, email, phone,
        client_type, product_type, market_type, pension_type,
        agency_name, department, position, employment_status,
        payroll_date, tenure, is_starred
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING id`,
      [
        firstName,
        lastName,
        randomElement(LAST_NAMES),
        generateEmail(firstName, lastName),
        generatePhone(),
        clientType,
        randomElement(PRODUCT_TYPES),
        randomElement(MARKET_TYPES),
        randomElement(PENSION_TYPES),
        agency.name,
        'Finance Department',
        'Senior Officer',
        Math.random() > 0.3 ? 'Active' : 'Retired',
        randomInt(1, 31).toString(),
        randomInt(5, 35),
        Math.random() > 0.9
      ]
    );

    createdClients.push({
      id: result.rows[0].id,
      firstName,
      lastName,
      clientType
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  Created ${i + 1}/${count} clients...`);
    }
  }

  console.log(`  ✓ Created ${count} clients`);
  return createdClients;
}

async function seedAddresses(client: any, clients: any[]) {
  console.log('\n🏠 Creating addresses...');

  let count = 0;
  for (const clientData of clients) {
    const region = randomElement(REGIONS);
    const municipality = randomElement(region.municipalities);

    await client.query(
      `INSERT INTO addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        clientData.id,
        'Home',
        `${randomInt(1, 999)} Rizal Street`,
        'Barangay 1',
        municipality,
        region.name,
        randomInt(1000, 9999).toString(),
        true
      ]
    );
    count++;
  }

  console.log(`  ✓ Created ${count} addresses`);
}

async function seedTouchpoints(client: any, clients: any[], users: any[]) {
  console.log('\n📋 Creating touchpoints...');

  const teleUsers = users.filter(u => u.role === 'tele');
  const caravanUsers = users.filter(u => u.role === 'caravan');

  // Tele touchpoints (calls only: 2, 3, 5, 6)
  console.log('  Creating tele touchpoints (calls)...');
  let teleCount = 0;

  for (const clientData of clients.slice(0, 50)) {
    const teleUser = randomElement(teleUsers);
    const numTouchpoints = randomInt(1, 4);

    for (let i = 0; i < numTouchpoints; i++) {
      const touchpointNumber = randomElement([2, 3, 5, 6]);
      const touchpointDate = randomDate(
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        new Date()
      );

      await client.query(
        `INSERT INTO touchpoints (
          id, client_id, user_id, touchpoint_number, type, date,
          reason, notes, status, time_arrival, time_departure
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )`,
        [
          clientData.id,
          teleUser.id,
          touchpointNumber,
          'Call',
          touchpointDate,
          randomElement(TOUCHPOINT_REASONS),
          `Call with ${clientData.firstName} ${clientData.lastName}`,
          randomElement(TOUCHPOINT_STATUSES),
          `${touchpointDate.getHours().toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}`,
          `${(touchpointDate.getHours() + randomInt(0, 2)).toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}`
        ]
      );
      teleCount++;
    }
  }

  // Caravan touchpoints (visits: 1, 4, 7)
  console.log('  Creating caravan touchpoints (visits with GPS)...');
  let caravanCount = 0;

  for (const clientData of clients.slice(50)) {
    const caravanUser = randomElement(caravanUsers);
    const numTouchpoints = randomInt(1, 5);

    for (let i = 0; i < numTouchpoints; i++) {
      const touchpointNumber = randomElement([1, 4, 7]);
      const touchpointDate = randomDate(
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        new Date()
      );

      // GPS coordinates (roughly Philippines)
      const baseLat = 14.5995;
      const baseLng = 120.9842;
      const lat = baseLat + (Math.random() - 0.5) * 0.1;
      const lng = baseLng + (Math.random() - 0.5) * 0.1;

      await client.query(
        `INSERT INTO touchpoints (
          id, client_id, user_id, touchpoint_number, type, date,
          reason, notes, status, time_arrival, time_departure,
          time_in_gps_lat, time_in_gps_lng, time_in_gps_address,
          time_out_gps_lat, time_out_gps_lng, time_out_gps_address
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16
        )`,
        [
          clientData.id,
          caravanUser.id,
          touchpointNumber,
          'Visit',
          touchpointDate,
          randomElement(TOUCHPOINT_REASONS),
          `Visit with ${clientData.firstName} ${clientData.lastName}`,
          randomElement(TOUCHPOINT_STATUSES),
          `${touchpointDate.getHours().toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}`,
          `${(touchpointDate.getHours() + randomInt(1, 3)).toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}`,
          lat,
          lng,
          `Near ${client.lastName}'s location`,
          lat + (Math.random() - 0.5) * 0.001,
          lng + (Math.random() - 0.5) * 0.001,
          `Departure from ${client.lastName}'s location`
        ]
      );
      caravanCount++;
    }
  }

  console.log(`  ✓ Created ${teleCount} tele touchpoints and ${caravanCount} caravan touchpoints`);
}

async function seedItineraries(client: any, clients: any[], users: any[]) {
  console.log('\n📅 Creating itineraries...');

  const caravanUsers = users.filter(u => u.role === 'caravan');
  const today = new Date();
  let count = 0;

  for (let i = 0; i < 50; i++) {
    const clientData = randomElement(clients);
    const caravan = randomElement(caravanUsers);
    const scheduledDate = new Date(today);
    scheduledDate.setDate(today.getDate() + randomInt(-7, 14));

    const status = scheduledDate < today
      ? randomElement(['completed', 'missed', 'cancelled'])
      : randomElement(['pending', 'in_progress']);

    await client.query(
      `INSERT INTO itineraries (
        id, client_id, user_id, scheduled_date, scheduled_time,
        status, priority, notes, created_by
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
      )`,
      [
        clientData.id,
        caravan.id,
        scheduledDate,
        `${randomInt(8, 16).toString().padStart(2, '0')}:${randomElement(['00', '30'])}`,
        status,
        randomElement(['low', 'normal', 'high']),
        `Scheduled visit for ${clientData.firstName} ${clientData.lastName}`,
        caravan.id
      ]
    );
    count++;
  }

  console.log(`  ✓ Created ${count} itineraries`);
}

async function seedApprovals(client: any, clients: any[], users: any[]) {
  console.log('\n✅ Creating approvals (UDI workflow)...');

  const adminUsers = users.filter(u => u.role === 'admin');
  const caravanUsers = users.filter(u => u.role === 'caravan');
  let count = 0;

  // Create pending UDI approvals
  for (const clientData of clients.slice(0, 20)) {
    const caravan = randomElement(caravanUsers);

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id, touchpoint_number,
        role, reason, notes
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
      )`,
      [
        'udi',
        'pending',
        clientData.id,
        randomInt(1, 7),
        'caravan',
        'UDI Number Request',
        `Please assign UDI number for ${clientData.firstName} ${clientData.lastName}. UDIN: ${randomInt(100000, 999999)}`
      ]
    );
    count++;
  }

  // Create approved UDI approvals (with UDI stored)
  for (const clientData of clients.slice(20, 40)) {
    const caravan = randomElement(caravanUsers);
    const admin = randomElement(adminUsers);
    const udiNumber = randomInt(100000, 999999).toString();

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id, touchpoint_number,
        role, reason, notes, approved_by, approved_at, updated_udi
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )`,
      [
        'udi',
        'approved',
        clientData.id,
        randomInt(1, 7),
        'caravan',
        'UDI Number Assigned',
        `UDI Number: ${udiNumber}`,
        admin.id,
        new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000),
        udiNumber
      ]
    );

    // Also update client with UDI
    await client.query(
      'UPDATE clients SET udi = $1 WHERE id = $2',
      [udiNumber, clientData.id]
    );

    count++;
  }

  // Create client information update approvals
  for (const clientData of clients.slice(40, 60)) {
    const caravan = randomElement(caravanUsers);

    const clientChanges = {
      phone: generatePhone(),
      email: generateEmail(clientData.firstName, clientData.lastName)
    };

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id,
        role, reason, notes, updated_client_information
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
      )`,
      [
        'client',
        'pending',
        clientData.id,
        'caravan',
        'Client Information Update',
        'Please update client contact information',
        JSON.stringify(clientChanges)
      ]
    );
    count++;
  }

  // Create Tele UDI approvals (pending and approved)
  const teleUsers = users.filter(u => u.role === 'tele');

  // Pending Tele UDI approvals
  for (const clientData of clients.slice(100, 110)) {
    const tele = randomElement(teleUsers);

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id, touchpoint_number,
        role, reason, notes
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
      )`,
      [
        'udi',
        'pending',
        clientData.id,
        randomInt(2, 6), // Tele can only create calls (2, 3, 5, 6)
        'tele',
        'UDI Number Request (Tele)',
        `Tele call resulted in UDI request for ${clientData.firstName} ${clientData.lastName}. UDIN: ${randomInt(100000, 999999)}`
      ]
    );
    count++;
  }

  // Approved Tele UDI approvals
  for (const clientData of clients.slice(110, 120)) {
    const tele = randomElement(teleUsers);
    const admin = randomElement(adminUsers);
    const udiNumber = randomInt(100000, 999999).toString();

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id, touchpoint_number,
        role, reason, notes, approved_by, approved_at, updated_udi
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )`,
      [
        'udi',
        'approved',
        clientData.id,
        randomInt(2, 6),
        'tele',
        'UDI Number Assigned (Tele)',
        `Tele call resulted in UDI assignment for ${clientData.firstName} ${clientData.lastName}. UDI Number: ${udiNumber}`,
        admin.id,
        new Date(Date.now() - randomInt(1, 20) * 24 * 60 * 60 * 1000),
        udiNumber
      ]
    );

    // Also update client with UDI
    await client.query(
      'UPDATE clients SET udi = $1 WHERE id = $2',
      [udiNumber, clientData.id]
    );

    count++;
  }

  // Tele client information update approvals (pending)
  for (const clientData of clients.slice(120, 140)) {
    const tele = randomElement(teleUsers);

    const clientChanges = {
      phone: generatePhone(),
      email: generateEmail(clientData.firstName, clientData.lastName)
    };

    await client.query(
      `INSERT INTO approvals (
        id, type, status, client_id,
        role, reason, notes, updated_client_information
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
      )`,
      [
        'client',
        'pending',
        clientData.id,
        'tele',
        'Client Information Update (Tele)',
        `Tele ${tele.firstName} ${tele.lastName} requested client info update during call`,
        JSON.stringify(clientChanges)
      ]
    );
    count++;
  }

  console.log(`  ✓ Created ${count} approvals`);
}

async function seedGroups(client: any, users: any[]) {
  console.log('\n👥 Creating groups...');

  const areaManagers = users.filter(u => u.role === 'area_manager' || u.role === 'assistant_area_manager');

  let count = 0;

  // Create groups for each region
  for (const region of REGIONS) {
    const manager = randomElement(areaManagers);

    const result = await client.query(
      `INSERT INTO groups (id, name, description)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING id`,
      [
        `${region.name} Team`,
        `Field team assigned to ${region.name}`
      ]
    );

    const groupId = result.rows[0].id;

    // Skip adding group members for now - table structure may vary
    // const caravanUsers = users.filter(u => u.role === 'caravan');
    // for (let i = 0; i < randomInt(2, 5); i++) {
    //   const caravan = randomElement(caravanUsers);
    //   await client.query(
    //     `INSERT INTO group_members (id, group_id, user_id, added_by, added_at)
    //      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
    //      ON CONFLICT DO NOTHING`,
    //     [groupId, caravan.id, manager.id]
    //   );
    // }

    count++;
  }

  console.log(`  ✓ Created ${count} groups`);
}

async function seedTargets(client: any, users: any[]) {
  console.log('\n🎯 Creating targets...');

  const caravanUsers = users.filter(u => u.role === 'caravan');
  const currentMonth = new Date();
  const monthInt = parseInt(`${currentMonth.getFullYear()}${String(currentMonth.getMonth() + 1).padStart(2, '0')}`);
  const year = currentMonth.getFullYear();

  let count = 0;

  // Create monthly targets for each caravan
  for (const caravan of caravanUsers) {
    await client.query(
      `INSERT INTO targets (id, user_id, month, period, year, target_touchpoints)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        caravan.id,
        monthInt,
        monthInt,
        year,
        randomInt(80, 150)
      ]
    );
    count++;
  }

  console.log(`  ✓ Created ${count} monthly targets`);
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedComprehensive() {
  console.log('🌱 Starting comprehensive database seeding...\n');
  console.log('═══════════════════════════════════════');
  console.log('   IMU COMPREHENSIVE SEEDING SCRIPT');
  console.log('═══════════════════════════════════════');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Seed in order
    const users = await seedUsers(client);
    const agencies = await seedAgencies(client);
    await seedUserLocations(client, users);
    const clients = await seedClients(client, users, agencies, 200);
    await seedAddresses(client, clients);
    await seedTouchpoints(client, clients, users);
    await seedItineraries(client, clients, users);
    await seedApprovals(client, clients, users);
    await seedGroups(client, users);
    await seedTargets(client, users);

    await client.query('COMMIT');

    // Print summary
    console.log('\n✅ Seeding completed successfully!\n');
    console.log('═══════════════════════════════════════');
    console.log('           SEEDING SUMMARY');
    console.log('═══════════════════════════════════════');

    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM agencies) as agencies,
        (SELECT COUNT(*) FROM user_locations) as user_locations,
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM addresses) as addresses,
        (SELECT COUNT(*) FROM touchpoints) as touchpoints,
        (SELECT COUNT(*) FROM itineraries) as itineraries,
        (SELECT COUNT(*) FROM approvals) as approvals,
        (SELECT COUNT(*) FROM groups) as groups,
        (SELECT COUNT(*) FROM targets) as targets
    `);

    console.log(`Users:         ${counts.rows[0].users}`);
    console.log(`Agencies:       ${counts.rows[0].agencies}`);
    console.log(`User Locs:      ${counts.rows[0].user_locations}`);
    console.log(`Clients:        ${counts.rows[0].clients}`);
    console.log(`Addresses:      ${counts.rows[0].addresses}`);
    console.log(`Touchpoints:    ${counts.rows[0].touchpoints}`);
    console.log(`Itineraries:    ${counts.rows[0].itineraries}`);
    console.log(`Approvals:      ${counts.rows[0].approvals}`);
    console.log(`Groups:         ${counts.rows[0].groups}`);
    console.log(`Targets:        ${counts.rows[0].targets}`);
    console.log('═══════════════════════════════════════\n');

    console.log('🔐 Test Credentials:');
    console.log('────────────────────────────────────────');
    console.log('Admin:    admin@imu.test / admin123');
    console.log('Staff:    staff@imu.test / staff123');
    console.log('Tele:     tele1@imu.test / tele123');
    console.log('Caravan:  caravan1@imu.test / caravan123');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seeder
seedComprehensive().catch(console.error);
