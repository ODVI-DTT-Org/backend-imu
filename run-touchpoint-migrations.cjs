const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runTouchpointMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Fix SSL mode for DigitalOcean managed databases
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

    // Run migration 073: Add touchpoint summary trigger
    console.log('\n📋 Running migration 073: Add touchpoint summary trigger...');
    const migration073 = fs.readFileSync(path.join(__dirname, 'src/migrations/073_add_touchpoint_summary_trigger.sql'), 'utf8');
    await client.query(migration073);
    console.log('✅ Migration 073 completed - Trigger created');

    // Run migration 074: Backfill touchpoint summary
    console.log('\n📋 Running migration 074: Backfill touchpoint summary...');
    const migration074 = fs.readFileSync(path.join(__dirname, 'src/migrations/074_backfill_touchpoint_summary.sql'), 'utf8');
    await client.query(migration074);
    console.log('✅ Migration 074 completed - Backfill completed');

    // Verify the fix
    console.log('\n🔍 Verifying touchpoint summary data...');
    const result = await client.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        jsonb_array_length(c.touchpoint_summary) as touchpoint_count,
        c.touchpoint_number,
        c.next_touchpoint
      FROM clients c
      WHERE c.deleted_at IS NULL
      ORDER BY jsonb_array_length(c.touchpoint_summary) DESC
      LIMIT 5
    `);

    console.log('\n✅ Sample clients with touchpoint data:');
    console.log('Client ID                              | Name              | Touchpoints | Next Type');
    console.log('--------------------------------------|-------------------|------------|-----------');
    result.rows.forEach(row => {
      const clientId = (row.id || '').substring(0, 38).padEnd(38);
      const name = `${row.first_name} ${row.last_name}`.substring(0, 17).padEnd(17);
      const count = (row.touchpoint_count || 0).toString().padEnd(10);
      const nextType = (row.next_touchpoint || 'NULL').padEnd(9);
      console.log(`${clientId} | ${name} | ${count} | ${nextType}`);
    });

    console.log('\n✅ All migrations completed successfully!');
    console.log('📝 The trigger will now automatically update touchpoint_summary when touchpoints are created/updated/deleted');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

runTouchpointMigrations();
