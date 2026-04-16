const { Client } = require('pg');

async function checkClientTouchpoints() {
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
    console.log('✅ Connected to database');

    // Get first 5 clients with their touchpoint summary
    console.log('\n📋 Checking client touchpoint summaries...\n');

    const result = await client.query(`
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
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    console.log('First 5 clients with their touchpoint data:\n');

    result.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. ${row.first_name} ${row.last_name}`);
      console.log(`   Client ID: ${row.id}`);
      console.log(`   Touchpoint Number: ${row.touchpoint_number}`);
      console.log(`   Next Touchpoint: ${row.next_touchpoint || 'NULL'}`);
      console.log(`   Summary Count: ${row.summary_count}`);

      if (row.summary_count > 0) {
        console.log(`   Touchpoint Summary:`);
        const touchpoints = row.touchpoint_summary;
        touchpoints.forEach((tp, tpIndex) => {
          console.log(`     ${tpIndex + 1}. Touchpoint #${tp.touchpoint_number}: ${tp.type} - ${tp.status || 'No status'}`);
        });
      } else {
        console.log(`   No touchpoints recorded`);
      }
    });

    // Check if all clients have the same touchpoint_summary
    console.log('\n\n🔍 Checking for duplicate touchpoint summaries...\n');

    const duplicateCheck = await client.query(`
      SELECT
        c.touchpoint_summary,
        COUNT(*) as client_count
      FROM clients c
      WHERE c.deleted_at IS NULL
      GROUP BY c.touchpoint_summary
      ORDER BY client_count DESC
      LIMIT 5
    `);

    console.log('Touchpoint summary duplicates:');
    console.log('Clients with same summary | Summary Content');
    console.log('------------------------|-----------------');

    duplicateCheck.rows.forEach(row => {
      const summary = JSON.stringify(row.touchpoint_summary);
      const truncatedSummary = summary.length > 100 ? summary.substring(0, 100) + '...' : summary;
      console.log(`${row.client_count.toString().padStart(25)} | ${truncatedSummary}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

checkClientTouchpoints();