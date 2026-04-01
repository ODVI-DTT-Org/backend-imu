/**
 * PSGC (Philippine Standard Geographic Code) Routes
 * Provides geographic data lookup from the psgc table
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
const psgc = new Hono();
// ============================================
// REGIONS
// ============================================
// GET /api/psgc/regions - List all regions
psgc.get('/regions', authMiddleware, async (c) => {
    try {
        const result = await pool.query(`
      SELECT DISTINCT region as id, region as name
      FROM psgc
      ORDER BY region
    `);
        return c.json({
            items: result.rows.map(row => ({
                id: row.id,
                name: row.name,
            })),
        });
    }
    catch (error) {
        console.error('Fetch regions error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// PROVINCES
// ============================================
// GET /api/psgc/provinces - List all provinces (optionally filter by region)
psgc.get('/provinces', authMiddleware, async (c) => {
    try {
        const region = c.req.query('region');
        let query = `
      SELECT DISTINCT province as id, region, province as name
      FROM psgc
    `;
        const params = [];
        if (region) {
            query += ' WHERE region = $1';
            params.push(region);
        }
        query += ' ORDER BY region, province';
        const result = await pool.query(query, params);
        return c.json({
            items: result.rows.map(row => ({
                id: row.id,
                region: row.region,
                name: row.name,
            })),
        });
    }
    catch (error) {
        console.error('Fetch provinces error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// MUNICIPALITIES / CITIES
// ============================================
// GET /api/psgc/municipalities - List municipalities/cities (optionally filter)
psgc.get('/municipalities', authMiddleware, async (c) => {
    try {
        const region = c.req.query('region');
        const province = c.req.query('province');
        let query = `
      SELECT DISTINCT
        TRIM(province) || '-' || TRIM(mun_city) as id,
        region,
        province,
        mun_city as name,
        mun_city_kind as kind,
        CASE WHEN mun_city_kind ILIKE '%city%' THEN true ELSE false END as is_city
      FROM psgc
    `;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (region) {
            conditions.push(`region = $${paramIndex}`);
            params.push(region);
            paramIndex++;
        }
        if (province) {
            conditions.push(`province = $${paramIndex}`);
            params.push(province);
            paramIndex++;
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY region, province, mun_city';
        const result = await pool.query(query, params);
        return c.json({
            items: result.rows.map(row => ({
                id: row.id,
                region: row.region,
                province: row.province,
                name: row.name,
                kind: row.kind,
                isCity: row.is_city,
            })),
        });
    }
    catch (error) {
        console.error('Fetch municipalities error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// BARANGAYS
// ============================================
// GET /api/psgc/barangays - List barangays (with filtering and pagination)
psgc.get('/barangays', authMiddleware, async (c) => {
    try {
        const region = c.req.query('region');
        const province = c.req.query('province');
        const municipality = c.req.query('municipality');
        const search = c.req.query('search');
        const page = parseInt(c.req.query('page') || '1');
        const perPage = parseInt(c.req.query('perPage') || '100');
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (region) {
            conditions.push(`region = $${paramIndex}`);
            params.push(region);
            paramIndex++;
        }
        if (province) {
            conditions.push(`province = $${paramIndex}`);
            params.push(province);
            paramIndex++;
        }
        if (municipality) {
            conditions.push(`mun_city = $${paramIndex}`);
            params.push(municipality);
            paramIndex++;
        }
        if (search) {
            conditions.push(`barangay ILIKE $${paramIndex}`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        // Get total count
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM psgc ${whereClause}`, params);
        const totalItems = parseInt(countResult.rows[0].count);
        // Get paginated results
        const offset = (page - 1) * perPage;
        const result = await pool.query(`SELECT
        id,
        region,
        province,
        mun_city as municipality,
        barangay,
        pin_location,
        zip_code
       FROM psgc
       ${whereClause}
       ORDER BY region, province, mun_city, barangay
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, perPage, offset]);
        return c.json({
            items: result.rows.map(row => ({
                id: row.id,
                region: row.region,
                province: row.province,
                municipality: row.municipality,
                barangay: row.barangay,
                pinLocation: row.pin_location,
                zipCode: row.zip_code,
            })),
            page,
            perPage,
            totalItems,
            totalPages: Math.ceil(totalItems / perPage),
        });
    }
    catch (error) {
        console.error('Fetch barangays error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// SEARCH - Unified search across all levels
// ============================================
// GET /api/psgc/search - Search across regions, provinces, municipalities, barangays
psgc.get('/search', authMiddleware, async (c) => {
    try {
        const q = c.req.query('q');
        const level = c.req.query('level') || 'all'; // all, region, province, municipality, barangay
        const limit = parseInt(c.req.query('limit') || '20');
        if (!q || q.length < 2) {
            return c.json({ items: [] });
        }
        const searchPattern = `%${q}%`;
        const results = [];
        // Search regions
        if (level === 'all' || level === 'region') {
            const regionResult = await pool.query(`
        SELECT DISTINCT region as name
        FROM psgc
        WHERE region ILIKE $1
        ORDER BY region
        LIMIT $2
      `, [searchPattern, limit]);
            results.push(...regionResult.rows.map(r => ({
                type: 'region',
                id: r.name,
                name: r.name,
                label: r.name,
            })));
        }
        // Search provinces
        if (level === 'all' || level === 'province') {
            const provinceResult = await pool.query(`
        SELECT DISTINCT province, region
        FROM psgc
        WHERE province ILIKE $1
        ORDER BY province
        LIMIT $2
      `, [searchPattern, limit]);
            results.push(...provinceResult.rows.map(r => ({
                type: 'province',
                id: r.province,
                name: r.province,
                region: r.region,
                label: `${r.province} (${r.region})`,
            })));
        }
        // Search municipalities
        if (level === 'all' || level === 'municipality') {
            const munResult = await pool.query(`
        SELECT DISTINCT mun_city, province, region, mun_city_kind
        FROM psgc
        WHERE mun_city ILIKE $1
        ORDER BY mun_city
        LIMIT $2
      `, [searchPattern, limit]);
            results.push(...munResult.rows.map(r => ({
                type: 'municipality',
                id: `${r.province.trim()}-${r.mun_city.trim()}`,
                name: r.mun_city,
                province: r.province,
                region: r.region,
                kind: r.mun_city_kind,
                label: `${r.mun_city}, ${r.province}`,
            })));
        }
        // Search barangays
        if (level === 'all' || level === 'barangay') {
            const brgyResult = await pool.query(`
        SELECT id, barangay, mun_city, province, region, zip_code
        FROM psgc
        WHERE barangay ILIKE $1
        ORDER BY barangay
        LIMIT $2
      `, [searchPattern, limit]);
            results.push(...brgyResult.rows.map(r => ({
                type: 'barangay',
                id: r.id,
                name: r.barangay,
                municipality: r.mun_city,
                province: r.province,
                region: r.region,
                zipCode: r.zip_code,
                label: `${r.barangay}, ${r.mun_city}, ${r.province}`,
            })));
        }
        return c.json({
            items: results.slice(0, limit),
            query: q,
        });
    }
    catch (error) {
        console.error('Search PSGC error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// SINGLE ITEM LOOKUP
// ============================================
// GET /api/psgc/barangays/:id - Get single barangay by ID
psgc.get('/barangays/:id', authMiddleware, async (c) => {
    try {
        const id = c.req.param('id');
        const result = await pool.query(`
      SELECT
        id,
        region,
        province,
        mun_city as municipality,
        barangay,
        pin_location,
        zip_code
      FROM psgc
      WHERE id = $1
    `, [id]);
        if (result.rows.length === 0) {
            return c.json({ message: 'Barangay not found' }, 404);
        }
        const row = result.rows[0];
        return c.json({
            id: row.id,
            region: row.region,
            province: row.province,
            municipality: row.municipality,
            barangay: row.barangay,
            pinLocation: row.pin_location,
            zipCode: row.zip_code,
            fullAddress: `${row.barangay}, ${row.municipality}, ${row.province}, ${row.region}`,
        });
    }
    catch (error) {
        console.error('Fetch barangay error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// HIERARCHY - Get full location hierarchy
// ============================================
// GET /api/psgc/hierarchy - Get full hierarchy (regions -> provinces -> municipalities)
psgc.get('/hierarchy', authMiddleware, async (c) => {
    try {
        const regionFilter = c.req.query('region');
        const provinceFilter = c.req.query('province');
        const municipalityFilter = c.req.query('municipality');
        // Get regions
        const regionsResult = await pool.query(`
      SELECT DISTINCT region as id, region as name
      FROM psgc
      ${regionFilter ? 'WHERE region = $1' : ''}
      ORDER BY region
    `, regionFilter ? [regionFilter] : []);
        const hierarchy = [];
        for (const regionRow of regionsResult.rows) {
            const regionData = {
                id: regionRow.id,
                name: regionRow.name,
                provinces: [],
            };
            // Get provinces for this region
            const provincesResult = await pool.query(`
        SELECT DISTINCT province as id, province as name
        FROM psgc
        WHERE region = $1
        ${provinceFilter ? 'AND province = $2' : ''}
        ORDER BY province
      `, provinceFilter ? [regionRow.id, provinceFilter] : [regionRow.id]);
            for (const provinceRow of provincesResult.rows) {
                const provinceData = {
                    id: provinceRow.id,
                    name: provinceRow.name,
                    municipalities: [],
                };
                // Get municipalities for this province
                const munsResult = await pool.query(`
          SELECT DISTINCT
            TRIM(province) || '-' || TRIM(mun_city) as id,
            mun_city as name,
            mun_city_kind as kind
          FROM psgc
          WHERE region = $1 AND province = $2
          ${municipalityFilter ? 'AND mun_city = $3' : ''}
          ORDER BY mun_city
        `, municipalityFilter ? [regionRow.id, provinceRow.id, municipalityFilter] : [regionRow.id, provinceRow.id]);
                provinceData.municipalities = munsResult.rows.map(munRow => ({
                    id: munRow.id,
                    name: munRow.name,
                    kind: munRow.kind,
                }));
                regionData.provinces.push(provinceData);
            }
            hierarchy.push(regionData);
        }
        return c.json({ hierarchy });
    }
    catch (error) {
        console.error('Fetch hierarchy error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// ============================================
// USER ASSIGNMENTS
// ============================================
// GET /api/psgc/user/:userId/assignments - Get PSGC assignments for a user
psgc.get('/user/:userId/assignments', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const result = await pool.query(`
      SELECT
        upa.id as assignment_id,
        upa.assigned_at,
        upa.assigned_by,
        p.id,
        p.region,
        p.province,
        p.mun_city as municipality,
        p.barangay,
        p.zip_code,
        p.pin_location
      FROM user_psgc_assignments upa
      JOIN psgc p ON p.id = upa.psgc_id
      WHERE upa.user_id = $1 AND upa.deleted_at IS NULL
      ORDER BY p.region, p.province, p.mun_city, p.barangay
    `, [userId]);
        return c.json({
            items: result.rows.map(row => ({
                assignmentId: row.assignment_id,
                assignedAt: row.assigned_at,
                assignedBy: row.assigned_by,
                psgc: {
                    id: row.id,
                    region: row.region,
                    province: row.province,
                    municipality: row.municipality,
                    barangay: row.barangay,
                    zipCode: row.zip_code,
                    pinLocation: row.pin_location,
                },
            })),
        });
    }
    catch (error) {
        console.error('Fetch user assignments error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/psgc/user/:userId/assignments - Assign PSGC locations to a user
psgc.post('/user/:userId/assignments', authMiddleware, async (c) => {
    try {
        const currentUser = c.get('user');
        const userId = c.req.param('userId');
        const body = await c.req.json();
        const psgcIds = body.psgc_ids;
        if (!Array.isArray(psgcIds) || psgcIds.length === 0) {
            return c.json({ message: 'psgc_ids array is required' }, 400);
        }
        // Verify user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return c.json({ message: 'User not found' }, 404);
        }
        // Verify all PSGC IDs exist
        const psgcCheck = await pool.query('SELECT id FROM psgc WHERE id = ANY($1)', [psgcIds]);
        if (psgcCheck.rows.length !== psgcIds.length) {
            return c.json({ message: 'One or more PSGC IDs not found' }, 400);
        }
        let assigned = 0;
        for (const psgcId of psgcIds) {
            // Check if assignment exists (including soft-deleted)
            const existing = await pool.query('SELECT id, deleted_at FROM user_psgc_assignments WHERE user_id = $1 AND psgc_id = $2', [userId, psgcId]);
            if (existing.rows.length > 0) {
                // Re-activate if soft-deleted
                if (existing.rows[0].deleted_at) {
                    await pool.query('UPDATE user_psgc_assignments SET deleted_at = NULL, assigned_at = NOW(), assigned_by = $1 WHERE id = $2', [currentUser.sub, existing.rows[0].id]);
                    assigned++;
                }
            }
            else {
                // Create new assignment
                await pool.query('INSERT INTO user_psgc_assignments (id, user_id, psgc_id, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, NOW(), $3)', [userId, psgcId, currentUser.sub]);
                assigned++;
            }
        }
        return c.json({
            message: 'PSGC locations assigned successfully',
            assigned_count: assigned,
        });
    }
    catch (error) {
        console.error('Assign PSGC error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// DELETE /api/psgc/user/:userId/assignments/:psgcId - Unassign PSGC location (soft delete)
psgc.delete('/user/:userId/assignments/:psgcId', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const psgcId = c.req.param('psgcId');
        const existing = await pool.query('SELECT id FROM user_psgc_assignments WHERE user_id = $1 AND psgc_id = $2 AND deleted_at IS NULL', [userId, psgcId]);
        if (existing.rows.length === 0) {
            return c.json({ message: 'Assignment not found' }, 404);
        }
        // Soft delete
        await pool.query('UPDATE user_psgc_assignments SET deleted_at = NOW() WHERE id = $1', [existing.rows[0].id]);
        return c.json({ message: 'Assignment removed successfully' });
    }
    catch (error) {
        console.error('Unassign PSGC error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
export default psgc;
