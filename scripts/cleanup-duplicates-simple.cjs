/**
 * Simple SQL script to clean up duplicates
 * Run with: node -e "require('./scripts/cleanup-duplicates-simple.js')"
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false
});

async function cleanup() {
  console.log('🔍 Checking for duplicates...');

  // Check current state
  const beforeResult = await pool.query(`
    SELECT COUNT(*) as total,
      COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
    FROM user_locations
    WHERE deleted_at IS NULL
  `);

  console.log(`📊 BEFORE: ${beforeResult.rows[0].total} total, ${beforeResult.rows[0].unique_combos} unique`);
  console.log(`🧹 Duplicates to remove: ${beforeResult.rows[0].total - beforeResult.rows[0].unique_combos}`);

  // Delete duplicates in batches
  console.log('🗑️  Deleting duplicates...');
  const deleteResult = await pool.query(`
    DELETE FROM user_locations
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, municipality_id
            ORDER BY assigned_at ASC
          ) as row_num
        FROM user_locations
        WHERE deleted_at IS NULL
      ) sub
      WHERE row_num > 1
    )
  `);

  console.log(`✅ Deleted ${deleteResult.rowCount} duplicate records`);

  // Check after cleanup
  const afterResult = await pool.query(`
    SELECT COUNT(*) as total,
      COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
    FROM user_locations
    WHERE deleted_at IS NULL
  `);

  console.log(`📊 AFTER: ${afterResult.rows[0].total} total, ${afterResult.rows[0].unique_combos} unique`);

  // Try to add unique constraint
  console.log('🔒 Adding unique constraint...');
  try {
    await pool.query(`
      ALTER TABLE user_locations
      ADD CONSTRAINT user_locations_user_municipality_unique
      UNIQUE (user_id, municipality_id)
    `);
    console.log('✅ Unique constraint added successfully');
  } catch (err) {
    if (err.code === '23505') {
      console.log('⚠️  Could not add constraint - duplicates still exist');
    } else if (err.code === '42710') {
      console.log('✅ Constraint already exists');
    } else {
      console.log('⚠️  Constraint error:', err.message);
    }
  }

  await pool.end();
  console.log('✨ Cleanup complete!');
}

cleanup().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
