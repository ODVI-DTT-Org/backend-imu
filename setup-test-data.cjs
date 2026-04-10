const { Client } = require('pg');

function gen_uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function setupTestData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    // Check if test data already exists
    const existingTest = await client.query("SELECT id FROM clients WHERE first_name = 'TEST' LIMIT 1");
    if (existingTest.rows.length > 0) {
      console.log('⚠️  Test data already exists. Skipping setup.');
      await client.end();
      return;
    }

    console.log('\n📋 Creating test data for three new features...\n');

    // 1. Create test client for multiple addresses
    console.log('1. Creating test client with multiple addresses...');
    const clientId1 = gen_uuid();
    await client.query(`
      INSERT INTO clients (id, first_name, middle_name, last_name, client_type, product_type, pension_type, region, province, municipality, barangay, psgc_id)
      VALUES (
        $1,
        'MARIA',
        'SANTOS',
        'CRUZ',
        'EXISTING',
        'PENSION',
        'SSS',
        'NCR',
        'Metro Manila',
        'Manila',
        'Poblacion',
        915001
      )
    `, [clientId1]);
    console.log(`   ✅ Client created: ${clientId1}`);

    // Add multiple addresses
    const addr1 = gen_uuid();
    const addr2 = gen_uuid();
    const addr3 = gen_uuid();

    await client.query(`
      INSERT INTO addresses (id, client_id, psgc_id, label, street_address, postal_code, latitude, longitude, is_primary)
      VALUES
        ($1, $2, 915001, 'Home', '123 Main Street', '1000', 14.5847, 121.0557, true),
        ($3, $2, 915002, 'Office', '456 Office Ave', '1001', 14.5900, 121.0600, false),
        ($4, $2, 915003, 'Work', '789 Work Blvd', '1002', 14.6000, 121.0700, false)
    `, [addr1, clientId1, addr2, addr3]);
    console.log('   ✅ 3 addresses added (Home, Office, Work)');

    // Add multiple phone numbers
    const phone1 = gen_uuid();
    const phone2 = gen_uuid();
    const phone3 = gen_uuid();

    await client.query(`
      INSERT INTO phone_numbers (id, client_id, label, number, is_primary)
      VALUES
        ($1, $2, 'Mobile', '09171234567', true),
        ($3, $2, 'Home', '02-81234567', false),
        ($4, $2, 'Office', '02-89876543', false)
    `, [phone1, clientId1, phone2, phone3]);
    console.log('   ✅ 3 phone numbers added (Mobile, Home, Office)');

    // 2. Create test clients for fuzzy search (similar names)
    console.log('\n2. Creating test clients for fuzzy search...');
    const similarNames = [
      { first: 'RODOLFO', middle: 'M', last: 'MARIN' },
      { first: 'RODELFO', middle: 'M', last: 'MARIN' },
      { first: 'RODOLFO', middle: null, last: 'MARINEZ' },
      { first: 'RODOLFO', middle: 'S', last: 'MARIN' }
    ];

    for (let i = 0; i < similarNames.length; i++) {
      const name = similarNames[i];
      const clientId = gen_uuid();
      await client.query(`
        INSERT INTO clients (id, first_name, middle_name, last_name, client_type, product_type, pension_type, region, province, municipality, barangay, psgc_id)
        VALUES (
          $1,
          $2, $3, $4,
          'EXISTING',
          'PENSION',
          'SSS',
          'NCR',
          'Metro Manila',
          'Quezon City',
          'Diliman',
          917001
        )
      `, [clientId, name.first, name.middle, name.last]);

      console.log(`   ✅ Created: ${name.first} ${name.last} (${name.middle || 'no middle'})`);
    }

    // 3. Create test client for database normalization (visits/calls)
    console.log('\n3. Creating test client for visits/calls...');
    const clientId3 = gen_uuid();

    await client.query(`
      INSERT INTO clients (id, first_name, middle_name, last_name, client_type, product_type, pension_type, region, province, municipality, barangay, psgc_id)
      VALUES (
        $1,
        'JUAN',
        'A',
        'DELACRUZ',
        'EXISTING',
        'PENSION',
        'SSS',
        'NCR',
        'Metro Manila',
        'Makati',
        'Poblacion',
        918001
      )
    `, [clientId3]);
    console.log(`   ✅ Client created: ${clientId3}`);

    // Add address and phone for visit/call testing
    const addrVisit = gen_uuid();
    const phoneVisit = gen_uuid();

    await client.query(`
      INSERT INTO addresses (id, client_id, psgc_id, label, street_address, postal_code, is_primary)
      VALUES ($1, $2, 918001, 'Home', '123 Test St', '1000', true)
    `, [addrVisit, clientId3]);

    await client.query(`
      INSERT INTO phone_numbers (id, client_id, label, number, is_primary)
      VALUES ($1, $2, 'Mobile', '09181234567', true)
    `, [phoneVisit, clientId3]);

    console.log('   ✅ Address and phone added');

    // 4. Create test users for each role
    console.log('\n4. Creating test users for RBAC testing...');
    const testUsers = [
      { email: 'admin@test.com', password: 'admin123', role_id: (await client.query("SELECT id FROM roles WHERE slug = 'admin'")).rows[0].id },
      { email: 'areamgr@test.com', password: 'area123', role_id: (await client.query("SELECT id FROM roles WHERE slug = 'area_manager'")).rows[0].id },
      { email: 'asstareamgr@test.com', password: 'asst123', role_id: (await client.query("SELECT id FROM roles WHERE slug = 'assistant_area_manager'")).rows[0].id },
      { email: 'caravan@test.com', password: 'caravan123', role_id: (await client.query("SELECT id FROM roles WHERE slug = 'caravan'")).rows[0].id },
      { email: 'tele@test.com', password: 'tele123', role_id: (await client.query("SELECT id FROM roles WHERE slug = 'tele'")).rows[0].id }
    ];

    for (const user of testUsers) {
      try {
        // Check if user exists
        const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [user.email]);
        if (existingUser.rows.length > 0) {
          console.log(`   ⚠️  User ${user.email} already exists`);
          continue;
        }

        // Create user
        const { hash } = await import('bcrypt');
        const hashedPassword = await hash(user.password, 10);

        const userResult = await client.query(`
          INSERT INTO users (email, password_hash, first_name, last_name, role)
          VALUES ($1, $2, 'Test', 'User', $3)
          RETURNING id
        `, [user.email, hashedPassword, user.email.split('@')[0]]);

        const userId = userResult.rows[0].id;

        // Assign role
        await client.query(`
          INSERT INTO user_roles (user_id, role_id)
          VALUES ($1, $2)
        `, [userId, user.role_id]);

        console.log(`   ✅ User created: ${user.email} (${user.email.split('@')[0]})`);
      } catch (err) {
        console.log(`   ⚠️  ${err.message}`);
      }
    }

    // 5. Verify permissions are set up
    console.log('\n5. Verifying RBAC permissions...');
    const permCount = await client.query(`
      SELECT COUNT(*) as count
      FROM permissions
      WHERE resource IN ('visits', 'calls', 'releases', 'addresses', 'phone_numbers')
    `);
    console.log(`   ✅ Total permissions: ${permCount.rows[0].count}`);

    const rolePermCount = await client.query(`
      SELECT COUNT(*) as count
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.resource IN ('visits', 'calls', 'releases', 'addresses', 'phone_numbers')
    `);
    console.log(`   ✅ Total role permissions: ${rolePermCount.rows[0].count}`);

    console.log('\n🎉 Test data setup complete!\n');
    console.log('Summary:');
    console.log('- Client with 3 addresses: Maria Santos Cruz');
    console.log('- Client with 3 phone numbers: Maria Santos Cruz');
    console.log('- 4 clients with similar names (for fuzzy search)');
    console.log('- 5 test users (one for each role)');
    console.log('\n✅ Ready for testing!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupTestData().catch(console.error);
