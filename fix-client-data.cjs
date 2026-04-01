const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== FIXING CLIENT DATA ===\n');

    // Step 1: Create user_municipalities_simple table
    console.log('Step 1: Creating user_municipalities_simple table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_municipalities_simple (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        municipality_id TEXT NOT NULL,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, municipality_id)
      )
    `);
    console.log('✅ Table created\n');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_user ON user_municipalities_simple(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_municipality ON user_municipalities_simple(municipality_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_municipalities_active ON user_municipalities_simple(user_id, municipality_id) WHERE deleted_at IS NULL`);
    console.log('✅ Indexes created\n');

    // Step 2: Get field agents
    console.log('Step 2: Getting field agents...');
    const agents = await client.query(`SELECT id, email, first_name, last_name FROM users WHERE role = 'field_agent' LIMIT 3`);
    console.log(`Found ${agents.rows.length} field agents:`);
    agents.rows.forEach(a => console.log(`  - ${a.email} (${a.id})`));
    console.log('');

    // Step 3: Assign clients to field agents
    console.log('Step 3: Assigning clients to field agents...');
    const clients = await client.query(`SELECT id FROM clients LIMIT 10`);
    console.log(`Assigning ${clients.rows.length} clients to field agents...\n`);

    for (let i = 0; i < clients.rows.length; i++) {
      const client_id = clients.rows[i].id;
      const agent = agents.rows[i % agents.rows.length];
      const agent_id = agent.id;

      await client.query(
        `UPDATE clients SET caravan_id = $1, updated_at = NOW() WHERE id = $2`,
        [agent_id, client_id]
      );
      console.log(`  ✓ Assigned client ${client_id.substring(0, 8)}... to ${agent.email}`);
    }
    console.log('');

    // Step 4: Create test municipality assignments
    console.log('Step 4: Creating test municipality assignments...');
    const municipalities = [
      'Tawi-Tawi-Bongao',
      'Tawi-Tawi-Sitangkai',
      'Tawi-Tawi-Tandubas'
    ];

    for (const agent of agents.rows) {
      for (const municipality of municipalities) {
        try {
          await client.query(
            `INSERT INTO user_municipalities_simple (user_id, municipality_id, assigned_by)
             VALUES ($1, $2, $1)
             ON CONFLICT (user_id, municipality_id) DO NOTHING`,
            [agent.id, municipality]
          );
          console.log(`  ✓ Assigned ${municipality} to ${agent.email}`);
        } catch (e) {
          console.log(`  ✗ Skipped ${municipality} for ${agent.email}: ${e.message}`);
        }
      }
    }
    console.log('');

    // Step 5: Verify results
    console.log('=== VERIFICATION ===');
    const clientCount = await client.query(`SELECT COUNT(*) as count FROM clients WHERE caravan_id IS NOT NULL`);
    console.log(`Clients with caravan_id: ${clientCount.rows[0].count}`);

    const munCount = await client.query(`SELECT COUNT(*) as count FROM user_municipalities_simple WHERE deleted_at IS NULL`);
    console.log(`Municipality assignments: ${munCount.rows[0].count}`);

    const sampleClients = await client.query(`
      SELECT c.id, c.first_name, c.last_name, c.caravan_id, u.email as caravan_email
      FROM clients c
      LEFT JOIN users u ON c.caravan_id = u.id
      LIMIT 5
    `);
    console.log('\nSample clients with assignments:');
    sampleClients.rows.forEach(c => {
      console.log(`  - ${c.first_name} ${c.last_name} → ${c.caravan_email || 'Unassigned'}`);
    });

    console.log('\n✅ All fixes applied successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
})();
