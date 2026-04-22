const { Client } = require('pg');

// Touchpoint sequence pattern: Visit → Call → Call → Visit → Call → Call → Visit
const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

async function createTestTouchpointClients() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const fixedConnectionString = connectionString.replace('sslmode=require', 'sslmode=no-verify');

  const client = new Client({
    connectionString: fixedConnectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get Tele and Caravan user IDs
    console.log('📋 Getting Tele and Caravan user IDs...\n');

    const usersResult = await client.query(`
      SELECT id, email, role
      FROM users
      WHERE role IN ('tele', 'caravan')
      LIMIT 10
    `);

    const teleUsers = usersResult.rows.filter(u => u.role === 'tele');
    const caravanUsers = usersResult.rows.filter(u => u.role === 'caravan');

    if (teleUsers.length === 0) {
      console.error('❌ No Tele users found. Please create at least one Tele user first.');
      return;
    }

    if (caravanUsers.length === 0) {
      console.error('❌ No Caravan users found. Please create at least one Caravan user first.');
      return;
    }

    const teleUserId = teleUsers[0].id;
    const caravanUserId = caravanUsers[0].id;

    console.log(`✅ Using Tele user: ${teleUsers[0].email} (${teleUserId})`);
    console.log(`✅ Using Caravan user: ${caravanUsers[0].email} (${caravanUserId})`);

    // Create test clients
    console.log('\n📋 Creating test clients with touchpoints...\n');

    let createdCount = 0;

    for (let touchpointCount = 1; touchpointCount <= 7; touchpointCount++) {
      console.log(`\n📍 Creating clients with ${touchpointCount} touchpoint(s)...`);

      // Create 2 clients for Tele
      for (let i = 1; i <= 2; i++) {
        const firstName = `TeleTP${touchpointCount}_${i}`;
        const lastName = 'TestClient';

        // Insert client and get the generated ID
        const clientResult = await client.query(`
          INSERT INTO clients (id, first_name, last_name, client_type, status, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, 'POTENTIAL', 'active', NOW(), NOW())
          RETURNING id
        `, [firstName, lastName]);
        const clientId = clientResult.rows[0].id;

        // Create touchpoints for this client
        for (let tpNum = 1; tpNum <= touchpointCount; tpNum++) {
          const touchpointType = TOUCHPOINT_SEQUENCE[tpNum - 1];

          await client.query(`
            INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, status, is_legacy, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, 'Interested', false, NOW(), NOW())
          `, [clientId, teleUserId, tpNum, touchpointType]);
        }

        createdCount++;
        console.log(`  ✅ Created: ${firstName} ${lastName} (${touchpointCount} ${touchpointCount === 1 ? 'touchpoint' : 'touchpoints'})`);
      }

      // Create 2 clients for Caravan
      for (let i = 1; i <= 2; i++) {
        const firstName = `CaravanTP${touchpointCount}_${i}`;
        const lastName = 'TestClient';

        // Insert client and get the generated ID
        const clientResult = await client.query(`
          INSERT INTO clients (id, first_name, last_name, client_type, status, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, 'POTENTIAL', 'active', NOW(), NOW())
          RETURNING id
        `, [firstName, lastName]);
        const clientId = clientResult.rows[0].id;

        // Create touchpoints for this client
        for (let tpNum = 1; tpNum <= touchpointCount; tpNum++) {
          const touchpointType = TOUCHPOINT_SEQUENCE[tpNum - 1];

          await client.query(`
            INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, status, is_legacy, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE, 'Interested', false, NOW(), NOW())
          `, [clientId, caravanUserId, tpNum, touchpointType]);
        }

        createdCount++;
        console.log(`  ✅ Created: ${firstName} ${lastName} (${touchpointCount} ${touchpointCount === 1 ? 'touchpoint' : 'touchpoints'})`);
      }
    }

    console.log(`\n\n✅ Successfully created ${createdCount} test clients with touchpoints`);

    // Verify the created data
    console.log('\n📋 Verifying created clients...\n');

    const verifyResult = await client.query(`
      SELECT
        c.first_name,
        c.last_name,
        c.touchpoint_number,
        c.next_touchpoint,
        jsonb_array_length(c.touchpoint_summary) as summary_count,
        c.touchpoint_summary
      FROM clients c
      WHERE c.first_name LIKE '%TestClient'
        AND c.last_name = 'TestClient'
      ORDER BY c.touchpoint_number, c.first_name
    `);

    console.log('Created Clients Summary:\n');
    console.log('Client Name           | Touchpoints | Next Type | Touchpoint Types');
    console.log('----------------------|-------------|-----------|------------------');

    verifyResult.rows.forEach(row => {
      const name = `${row.first_name} ${row.last_name}`.substring(0, 20).padEnd(20);
      const count = (row.touchpoint_number || 0).toString().padEnd(11);
      const next = (row.next_touchpoint || 'NULL').padEnd(9);

      const types = row.touchpoint_summary
        .map(tp => tp.type)
        .join(', ');

      console.log(`${name} | ${count} | ${next} | ${types}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

createTestTouchpointClients();
