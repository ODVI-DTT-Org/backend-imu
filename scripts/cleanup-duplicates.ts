/**
 * Script to clean up duplicate user_locations entries
 * Run with: pnpm tsx scripts/cleanup-duplicates.ts
 */

import { pool } from '../src/db/index.js';

async function cleanupDuplicates() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔍 Finding duplicates...');

    // First, let's see how many duplicates we have
    const duplicateCheck = await client.query(`
      SELECT COUNT(*) as total,
        COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
      FROM user_locations
      WHERE deleted_at IS NULL
    `);

    const { total, unique_combos } = duplicateCheck.rows[0];
    const duplicateCount = parseInt(total) - parseInt(unique_combos);

    console.log(`📊 Stats: ${total} total assignments, ${unique_combos} unique, ${duplicateCount} duplicates`);

    if (duplicateCount === 0) {
      console.log('✅ No duplicates found!');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`🧹 Cleaning up ${duplicateCount} duplicate entries...`);

    // Delete duplicates, keeping only the earliest assignment for each user-municipality pair
    const deleteResult = await client.query(`
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

    console.log(`✅ Deleted ${deleteResult.rowCount} duplicate entries`);

    // Verify cleanup
    const verifyResult = await client.query(`
      SELECT COUNT(*) as total,
        COUNT(DISTINCT user_id || '-' || municipality_id) as unique_combos
      FROM user_locations
      WHERE deleted_at IS NULL
    `);

    console.log(`📊 After cleanup: ${verifyResult.rows[0].total} total, ${verifyResult.rows[0].unique_combos} unique`);

    // Add unique constraint to prevent future duplicates
    console.log('🔒 Adding unique constraint...');

    try {
      await client.query(`
        ALTER TABLE user_locations
        ADD CONSTRAINT user_locations_user_municipality_unique
        UNIQUE (user_id, municipality_id)
        DEFERRABLE INITIALLY DEFERRED
      `);
      console.log('✅ Unique constraint added successfully');
    } catch (err: any) {
      if (err.code === '23505') { // unique_violation
        console.log('⚠️  Cannot add constraint - duplicates still exist');
        console.log('🔄 Please run this script again');
      } else {
        throw err;
      }
    }

    await client.query('COMMIT');
    console.log('✅ Cleanup completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    client.release();
  }
}

cleanupDuplicates()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
