import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';

const clients = new Hono();

// Validation schemas
const createClientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  middle_name: z.string().optional(),
  birth_date: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional(),
  agency_name: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  employment_status: z.string().optional(),
  payroll_date: z.string().optional(),
  tenure: z.number().optional(),
  client_type: z.enum(['POTENTIAL', 'EXISTING']).default('POTENTIAL'),
  product_type: z.string().optional(),
  market_type: z.string().optional(),
  pension_type: z.string().optional(),
  pan: z.string().optional(),
  facebook_link: z.string().optional(),
  remarks: z.string().optional(),
  agency_id: z.string().uuid().optional().nullable(),
  caravan_id: z.string().uuid().optional().nullable(),
  is_starred: z.boolean().default(false),
  loan_released: z.boolean().optional().default(false),
  loan_released_at: z.string().optional(),
});

const updateClientSchema = createClientSchema.partial();

// Schema for partial updates (PATCH) - allows updating individual fields
const patchClientSchema = z.object({
  loan_released: z.boolean().optional(),
  loan_released_at: z.string().optional(),
}).strict();

const addressSchema = z.object({
  type: z.enum(['home', 'work', 'mailing']),
  street: z.string().optional(),
  barangay: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postal_code: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  is_primary: z.boolean().default(false),
});

const phoneSchema = z.object({
  type: z.enum(['mobile', 'landline']),
  number: z.string().min(1),
  label: z.string().optional(),
  is_primary: z.boolean().default(false),
});

// Helper to map DB row to Client type
function mapRowToClient(row: Record<string, any>) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    middle_name: row.middle_name,
    birth_date: row.birth_date,
    email: row.email,
    phone: row.phone,
    agency_name: row.agency_name,
    department: row.department,
    position: row.position,
    employment_status: row.employment_status,
    payroll_date: row.payroll_date,
    tenure: row.tenure,
    client_type: row.client_type,
    product_type: row.product_type,
    market_type: row.market_type,
    pension_type: row.pension_type,
    pan: row.pan,
    facebook_link: row.facebook_link,
    remarks: row.remarks,
    agency_id: row.agency_id,
    caravan_id: row.caravan_id,
    // PSGC fields
    region: row.psgc_region,
    province: row.psgc_province,
    municipality: row.psgc_municipality || row.municipality,
    barangay: row.psgc_barangay,
    psgc_id: row.psgc_id,
    is_starred: row.is_starred,
    loan_released: row.loan_released || false,
    loan_released_at: row.loan_released_at,
    created: row.created_at,
    updated: row.updated_at,
    expand: row.psgc_id ? {
      psgc: {
        region: row.psgc_region,
        province: row.psgc_province,
        mun_city: row.psgc_municipality,
        barangay: row.psgc_barangay,
      }
    } : undefined,
  };
}

// GET /api/clients - List clients with pagination and filters
clients.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const clientType = c.req.query('client_type');
    const agencyId = c.req.query('agency_id');
    const caravanId = c.req.query('caravan_id');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // NOTE: Business rule - Caravan users can VIEW all clients
    // Touchpoint status controls who can CREATE touchpoints
    // No municipality filtering needed for viewing clients

    if (search) {
      conditions.push(`(c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (clientType && clientType !== 'all') {
      conditions.push(`c.client_type = $${paramIndex}`);
      params.push(clientType);
      paramIndex++;
    }

    if (agencyId) {
      conditions.push(`c.agency_id = $${paramIndex}`);
      params.push(agencyId);
      paramIndex++;
    }

    if (caravanId) {
      // caravan_id filter is deprecated - municipality is now used for location assignments
      // This filter is kept for backwards compatibility but will not return results
      conditions.push(`c.municipality = $${paramIndex}`);
      params.push(caravanId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM clients c ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results with touchpoint status
    const result = await pool.query(
      `SELECT c.*,
        psg.region as psgc_region,
        psg.province as psgc_province,
        psg.mun_city as psgc_municipality,
        psg.barangay as psgc_barangay,
        COALESCE(
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers,
        COALESCE(tp.completed_count, 0) as completed_touchpoints,
        tp.last_touchpoint_type
       FROM clients c
       LEFT JOIN psgc psg ON psg.id = c.psgc_id
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       LEFT JOIN (
         SELECT t.client_id,
           COUNT(DISTINCT t.touchpoint_number)::int as completed_count,
           (SELECT t2.type FROM touchpoints t2 WHERE t2.client_id = t.client_id ORDER BY t2.touchpoint_number DESC LIMIT 1) as last_touchpoint_type
         FROM touchpoints t
         GROUP BY t.client_id
       ) tp ON tp.client_id = c.id
       ${whereClause}
       GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay, tp.completed_count, tp.last_touchpoint_type
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    // Touchpoint sequence: Visit → Call → Call → Visit → Call → Call → Visit
    const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

    const clientsList = result.rows.map(row => {
      const completedCount = parseInt(row.completed_touchpoints) || 0;
      const nextTouchpointNumber = completedCount >= 7 ? null : completedCount + 1;
      const nextTouchpointType = nextTouchpointNumber ? TOUCHPOINT_SEQUENCE[nextTouchpointNumber - 1] : null;
      const loanReleased = row.loan_released || false;

      // Determine if current user can create the next touchpoint
      let canCreateTouchpoint = false;
      let expectedRole = null;

      // IMPORTANT: Cannot create touchpoints if loan is released
      if (loanReleased) {
        canCreateTouchpoint = false;
        expectedRole = null;
      } else if (nextTouchpointNumber) {
        if (user.role === 'caravan') {
          // Caravan: Only Visit types (1, 4, 7)
          canCreateTouchpoint = nextTouchpointType === 'Visit';
          expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
        } else if (user.role === 'tele') {
          // Tele: Only Call types (2, 3, 5, 6)
          canCreateTouchpoint = nextTouchpointType === 'Call';
          expectedRole = canCreateTouchpoint ? 'tele' : 'caravan';
        } else {
          // Admin/Manager: Can create any touchpoint
          canCreateTouchpoint = true;
          expectedRole = nextTouchpointType === 'Visit' ? 'caravan' : 'tele';
        }
      }

      return {
        ...mapRowToClient(row),
        expand: {
          addresses: row.addresses,
          phone_numbers: row.phone_numbers,
        },
        touchpoint_status: {
          completed_touchpoints: completedCount,
          next_touchpoint_number: nextTouchpointNumber,
          next_touchpoint_type: nextTouchpointType,
          can_create_touchpoint: canCreateTouchpoint,
          expected_role: expectedRole,
          is_complete: completedCount >= 7 || loanReleased,
          last_touchpoint_type: row.last_touchpoint_type,
          loan_released: loanReleased,
          loan_released_at: row.loan_released_at,
        },
      };
    });

    return c.json({
      items: clientsList,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch clients error:', error);
    throw new Error();
  }
});

// GET /api/clients/:id - Get single client with full details
clients.get('/:id', authMiddleware, requirePermission('clients', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers,
        COALESCE(
          json_agg(DISTINCT t) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) as touchpoints
       FROM clients c
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       LEFT JOIN touchpoints t ON t.client_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    const client = result.rows[0];

    // NOTE: Business rule - All users can VIEW all clients
    // Touchpoint status controls who can CREATE touchpoints
    // No role-based access check needed for viewing

    // Calculate touchpoint status
    const completedTouchpoints = client.touchpoints ? client.touchpoints.length : 0;
    const nextTouchpointNumber = completedTouchpoints >= 7 ? null : completedTouchpoints + 1;
    const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];
    const nextTouchpointType = nextTouchpointNumber ? TOUCHPOINT_SEQUENCE[nextTouchpointNumber - 1] : null;
    const lastTouchpointType = completedTouchpoints > 0 ? client.touchpoints[completedTouchpoints - 1]?.type : null;
    const loanReleased = client.loan_released || false;

    let canCreateTouchpoint = false;
    let expectedRole = null;

    // IMPORTANT: Cannot create touchpoints if loan is released
    if (loanReleased) {
      canCreateTouchpoint = false;
      expectedRole = null;
    } else if (nextTouchpointNumber) {
      if (user.role === 'caravan') {
        canCreateTouchpoint = nextTouchpointType === 'Visit';
        expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
      } else if (user.role === 'tele') {
        canCreateTouchpoint = nextTouchpointType === 'Call';
        expectedRole = canCreateTouchpoint ? 'tele' : 'caravan';
      } else {
        canCreateTouchpoint = true;
        expectedRole = nextTouchpointType === 'Visit' ? 'caravan' : 'tele';
      }
    }

    return c.json({
      ...mapRowToClient(client),
      expand: {
        addresses: client.addresses,
        phone_numbers: client.phone_numbers,
        touchpoints: client.touchpoints,
      },
      touchpoint_status: {
        completed_touchpoints: completedTouchpoints,
        next_touchpoint_number: nextTouchpointNumber,
        next_touchpoint_type: nextTouchpointType,
        can_create_touchpoint: canCreateTouchpoint,
        expected_role: expectedRole,
        is_complete: completedTouchpoints >= 7 || loanReleased,
        last_touchpoint_type: lastTouchpointType,
        loan_released: loanReleased,
        loan_released_at: client.loan_released_at,
      },
    });
  } catch (error) {
    console.error('Fetch client error:', error);
    throw new Error();
  }
});

// POST /api/clients - Create new client
clients.post('/', authMiddleware, requirePermission('clients', 'create'), auditMiddleware('client'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createClientSchema.parse(body);

    const result = await pool.query(
      `INSERT INTO clients (
        id, first_name, last_name, middle_name, birth_date, email, phone,
        agency_name, department, position, employment_status, payroll_date, tenure,
        client_type, product_type, market_type, pension_type, pan, facebook_link, remarks,
        agency_id, caravan_id, is_starred
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *`,
      [
        validated.first_name, validated.last_name, validated.middle_name, validated.birth_date,
        validated.email, validated.phone, validated.agency_name, validated.department,
        validated.position, validated.employment_status, validated.payroll_date, validated.tenure,
        validated.client_type, validated.product_type, validated.market_type, validated.pension_type,
        validated.pan, validated.facebook_link, validated.remarks, validated.agency_id,
        validated.caravan_id, validated.is_starred
      ]
    );

    return c.json(mapRowToClient(result.rows[0]), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create client error:', error);
    throw new Error();
  }
});

// PUT /api/clients/:id - Update client
clients.put('/:id', authMiddleware, requirePermission('clients', 'update'), auditMiddleware('client'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateClientSchema.parse(body);

    // Check if client exists
    const existingResult = await client.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Client');
    }

    const existingClient = existingResult.rows[0];

    // For Tele and Caravan users, create approval request instead of updating directly
    if (user.role === 'tele' || user.role === 'caravan') {
      // Store changes as JSON in notes field
      const changes = JSON.stringify(validated);

      // Create approval request
      const approvalResult = await client.query(
        `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        ['client', id, user.sub, user.role, 'Client Edit Request', changes]
      );

      await client.query('COMMIT');

      return c.json({
        message: 'Client edit submitted for approval',
        approval: mapRowToApproval(approvalResult.rows[0]),
        requires_approval: true
      });
    }

    // For Admin users, update directly
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      first_name: 'first_name',
      last_name: 'last_name',
      middle_name: 'middle_name',
      birth_date: 'birth_date',
      email: 'email',
      phone: 'phone',
      agency_name: 'agency_name',
      department: 'department',
      position: 'position',
      employment_status: 'employment_status',
      payroll_date: 'payroll_date',
      tenure: 'tenure',
      client_type: 'client_type',
      product_type: 'product_type',
      market_type: 'market_type',
      pension_type: 'pension_type',
      pan: 'pan',
      facebook_link: 'facebook_link',
      remarks: 'remarks',
      agency_id: 'agency_id',
      caravan_id: 'caravan_id',
      region: 'region',
      province: 'province',
      municipality: 'municipality',
      barangay: 'barangay',
      is_starred: 'is_starred',
      loan_released: 'loan_released',
      loan_released_at: 'loan_released_at',
    };

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in validated) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push((validated as any)[key]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await client.query(
      `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    await client.query('COMMIT');
    return c.json({ ...mapRowToClient(result.rows[0]), requires_approval: false });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update client error:', error);
    throw new Error();
  } finally {
    client.release();
  }
});

// PATCH /api/clients/:id - Partial update client (e.g., loan_released)
clients.patch('/:id', authMiddleware, auditMiddleware('client'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = patchClientSchema.parse(body);

    // Check if client exists
    const existingResult = await client.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Client');
    }

    const existingClient = existingResult.rows[0];

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (validated.loan_released !== undefined) {
      updateFields.push(`loan_released = $${paramIndex}`);
      updateValues.push(validated.loan_released);
      paramIndex++;
    }

    if (validated.loan_released_at !== undefined) {
      updateFields.push(`loan_released_at = $${paramIndex}`);
      updateValues.push(validated.loan_released_at);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await client.query(
      `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    await client.query('COMMIT');
    return c.json(mapRowToClient(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Patch client error:', error);
    throw new Error();
  } finally {
    client.release();
  }
});

// Helper to map approval row
function mapRowToApproval(row: Record<string, any>) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    client_id: row.client_id,
    user_id: row.user_id,
    reason: row.reason,
    notes: row.notes,
    created_at: row.created_at,
  };
}

// DELETE /api/clients/:id - Delete client
clients.delete('/:id', authMiddleware, requirePermission('clients', 'delete'), auditMiddleware('client'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Check if client exists and user has access
    const existingResult = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    if (user.role === 'field_agent' && existingResult.rows[0].caravan_id !== user.sub) {
      throw new AuthorizationError('You do not have permission to perform this action');
    }

    await pool.query('DELETE FROM clients WHERE id = $1', [id]);
    return c.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    throw new Error();
  }
});

// POST /api/clients/:id/addresses - Add address to client
clients.post('/:id/addresses', authMiddleware, async (c) => {
  try {
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = addressSchema.parse(body);

    const result = await pool.query(
      `INSERT INTO addresses (id, client_id, type, street, barangay, city, province, postal_code, latitude, longitude, is_primary)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [clientId, validated.type, validated.street, validated.barangay, validated.city,
       validated.province, validated.postal_code, validated.latitude, validated.longitude, validated.is_primary]
    );

    return c.json(result.rows[0], 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add address error:', error);
    throw new Error();
  }
});

// POST /api/clients/:id/phones - Add phone number to client
clients.post('/:id/phones', authMiddleware, async (c) => {
  try {
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = phoneSchema.parse(body);

    const result = await pool.query(
      `INSERT INTO phone_numbers (id, client_id, type, number, label, is_primary)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [clientId, validated.type, validated.number, validated.label, validated.is_primary]
    );

    return c.json(result.rows[0], 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add phone error:', error);
    throw new Error();
  }
});

// GET /api/clients/search/unassigned - Search unassigned clients (for caravan users)
clients.get('/search/unassigned', authMiddleware, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const clientType = c.req.query('client_type');

    const offset = (page - 1) * perPage;
    const conditions: string[] = ['c.caravan_id IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (clientType && clientType !== 'all') {
      conditions.push(`c.client_type = $${paramIndex}`);
      params.push(clientType);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM clients c ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers
       FROM clients c
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    const clientsList = result.rows.map(row => ({
      ...mapRowToClient(row),
      expand: {
        addresses: row.addresses,
        phone_numbers: row.phone_numbers,
      },
    }));

    return c.json({
      items: clientsList,
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Search unassigned clients error:', error);
    throw new Error();
  }
});

// GET /api/clients/psgc/status - Get PSGC assignment status
clients.get('/psgc/status', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  try {
    // Get statistics about PSGC assignments
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_clients,
        COUNT(c.psgc_id) as with_psgc,
        COUNT(*) - COUNT(c.psgc_id) as without_psgc
      FROM clients c
    `);

    // Get sample of clients without PSGC (up to 20)
    const unmatchedResult = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.region,
        c.province,
        c.municipality,
        c.barangay
      FROM clients c
      WHERE c.psgc_id IS NULL
      AND (c.province IS NOT NULL OR c.municipality IS NOT NULL)
      ORDER BY c.created_at DESC
      LIMIT 20
    `);

    // Get sample of recently matched clients (up to 10)
    const matchedResult = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.region,
        c.province,
        c.municipality,
        c.barangay,
        psg.region as matched_region,
        psg.province as matched_province,
        psg.mun_city as matched_municipality,
        psg.barangay as matched_barangay,
        c.updated_at as matched_at
      FROM clients c
      INNER JOIN psgc psg ON psg.id = c.psgc_id
      ORDER BY c.updated_at DESC
      LIMIT 10
    `);

    return c.json({
      stats: statsResult.rows[0],
      unmatched: unmatchedResult.rows,
      recently_matched: matchedResult.rows,
    });
  } catch (error) {
    console.error('Get PSGC status error:', error);
    throw new Error();
  }
});

// POST /api/clients/psgc/assign - Assign PSGC IDs to clients
clients.post('/psgc/assign', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  try {
    const body = await c.req.json();
    const { dryRun = false } = body;

    // Get clients without PSGC ID but with province/municipality data
    const clientsResult = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.region,
        c.province,
        c.municipality,
        c.barangay
      FROM clients c
      WHERE c.psgc_id IS NULL
      AND (c.province IS NOT NULL OR c.municipality IS NOT NULL)
      ORDER BY c.created_at ASC
    `);

    const clientsToProcess = clientsResult.rows;
    const matched: any[] = [];
    const unmatched: any[] = [];

    for (const client of clientsToProcess) {
      // Progressive matching strategy
      let psgcId = null;
      let matchType = '';

      // Try 1: Advanced matching on province AND municipality
      // This handles word order differences like "CEBU CITY" vs "City of Cebu"
      if (client.province && client.municipality) {
        let exactMatch = null;

        // Strategy 1: Direct pattern match (PSGC municipality in client municipality)
        exactMatch = await pool.query(`
          SELECT id, region, province, mun_city, barangay
          FROM psgc
          WHERE province ILIKE '%' || $1 || '%'
          AND mun_city ILIKE '%' || $2 || '%'
          LIMIT 1
        `, [client.province, client.municipality]);

        // Strategy 2: Reverse pattern match (client municipality in PSGC municipality)
        if (exactMatch.rows.length === 0) {
          exactMatch = await pool.query(`
            SELECT id, region, province, mun_city, barangay
            FROM psgc
            WHERE province ILIKE '%' || $1 || '%'
            AND $2 ILIKE '%' || mun_city || '%'
            LIMIT 1
          `, [client.province, client.municipality]);
        }

        // Strategy 3: Keyword match - extract main keyword from client municipality
        // Remove "CITY" suffix from client municipality and try again
        if (exactMatch.rows.length === 0) {
          const clientMunicipalityKeyword = client.municipality.replace(/ CITY$/i, '').trim();
          exactMatch = await pool.query(`
            SELECT id, region, province, mun_city, barangay
            FROM psgc
            WHERE province ILIKE '%' || $1 || '%'
            AND (
              mun_city ILIKE '%' || $2 || '%'
              OR mun_city ILIKE '%' || $3 || '%'
            )
            LIMIT 1
          `, [client.province, client.municipality, clientMunicipalityKeyword]);
        }

        // Strategy 4: Keyword match - extract main keyword from PSGC municipality
        if (exactMatch.rows.length === 0) {
          // Get all PSGC entries for this province and check keyword match
          const provinceMatches = await pool.query(`
            SELECT id, region, province, mun_city, barangay
            FROM psgc
            WHERE province ILIKE '%' || $1 || '%'
          `, [client.province]);

          // Extract keyword from client municipality (remove "CITY", "OF", etc.)
          const clientKeywords = client.municipality
            .replace(/ CITY$/i, '')
            .replace(/^(CITY OF|CITY)\s*/i, '')
            .trim()
            .toLowerCase();

          // Find PSGC entry where keyword matches in municipality name
          for (const psgcRow of provinceMatches.rows) {
            const psgcKeywords = psgcRow.mun_city
              .replace(/ CITY$/i, '')
              .replace(/^(CITY OF|CITY)\s*/i, '')
              .trim()
              .toLowerCase();

            if (psgcKeywords === clientKeywords ||
                psgcRow.mun_city.toLowerCase().includes(clientKeywords) ||
                clientKeywords.includes(psgcKeywords)) {
              exactMatch = { rows: [psgcRow] };
              break;
            }
          }
        }

        if (exactMatch.rows.length > 0) {
          psgcId = exactMatch.rows[0].id;
          matchType = 'exact';
        }
      }

      // NOTE: No province fallback - we only match when BOTH province AND municipality match
      // This ensures accuracy rather than false positive matches

      if (psgcId && !dryRun) {
        // Update client with PSGC ID
        await pool.query(`
          UPDATE clients
          SET psgc_id = $1,
              region = COALESCE($2, region),
              province = COALESCE($3, province),
              municipality = COALESCE($4, municipality),
              barangay = COALESCE($5, barangay),
              updated_at = NOW()
          WHERE id = $6
        `, [
          psgcId,
          client.region,
          client.province,
          client.municipality,
          client.barangay,
          client.id
        ]);
      }

      if (psgcId) {
        matched.push({
          client_id: client.id,
          client_name: `${client.first_name} ${client.last_name}`,
          psgc_id: psgcId,
          match_type: matchType,
          province: client.province,
          municipality: client.municipality,
        });
      } else {
        unmatched.push({
          client_id: client.id,
          client_name: `${client.first_name} ${client.last_name}`,
          province: client.province,
          municipality: client.municipality,
          barangay: client.barangay,
        });
      }
    }

    return c.json({
      success: true,
      dry_run: dryRun,
      summary: {
        total_processed: clientsToProcess.length,
        matched_count: matched.length,
        unmatched_count: unmatched.length,
        success_rate: clientsToProcess.length > 0
          ? (matched.length / clientsToProcess.length * 100).toFixed(1)
          : 0,
      },
      matched,
      unmatched,
    });
  } catch (error) {
    console.error('Assign PSGC error:', error);
    throw new Error();
  }
});

export default clients;
