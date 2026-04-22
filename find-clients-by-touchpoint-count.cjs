const { Client } = require('pg');

async function findClientsByTouchpointCount() {
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

    // Find users with touchpoints
    console.log('📋 Finding users with touchpoints:\n');

    const usersWithTouchpoints = await client.query(`
      SELECT
        u.id,
        u.email,
        u.role,
        u.first_name,
        u.last_name,
        COUNT(DISTINCT t.client_id) as client_count,
        COUNT(t.id) as total_touchpoints
      FROM touchpoints t
      JOIN users u ON u.id = t.user_id
      WHERE u.role IN ('tele', 'caravan')
      GROUP BY u.id, u.email, u.role, u.first_name, u.last_name
      ORDER BY u.role, client_count DESC
    `);

    console.log('Users with Touchpoints:');
    console.log('Role   | Name                  | Email                       | Clients | Touchpoints');
    console.log('-------|-----------------------|-----------------------------|---------|------------');

    usersWithTouchpoints.rows.forEach(row => {
      const role = row.role.padEnd(6);
      const name = `${row.first_name} ${row.last_name}`.substring(0, 20).padEnd(22);
      const email = row.email.substring(0, 27).padEnd(28);
      const clients = row.client_count.toString().padEnd(8);
      const touchpoints = row.total_touchpoints.toString().padEnd(11);
      console.log(`${role} | ${name} | ${email} | ${clients} | ${touchpoints}`);
    });

    // Get 2 clients for each touchpoint count
    console.log('\n\n📋 Finding 2 clients for each touchpoint count:\n');

    const expectedSequence = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

    for (let touchpointCount = 1; touchpointCount <= 7; touchpointCount++) {
      const clientsResult = await client.query(`
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
        ORDER BY c.created_at DESC
        LIMIT 2
      `, [touchpointCount]);

      console.log(`\n📍 Touchpoint Count: ${touchpointCount}`);
      console.log('  '.repeat(40));

      if (clientsResult.rows.length === 0) {
        console.log('  ⚠️  No clients found with this touchpoint count');
      } else {
        clientsResult.rows.forEach((row, index) => {
          const types = row.touchpoint_summary.map(tp => tp.type).join(', ');
          const expectedTypes = expectedSequence.slice(0, touchpointCount).join(', ');

          // Check if types match expected
          const actualArray = row.touchpoint_summary.map(tp => tp.type);
          const expectedArray = expectedSequence.slice(0, touchpointCount);
          const isCorrect = JSON.stringify(actualArray) === JSON.stringify(expectedArray);
          const status = isCorrect ? '✅' : '❌';

          console.log(`  ${index + 1}. ${row.first_name} ${row.last_name} ${status}`);
          console.log(`     ID: ${row.id}`);
          console.log(`     Touchpoints: ${row.summary_count} - [${types}]`);
          console.log(`     Expected:    [${expectedTypes}]`);
          console.log(`     Next: ${row.next_touchpoint || 'Complete'}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

findClientsByTouchpointCount();
