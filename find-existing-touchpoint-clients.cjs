const { Client } = require('pg');

async function findExistingTouchpointClients() {
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

    if (teleUsers.length === 0 && caravanUsers.length === 0) {
      console.error('❌ No Tele or Caravan users found in database.');
      return;
    }

    const teleUserIds = teleUsers.map(u => u.id);
    const caravanUserIds = caravanUsers.map(u => u.id);

    console.log(`✅ Found ${teleUsers.length} Tele user(s)`);
    console.log(`✅ Found ${caravanUsers.length} Caravan user(s)`);

    // Find clients by touchpoint count for each role
    console.log('\n📋 Finding clients by touchpoint count...\n');

    for (let touchpointCount = 1; touchpointCount <= 7; touchpointCount++) {
      console.log(`\n📍 Touchpoint Count: ${touchpointCount}`);
      console.log('='.repeat(80));

      // Find Tele clients with this touchpoint count
      if (teleUserIds.length > 0) {
        const teleClientsResult = await client.query(`
          SELECT
            c.id,
            c.first_name,
            c.last_name,
            c.touchpoint_number,
            c.next_touchpoint,
            jsonb_array_length(c.touchpoint_summary) as summary_count,
            c.touchpoint_summary
          FROM clients c
          WHERE c.deleted_at IS NULL
            AND c.touchpoint_number = $1
            AND c.id IN (
              SELECT DISTINCT t.client_id
              FROM touchpoints t
              WHERE t.user_id = ANY($2)
            )
          ORDER BY c.created_at DESC
          LIMIT 2
        `, [touchpointCount, teleUserIds]);

        console.log(`\n  📞 TELE Clients (${teleClientsResult.rows.length} found):`);
        if (teleClientsResult.rows.length === 0) {
          console.log('     ⚠️  No Tele clients found with this touchpoint count');
        } else {
          teleClientsResult.rows.forEach((row, index) => {
            const types = row.touchpoint_summary.map(tp => tp.type).join(', ');
            console.log(`     ${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`        ID: ${row.id}`);
            console.log(`        Touchpoints: ${row.summary_count} - ${types}`);
            console.log(`        Next: ${row.next_touchpoint || 'Complete'}`);
          });
        }
      }

      // Find Caravan clients with this touchpoint count
      if (caravanUserIds.length > 0) {
        const caravanClientsResult = await client.query(`
          SELECT
            c.id,
            c.first_name,
            c.last_name,
            c.touchpoint_number,
            c.next_touchpoint,
            jsonb_array_length(c.touchpoint_summary) as summary_count,
            c.touchpoint_summary
          FROM clients c
          WHERE c.deleted_at IS NULL
            AND c.touchpoint_number = $1
            AND c.id IN (
              SELECT DISTINCT t.client_id
              FROM touchpoints t
              WHERE t.user_id = ANY($2)
            )
          ORDER BY c.created_at DESC
          LIMIT 2
        `, [touchpointCount, caravanUserIds]);

        console.log(`\n  🚐 CARAVAN Clients (${caravanClientsResult.rows.length} found):`);
        if (caravanClientsResult.rows.length === 0) {
          console.log('     ⚠️  No Caravan clients found with this touchpoint count');
        } else {
          caravanClientsResult.rows.forEach((row, index) => {
            const types = row.touchpoint_summary.map(tp => tp.type).join(', ');
            console.log(`     ${index + 1}. ${row.first_name} ${row.last_name}`);
            console.log(`        ID: ${row.id}`);
            console.log(`        Touchpoints: ${row.summary_count} - ${types}`);
            console.log(`        Next: ${row.next_touchpoint || 'Complete'}`);
          });
        }
      }
    }

    // Summary statistics
    console.log('\n\n📊 Summary Statistics:\n');

    const statsResult = await client.query(`
      SELECT
        u.role,
        COUNT(DISTINCT t.client_id) as client_count,
        COUNT(t.id) as total_touchpoints,
        AVG(ct.touchpoint_number) as avg_touchpoints
      FROM touchpoints t
      JOIN users u ON u.id = t.user_id
      JOIN clients ct ON ct.id = t.client_id
      WHERE u.role IN ('tele', 'caravan')
        AND ct.deleted_at IS NULL
      GROUP BY u.role
      ORDER BY u.role
    `);

    console.log('Role   | Clients | Total Touchpoints | Avg Touchpoints/Client');
    console.log('-------|---------|-------------------|----------------------');

    statsResult.rows.forEach(row => {
      const role = row.role.padEnd(6);
      const clients = row.client_count.toString().padEnd(8);
      const total = row.total_touchpoints.toString().padEnd(18);
      const avg = row.avg_touchpoints ? row.avg_touchpoints.toFixed(2).padEnd(21) : 'N/A'.padEnd(21);
      console.log(`${role} | ${clients} | ${total} | ${avg}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

findExistingTouchpointClients();
