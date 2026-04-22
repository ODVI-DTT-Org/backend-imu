const { Client } = require('pg');

async function checkUserIds() {
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

    const caravanUserId = '1a51fea7-dda4-400d-a451-cb23a6da9402';
    const teleUserId = '123e4567-e89b-12d3-a456-426614174400';

    console.log('📋 Checking if user IDs exist:\n');

    // Check if specific user IDs exist
    const checkUsersResult = await client.query(`
      SELECT id, email, role, first_name, last_name
      FROM users
      WHERE id IN ($1, $2)
    `, [caravanUserId, teleUserId]);

    console.log('Requested User IDs:');
    console.log('-------------------');

    if (checkUsersResult.rows.length === 0) {
      console.log('❌ Neither user ID exists in the database');
    } else {
      checkUsersResult.rows.forEach(row => {
        console.log(`✅ ${row.role}: ${row.first_name} ${row.last_name} (${row.email})`);
        console.log(`   ID: ${row.id}`);
      });
    }

    // Find actual users with touchpoints
    console.log('\n\n📋 Finding actual users with touchpoints:\n');

    const usersWithTouchpoints = await client.query(`
      SELECT DISTINCT
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
      ORDER BY u.role, u.created_at
      LIMIT 10
    `);

    console.log('Users with Touchpoints:');
    console.log('----------------------');
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

    // Get 2 clients for each touchpoint count from ANY user
    console.log('\n\n📋 Finding 2 clients for each touchpoint count (from any user):\n');

    for (let touchpointCount = 1; touchpointCount <= 7; touchpointCount++) {
      const clientsResult = await client.query(`
        SELECT
          c.id,
          c.first_name,
          c.last_name,
          c.touchpoint_number,
          c.next_touchpoint,
          jsonb_array_length(c.touchpoint_summary) as summary_count,
          c.touchpoint_summary,
          u.role as created_by_role,
          u.email as created_by_email
        FROM clients c
        CROSS JOIN LATERAL (
          SELECT t.user_id
          FROM touchpoints t
          WHERE t.client_id = c.id
          ORDER BY t.created_at DESC
          LIMIT 1
        ) last_tp
        JOIN users u ON u.id = last_tp.user_id
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
          console.log(`  ${index + 1}. ${row.first_name} ${row.last_name}`);
          console.log(`     ID: ${row.id}`);
          console.log(`     Touchpoints: ${row.summary_count} - [${types}]`);
          console.log(`     Next: ${row.next_touchpoint || 'Complete'}`);
          console.log(`     Created by: ${row.created_by_role} (${row.created_by_email})`);
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

checkUserIds();
