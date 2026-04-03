import 'dotenv/config';
import { pool } from '../db/index.js';

// Common Filipino names and data
const firstNames = [
  'Juan', 'Jose', 'Maria', 'Carmen', 'Rosa', 'Miguel', 'Antonio', 'Francisco',
  'Teresa', 'Ana', 'Luis', 'Carlos', 'Mercedes', 'Dolores', 'Manuel', 'Concepcion',
  'Pedro', 'Margarita', 'Fernando', 'Isabel', 'Ricardo', 'Elena', 'Javier', 'Patricia',
  'Angel', 'Gabriel', 'Sofia', 'Daniel', 'Valentina', 'Sebastian', 'Camila', 'Alejandro',
  'Andres', 'Diego', 'Fernanda', 'Rafael', 'Valeria', 'Nicolas', 'Ximena', 'Santiago',
  'Victoria', 'Maximiliano', 'Renata', 'Leonardo', 'Gloria', 'Esteban', 'Adriana', 'Matias',
  'Emilia', 'Ignacio', 'Beatriz', 'Tomas', 'Olivia', 'Gonzalo', 'Sara', 'Felipe', 'Lucia'
];

const lastNames = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Aquino', 'Ramos', 'Flores', 'Mendoza',
  'Morales', 'Torres', 'Navarro', 'Villanueva', 'Santiago', 'De Leon', 'Dela Cruz',
  'Tan', 'Lim', 'Ng', 'Wong', 'Lee', 'Chua', 'Go', 'Ong', 'Lao', 'Sy', 'Ho',
  'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez',
  'Ramirez', 'Castillo', 'Del Rosario', 'Dela Pena', 'Macaraig', 'Dimaano', 'Bautista'
];

const middleInitials = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
];

const productTypes = ['Salary Loan', 'Pension Loan', 'Emergency Loan', 'Business Loan'];
const marketTypes = ['Public', 'Private', 'Government'];
const pensionTypes = ['SSS', 'GSIS', 'PVAO'];
const clientTypes = ['POTENTIAL', 'EXISTING'];
const employmentStatuses = ['Active', 'Retired', 'Separated', 'On Leave'];
const departments = ['Police Office', 'Fire Department', 'Bureau of Jail Management', 'NBI'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomEmail(firstName, lastName) {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
  const randomNum = getRandomInt(1, 999);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${getRandomItem(domains)}`;
}

function getRandomPhoneNumber() {
  const prefixes = ['917', '918', '919', '920', '921', '922', '923', '925', '926', '927', '928', '929'];
  const prefix = getRandomItem(prefixes);
  const remaining = getRandomInt(1000000, 9999999);
  return `+63${prefix}${remaining}`;
}

function getRandomBirthDate() {
  const now = new Date();
  const age = getRandomInt(40, 80);
  const birthYear = now.getFullYear() - age;
  const birthMonth = getRandomInt(1, 12);
  const birthDay = getRandomInt(1, 28);
  return `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
}

function getRandomDate() {
  const now = new Date();
  const pastDate = new Date(now.getFullYear() - getRandomInt(1, 5), getRandomInt(0, 11), getRandomInt(1, 28));
  return pastDate.toISOString().split('T')[0];
}

function generateClient(index) {
  const firstName = getRandomItem(firstNames);
  const lastName = getRandomItem(lastNames);
  const middleInitial = getRandomItem(middleInitials);
  const clientType = getRandomItem(clientTypes);

  return {
    first_name: firstName,
    last_name: lastName,
    middle_name: `${middleInitial}.`,
    birth_date: getRandomBirthDate(),
    email: getRandomEmail(firstName, lastName),
    phone: getRandomPhoneNumber(),
    agency_name: `Philippine ${getRandomItem(['National', 'Regional', 'Local'])} ${getRandomItem(['Police', 'Fire', 'Jail'])}`,
    department: getRandomItem(departments),
    position: getRandomItem(['Chief', 'Senior Officer', 'Officer', 'Superintendent', 'Inspector']),
    employment_status: getRandomItem(employmentStatuses),
    payroll_date: getRandomDate(),
    tenure: getRandomInt(5, 40),
    client_type: clientType,
    product_type: getRandomItem(productTypes),
    market_type: getRandomItem(marketTypes),
    pension_type: getRandomItem(pensionTypes),
    pan: `PAN${String(index + 1).padStart(7, '0')}`,
    facebook_link: `https://facebook.com/${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}`,
    remarks: index % 5 === 0 ? 'VIP Client - Priority handling required' : null,
    is_starred: index % 10 === 0
  };
}

async function insertClients() {
  const batchSize = 100;
  const totalClients = 5000;
  let inserted = 0;

  console.log(`Starting insertion of ${totalClients} clients...`);

  for (let batch = 0; batch < totalClients; batch += batchSize) {
    const clients = [];
    const currentBatchSize = Math.min(batchSize, totalClients - batch);

    for (let i = 0; i < currentBatchSize; i++) {
      const client = generateClient(batch + i);
      clients.push(`(
        uuid_generate_v4(),
        '${client.first_name}',
        '${client.last_name}',
        '${client.middle_name}',
        '${client.birth_date}',
        '${client.email}',
        '${client.phone}',
        '${client.agency_name}',
        '${client.department}',
        '${client.position}',
        '${client.employment_status}',
        '${client.payroll_date}',
        ${client.tenure},
        '${client.client_type}',
        '${client.product_type}',
        '${client.market_type}',
        '${client.pension_type}',
        '${client.pan}',
        '${client.facebook_link}',
        ${client.remarks ? `'${client.remarks}'` : 'NULL'},
        ${client.is_starred},
        NOW(),
        NOW()
      )`);
    }

    const query = `
      INSERT INTO clients (
        id, first_name, last_name, middle_name, birth_date, email, phone,
        agency_name, department, position, employment_status, payroll_date,
        tenure, client_type, product_type, market_type, pension_type,
        pan, facebook_link, remarks, is_starred, created_at, updated_at
      ) VALUES ${clients.join(', ')}
    `;

    try {
      await pool.query(query);
      inserted += currentBatchSize;
      console.log(`✅ Inserted ${inserted}/${totalClients} clients`);
    } catch (error) {
      console.error(`❌ Error inserting batch ${batch}-${batch + currentBatchSize}:`, error.message);
      throw error;
    }
  }

  console.log(`\n✅ Successfully inserted ${inserted} clients!`);

  // Verify the count
  const result = await pool.query('SELECT COUNT(*) as count FROM clients');
  console.log(`📊 Total clients in database: ${result.rows[0].count}`);

  await pool.end();
}

insertClients().catch(console.error);
