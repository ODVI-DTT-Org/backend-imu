const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== ADDING 50 MORE CLIENTS ===\n');

    // Get field agents
    const agents = await client.query(`SELECT id, email FROM users WHERE role = 'field_agent' LIMIT 10`);
    console.log(`Found ${agents.rows.length} field agents\n`);

    // First names and last names for realistic data
    const firstNames = [
      'Juan', 'Maria', 'Carlos', 'Ana', 'Jose', 'Elena', 'Miguel', 'Sofia', 'Antonio', 'Isabella',
      'Diego', 'Camila', 'Luis', 'Valentina', 'Pedro', 'Lucia', 'Rafael', 'Gabriela', 'Fernando', 'Daniela',
      'Andres', 'Marta', 'Javier', 'Clara', 'Ricardo', 'Teresa', 'Felipe', 'Alejandra', 'Mateo', 'Valeria',
      'Sebastian', 'Victoria', 'Nicolas', 'Carmen', 'Alejandro', 'Sandra', 'Bruno', 'Patricia', 'Gonzalo', 'Rosa',
      'Emiliano', 'Adriana', 'Santiago', 'Lorena', 'Leonardo', 'Beatriz', 'Samuel', 'Carolina', 'Maximiliano', 'Fernanda'
    ];

    const lastNames = [
      'Dela Cruz', 'Garcia', 'Santos', 'Fernandez', 'Ramos', 'Reyes', 'Mendoza', 'Castillo', 'Torres', 'Rivera',
      'Flores', 'Gonzales', 'Bautista', 'Aquino', 'Vargas', 'Roxas', 'Pascual', 'Navarro', ' Morales', 'Salvador',
      'Estrella', 'Ocampo', 'Tan', 'Lim', 'Wong', 'Chua', 'Go', 'Lee', 'Ng', 'Ho',
      'Cruz', 'Santos', ' Reyes', 'Ramos', 'Mendoza', 'Castillo', 'Torres', 'Rivera', 'Flores', 'Gonzales',
      'Bautista', 'Aquino', 'Vargas', 'Roxas', 'Pascual', 'Navarro', 'Morales', 'Salvador', 'Estrella', 'Ocampo'
    ];

    const clientTypes = ['POTENTIAL', 'EXISTING'];
    const productTypes = ['LOAN', 'INSURANCE', 'CREDIT_CARD'];
    const marketTypes = ['NEW', 'RENEWAL', 'TOP_UP'];
    const pensionTypes = ['SSS', 'GSIS', 'PVAO'];

    let addedCount = 0;

    for (let i = 0; i < 50; i++) {
      const firstName = firstNames[i % firstNames.length];
      const lastName = lastNames[i % lastNames.length];
      const agent = agents.rows[i % agents.rows.length];

      // Insert client
      const result = await client.query(
        `INSERT INTO clients (first_name, last_name, email, phone,
                              client_type, product_type, market_type, pension_type,
                              caravan_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id`,
        [
          firstName,
          lastName,
          `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, '')}@example.com`,
          '63' + Math.floor(Math.random() * 9000000000 + 1000000000).toString(),
          clientTypes[i % clientTypes.length],
          productTypes[i % productTypes.length],
          marketTypes[i % marketTypes.length],
          pensionTypes[i % pensionTypes.length],
          agent.id
        ]
      );

      const clientId = result.rows[0].id;

      // Add address
      await client.query(
        `INSERT INTO addresses (id, client_id, type, street, barangay, city, province, postal_code, is_primary, created_at)
         VALUES (gen_random_uuid(), $1, 'home', 'Street ' || floor(random() * 100), 'Barangay ' || floor(random() * 50),
                 'City Name', 'Province Name', '2000', true, NOW())`,
        [clientId]
      );

      // Add phone number
      await client.query(
        `INSERT INTO phone_numbers (id, client_id, number, type, is_primary, created_at)
         VALUES (gen_random_uuid(), $1, '63' || floor(random() * 9000000000 + 1000000000), 'mobile', true, NOW())`,
        [clientId]
      );

      addedCount++;
      console.log(`✓ ${addedCount}. ${firstName} ${lastName} → ${agent.email}`);
    }

    // Verify total clients
    const countResult = await client.query('SELECT COUNT(*) as count FROM clients');
    console.log(`\n✅ SUCCESS! Total clients in database: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
})();
