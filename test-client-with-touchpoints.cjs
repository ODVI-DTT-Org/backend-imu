const { Client } = require('pg');

async function testClientWithTouchpoints() {
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

    // Get clients with actual touchpoint data
    console.log('📋 Testing clients WITH touchpoints:\n');

    const result = await client.query(`
      SELECT c.*,
        psg.region as psgc_region,
        psg.province as psgc_province,
        psg.mun_city as psgc_municipality,
        psg.barangay as psgc_barangay,
        COALESCE(
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers,
        -- Calculate completed touchpoints from touchpoint_number
        CASE
          WHEN c.touchpoint_number IS NULL THEN 0
          WHEN c.touchpoint_number > 1 THEN c.touchpoint_number - 1
          ELSE 0
        END as completed_touchpoints,
        c.next_touchpoint as next_touchpoint_type,
        (c.touchpoint_summary->-1->>'type') as last_touchpoint_type,
        (c.touchpoint_summary->-1->>'user_id')::uuid as last_touchpoint_user_id,
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM clients c
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN addresses a ON a.client_id = c.id
      LEFT JOIN phone_numbers p ON p.client_id = c.id
      LEFT JOIN users lt ON lt.id = (c.touchpoint_summary->-1->>'user_id')::uuid
      WHERE c.deleted_at IS NULL
        AND jsonb_array_length(c.touchpoint_summary) > 0
      GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay,
        c.touchpoint_number, c.next_touchpoint, c.touchpoint_summary, c.loan_released,
        lt.first_name, lt.last_name
      ORDER BY jsonb_array_length(c.touchpoint_summary) DESC
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  No clients with touchpoints found in database');
    } else {
      console.log('Clients with touchpoint data:\n');

      result.rows.forEach((row, index) => {
        const touchpointCount = Array.isArray(row.touchpoint_summary) ? row.touchpoint_summary.length : 0;

        console.log(`${index + 1}. ${row.first_name} ${row.last_name}`);
        console.log(`   ID: ${row.id.substring(0, 8)}...`);
        console.log(`   touchpoint_number: ${row.touchpoint_number}`);
        console.log(`   next_touchpoint: ${row.next_touchpoint || 'NULL'}`);
        console.log(`   touchpoint_summary length: ${touchpointCount}`);
        console.log(`   completed_touchpoints: ${row.completed_touchpoints}`);

        if (touchpointCount > 0) {
          console.log(`   Touchpoints:`);
          row.touchpoint_summary.forEach((tp, tpIndex) => {
            console.log(`     ${tpIndex + 1}. #${tp.touchpoint_number} - ${tp.type} (${tp.status || 'No status'})`);
          });
        }
        console.log('');
      });
    }

    console.log('✅ Test complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

testClientWithTouchpoints();
