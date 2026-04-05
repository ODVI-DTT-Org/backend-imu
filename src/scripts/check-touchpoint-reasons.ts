import { pool } from '../db/index.js';

async function checkTouchpointReasons() {
  try {
    console.log('Checking touchpoint_reasons table...\n');

    // Check all touchpoint reasons
    const allReasons = await pool.query('SELECT * FROM touchpoint_reasons ORDER BY role, touchpoint_type, category, sort_order');
    console.log(`Total touchpoint reasons: ${allReasons.rows.length}`);

    // Check Tele Call reasons
    const teleCallReasons = await pool.query(
      `SELECT * FROM touchpoint_reasons
       WHERE role = 'tele' AND touchpoint_type = 'Call' AND is_active = true
       ORDER BY category, sort_order`
    );
    console.log(`\nTele Call reasons: ${teleCallReasons.rows.length}`);

    if (teleCallReasons.rows.length > 0) {
      console.log('\nTele Call reasons by category:');
      const grouped: Record<string, any[]> = {};
      teleCallReasons.rows.forEach(row => {
        const category = row.category || 'Other';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(row);
      });

      Object.entries(grouped).forEach(([category, reasons]) => {
        console.log(`\n${category}:`);
        reasons.forEach(r => {
          console.log(`  - ${r.reason_code}: ${r.label}`);
        });
      });
    } else {
      console.log('\n⚠️  WARNING: No Tele Call reasons found in database!');
      console.log('The dropdown will be empty because there are no touchpoint reasons for Tele role.');
    }

    // Check Caravan Visit reasons
    const caravanVisitReasons = await pool.query(
      `SELECT * FROM touchpoint_reasons
       WHERE role = 'caravan' AND touchpoint_type = 'Visit' AND is_active = true
       ORDER BY category, sort_order`
    );
    console.log(`\nCaravan Visit reasons: ${caravanVisitReasons.rows.length}`);

    await pool.end();
  } catch (error) {
    console.error('Error checking touchpoint reasons:', error);
    process.exit(1);
  }
}

checkTouchpointReasons();
