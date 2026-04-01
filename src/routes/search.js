import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
const search = new Hono();
// Search validation schema
const fullTextSearchSchema = z.object({
    entity: z.enum(['clients', 'touchpoints', 'users']),
    query: z.string().min(1),
    filters: z.object({
        client_type: z.array(z.string()).optional(),
        market_type: z.array(z.string()).optional(),
        region: z.array(z.string()).optional(),
        province: z.array(z.string()).optional(),
        municipality: z.array(z.string()).optional(),
    }).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
});
// POST /api/search/full-text - Full-text search across entities
search.post('/full-text', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const body = await c.req.json();
        const validated = fullTextSearchSchema.parse(body);
        const { entity, query, filters = {}, limit = 20, offset = 0 } = validated;
        let results = [];
        let total = 0;
        switch (entity) {
            case 'clients':
                // Build search query for clients
                {
                    const conditions = [];
                    const params = [];
                    let paramIndex = 1;
                    // Full-text search on name fields
                    conditions.push(`(
            first_name ILIKE $${paramIndex} OR
            last_name ILIKE $${paramIndex} OR
            CONCAT(first_name, ' ', last_name) ILIKE $${paramIndex} OR
            email ILIKE $${paramIndex} OR
            phone ILIKE $${paramIndex}
          )`);
                    params.push(`%${query}%`);
                    paramIndex++;
                    // Apply filters
                    if (filters.client_type?.length) {
                        conditions.push(`client_type = ANY($${paramIndex})`);
                        params.push(filters.client_type);
                        paramIndex++;
                    }
                    if (filters.market_type?.length) {
                        conditions.push(`market_type = ANY($${paramIndex})`);
                        params.push(filters.market_type);
                        paramIndex++;
                    }
                    if (filters.region?.length) {
                        conditions.push(`region = ANY($${paramIndex})`);
                        params.push(filters.region);
                        paramIndex++;
                    }
                    if (filters.province?.length) {
                        conditions.push(`province = ANY($${paramIndex})`);
                        params.push(filters.province);
                        paramIndex++;
                    }
                    if (filters.municipality?.length) {
                        conditions.push(`municipality = ANY($${paramIndex})`);
                        params.push(filters.municipality);
                        paramIndex++;
                    }
                    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
                    // Get total count
                    const countResult = await pool.query(`SELECT COUNT(*) as count FROM clients ${whereClause}`, params);
                    total = parseInt(countResult.rows[0].count);
                    // Get paginated results
                    const result = await pool.query(`SELECT id, first_name, last_name, email, phone, client_type, market_type,
                    region, province, municipality, is_starred
             FROM clients ${whereClause}
             ORDER BY last_name, first_name
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]);
                    results = result.rows;
                }
                break;
            case 'touchpoints':
                // Build search query for touchpoints
                {
                    const conditions = [];
                    const params = [];
                    let paramIndex = 1;
                    // Role-based filtering
                    if (user.role === 'caravan' || user.role === 'tele') {
                        conditions.push(`t.user_id = $${paramIndex}`);
                        params.push(user.sub);
                        paramIndex++;
                    }
                    // Full-text search on notes and reason
                    conditions.push(`(
            t.notes ILIKE $${paramIndex} OR
            t.reason ILIKE $${paramIndex} OR
            c.first_name ILIKE $${paramIndex} OR
            c.last_name ILIKE $${paramIndex} OR
            CONCAT(c.first_name, ' ', c.last_name) ILIKE $${paramIndex}
          )`);
                    params.push(`%${query}%`);
                    paramIndex++;
                    const whereClause = `WHERE ${conditions.join(' AND ')}`;
                    // Get total count
                    const countResult = await pool.query(`SELECT COUNT(*) as count FROM touchpoints t LEFT JOIN clients c ON t.client_id = c.id ${whereClause}`, params);
                    total = parseInt(countResult.rows[0].count);
                    // Get paginated results
                    const result = await pool.query(`SELECT t.*, c.first_name, c.last_name
             FROM touchpoints t
             LEFT JOIN clients c ON t.client_id = c.id
             ${whereClause}
             ORDER BY t.date DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]);
                    results = result.rows;
                }
                break;
            case 'users':
                // Build search query for users
                {
                    const conditions = [];
                    const params = [];
                    let paramIndex = 1;
                    // Full-text search on name and email
                    conditions.push(`(
            first_name ILIKE $${paramIndex} OR
            last_name ILIKE $${paramIndex} OR
            CONCAT(first_name, ' ', last_name) ILIKE $${paramIndex} OR
            email ILIKE $${paramIndex}
          )`);
                    params.push(`%${query}%`);
                    paramIndex++;
                    const whereClause = `WHERE ${conditions.join(' AND ')}`;
                    // Get total count
                    const countResult = await pool.query(`SELECT COUNT(*) as count FROM users ${whereClause}`, params);
                    total = parseInt(countResult.rows[0].count);
                    // Get paginated results
                    const result = await pool.query(`SELECT id, email, first_name, last_name, role, is_active
             FROM users ${whereClause}
             ORDER BY last_name, first_name
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]);
                    results = result.rows;
                }
                break;
        }
        return c.json({
            results,
            total,
            limit,
            offset,
            hasMore: offset + results.length < total
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Search error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
export default search;
