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

// Pagination limits
const MAX_PER_PAGE = 100;

// Validation schemas
const createClientSchema = z.object({
  first_name: z.string().min(1).max(255),
  last_name: z.string().min(1).max(255),
  middle_name: z.string().max(255).optional(),
  birth_date: z.string().max(50).optional(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional(),
  agency_name: z.string().max(255).optional(),
  department: z.string().max(255).optional(),
  position: z.string().max(255).optional(),
  employment_status: z.string().max(50).optional(),
  payroll_date: z.string().max(50).optional(),
  tenure: z.number().optional(),
  client_type: z.enum(['POTENTIAL', 'EXISTING']).default('POTENTIAL'),
  product_type: z.string().max(100).optional(),
  market_type: z.string().max(100).optional(),
  pension_type: z.string().max(100).optional(),
  pan: z.string().max(50).optional(),
  facebook_link: z.string().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  agency_id: z.string().uuid().optional().nullable(),
  caravan_id: z.string().uuid().optional().nullable(),
  is_starred: z.boolean().default(false),
  loan_released: z.boolean().optional().default(false),
  loan_released_at: z.string().max(50).optional(),
});

const updateClientSchema = createClientSchema.partial().passthrough();

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
    // Address fields (from addresses table, mapped to client for easier access)
    street: row.street,
    // PSGC fields
    region: row.psgc_region,
    province: row.psgc_province,
    municipality: row.psgc_municipality || row.municipality,
    barangay: row.psgc_barangay,
    postal_code: row.postal_code,
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
    let perPage = parseInt(c.req.query('perPage') || '20');

    // Enforce MAX_PER_PAGE limit for security and performance
    if (perPage > MAX_PER_PAGE) {
      throw new ValidationError(`perPage cannot exceed ${MAX_PER_PAGE}`);
    }

    const search = c.req.query('search');
    const clientType = c.req.query('client_type');
    const agencyId = c.req.query('agency_id');
    const caravanId = c.req.query('caravan_id');
    const municipalityIds = c.req.query('municipality_ids'); // Comma-separated list
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');
    const productType = c.req.query('product_type');
    const touchpointStatus = c.req.query('touchpoint_status'); // callable, completed, has_progress, no_progress
    const sortBy = c.req.query('sort_by'); // touchpoint_status, created_at, etc.

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Touchpoint sequence: Visit → Call → Call → Visit → Call → Call → Visit
    // Declared once at the top level to avoid duplicate declarations
    const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

    // Role level mapping for area-based filtering
    const ROLE_LEVELS: Record<string, number> = {
      'admin': 100,
      'area_manager': 50,
      'assistant_area_manager': 40,
      'caravan': 20,
      'tele': 15,
    };

    // Get user level from role (default to 0 if role not found)
    const userLevel = ROLE_LEVELS[user.role] || 0;

    // Area-based filtering using CTE
    // NO AREA FILTER for oversight roles: Admin (100), Area Manager (50), Assistant Area Manager (40)
    // FILTER BY user_locations for field agents: Caravan (20), Tele (15)
    const shouldFilterByArea = userLevel < 40 || ['caravan', 'tele'].includes(user.role);

    if (search) {
      conditions.push(`((c.first_name || ' ' || c.last_name) ILIKE $${paramIndex} OR c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (clientType && clientType !== 'all') {
      conditions.push(`c.client_type = $${paramIndex}`);
      params.push(clientType);
      paramIndex++;
    }

    if (productType && productType !== 'all') {
      conditions.push(`c.product_type = $${paramIndex}`);
      params.push(productType);
      paramIndex++;
    }

    if (agencyId) {
      conditions.push(`c.agency_id = $${paramIndex}`);
      params.push(agencyId);
      paramIndex++;
    }

    if (municipality) {
      // Filter by municipality name (clients table has municipality column)
      conditions.push(`c.municipality = $${paramIndex}`);
      params.push(municipality);
      paramIndex++;
    }

    if (province) {
      conditions.push(`c.province = $${paramIndex}`);
      params.push(province);
      paramIndex++;
    }

    if (caravanId) {
      // caravan_id filter is deprecated - municipality is now used for location assignments
      // This filter is kept for backwards compatibility but will not return results
      // Use province/municipality filtering instead
      // Silently ignore the deprecated filter
    }

    // Determine sort order BEFORE building CTE (needed in both CTE and final query)
    let orderByClause = 'ORDER BY c.created_at DESC';
    let groupScoreCase = '';

    if (sortBy === 'touchpoint_status') {
      // Calculate group score for sorting
      // Group scores: 1=callable, 2=completed, 3=has_progress, 4=no_progress
      const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

      // Determine if current user can create the next touchpoint
      // Note: Column names used directly (no table prefix) for CTE context
      let canCreateCondition = '';
      if (user.role === 'tele') {
        canCreateCondition = `next_touchpoint_type = 'Call'`;
      } else if (user.role === 'caravan') {
        canCreateCondition = `next_touchpoint_type = 'Visit'`;
      } else {
        canCreateCondition = `next_touchpoint_type IS NOT NULL`;
      }

      // Group score CASE expression
      // Note: Column names used directly (no table prefix) for CTE context
      // Use c.loan_released to avoid ambiguity when used in ORDER BY
      groupScoreCase = `CASE
        WHEN (${canCreateCondition}) AND completed_count < 7 AND NOT c.loan_released THEN 1
        WHEN completed_count >= 7 OR c.loan_released THEN 2
        WHEN completed_count > 0 AND completed_count < 7 AND NOT (${canCreateCondition}) THEN 3
        ELSE 4
      END`;

      // Sort by group score, then by completed count (more progress first)
      // Note: {touchpoint_alias}.completed_count will be replaced with dynamic alias in mainQuery
      orderByClause = `ORDER BY
        ${groupScoreCase} ASC,
        {touchpoint_alias}.completed_count DESC,
        c.created_at DESC`;
    }

    // Build WHERE clause conditions for basic client filtering
    // Note: touchpoint_status filtering will be done in CTE, not here
    const baseWhereConditions: string[] = [];
    const baseParams: any[] = [];
    let baseParamIndex = 1;

    if (search) {
      baseWhereConditions.push(`((c.first_name || ' ' || c.last_name) ILIKE $${baseParamIndex} OR c.first_name ILIKE $${baseParamIndex} OR c.last_name ILIKE $${baseParamIndex} OR c.email ILIKE $${baseParamIndex})`);
      baseParams.push(`%${search}%`);
      baseParamIndex++;
    }

    if (clientType && clientType !== 'all') {
      baseWhereConditions.push(`c.client_type = $${baseParamIndex}`);
      baseParams.push(clientType);
      baseParamIndex++;
    }

    if (productType && productType !== 'all') {
      baseWhereConditions.push(`c.product_type = $${baseParamIndex}`);
      baseParams.push(productType);
      baseParamIndex++;
    }

    if (agencyId) {
      baseWhereConditions.push(`c.agency_id = $${baseParamIndex}`);
      baseParams.push(agencyId);
      baseParamIndex++;
    }

    if (municipality) {
      baseWhereConditions.push(`c.municipality = $${baseParamIndex}`);
      baseParams.push(municipality);
      baseParamIndex++;
    }

    if (province) {
      baseWhereConditions.push(`c.province = $${baseParamIndex}`);
      baseParams.push(province);
      baseParamIndex++;
    }

    const baseWhereClause = baseWhereConditions.length > 0 ? `WHERE ${baseWhereConditions.join(' AND ')}` : '';

    // Build CTE-based query for proper filter-then-paginate behavior
    // CTE 1: Get user's assigned areas (for Caravan/Tele filtering)
    // CTE 2: Calculate touchpoint info for ALL clients (without client filters)

    // Add area filter conditions for Caravan/Tele roles
    let areaFilterWhereClause = '';
    if (shouldFilterByArea) {
      // For Caravan/Tele: Filter by assigned provinces/municipalities
      // Using the new province and municipality columns directly
      const whereOrAnd = baseWhereClause !== '' ? 'AND' : 'WHERE';
      areaFilterWhereClause = ` ${whereOrAnd} (
        c.province IN (SELECT province FROM user_areas)
        AND c.municipality IN (SELECT municipality FROM user_areas)
      )`;
    }

    const touchpointInfoCTE = `touchpoint_info AS (
      SELECT
        t.client_id,
        CAST(COUNT(DISTINCT t.touchpoint_number) AS INTEGER) as completed_count,
        (SELECT t2.type FROM touchpoints t2 WHERE t2.client_id = t.client_id ORDER BY t2.touchpoint_number DESC LIMIT 1) as last_touchpoint_type,
        (SELECT t2.user_id FROM touchpoints t2 WHERE t2.client_id = t.client_id ORDER BY t2.touchpoint_number DESC LIMIT 1) as last_touchpoint_user_id,
        CASE ${TOUCHPOINT_SEQUENCE.map((type, index) =>
          `WHEN COUNT(DISTINCT t.touchpoint_number) = ${index + 1} THEN '${type}'`
        ).join(' ')}
          ELSE NULL
        END as next_touchpoint_type,
        c.loan_released
      FROM touchpoints t
      JOIN clients c ON c.id = t.client_id
      GROUP BY t.client_id, c.loan_released
    )`;

    // Build WITH clause with user_areas CTE if needed
    let withGroupScoreCTE: string;
    if (shouldFilterByArea) {
      withGroupScoreCTE = `WITH user_areas AS (
        SELECT province, municipality
        FROM user_locations
        WHERE user_id = '${user.sub}' AND deleted_at IS NULL
      ), ${touchpointInfoCTE}`;
      console.log('[clients] CTE with area filter:', withGroupScoreCTE.substring(0, 300) + '...');
      console.log('[clients] user.sub:', user.sub);
    } else {
      withGroupScoreCTE = `WITH ${touchpointInfoCTE}`;
      console.log('[clients] CTE without area filter:', withGroupScoreCTE.substring(0, 200) + '...');
    }
    let groupScoreFilter = '';

    if (touchpointStatus) {
      // Determine if current user can create the next touchpoint
      let canCreateCondition = '';
      if (user.role === 'tele') {
        canCreateCondition = `next_touchpoint_type = 'Call'`;
      } else if (user.role === 'caravan') {
        canCreateCondition = `next_touchpoint_type = 'Visit'`;
      } else {
        canCreateCondition = `next_touchpoint_type IS NOT NULL`;
      }

      // Map touchpoint_status to group score
      const statusToScoreMap: Record<string, number> = {
        'callable': 1,
        'completed': 2,
        'has_progress': 3,
        'no_progress': 4
      };

      const targetScore = statusToScoreMap[touchpointStatus];
      if (targetScore !== undefined) {
        // Add group score calculation to CTE
        // CRITICAL: loan_released clients should NEVER be callable (group 1)
        // They should always be in group 2 (completed) regardless of touchpoint count
        withGroupScoreCTE = `${withGroupScoreCTE}, touchpoint_with_score AS (
          SELECT *,
            CASE
              -- Group 1 (callable): User can create next touchpoint AND loan NOT released
              WHEN (${canCreateCondition}) AND completed_count < 7 AND NOT loan_released THEN 1
              -- Group 2 (completed): 7/7 touchpoints OR loan released (blocked from further touchpoints)
              WHEN completed_count >= 7 OR loan_released THEN 2
              -- Group 3 (has_progress): 1-6 touchpoints but user cannot create next
              WHEN completed_count > 0 AND completed_count < 7 AND NOT (${canCreateCondition}) THEN 3
              -- Group 4 (no_progress): 0 touchpoints
              ELSE 4
            END as group_score
          FROM touchpoint_info
        )`;

        // Filter by group score in WHERE clause
        // Use WHERE or AND depending on whether any WHERE clause exists (baseWhereClause or areaFilterWhereClause)
        const hasExistingWhere = baseWhereClause || areaFilterWhereClause;
        const whereOrAnd = hasExistingWhere ? 'AND' : 'WHERE';
        groupScoreFilter = `${whereOrAnd} tws.group_score = $${baseParamIndex}`;
        baseParams.push(targetScore);
        baseParamIndex++;
      }
    }

    // Get total count using CTE
    const countQuery = `
      ${withGroupScoreCTE}
      SELECT COUNT(DISTINCT c.id) as count
      FROM clients c
      ${touchpointStatus ? 'LEFT JOIN touchpoint_with_score tws ON tws.client_id = c.id' : 'LEFT JOIN touchpoint_info tp ON tp.client_id = c.id'}
      ${baseWhereClause}
      ${areaFilterWhereClause}
      ${groupScoreFilter}
    `;

    const countResult = await pool.query(countQuery, baseParams);
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results using CTEs
    // The CTEs filter ALL clients first, then we paginate
    // When touchpointStatus is provided, use tws (touchpoint_with_score) instead of tp (touchpoint_info)
    const touchpointInfoAlias = touchpointStatus ? 'tws' : 'tp';
    const touchpointInfoJoin = touchpointStatus
      ? 'LEFT JOIN touchpoint_with_score tws ON tws.client_id = c.id'
      : 'LEFT JOIN touchpoint_info tp ON tp.client_id = c.id';

    const mainQuery = `
      ${withGroupScoreCTE}
      SELECT c.*,
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
        COALESCE(${touchpointInfoAlias}.completed_count, 0) as completed_touchpoints,
        ${touchpointInfoAlias}.next_touchpoint_type,
        ${touchpointInfoAlias}.last_touchpoint_type,
        ${touchpointInfoAlias}.last_touchpoint_user_id,
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM clients c
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN addresses a ON a.client_id = c.id
      LEFT JOIN phone_numbers p ON p.client_id = c.id
      ${touchpointInfoJoin}
      LEFT JOIN users lt ON lt.id = ${touchpointInfoAlias}.last_touchpoint_user_id
      ${baseWhereClause}
      ${areaFilterWhereClause}
      ${groupScoreFilter}
      GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay, ${touchpointInfoAlias}.completed_count, ${touchpointInfoAlias}.next_touchpoint_type, ${touchpointInfoAlias}.last_touchpoint_type, ${touchpointInfoAlias}.last_touchpoint_user_id, lt.first_name, lt.last_name
      ${orderByClause.replace('{touchpoint_alias}', touchpointInfoAlias)}
      LIMIT $${baseParamIndex} OFFSET $${baseParamIndex + 1}
    `;

    const result = await pool.query(mainQuery, [...baseParams, perPage, offset]);

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
          is_complete: completedCount >= 7, // Only complete when 7/7 touchpoints done
          last_touchpoint_type: row.last_touchpoint_type,
          last_touchpoint_agent_name: row.last_touchpoint_first_name && row.last_touchpoint_last_name ? `${row.last_touchpoint_first_name} ${row.last_touchpoint_last_name}` : null,
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
      `SELECT c.id, c.first_name, c.last_name, c.middle_name, c.birth_date, c.email, c.phone,
        c.agency_name, c.department, c.position, c.employment_status, c.payroll_date,
        c.tenure, c.client_type, c.product_type, c.market_type, c.pension_type,
        c.pan, c.facebook_link, c.remarks, c.agency_id, c.caravan_id, c.is_starred,
        c.psgc_id, c.region, c.province, c.municipality, c.barangay,
        c.loan_released, c.loan_released_at, c.udi, c.deleted_at,
        c.created_at, c.updated_at,
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
        COALESCE(
          json_agg(DISTINCT json_build_object(
            'id', t.id,
            'client_id', t.client_id,
            'user_id', t.user_id,
            'touchpoint_number', t.touchpoint_number,
            'type', t.type,
            'reason', t.reason,
            'status', t.status,
            'date', to_char(t.date, 'YYYY-MM-DD'),
            'time_in', to_char(t.time_in, 'YYYY-MM-DD"T"HH24:MI:SS'),
            'time_out', to_char(t.time_out, 'YYYY-MM-DD"T"HH24:MI:SS'),
            'time_arrival', t.time_arrival,
            'time_departure', t.time_departure,
            'odometer_arrival', t.odometer_arrival,
            'odometer_departure', t.odometer_departure,
            'next_visit_date', to_char(t.next_visit_date, 'YYYY-MM-DD'),
            'notes', t.notes,
            'photo_url', t.photo_url,
            'audio_url', t.audio_url,
            'latitude', t.latitude,
            'longitude', t.longitude,
            'time_in_gps_lat', t.time_in_gps_lat,
            'time_in_gps_lng', t.time_in_gps_lng,
            'time_in_gps_address', t.time_in_gps_address,
            'time_out_gps_lat', t.time_out_gps_lat,
            'time_out_gps_lng', t.time_out_gps_lng,
            'time_out_gps_address', t.time_out_gps_address,
            'created_at', to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z'),
            'updated_at', to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z')
          ) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) as touchpoints
       FROM clients c
       LEFT JOIN psgc psg ON psg.id = c.psgc_id
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       LEFT JOIN touchpoints t ON t.client_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, c.first_name, c.last_name, c.middle_name, c.birth_date, c.email, c.phone,
                c.agency_name, c.department, c.position, c.employment_status, c.payroll_date,
                c.tenure, c.client_type, c.product_type, c.market_type, c.pension_type,
                c.pan, c.facebook_link, c.remarks, c.agency_id, c.caravan_id, c.is_starred,
                c.psgc_id, c.region, c.province, c.municipality, c.barangay,
                c.loan_released, c.loan_released_at, c.udi, c.deleted_at,
                c.created_at, c.updated_at, psg.region, psg.province, psg.mun_city, psg.barangay
      `,
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
      // Put touchpoints at root level for mobile Client.fromJson() compatibility
      touchpoints: client.touchpoints,
      expand: {
        addresses: client.addresses,
        phone_numbers: client.phone_numbers,
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

    // Debug: Log received body
    console.log('[PUT /api/clients/:id] Received body:', JSON.stringify(body, null, 2));

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
      console.error('[PUT /api/clients/:id] Zod validation errors:', JSON.stringify(error.errors, null, 2));
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
    let perPage = parseInt(c.req.query('perPage') || '20');

    // Enforce MAX_PER_PAGE limit for security and performance
    if (perPage > MAX_PER_PAGE) {
      throw new ValidationError(`perPage cannot exceed ${MAX_PER_PAGE}`);
    }

    const search = c.req.query('search');
    const clientType = c.req.query('client_type');

    const offset = (page - 1) * perPage;
    const conditions: string[] = ['c.caravan_id IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`((c.first_name || ' ' || c.last_name) ILIKE $${paramIndex} OR c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`);
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

    // Get sample of clients without PSGC (up to 20) with debug info
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

    // Fetch PSGC data for debug information
    const psgcResult = await pool.query(`
      SELECT id, region, province, mun_city, barangay
      FROM psgc
      ORDER BY province, mun_city
    `);

    // Build lookup map for debug info
    const psgcByProvince = new Map<string, any[]>();
    for (const psgc of psgcResult.rows) {
      const normalizedProvince = psgc.province.toLowerCase().trim();
      if (!psgcByProvince.has(normalizedProvince)) {
        psgcByProvince.set(normalizedProvince, []);
      }
      psgcByProvince.get(normalizedProvince)!.push(psgc);
    }

    // Helper function to normalize municipality names
    function normalizeMunicipality(name: string): string {
      return name
        .replace(/ CITY$/i, '')
        .replace(/^(CITY OF|CITY)\s*/i, '')
        .trim()
        .toLowerCase();
    }

    // Add debug info to unmatched clients
    const unmatchedWithDebug = unmatchedResult.rows.map((client: any) => {
      let debugInfo: any = {
        normalized_province: null,
        normalized_municipality: null,
        available_psgc_count: 0,
        psgc_options: [],
        failure_reason: ''
      };

      if (client.province && client.municipality) {
        const normalizedClientProvince = client.province.toLowerCase().trim();
        const clientMunicipality = client.municipality.trim();
        const normalizedClientMunicipality = normalizeMunicipality(clientMunicipality);

        debugInfo.normalized_province = normalizedClientProvince;
        debugInfo.normalized_municipality = normalizedClientMunicipality;

        const provincePsgcs = psgcByProvince.get(normalizedClientProvince);

        if (provincePsgcs && provincePsgcs.length > 0) {
          debugInfo.available_psgc_count = provincePsgcs.length;
          debugInfo.psgc_options = provincePsgcs.map(p => ({
            id: p.id,
            municipality: p.mun_city,
            normalized: normalizeMunicipality(p.mun_city)
          }));
          debugInfo.failure_reason = 'No PSGC municipality matched for this province';
        } else {
          debugInfo.available_psgc_count = 0;
          debugInfo.failure_reason = `No PSGC records found for province: "${client.province}"`;
        }
      } else {
        debugInfo.failure_reason = !client.province ? 'Missing province data' : 'Missing municipality data';
      }

      return {
        id: client.id,
        client_name: `${client.first_name} ${client.last_name}`,
        first_name: client.first_name,
        last_name: client.last_name,
        region: client.region,
        province: client.province,
        municipality: client.municipality,
        barangay: client.barangay,
        failure_reason: debugInfo.failure_reason,
        debug: debugInfo
      };
    });

    // Get pagination parameters
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '10');
    const offset = (page - 1) * perPage;

    // Get total count of matched clients
    const matchedCountResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM clients c
      INNER JOIN psgc psg ON psg.id = c.psgc_id
    `);
    const matchedTotal = parseInt(matchedCountResult.rows[0].total);

    // Get paginated recently matched clients
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
      LIMIT $1 OFFSET $2
    `, [perPage, offset]);

    return c.json({
      stats: statsResult.rows[0],
      unmatched: unmatchedWithDebug,
      recently_matched: matchedResult.rows,
      recently_matched_pagination: {
        page,
        perPage,
        total: matchedTotal,
        totalPages: Math.ceil(matchedTotal / perPage)
      }
    });
  } catch (error) {
    console.error('Get PSGC status error:', error);
    throw new Error();
  }
});

// POST /api/clients/psgc/assign - Assign PSGC IDs to clients (OPTIMIZED with chunking)
clients.post('/psgc/assign', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  try {
    const body = await c.req.json();
    const { dryRun = false } = body;

    // Step 1: Get all clients without PSGC ID but with province/municipality data
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

    // Early exit if no clients to process
    if (clientsToProcess.length === 0) {
      return c.json({
        success: true,
        dry_run: dryRun,
        summary: {
          total_processed: 0,
          matched_count: 0,
          unmatched_count: 0,
          success_rate: 0,
        },
        matched: [],
        unmatched: [],
      });
    }

    // Step 2: Fetch ALL PSGC data in a single query (chunking by loading all at once)
    // This is efficient because PSGC table is indexed and relatively small (~1,600 records)
    const psgcResult = await pool.query(`
      SELECT id, region, province, mun_city, barangay
      FROM psgc
      ORDER BY province, mun_city
    `);

    // Step 3: Build a lookup map for fast in-memory matching
    // Map: normalized province -> array of PSGC records
    const psgcByProvince = new Map<string, any[]>();

    for (const psgc of psgcResult.rows) {
      const normalizedProvince = psgc.province.toLowerCase().trim();
      if (!psgcByProvince.has(normalizedProvince)) {
        psgcByProvince.set(normalizedProvince, []);
      }
      psgcByProvince.get(normalizedProvince)!.push(psgc);
    }

    // Step 4: Match all clients in memory (no database queries!)
    const matched: any[] = [];
    const unmatched: any[] = [];
    const updates: any[] = []; // For batch update

    // Helper function to normalize municipality names for matching
    function normalizeMunicipality(name: string): string {
      return name
        .replace(/ CITY$/i, '')
        .replace(/^(CITY OF|CITY)\s*/i, '')
        .trim()
        .toLowerCase();
    }

    for (const client of clientsToProcess) {
      let psgcId: string | null = null;
      let matchedPsgc: any = null;
      let matchReason = '';

      // Detailed debug info for unmatched clients
      let debugInfo: any = {
        normalized_province: null,
        normalized_municipality: null,
        available_psgc_count: 0,
        psgc_options: [],
        failure_reason: ''
      };

      if (client.province && client.municipality) {
        const normalizedClientProvince = client.province.toLowerCase().trim();
        const clientMunicipality = client.municipality.trim();
        const normalizedClientMunicipality = normalizeMunicipality(clientMunicipality);

        debugInfo.normalized_province = normalizedClientProvince;
        debugInfo.normalized_municipality = normalizedClientMunicipality;

        // Get PSGC records for this province
        const provincePsgcs = psgcByProvince.get(normalizedClientProvince);

        if (provincePsgcs && provincePsgcs.length > 0) {
          debugInfo.available_psgc_count = provincePsgcs.length;
          debugInfo.psgc_options = provincePsgcs.map(p => ({
            id: p.id,
            municipality: p.mun_city,
            normalized: normalizeMunicipality(p.mun_city)
          }));

          // Strategy 1: Direct match (PSGC municipality in client municipality)
          matchedPsgc = provincePsgcs.find(psgc =>
            clientMunicipality.toLowerCase().includes(psgc.mun_city.toLowerCase()) ||
            psgc.mun_city.toLowerCase().includes(clientMunicipality.toLowerCase())
          );

          if (matchedPsgc) {
            matchReason = 'direct_match';
          }

          // Strategy 2: Keyword match (normalized comparison)
          if (!matchedPsgc) {
            const psgcKeywords = normalizeMunicipality(clientMunicipality);
            matchedPsgc = provincePsgcs.find(psgc => {
              const psgcMunicipalityNormalized = normalizeMunicipality(psgc.mun_city);
              return psgcMunicipalityNormalized === psgcKeywords ||
                psgcMunicipalityNormalized.includes(psgcKeywords) ||
                psgcKeywords.includes(psgcMunicipalityNormalized);
            });

            if (matchedPsgc) {
              matchReason = 'keyword_match';
            }
          }

          if (!matchedPsgc) {
            debugInfo.failure_reason = 'No PSGC municipality matched for this province';
          }
        } else {
          debugInfo.available_psgc_count = 0;
          debugInfo.failure_reason = `No PSGC records found for province: "${client.province}"`;
        }

        if (matchedPsgc) {
          psgcId = matchedPsgc.id;
        }
      } else {
        debugInfo.failure_reason = !client.province ? 'Missing province data' : 'Missing municipality data';
      }

      if (psgcId) {
        matched.push({
          client_id: client.id,
          client_name: `${client.first_name} ${client.last_name}`,
          psgc_id: psgcId,
          match_type: matchReason,
          province: client.province,
          municipality: client.municipality,
        });

        // Collect for batch update
        updates.push({
          clientId: client.id,
          psgcId: psgcId,
          region: matchedPsgc.region,
          province: matchedPsgc.province,
          municipality: matchedPsgc.mun_city,
          barangay: matchedPsgc.barangay,
        });
      } else {
        unmatched.push({
          client_id: client.id,
          client_name: `${client.first_name} ${client.last_name}`,
          province: client.province,
          municipality: client.municipality,
          barangay: client.barangay,
          failure_reason: debugInfo.failure_reason,
          debug: debugInfo
        });
      }
    }

    // Step 5: Batch UPDATE all matched clients in a single query
    if (!dryRun && updates.length > 0) {
      // Use PostgreSQL's UPDATE with FROM clause for batch update
      // Build the VALUES clause: ($1, $2), ($3, $4), ...
      const valuesClause = updates.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');

      // Flatten the updates array for parameter binding
      const params = updates.flatMap(u => [u.clientId, u.psgcId, u.region, u.province, u.municipality, u.barangay]);

      await pool.query(`
        UPDATE clients AS c
        SET
          psgc_id = CAST(v.psgc_id AS INTEGER),
          region = COALESCE(v.region, c.region),
          province = COALESCE(v.province, c.province),
          municipality = COALESCE(v.municipality, c.municipality),
          barangay = COALESCE(v.barangay, c.barangay),
          updated_at = NOW()
        FROM (VALUES ${valuesClause}) AS v(client_id, psgc_id, region, province, municipality, barangay)
        WHERE c.id = CAST(v.client_id AS UUID)
      `, params);
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
    throw new Error('Failed to assign PSGC IDs to clients');
  }
});

export default clients;
