const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@host:port/database';

  // Remove sslmode from connection string to avoid conflicts
  const cleanConnectionString = connectionString.split('?')[0];

  const client = new Client({
    connectionString: cleanConnectionString,
    ssl: {
      rejectUnauthorized: false,
      checkServerIdentity: () => {}
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to production database');

    // Run migration 047
    console.log('\n📋 Running migration 047: Extend Clients Schema for Legacy Data...');
    const migration = fs.readFileSync(path.join(__dirname, 'src/migrations/047_extend_clients_schema.sql'), 'utf8');
    await client.query(migration);
    console.log('✅ Migration 047 completed');

    // Verify the columns were added
    console.log('\n🔍 Verifying new columns...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clients'
      AND column_name IN (
        'ext_name', 'fullname', 'full_address', 'account_code',
        'account_number', 'rank', 'monthly_pension_amount',
        'monthly_pension_gross', 'atm_number', 'applicable_republic_act',
        'unit_code', 'pcni_acct_code', 'dob', 'g_company',
        'g_status', 'status'
      )
      ORDER BY column_name
    `);

    console.log('\n✅ New columns added:');
    if (result.rows.length > 0) {
      console.log('Column                 | Type        | Nullable');
      console.log('------------------------|-------------|----------');
      result.rows.forEach(row => {
        const column = (row.column_name || 'NULL').padEnd(22);
        const type = (row.data_type || 'NULL').padEnd(11);
        const nullable = row.is_nullable || 'NULL';
        console.log(`${column} | ${type} | ${nullable}`);
      });
    } else {
      console.log('No new columns found');
    }

    // Verify index was created
    const indexResult = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'clients'
      AND indexname = 'idx_clients_account_number'
    `);

    if (indexResult.rows.length > 0) {
      console.log('\n✅ Index idx_clients_account_number created');
    } else {
      console.log('\n⚠️  Index idx_clients_account_number not found');
    }

    console.log('\n🎉 Migration 047 completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

runMigration().catch(console.error);
