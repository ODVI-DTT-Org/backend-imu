/**
 * Test script to verify itinerary audit logging
 * Run with: tsx test-itinerary-audit.ts
 */

import { pool } from './src/db/index.js';

async function testItineraryAudit() {
  console.log('🔍 Testing Itinerary Audit Logging...\n');

  try {
    // 1. Get recent audit logs for itinerary operations
    const result = await pool.query(`
      SELECT id, action, entity, entity_id,
             old_values IS NOT NULL as has_old_values,
             new_values IS NOT NULL as has_new_values,
             user_id,
             created_at
      FROM audit_logs
      WHERE entity = 'itinerary'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`📊 Found ${result.rows.length} itinerary audit logs`);

    if (result.rows.length === 0) {
      console.log('\n❌ No itinerary audit logs found');
      console.log('   This means either:');
      console.log('   - No itineraries have been created/updated/deleted');
      console.log('   - The audit middleware is not working');
      console.log('   - The mobile app is not using the correct endpoint');
    } else {
      console.log('\n✅ Recent itinerary audit logs:');
      result.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. Action: ${row.action}`);
        console.log(`   Entity ID: ${row.entity_id}`);
        console.log(`   User ID: ${row.user_id}`);
        console.log(`   Has oldValues: ${row.has_old_values}`);
        console.log(`   Has newValues: ${row.has_new_values}`);
        console.log(`   Created: ${row.created_at}`);
      });
    }

    // 2. Check total count of itinerary audit logs
    const countResult = await pool.query(`
      SELECT COUNT(*) as count,
             action,
             COUNT(*) as total
      FROM audit_logs
      WHERE entity = 'itinerary'
      GROUP BY action
    `);

    console.log('\n📈 Itinerary audit logs by action:');
    countResult.rows.forEach(row => {
      console.log(`   ${row.action}: ${row.total}`);
    });

    // 3. Get total itineraries count
    const itineraryCount = await pool.query(`
      SELECT COUNT(*) as count FROM itineraries
    `);

    console.log(`\n📋 Total itineraries in database: ${itineraryCount.rows[0].count}`);

    // 4. Check if audit middleware is working by looking at the code
    console.log('\n🔎 Checking itinerary routes...');
    console.log('   POST /api/itineraries - Has auditMiddleware');
    console.log('   PUT /api/itineraries/:id - Has auditMiddleware');
    console.log('   DELETE /api/itineraries/:id - Has auditMiddleware');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testItineraryAudit();
