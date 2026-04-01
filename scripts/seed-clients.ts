/**
 * Large Dataset Seeder for IMU Clients
 * Generates realistic Filipino client data with addresses, phone numbers, and touchpoints
 *
 * Usage: npx tsx scripts/seed-clients.ts [count]
 * Default: 500 clients
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

// ============================================
// FILIPINO DATA SETS
// ============================================

const FIRST_NAMES_MALE = [
  'Juan', 'Jose', 'Pedro', 'Manuel', 'Antonio', 'Francisco', 'Miguel', 'Ricardo',
  'Fernando', 'Eduardo', 'Carlos', 'Roberto', 'Andres', 'Rafael', 'Gabriel', 'Daniel',
  'Alexander', 'Luis', 'Marco', 'Ramon', 'Gerardo', 'Felipe', 'Rodrigo', 'Aurelio',
  'Benjamin', 'Cesar', 'Dante', 'Emmanuel', 'Fabian', 'Gerald', 'Hector', 'Ismael',
  'Jorge', 'Kenneth', 'Leonardo', 'Marcelo', 'Norberto', 'Oscar', 'Pablo', 'Quirino',
  'Reynaldo', 'Salvador', 'Teodoro', 'Ulysses', 'Victor', 'Wilfredo', 'Xavier', 'Yuri', 'Zaldy'
];

const FIRST_NAMES_FEMALE = [
  'Maria', 'Ana', 'Rosa', 'Teresa', 'Elena', 'Carmen', 'Sofia', 'Isabella',
  'Valentina', 'Gabriela', 'Victoria', 'Camila', 'Andrea', 'Patricia', 'Jessica', 'Michelle',
  'Jennifer', 'Stephanie', 'Christina', 'Katherine', 'Margaret', 'Elizabeth', 'Caroline', 'Rebecca',
  'Samantha', 'Amanda', 'Melissa', 'Angela', 'Daniela', 'Natalia', 'Adriana', 'Monica',
  'Silvia', 'Lorena', 'Gloria', 'Raquel', 'Judith', 'Martha', 'Lucia', 'Diana',
  'Alicia', 'Veronica', 'Silvia', 'Cristina', 'Esther', 'Raquel', 'Pilar', 'Rocío', 'Lourdes'
];

const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Gonzales',
  'Fernandez', 'Lopez', 'Perez', 'Martinez', 'Rodriguez', 'Ramos', 'Castillo', 'Flores',
  'Rivera', 'Aquino', 'Villanueva', 'Domingo', 'Santiago', 'De la Cruz', 'Velasco', 'Soriano',
  'Padilla', 'Morales', 'Gutierrez', 'De Guzman', 'Aguilar', 'Chua', 'Sy', 'Tan',
  'Lim', 'Lee', 'Yap', 'Go', 'Ng', 'Chin', 'Ong', 'Wong',
  'Del Rosario', 'Delos Santos', 'De Leon', 'Valdez', 'Pascual', 'Salazar', 'Navarro', 'Mercado',
  'Gomez', 'Reyes', 'Serrano', 'Herrera', 'Castro', 'Alvarez', 'Moreno', 'Munoz',
  'Roman', 'Nolasco', 'Vergara', 'Cabrera', 'Luna', 'Samson', 'Diaz', 'Ortiz'
];

const MIDDLE_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Garcia', 'Mendoza', 'Torres', 'Gonzales', 'Fernandez',
  'Lopez', 'Perez', 'Martinez', 'Rodriguez', 'Ramos', 'Castillo', 'Flores', 'Rivera',
  'Aquino', 'Villanueva', 'Domingo', 'Santiago', 'Padilla', 'Morales', 'Gutierrez', 'Aguilar'
];

// Philippine Provinces and Cities
const REGIONS: { region: string; provinces: { province: string; cities: string[] }[] }[] = [
  {
    region: 'NCR',
    provinces: [
      {
        province: 'Metro Manila',
        cities: ['Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Caloocan', 'Valenzuela', 'Marikina', 'Mandaluyong', 'San Juan', 'Pasay', 'Malabon', 'Navotas']
      }
    ]
  },
  {
    region: 'Region III',
    provinces: [
      { province: 'Bulacan', cities: ['Malolos', 'Meycauayan', 'San Jose del Monte', 'Baliuag', 'Santa Maria', 'Marilao', 'Bocaue', 'Pulilan'] },
      { province: 'Pampanga', cities: ['San Fernando', 'Angeles City', 'Mabalacat', 'Clark', 'Guagua', 'Lubao', 'Mexico'] },
      { province: 'Tarlac', cities: ['Tarlac City', 'Capas', 'Concepcion', 'Gerona', 'Paniqui'] },
      { province: 'Zambales', cities: ['Olongapo', 'Iba', 'Subic'] }
    ]
  },
  {
    region: 'Region IV-A',
    provinces: [
      { province: 'Cavite', cities: ['Bacoor', 'Cavite City', 'Dasmariñas', 'Imus', 'Tagaytay', 'Trece Martires', 'General Trias', 'Silang'] },
      { province: 'Laguna', cities: ['Santa Rosa', 'Biñan', 'San Pedro', 'Calamba', 'Los Baños', 'Cabuyao'] },
      { province: 'Batangas', cities: ['Batangas City', 'Lipa', 'Tanauan', 'Santo Tomas', 'Nasugbu'] },
      { province: 'Rizal', cities: ['Antipolo', 'Cainta', 'Taytay', 'Pasig', 'Marikina', 'San Mateo', 'Rodriguez'] }
    ]
  },
  {
    region: 'Region IV-B',
    provinces: [
      { province: 'Palawan', cities: ['Puerto Princesa', 'El Nido', 'Coron'] }
    ]
  },
  {
    region: 'Region VII',
    provinces: [
      { province: 'Cebu', cities: ['Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay', 'Danao', 'Carcar'] }
    ]
  }
];

const BARANGAYS = [
  'Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Barangay 5', 'Barangay 6',
  'San Isidro', 'San Jose', 'San Juan', 'San Pedro', 'San Miguel', 'Santa Cruz',
  'Poblacion', 'Central', 'East', 'West', 'North', 'South',
  'Sampaguita', 'Rosal', 'Ilang-Ilang', 'Kamuning', 'Maharlika', 'Malaya',
  'Commonwealth', 'Fairview', 'Batasan', 'Loyola', 'Matandang Balara', 'Culiat'
];

const STREETS = [
  'Rizal Street', 'Mabini Street', 'Bonifacio Street', 'Quezon Avenue', 'Ayala Avenue',
  'Shaw Boulevard', 'EDSA', 'C-5 Road', 'Marcos Highway', 'Commonwealth Avenue',
  'España Boulevard', 'Taft Avenue', 'Roxas Boulevard', 'Ortigas Avenue', 'Cainta Junction',
  'M.L. Quezon Street', 'J.P. Rizal Street', 'Gen. Luna Street', 'F. Blumentritt', 'D. Jakosalem'
];

const AGENCIES = [
  { name: 'Philippine National Police', code: 'PNP', department: 'Retirement Division' },
  { name: 'Armed Forces of the Philippines', code: 'AFP', department: 'Pension Service' },
  { name: 'Bureau of Fire Protection', code: 'BFP', department: 'Finance Division' },
  { name: 'Bureau of Jail Management', code: 'BJMP', department: 'Personnel Division' },
  { name: 'Department of Education', code: 'DEPED', department: 'Human Resources' },
  { name: 'Department of Health', code: 'DOH', department: 'Administrative Service' },
  { name: 'Bureau of Internal Revenue', code: 'BIR', department: 'Assessment Division' },
  { name: 'Social Security System', code: 'SSS', department: 'Member Services' },
  { name: 'Government Service Insurance System', code: 'GSIS', department: 'Claims Division' },
  { name: 'Philippine Veterans Affairs', code: 'PVAO', department: 'Pension Division' },
  { name: 'Local Government Unit', code: 'LGU', department: 'General Services' },
  { name: 'Metropolitan Manila Development Authority', code: 'MMDA', department: 'Operations' },
  { name: 'Philippine Postal Corporation', code: 'PHLPOST', department: 'Finance' },
  { name: 'Land Transportation Office', code: 'LTO', department: 'Licensing' },
  { name: 'Philippine Coconut Authority', code: 'PCA', department: 'Administration' }
];

const POSITIONS = [
  'Police Officer I', 'Police Officer II', 'Police Officer III', 'Senior Police Officer',
  'Police Staff Sergeant', 'Police Master Sergeant', 'Police Lieutenant', 'Police Captain',
  'Teacher I', 'Teacher II', 'Teacher III', 'Master Teacher I', 'Master Teacher II',
  'Administrative Aide', 'Administrative Assistant', 'Clerk', 'Accountant', 'Auditor',
  'Revenue Officer', 'Tax Examiner', 'Social Worker', 'Nurse', 'Midwife',
  'Fire Officer', 'Jail Officer', 'Traffic Enforcer', 'Security Guard', 'Driver',
  'Engineer', 'Architect', 'Legal Officer', 'IT Specialist', 'Data Analyst'
];

const CLIENT_TYPES = ['POTENTIAL', 'EXISTING'];
const PRODUCT_TYPES = ['PENSION_LOAN', 'CASH_LOAN', 'SALARY_LOAN', 'PERSONAL_LOAN', 'BUSINESS_LOAN'];
const MARKET_TYPES = ['GOVERNMENT', 'PRIVATE', 'MILITARY', 'SENIOR_CITIZEN'];
const PENSION_TYPES = ['GSIS', 'SSS', 'AFP', 'PNP', 'BFP', 'PRIVATE', 'NONE'];

const TOUCHPOINT_REASONS = [
  'Initial Contact', 'Follow-up Visit', 'Document Collection', 'Loan Application',
  'Verification', 'Payment Collection', 'Account Update', 'Referral Follow-up',
  'Complaint Resolution', 'Product Presentation', 'Contract Signing', 'Document Submission'
];

const TOUCHPOINT_TYPES = ['Visit', 'Call', 'Online'];

// ============================================
// HELPER FUNCTIONS
// ============================================

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
  const prefixes = ['917', '918', '919', '920', '921', '922', '923', '927', '928', '929', '945', '946', '947', '948', '949', '954', '955', '956', '961', '962', '963', '964', '965', '966', '967', '968', '969', '973', '974', '975', '976', '977', '978', '979', '992', '994', '995', '996', '997', '998', '999'];
  return `+63${randomElement(prefixes)}${randomInt(100, 999)}${randomInt(1000, 9999)}`;
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'mail.com', 'proton.me'];
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const variants = [
    `${cleanFirst}.${cleanLast}`,
    `${cleanFirst}${cleanLast}`,
    `${cleanFirst}_${cleanLast}`,
    `${cleanFirst}${randomInt(1, 99)}`,
    `${cleanFirst}.${cleanLast}${randomInt(1, 999)}`,
  ];
  return `${randomElement(variants)}@${randomElement(domains)}`;
}

function generateBirthDate(): Date {
  // Age 45-75 (typical pensioner age range)
  const now = new Date();
  const minAge = 45;
  const maxAge = 75;
  const year = now.getFullYear() - randomInt(minAge, maxAge);
  const month = randomInt(0, 11);
  const day = randomInt(1, 28);
  return new Date(year, month, day);
}

function generateAddress() {
  const region = randomElement(REGIONS);
  const province = randomElement(region.provinces);
  const city = randomElement(province.cities);
  return {
    region: region.region,
    province: province.province,
    city,
    barangay: randomElement(BARANGAYS),
    street: `${randomInt(1, 999)} ${randomElement(STREETS)}`,
    postalCode: `${randomInt(1000, 9999)}`,
  };
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedClients(count: number = 500) {
  console.log(`🌱 Seeding ${count} clients with related data...\n`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get existing caravans (field agents)
    const caravansResult = await client.query(
      "SELECT id FROM users WHERE role = ANY($1) ORDER BY RANDOM()",
      [['caravan', 'field_agent']]
    );
    const caravanIds = caravansResult.rows.map(r => r.id);
    console.log(`Found ${caravanIds.length} caravans to assign clients to`);

    // Get existing agencies or create them
    let agenciesResult = await client.query('SELECT id, name FROM agencies');
    if (agenciesResult.rows.length === 0) {
      console.log('Creating agencies...');
      for (const agency of AGENCIES) {
        await client.query(
          'INSERT INTO agencies (id, name, code, address) VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT (code) DO NOTHING',
          [agency.name, agency.code, 'Metro Manila']
        );
      }
      agenciesResult = await client.query('SELECT id, name FROM agencies');
    }
    const agencies = agenciesResult.rows;
    console.log(`Using ${agencies.length} agencies`);

    // Batch insert clients
    console.log(`\n📝 Generating ${count} clients...`);
    const clientsData: any[] = [];

    for (let i = 0; i < count; i++) {
      const isMale = Math.random() > 0.5;
      const firstName = randomElement(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
      const lastName = randomElement(LAST_NAMES);
      const middleName = randomElement(MIDDLE_NAMES);
      const agency = randomElement(AGENCIES);
      const clientType = randomElement(CLIENT_TYPES);
      const productType = randomElement(PRODUCT_TYPES);
      const marketType = randomElement(MARKET_TYPES);
      const pensionType = marketType === 'GOVERNMENT' || marketType === 'MILITARY'
        ? randomElement(['GSIS', 'SSS', 'AFP', 'PNP', 'BFP'])
        : randomElement(['SSS', 'PRIVATE', 'NONE']);
      const caravanId = caravanIds.length > 0 ? randomElement(caravanIds) : null;

      clientsData.push({
        firstName,
        lastName,
        middleName,
        email: generateEmail(firstName, lastName),
        phone: generatePhone(),
        birthDate: generateBirthDate(),
        clientType,
        productType,
        marketType,
        pensionType,
        agencyName: agency.name,
        department: agency.department,
        position: randomElement(POSITIONS),
        employmentStatus: Math.random() > 0.3 ? 'Active' : 'Retired',
        payrollDate: randomInt(1, 31).toString(),
        tenure: randomInt(5, 35),
        isStarred: Math.random() > 0.9,
        caravanId,
      });

      if ((i + 1) % 100 === 0) {
        console.log(`  Generated ${i + 1}/${count} client records...`);
      }
    }

    // Insert clients in batches
    console.log('\n💾 Inserting clients into database...');
    const batchSize = 100;
    const insertedClients: any[] = [];

    for (let i = 0; i < clientsData.length; i += batchSize) {
      const batch = clientsData.slice(i, i + batchSize);

      for (const data of batch) {
        const result = await client.query(
          `INSERT INTO clients (
            id, first_name, last_name, middle_name, birth_date, email, phone,
            client_type, product_type, market_type, pension_type,
            agency_name, department, position, employment_status, payroll_date, tenure,
            is_starred, caravan_id
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          ) RETURNING id`,
          [
            data.firstName, data.lastName, data.middleName, data.birthDate,
            data.email, data.phone, data.clientType, data.productType,
            data.marketType, data.pensionType, data.agencyName, data.department,
            data.position, data.employmentStatus, data.payrollDate, data.tenure,
            data.isStarred, data.caravanId
          ]
        );
        insertedClients.push({ id: result.rows[0].id, ...data });
      }

      console.log(`  Inserted ${Math.min(i + batchSize, count)}/${count} clients...`);
    }

    // Generate addresses for each client
    console.log('\n🏠 Generating addresses...');
    let addressCount = 0;

    for (const clientData of insertedClients) {
      const numAddresses = Math.random() > 0.5 ? 2 : 1;

      for (let i = 0; i < numAddresses; i++) {
        const addr = generateAddress();
        await client.query(
          `INSERT INTO addresses (
            id, client_id, type, street, barangay, city, province, postal_code, is_primary
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
          )`,
          [
            clientData.id,
            i === 0 ? 'Home' : 'Work',
            addr.street,
            addr.barangay,
            addr.city,
            addr.province,
            addr.postalCode,
            i === 0
          ]
        );
        addressCount++;
      }
    }
    console.log(`  Created ${addressCount} addresses`);

    // Generate phone numbers for each client
    console.log('\n📱 Generating additional phone numbers...');
    let phoneCount = 0;

    for (const clientData of insertedClients) {
      if (Math.random() > 0.4) {
        // 60% chance of having a second phone number
        const phoneType = Math.random() > 0.5 ? 'Mobile' : 'Landline';
        await client.query(
          `INSERT INTO phone_numbers (
            id, client_id, type, number, label, is_primary
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5
          )`,
          [
            clientData.id,
            phoneType,
            phoneType === 'Landline' ? `02${randomInt(1000000, 9999999)}` : generatePhone(),
            phoneType === 'Mobile' ? 'Secondary' : 'Office',
            false
          ]
        );
        phoneCount++;
      }
    }
    console.log(`  Created ${phoneCount} additional phone numbers`);

    // Generate touchpoints for existing clients
    console.log('\n📋 Generating touchpoints for existing clients...');
    let touchpointCount = 0;
    const existingClients = insertedClients.filter(c => c.clientType === 'EXISTING');

    // Check if is_synced column exists
    const touchpointColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'touchpoints' AND column_name = 'is_synced'
    `);
    const hasSyncColumn = touchpointColumns.rows.length > 0;

    for (const clientData of existingClients) {
      const numTouchpoints = randomInt(1, 5);

      for (let i = 1; i <= numTouchpoints; i++) {
        const touchpointDate = randomDate(
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          new Date()
        );

        if (hasSyncColumn) {
          await client.query(
            `INSERT INTO touchpoints (
              id, client_id, caravan_id, touchpoint_number, type, date, reason, notes, is_synced
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
            )`,
            [
              clientData.id,
              clientData.caravanId,
              i,
              randomElement(TOUCHPOINT_TYPES),
              touchpointDate,
              randomElement(TOUCHPOINT_REASONS),
              `Touchpoint ${i} - ${clientData.firstName} ${clientData.lastName}`,
              Math.random() > 0.2 // 80% synced
            ]
          );
        } else {
          await client.query(
            `INSERT INTO touchpoints (
              id, client_id, caravan_id, touchpoint_number, type, date, reason, notes
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
            )`,
            [
              clientData.id,
              clientData.caravanId,
              i,
              randomElement(TOUCHPOINT_TYPES),
              touchpointDate,
              randomElement(TOUCHPOINT_REASONS),
              `Touchpoint ${i} - ${clientData.firstName} ${clientData.lastName}`
            ]
          );
        }
        touchpointCount++;
      }
    }
    console.log(`  Created ${touchpointCount} touchpoints`);

    // Generate itineraries
    console.log('\n📅 Generating itineraries...');
    let itineraryCount = 0;
    const today = new Date();

    for (let i = 0; i < Math.min(insertedClients.length, 100); i++) {
      const clientData = randomElement(insertedClients);
      const scheduledDate = new Date(today);
      scheduledDate.setDate(today.getDate() + randomInt(-7, 14)); // -7 to +14 days

      await client.query(
        `INSERT INTO itineraries (
          id, client_id, caravan_id, scheduled_date, scheduled_time, status, priority, notes
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
        )`,
        [
          clientData.id,
          clientData.caravanId,
          scheduledDate,
          `${randomInt(8, 17).toString().padStart(2, '0')}:${randomElement(['00', '30'])}`,
          randomElement(['pending', 'completed', 'missed', 'cancelled']),
          randomElement(['low', 'normal', 'high']),
          `Scheduled visit for ${clientData.firstName} ${clientData.lastName}`
        ]
      );
      itineraryCount++;
    }
    console.log(`  Created ${itineraryCount} itineraries`);

    await client.query('COMMIT');

    // Final summary
    console.log('\n✅ Seeding completed successfully!\n');
    console.log('═══════════════════════════════════════');
    console.log('           SEEDING SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Clients:      ${count}`);
    console.log(`Addresses:    ${addressCount}`);
    console.log(`Phone #s:     ${phoneCount}`);
    console.log(`Touchpoints:  ${touchpointCount}`);
    console.log(`Itineraries:  ${itineraryCount}`);
    console.log('═══════════════════════════════════════\n');

    // Verify counts
    const verifyResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM addresses) as addresses,
        (SELECT COUNT(*) FROM phone_numbers) as phone_numbers,
        (SELECT COUNT(*) FROM touchpoints) as touchpoints,
        (SELECT COUNT(*) FROM itineraries) as itineraries
    `);
    console.log('Database verification:');
    console.table(verifyResult.rows[0]);

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
const count = parseInt(process.argv[2]) || 500;
seedClients(count).catch(console.error);
