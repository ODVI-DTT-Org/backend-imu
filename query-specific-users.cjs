const { Client } = require('pg');

async function querySpecificUsers() {
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

    console.log('📋 Querying for specific users:\n');
    console.log(`🚐 Caravan User ID: ${caravanUserId}`);
    console.log(`📞 Tele User ID: ${teleUserId}\n`);

    // Find clients by touchpoint count for each role
    for (let touchpointCount = 1; touchpointCount <= 7; touchpointCount++) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📍 Touchpoint Count: ${touchpointCount}`);
      console.log('='.repeat(80));

      // Find Tele clients with this touchpoint count
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
            WHERE t.user_id = $2
          )
        ORDER BY c.created_at DESC
        LIMIT 2
      `, [touchpointCount, teleUserId]);

      console.log(`\n  📞 TELE Clients (${teleClientsResult.rows.length} found):`);
      if (teleClientsResult.rows.length === 0) {
        console.log('     ⚠️  No Tele clients found with this touchpoint count');
      } else {
        teleClientsResult.rows.forEach((row, index) => {
          const types = row.touchpoint_summary.map(tp => tp.type).join(', ');
          console.log(`     ${index + 1}. ${row.first_name} ${row.last_name}`);
          console.log(`        ID: ${row.id}`);
          console.log(`        Touchpoints: ${row.summary_count} - [${types}]`);
          console.log(`        Next: ${row.next_touchpoint || 'Complete'}`);
        });
      }

      // Find Caravan clients with this touchpoint count
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
            WHERE t.user_id = $2
          )
        ORDER BY c.created_at DESC
        LIMIT 2
      `, [touchpointCount, caravanUserId]);

      console.log(`\n  🚐 CARAVAN Clients (${caravanClientsResult.rows.length} found):`);
      if (caravanClientsResult.rows.length === 0) {
        console.log('     ⚠️  No Caravan clients found with this touchpoint count');
      } else {
        caravanClientsResult.rows.forEach((row, index) => {
          const types = row.touchpoint_summary.map(tp => tp.type).join(', ');
          console.log(`     ${index + 1}. ${row.first_name} ${row.last_name}`);
          console.log(`        ID: ${row.id}`);
          console.log(`        Touchpoints: ${row.summary_count} - [${types}]`);
          console.log(`        Next: ${row.next_touchpoint || 'Complete'}`);
        });
      }
    }

    // Show expected vs actual touchpoint types
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 TOUCHPOINT TYPE ANALYSIS');
    console.log('='.repeat(80));

    console.log('\nExpected Sequence: Visit → Call → Call → Visit → Call → Call → Visit\n');

    const allClientsResult = await client.query(`
      SELECT
        c.first_name,
        c.last_name,
        c.touchpoint_number,
        c.touchpoint_summary,
        CASE
          WHEN c.id IN (
            SELECT DISTINCT t.client_id FROM touchpoints t WHERE t.user_id = $1
          ) THEN 'TELE'
          WHEN c.id IN (
            SELECT DISTINCT t.client_id FROM touchpoints t WHERE t.user_id = $2
          ) THEN 'CARAVAN'
          ELSE 'UNKNOWN'
        END as assigned_role
      FROM clients c
      WHERE c.deleted_at IS NULL
        AND c.touchpoint_number > 0
        AND (
          c.id IN (SELECT DISTINCT t.client_id FROM touchpoints t WHERE t.user_id = $1)
          OR c.id IN (SELECT DISTINCT t.client_id FROM touchpoints t WHERE t.user_id = $2)
        )
      ORDER BY c.touchpoint_number, c.first_name
    `, [teleUserId, caravanUserId]);

    console.log('Client Name                    | Role    | TP # | Actual Types                     | Expected Types                    | Status');
    console.log('-------------------------------|---------|------|----------------------------------|-----------------------------------|--------');

    const expectedSequence = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

    allClientsResult.rows.forEach(row => {
      const name = `${row.first_name} ${row.last_name}`.substring(0, 30).padEnd(30);
      const role = row.assigned_role.padEnd(8);
      const tpNum = row.touchpoint_number.toString().padEnd(5);
      const actualTypes = row.touchpoint_summary.map(tp => tp.type).join(', ');
      const expectedTypes = expectedSequence.slice(0, row.touchpoint_number).join(', ');

      // Check if types match expected
      const actualArray = row.touchpoint_summary.map(tp => tp.type);
      const expectedArray = expectedSequence.slice(0, row.touchpoint_number);
      const isCorrect = JSON.stringify(actualArray) === JSON.stringify(expectedArray);
      const status = isCorrect ? '✅ CORRECT' : '❌ WRONG';

      const actual = actualTypes.padEnd(33);
      const expected = expectedTypes.padEnd(34);
      const stat = status.padEnd(8);

      console.log(`${name} | ${role} | ${tpNum} | ${actual} | ${expected} | ${stat}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

querySpecificUsers();
