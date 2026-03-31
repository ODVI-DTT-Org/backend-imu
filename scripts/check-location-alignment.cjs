const { Pool } = require('pg');
require('dotenv/config');

(async () => {
  const client = await (new Pool({ connectionString: process.env.DATABASE_URL })).connect();
  try {
    console.log('=== CHECKING LOCATION FIELD ALIGNMENT ===\n');

    // 1. Check clients table location columns
    console.log('1. CLIENTS Table Location Columns:');
    const clientColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'clients'
      AND column_name IN ('region', 'province', 'municipality', 'barangay', 'psgc_id')
      ORDER BY ordinal_position
    `);
    clientColumns.rows.forEach(r => console.log('  -', r.column_name + ':', r.data_type));

    // 2. Check PSGC table columns
    console.log('\n2. PSGC Table Columns:');
    const psgcColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'psgc'
      AND column_name IN ('region', 'province', 'mun_city', 'barangay')
      ORDER BY ordinal_position
    `);
    psgcColumns.rows.forEach(r => console.log('  -', r.column_name + ':', r.data_type));

    // 3. Sample data from clients
    console.log('\n3. Sample CLIENT Data (location fields):');
    const clientSample = await client.query(`
      SELECT region, province, municipality, barangay, psgc_id
      FROM clients
      WHERE psgc_id IS NOT NULL
      LIMIT 3
    `);
    clientSample.rows.forEach(r => console.log('  -', JSON.stringify(r)));

    // 4. Sample data from PSGC
    console.log('\n4. Sample PSGC Data:');
    const psgcSample = await client.query(`
      SELECT region, province, mun_city, barangay, id
      FROM psgc
      LIMIT 3
    `);
    psgcSample.rows.forEach(r => console.log('  -', JSON.stringify(r)));

    // 5. Check user_locations table
    console.log('\n5. USER_LOCATIONS Table Structure:');
    const userLocColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'user_locations'
      ORDER BY ordinal_position
    `);
    userLocColumns.rows.forEach(r => console.log('  -', r.column_name + ':', r.data_type));

    // 6. Sample user_locations
    console.log('\n6. Sample USER_LOCATIONS Data:');
    const userLocSample = await client.query(`
      SELECT * FROM user_locations
      WHERE deleted_at IS NULL
      LIMIT 2
    `);
    userLocSample.rows.forEach(r => console.log('  -', JSON.stringify(r)));

    // 7. Check for alignment issues
    console.log('\n7. CHECKING ALIGNMENT ISSUES:');

    // Check if clients.province matches any PSGC.province
    const provinceCheck = await client.query(`
      SELECT DISTINCT c.province as client_province, p.province as psgc_province
      FROM clients c
      LEFT JOIN psgc p ON c.province = p.province
      WHERE c.province IS NOT NULL
      LIMIT 10
    `);
    console.log('   Province matching:');
    provinceCheck.rows.forEach(r => {
      const match = r.psgc_province ? '✓' : '✗';
      console.log('     ', match, r.client_province, '->', r.psgc_province || 'NO MATCH');
    });

    // Check if clients.municipality matches PSGC.mun_city
    const munCheck = await client.query(`
      SELECT DISTINCT c.municipality as client_mun, p.mun_city as psgc_mun
      FROM clients c
      LEFT JOIN psgc p ON LOWER(c.municipality) = LOWER(p.mun_city)
      WHERE c.municipality IS NOT NULL
      LIMIT 10
    `);
    console.log('\n   Municipality matching:');
    munCheck.rows.forEach(r => {
      const match = r.psgc_mun ? '✓' : '✗';
      console.log('     ', match, r.client_mun, '->', r.psgc_mun || 'NO MATCH');
    });

    // 8. Check PSGC_ID alignment
    console.log('\n8. PSGC_ID Alignment Check:');
    const psgcIdCheck = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN psgc_id IS NOT NULL THEN 1 END) as with_psgc_id
      FROM clients
    `);
    console.log('   Total clients:', psgcIdCheck.rows[0].total);
    console.log('   With PSGC_ID:', psgcIdCheck.rows[0].with_psgc_id);
    console.log('   Missing PSGC_ID:', psgcIdCheck.rows[0].total - psgcIdCheck.rows[0].with_psgc_id);

    // 9. Check user_locations vs PSGC alignment
    console.log('\n9. USER_LOCATIONS vs PSGC Alignment:');
    const userLocCheck = await client.query(`
      SELECT ul.municipality_id, p.mun_city, p.province
      FROM user_locations ul
      LEFT JOIN psgc p ON ul.municipality_id = p.id
      WHERE ul.deleted_at IS NULL
      LIMIT 5
    `);
    userLocCheck.rows.forEach(r => {
      const match = r.mun_city ? '✓' : '✗';
      console.log('   ', match, 'municipality_id:', r.municipality_id, '->', r.mun_city || 'NO MATCH', 'in', r.province || 'UNKNOWN');
    });

  } finally {
    client.release();
    process.exit(0);
  }
})();
