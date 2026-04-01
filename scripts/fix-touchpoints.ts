/**
 * Clean up touchpoint data to follow the golden rule
 * Removes duplicates and out-of-sequence touchpoints
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixTouchpoints() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔧 Cleaning touchpoint data...\n');

    // Get all clients with their touchpoints
    const clientsResult = await client.query(`
      SELECT c.id, c.first_name, c.last_name
      FROM clients c
      ORDER BY c.first_name, c.last_name
    `);

    let totalDeleted = 0;

    for (const clientRow of clientsResult.rows) {
      const clientId = clientRow.id;
      const clientName = `${clientRow.first_name} ${clientRow.last_name}`;

      // Get all touchpoints for this client
      const touchpointsResult = await client.query(`
        SELECT id, touchpoint_number, type, created_at
        FROM touchpoints
        WHERE client_id = $1
        ORDER BY touchpoint_number, created_at
      `, [clientId]);

      const touchpoints = touchpointsResult.rows;
      const existingNumbers = touchpoints.map(t => t.touchpoint_number);

      // Check for duplicates
      const duplicates = new Set<number>();
      const seen = new Set<number>();
      for (const tp of touchpoints) {
        if (seen.has(tp.touchpoint_number)) {
          duplicates.add(tp.touchpoint_number);
        }
        seen.add(tp.touchpoint_number);
      }

      if (duplicates.size > 0) {
        console.log(`  Found duplicates for ${clientName}: ${Array.from(duplicates).join(', ')}`);

        // Delete duplicates (keep the oldest one)
        for (const dupNum of duplicates) {
          const dupTouchpoints = touchpoints.filter(t => t.touchpoint_number === dupNum);
          // Sort by created_at, keep the first (oldest), delete the rest
          dupTouchpoints.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          for (let i = 1; i < dupTouchpoints.length; i++) {
            await client.query('DELETE FROM touchpoints WHERE id = $1', [dupTouchpoints[i].id]);
            totalDeleted++;
            console.log(`    Deleted duplicate TP${dupNum}`);
          }
        }
      }

      // Check for out-of-sequence touchpoints
      // The golden rule: 1→2→3→4→5→6→7
      // Remove any touchpoint that doesn't follow the sequence
      const validSequence = [1, 2, 3, 4, 5, 6, 7];
      const toDelete: string[] = [];

      // Get updated touchpoints after removing duplicates
      const updatedResult = await client.query(`
        SELECT id, touchpoint_number, type
        FROM touchpoints
        WHERE client_id = $1
        ORDER BY touchpoint_number
      `, [clientId]);

      const updatedTouchpoints = updatedResult.rows;
      const updatedNumbers = updatedTouchpoints.map(t => t.touchpoint_number);

      // Find the highest valid touchpoint number
      let highestValid = 0;
      for (const num of updatedNumbers.sort((a, b) => a - b)) {
        if (num === highestValid + 1) {
          highestValid = num;
        } else {
          // This touchpoint is out of sequence
          const tp = updatedTouchpoints.find(t => t.touchpoint_number === num);
          if (tp) {
            toDelete.push(tp.id);
            console.log(`    Marking out-of-sequence TP${num} for deletion`);
          }
        }
      }

      // Delete out-of-sequence touchpoints
      for (const id of toDelete) {
        await client.query('DELETE FROM touchpoints WHERE id = $1', [id]);
        totalDeleted++;
      }

      // Special case: if client has TP3, TP5, TP6 but no TP1, TP2, TP4
      // Remove everything and start fresh (they can't reach TP3 without TP1 and TP2)
      const currentResult = await client.query(`
        SELECT touchpoint_number
        FROM touchpoints
        WHERE client_id = $1
        ORDER BY touchpoint_number
      `, [clientId]);

      const currentNumbers = currentResult.rows.map(r => r.touchpoint_number);

      // Check if the sequence is broken (gaps that shouldn't exist)
      if (currentNumbers.length > 0) {
        const minNum = Math.min(...currentNumbers);
        const maxNum = Math.max(...currentNumbers);

        // If we have TP3 but no TP1 or TP2, remove everything
        if (currentNumbers.includes(3) && (!currentNumbers.includes(1) || !currentNumbers.includes(2))) {
          console.log(`  ${clientName}: Has TP3 but missing TP1/TP2 - removing all touchpoints`);
          await client.query('DELETE FROM touchpoints WHERE client_id = $1', [clientId]);
          totalDeleted += currentNumbers.length;
        }
        // If we have TP5 or TP6 but no TP4, remove TP5 and TP6
        else if ((currentNumbers.includes(5) || currentNumbers.includes(6)) && !currentNumbers.includes(4)) {
          console.log(`  ${clientName}: Has TP5/TP6 but no TP4 - removing TP5 and TP6`);
          await client.query('DELETE FROM touchpoints WHERE client_id = $1 AND touchpoint_number IN (5, 6)', [clientId]);
          const deleted = currentNumbers.filter(n => n === 5 || n === 6).length;
          totalDeleted += deleted;
        }
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ Cleanup completed! Total touchpoints deleted: ${totalDeleted}`);

    // Show final status
    console.log('\n📊 Final client status:');
    const finalResult = await pool.query(`
      SELECT
        c.first_name,
        c.last_name,
        COUNT(t.id) as touchpoint_count,
        ARRAY_AGG(t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      GROUP BY c.id, c.first_name, c.last_name
      ORDER BY c.first_name, c.last_name
    `);

    console.table(finalResult.rows.map(row => ({
      name: `${row.first_name} ${row.last_name}`,
      count: row.touchpoint_count,
      touchpoints: row.touchpoints || []
    })));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixTouchpoints();
