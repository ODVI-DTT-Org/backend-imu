import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import { normalizeSearchQuery } from '../utils/search-normalizer.js';
import {
  parseHybridSearchQuery,
  buildHybridSearchClause,
  getHybridSearchStrategyInfo,
  logSearchStrategy,
} from '../utils/hybrid-search.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';
import { getClientsCacheService } from '../services/cache/clients-cache.js';
import { getQueueManager, QUEUE_NAMES, BulkJobType } from '../queues/index.js';
import type { BulkUploadJobData } from '../queues/jobs/job-types.js';

// Helper function to ensure loan_type is always returned as string
function parseLoanType(value: any): string | null {
  if (value === null || value === undefined) return null;
  // Convert to string if it's a number or other type
  return String(value);
}

interface ClientFilterResult {
  conditions: string[];
  params: any[];
  nextIdx: number;
}

function buildClientFilters(
  q: {
    client_type?: string | string[];
    product_type?: string | string[];
    market_type?: string | string[];
    pension_type?: string | string[];
    loan_type?: string | string[];
    agency_id?: string;
    municipality?: string | string[];
    province?: string | string[];
  },
  startIdx: number = 1
): ClientFilterResult {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = startIdx;

  function applyMultiFilter(raw: string | string[] | undefined, col: string) {
    if (!raw) return;
    const values = Array.isArray(raw)
      ? raw.filter(v => v && v !== 'all')
      : raw.split(',').map(v => v.trim()).filter(v => v && v !== 'all');
    if (values.length === 0) return;
    conditions.push(`${col} = ANY($${idx}::text[])`);
    params.push(values);
    idx++;
  }

  applyMultiFilter(q.client_type, 'c.client_type');
  applyMultiFilter(q.product_type, 'c.product_type');
  applyMultiFilter(q.market_type, 'c.market_type');
  applyMultiFilter(q.pension_type, 'c.pension_type');
  applyMultiFilter(q.loan_type, 'c.loan_type');

  if (q.agency_id) {
    conditions.push(`c.agency_id = $${idx}`);
    params.push(q.agency_id);
    idx++;
  }

  if (q.municipality) {
    const values = Array.isArray(q.municipality) ? q.municipality : [q.municipality];
    if (values.length > 0) {
      const placeholders = values.map((_, i) => `$${idx + i}`).join(', ');
      conditions.push(`c.municipality IN (${placeholders})`);
      params.push(...values);
      idx += values.length;
    }
  }

  if (q.province) {
    const values = Array.isArray(q.province) ? q.province : [q.province];
    if (values.length > 0) {
      const placeholders = values.map((_, i) => `$${idx + i}`).join(', ');
      conditions.push(`c.province IN (${placeholders})`);
      params.push(...values);
      idx += values.length;
    }
  }

  return { conditions, params, nextIdx: idx };
}

const clients = new Hono();

// Pagination limits
const MAX_PER_PAGE = 100;

// Validation schemas
const createClientSchema = z.object({
  id: z.string().uuid().optional(),
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
  product_type: z.enum(['BFP ACTIVE', 'BFP PENSION', 'PNP PENSION', 'NAPOLCOM', 'BFP STP']).optional(),
  market_type: z.string().max(100).optional(),
  pension_type: z.string().max(100).optional(),
  loan_type: z.enum(['NEW', 'ADDITIONAL', 'RENEWAL', 'PRETERM']).optional(),
  pan: z.string().max(50).optional(),
  facebook_link: z.string().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  agency_id: z.string().uuid().optional().nullable(),
  is_starred: z.boolean().default(false),
  loan_released: z.boolean().optional().default(false),
  loan_released_at: z.string().max(50).optional(),
  // Legacy PCNICMS fields (optional)
  ext_name: z.string().max(50).optional(),
  fullname: z.string().max(500).optional(),
  full_address: z.string().max(1000).optional(),
  account_code: z.string().max(50).optional(),
  account_number: z.string().max(50).optional(),
  rank: z.string().max(100).optional(),
  monthly_pension_amount: z.number().optional(),
  monthly_pension_gross: z.number().optional(),
  atm_number: z.string().max(50).optional(),
  applicable_republic_act: z.string().max(100).optional(),
  unit_code: z.string().max(50).optional(),
  pcni_acct_code: z.string().max(50).optional(),
  dob: z.string().max(50).optional(),
  g_company: z.string().max(255).optional(),
  g_status: z.string().max(50).optional(),
  status: z.string().max(50).default('active'),
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
  // Calculate display_name: "Surname, First Name MiddleName"
  // Only comma after surname, rest separated by spaces
  const middleName = row.middle_name || '';
  const nameParts = [row.first_name, middleName].filter((p: string) => p && p.trim().length > 0);
  const displayName = `${row.last_name}, ${nameParts.join(' ')}`;

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    middle_name: row.middle_name,
    display_name: displayName,
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
    loan_type: parseLoanType(row.loan_type),
    pan: row.pan,
    facebook_link: row.facebook_link,
    remarks: row.remarks,
    agency_id: row.agency_id,
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
    // Touchpoint summary fields (denormalized from touchpoints table)
    touchpoint_summary: row.touchpoint_summary || [],
    touchpoint_number: row.touchpoint_number || 0,
    next_touchpoint: row.next_touchpoint || null,
    next_touchpoint_number: row.next_touchpoint_number || null,
    // Legacy PCNICMS fields
    ext_name: row.ext_name,
    fullname: row.fullname,
    full_address: row.full_address,
    account_code: row.account_code,
    account_number: row.account_number,
    rank: row.rank,
    monthly_pension_amount: row.monthly_pension_amount,
    monthly_pension_gross: row.monthly_pension_gross,
    atm_number: row.atm_number,
    applicable_republic_act: row.applicable_republic_act,
    unit_code: row.unit_code,
    pcni_acct_code: row.pcni_acct_code,
    dob: row.dob,
    g_company: row.g_company,
    g_status: row.g_status,
    status: row.status,
    // Audit fields
    created_by: row.created_by,
    deleted_by: row.deleted_by,
    deleted_at: row.deleted_at,
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

// GET /api/clients - List ALL clients (no area filter) with pagination and filters
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
    const caravanId = c.req.query('caravan_id');
    const touchpointStatusQuery = c.req.queries('touchpoint_status'); // callable, completed, has_progress, no_progress
    const sortBy = c.req.query('sort_by'); // touchpoint_status, created_at, etc.
    const nextTouchpointNumberQuery = c.req.queries('next_touchpoint_number'); // array of 1-7 and/or 'archive'

    const municipalityQuery = c.req.queries('municipality');
    const provinceQuery = c.req.queries('province');
    const municipality = municipalityQuery?.length ? municipalityQuery : undefined;
    const province = provinceQuery?.length ? provinceQuery : undefined;

    const { conditions: sharedConditions, params: sharedParams, nextIdx: sharedNextIdx } = buildClientFilters({
      client_type: c.req.queries('client_type')?.length ? c.req.queries('client_type') : undefined,
      product_type: c.req.queries('product_type')?.length ? c.req.queries('product_type') : undefined,
      market_type: c.req.queries('market_type')?.length ? c.req.queries('market_type') : undefined,
      pension_type: c.req.queries('pension_type')?.length ? c.req.queries('pension_type') : undefined,
      loan_type: c.req.queries('loan_type')?.length ? c.req.queries('loan_type') : undefined,
      agency_id: c.req.query('agency_id'),
      municipality,
      province,
    });

    // Handle touchpoint_status (can be array or string)
    let touchpointStatus: string[] | undefined;
    if (touchpointStatusQuery) {
      if (Array.isArray(touchpointStatusQuery)) {
        touchpointStatus = touchpointStatusQuery;
      } else {
        touchpointStatus = [touchpointStatusQuery];
      }
    }

    const offset = (page - 1) * perPage;

    // Touchpoint sequence: Visit → Call → Call → Visit → Call → Call → Visit
    // Declared once at the top level to avoid duplicate declarations
    const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

    // IMPORTANT: This endpoint returns ALL clients (no area filter)
    // Use /api/clients/assigned for area-filtered clients

    // Determine sort order - use direct column references from clients table
    // DEFAULT: Use group scoring ordering
    // Group 1 (callable): Next is Call, Group 2 (waiting): Next is Visit, Group 3: Completed, Group 4: Loan released, Group 5: No progress
    let orderByClause = `
      CASE
        WHEN c.loan_released THEN 4
        WHEN COALESCE(c.touchpoint_number, 1) >= 7 THEN 3
        WHEN c.next_touchpoint = 'Call' AND COALESCE(c.touchpoint_number, 1) < 7 THEN 1
        WHEN c.next_touchpoint = 'Visit' AND COALESCE(c.touchpoint_number, 1) < 7 THEN 2
        ELSE 5
      END ASC,
      -- OPTIMIZED: Get last touchpoint date from denormalized touchpoint_summary JSON array
      (c.touchpoint_summary->-1->>'date') DESC NULLS LAST,
      COALESCE(c.touchpoint_number, 1) DESC,
      c.created_at DESC`;

    if (sortBy === 'touchpoint_status') {
      // For Tele role: use group scoring directly
      if (user.role === 'tele' && touchpointStatus) {
        // Order by group_score ASC, then by completed_count DESC, then by created_at DESC
        orderByClause = `
          CASE
            WHEN (c.next_touchpoint IS NOT NULL OR COALESCE(c.touchpoint_number, 1) = 1)
              AND COALESCE(c.touchpoint_number, 1) < 7 AND NOT c.loan_released THEN 1
            WHEN COALESCE(c.touchpoint_number, 1) >= 7 OR c.loan_released THEN 2
            ELSE 3
          END ASC,
          COALESCE(c.touchpoint_number, 1) DESC,
          c.created_at DESC`;
      } else {
        // For Caravan/Admin or when no touchpointStatus filter: use CASE expression
        // Determine if current user can create the next touchpoint
        let canCreateCondition = '';
        if (user.role === 'caravan') {
          canCreateCondition = `c.next_touchpoint = 'Visit' OR COALESCE(c.touchpoint_number, 1) = 1`;
        } else {
          canCreateCondition = `c.next_touchpoint IS NOT NULL OR COALESCE(c.touchpoint_number, 1) = 1`;
        }

        // Group score CASE expression for ordering
        const groupScoreCase = `CASE
          WHEN (${canCreateCondition}) AND COALESCE(c.touchpoint_number, 1) < 7 AND NOT c.loan_released THEN 1
          WHEN COALESCE(c.touchpoint_number, 1) >= 7 OR c.loan_released THEN 2
          WHEN COALESCE(c.touchpoint_number, 1) > 0 AND COALESCE(c.touchpoint_number, 1) < 7 AND NOT (${canCreateCondition}) THEN 3
          ELSE 4
        END`;

        orderByClause = `
          ${groupScoreCase} ASC,
          COALESCE(c.touchpoint_number, 1) DESC,
          c.created_at DESC`;
      }
    }

    // Build WHERE clause conditions — shared filters from helper, then search appended below
    const baseWhereConditions: string[] = [...sharedConditions];
    const baseParams: any[] = [...sharedParams];
    let baseParamIndex = sharedNextIdx;
    let searchParam = ''; // Track search parameter for similarity scoring
    let searchStrategy = ''; // Track search strategy for SELECT clause
    let searchOrderBy = ''; // Track search ORDER BY clause

    // Hybrid search: pg_trgm for 1-2 words, full-text search for 3+ words
    let parsedSearch: ReturnType<typeof parseHybridSearchQuery> | null = null;
    if (search && search.trim()) {
      parsedSearch = parseHybridSearchQuery(search.trim());

      const searchResult = buildHybridSearchClause(parsedSearch, baseParamIndex);
      baseWhereConditions.push(searchResult.whereClause);
      baseParams.push(...searchResult.params);
      baseParamIndex = searchResult.newParamIndex;

      // Store search info for similarity scoring and ordering
      searchParam = parsedSearch.normalizedQuery;
      searchStrategy = searchResult.similaritySelect || '';
      searchOrderBy = searchResult.orderBy || '';

      // Log search strategy for debugging
      logSearchStrategy(parsedSearch, 'GET /api/clients', searchResult.strategy);
    }

    // Add next_touchpoint_number filter if specified (supports multi-select array)
    if (nextTouchpointNumberQuery && nextTouchpointNumberQuery.length > 0) {
      const hasArchive = nextTouchpointNumberQuery.includes('archive');
      const numericValues = nextTouchpointNumberQuery
        .filter(v => v !== 'archive')
        .map(v => parseInt(v))
        .filter(n => !isNaN(n) && n >= 1 && n <= 7)
        .map(n => n - 1); // convert to completed count (touchpoint_number stores completed count)

      const parts: string[] = [];
      if (numericValues.length > 0) {
        parts.push(`COALESCE(c.touchpoint_number, 0) = ANY($${baseParamIndex}::int[])`);
        baseParams.push(numericValues);
        baseParamIndex++;
      }
      if (hasArchive) {
        parts.push(`(COALESCE(c.touchpoint_number, 0) >= 7 OR c.loan_released = true)`);
      }
      if (parts.length > 0) {
        baseWhereConditions.push(`(${parts.join(' OR ')})`);
      }
    }

    // Build WHERE clause for main query
    // Note: /clients endpoint has NO WHERE clause, but /assigned HAS WHERE c.deleted_at IS NULL
    // This will be handled differently in each endpoint
    const baseWhereConditionsJoined = baseWhereConditions.length > 0 ? baseWhereConditions.join(' AND ') : '';

    // ============================================
    // OPTIMIZED QUERY: Direct column access from clients table
    // ============================================
    // No CTEs needed - all touchpoint data available via denormalized columns
    const withGroupScoreCTE = ''; // No CTE needed

    // Get total count - direct query on clients table (no CTEs needed)
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM clients c
       WHERE c.deleted_at IS NULL
       ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}`,
      baseParams
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results - direct query on clients table (no CTEs needed)
    // Add similarity score or word match count to SELECT when search is active
    const similaritySelect = searchStrategy || '';

    // Build WHERE clause for main query
    const whereClause = baseWhereConditionsJoined
      ? `WHERE c.deleted_at IS NULL AND ${baseWhereConditionsJoined}`
      : `WHERE c.deleted_at IS NULL`;

    const mainQuery = `
      SELECT c.*,
        psg.region as psgc_region,
        psg.province as psgc_province,
        psg.mun_city as psgc_municipality,
        psg.barangay as psgc_barangay,
        COALESCE(
          addr.addresses_json, '[]'
        ) as addresses,
        COALESCE(
          phones.phones_json, '[]'
        ) as phone_numbers,
        -- touchpoint_number already stores the actual count (0-7), not next number
        COALESCE(c.touchpoint_number, 0) as completed_touchpoints,
        -- Calculate next touchpoint number (1-7 or null if complete)
        CASE
          WHEN c.touchpoint_number >= 7 THEN NULL
          ELSE c.touchpoint_number + 1
        END as next_touchpoint_number,
        c.next_touchpoint as next_touchpoint_type,
        (c.touchpoint_summary->-1->>'type') as last_touchpoint_type,
        (c.touchpoint_summary->-1->>'user_id')::uuid as last_touchpoint_user_id,
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM clients c
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', a.id,
          'client_id', a.client_id,
          'type', a.type,
          'street', a.street,
          'barangay', a.barangay,
          'city', a.city,
          'province', a.province,
          'postal_code', a.postal_code,
          'latitude', a.latitude,
          'longitude', a.longitude,
          'is_primary', a.is_primary,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )) as addresses_json
        FROM addresses a
        WHERE a.client_id = c.id
      ) addr ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', p.id,
          'client_id', p.client_id,
          'label', p.label,
          'number', p.number,
          'is_primary', p.is_primary,
          'created_at', p.created_at,
          'updated_at', p.updated_at
        )) as phones_json
        FROM phone_numbers p
        WHERE p.client_id = c.id
      ) phones ON true
      LEFT JOIN users lt ON lt.id = (c.touchpoint_summary->-1->>'user_id')::uuid
      ${whereClause}
      ${searchOrderBy && searchOrderBy.trim().length > 0
        ? `ORDER BY ${searchOrderBy}, ${orderByClause}`
        : `ORDER BY ${orderByClause}`}
      LIMIT $${baseParamIndex} OFFSET $${baseParamIndex + 1}
    `;

    const result = await pool.query(mainQuery, [...baseParams, perPage, offset]);

    const clientsList = result.rows.map(row => {
      const completedCount = parseInt(row.completed_touchpoints) || 0;
      // Use next_touchpoint_number from SQL query instead of calculating
      const nextTouchpointNumber = row.next_touchpoint_number;
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
          canCreateTouchpoint = nextTouchpointType === 'Visit' || completedCount === 0;
          expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
        } else if (user.role === 'tele') {
          // Tele: Only Call types (2, 3, 5, 6)
          // FIX: Cannot create touchpoint 1 (Visit) - that's for Caravan
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
          is_complete: completedCount >= 7 || loanReleased, // Complete when 7/7 touchpoints OR loan released
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
    // Preserve the actual error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fetch clients error details:', errorMessage);
    console.error('Fetch clients error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error(`Failed to fetch clients: ${errorMessage}`);
  }
});

// GET /api/clients/assigned - List ASSIGNED clients for Tele/Caravan (with area filter + callable status)
clients.get('/assigned', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    let perPage = parseInt(c.req.query('perPage') || '20');

    // Enforce MAX_PER_PAGE limit for security and performance
    if (perPage > MAX_PER_PAGE) {
      throw new ValidationError(`perPage cannot exceed ${MAX_PER_PAGE}`);
    }

    const search = c.req.query('search');
    const caravanId = c.req.query('caravan_id');
    const touchpointStatusQuery = c.req.queries('touchpoint_status'); // callable, completed, has_progress, no_progress
    const sortBy = c.req.query('sort_by'); // touchpoint_status, created_at, etc.
    const nextTouchpointNumberQuery = c.req.queries('next_touchpoint_number'); // array of 1-7 and/or 'archive'

    const municipalityQuery = c.req.queries('municipality');
    const provinceQuery = c.req.queries('province');
    const municipality = municipalityQuery?.length ? municipalityQuery : undefined;
    const province = provinceQuery?.length ? provinceQuery : undefined;

    const { conditions: sharedConditions, params: sharedParams, nextIdx: sharedNextIdx } = buildClientFilters({
      client_type: c.req.queries('client_type')?.length ? c.req.queries('client_type') : undefined,
      product_type: c.req.queries('product_type')?.length ? c.req.queries('product_type') : undefined,
      market_type: c.req.queries('market_type')?.length ? c.req.queries('market_type') : undefined,
      pension_type: c.req.queries('pension_type')?.length ? c.req.queries('pension_type') : undefined,
      loan_type: c.req.queries('loan_type')?.length ? c.req.queries('loan_type') : undefined,
      agency_id: c.req.query('agency_id'),
      municipality,
      province,
    });

    // Handle touchpoint_status (can be array or string)
    let touchpointStatus: string[] | undefined;
    if (touchpointStatusQuery) {
      if (Array.isArray(touchpointStatusQuery)) {
        touchpointStatus = touchpointStatusQuery;
      } else {
        touchpointStatus = [touchpointStatusQuery];
      }
    }

    const offset = (page - 1) * perPage;

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

    // IMPORTANT: This endpoint ALWAYS filters by user's assigned areas
    // Caravan/Tele: Filter by their assigned provinces/municipalities from user_locations
    // Admin/Manager: See all clients (no area filter needed)
    const shouldFilterByArea = (userLevel < 40 || ['caravan', 'tele'].includes(user.role));

    // Determine which touchpoint status groups to include
    // If touchpointStatus is undefined/empty, show all groups (no filtering)
    // Otherwise, only include the selected groups
    const includeCallable = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('callable');
    const includeWaitingForCaravan = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('waiting_for_caravan');
    const includeCompleted = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('completed');
    const includeLoanReleased = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('loan_released');
    const includeNoProgress = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('no_progress');

    // ============================================
    // CACHE LAYER: Get assigned client IDs from cache
    // ============================================
    // For Caravan/Tele with area filtering, try cache first
    // This avoids expensive area-based queries on every request
    let cachedClientIds: string[] | null = null;
    const clientsCache = getClientsCacheService();

    if (shouldFilterByArea && !search && sharedConditions.length === 0) {
      // Only use cache when no additional filters are present
      // (cache stores base assigned client IDs for the user)
      cachedClientIds = await clientsCache.getAssignedClientIds(user.sub);
      console.debug(`[AssignedClients] Cache ${cachedClientIds ? 'HIT' : 'MISS'} for user ${user.sub}`);
    }

    // Build WHERE clause conditions — soft delete + shared filters, then search appended below
    const baseWhereConditions: string[] = ['c.deleted_at IS NULL', ...sharedConditions];
    const baseParams: any[] = [...sharedParams];
    let baseParamIndex = sharedNextIdx;
    let searchParam = ''; // Track search parameter for similarity scoring
    let searchStrategy = ''; // Track search strategy for SELECT clause
    let searchOrderBy = ''; // Track search ORDER BY clause

    // Hybrid search: pg_trgm for 1-2 words, full-text search for 3+ words
    if (search) {
      const parsedSearch = parseHybridSearchQuery(search);

      const searchResult = buildHybridSearchClause(parsedSearch, baseParamIndex);
      baseWhereConditions.push(searchResult.whereClause);
      baseParams.push(...searchResult.params);
      baseParamIndex = searchResult.newParamIndex;

      // Store search info for similarity scoring and ordering
      searchParam = parsedSearch.normalizedQuery;
      searchStrategy = searchResult.similaritySelect || '';
      searchOrderBy = searchResult.orderBy || '';

      // Log search strategy for debugging
      logSearchStrategy(parsedSearch, 'GET /api/clients/assigned', searchResult.strategy);
    }

    // Add tele_member_ids filter for managers: restrict to clients assigned to specific tele users
    const teleMemberIdsQuery = c.req.queries('tele_member_ids');
    const teleMemberIds = teleMemberIdsQuery?.length ? teleMemberIdsQuery : undefined;
    if (teleMemberIds && teleMemberIds.length > 0) {
      baseWhereConditions.push(`c.user_id = ANY($${baseParamIndex}::uuid[])`);
      baseParams.push(teleMemberIds);
      baseParamIndex += 1;
    }

    // Add next_touchpoint_number filter if specified (supports multi-select array)
    if (nextTouchpointNumberQuery && nextTouchpointNumberQuery.length > 0) {
      const hasArchive = nextTouchpointNumberQuery.includes('archive');
      const numericValues = nextTouchpointNumberQuery
        .filter(v => v !== 'archive')
        .map(v => parseInt(v))
        .filter(n => !isNaN(n) && n >= 1 && n <= 7)
        .map(n => n - 1); // convert to completed count (touchpoint_number stores completed count)

      const parts: string[] = [];
      if (numericValues.length > 0) {
        parts.push(`COALESCE(c.touchpoint_number, 0) = ANY($${baseParamIndex}::int[])`);
        baseParams.push(numericValues);
        baseParamIndex++;
      }
      if (hasArchive) {
        parts.push(`(COALESCE(c.touchpoint_number, 0) >= 7 OR c.loan_released = true)`);
      }
      if (parts.length > 0) {
        baseWhereConditions.push(`(${parts.join(' OR ')})`);
      }
    }

    // Apply touchpoint_status filter to WHERE clause
    if (touchpointStatus && touchpointStatus.length > 0) {
      const tsConds: string[] = [];
      if (includeCallable) {
        tsConds.push(`(c.next_touchpoint = 'Call' AND COALESCE(c.touchpoint_number, 0) < 7 AND c.loan_released = false)`);
      }
      if (includeWaitingForCaravan) {
        tsConds.push(`(c.next_touchpoint = 'Visit' AND COALESCE(c.touchpoint_number, 0) < 7 AND c.loan_released = false)`);
      }
      if (includeNoProgress) {
        tsConds.push(`(COALESCE(c.touchpoint_number, 0) = 0 AND c.loan_released = false)`);
      }
      if (includeCompleted) {
        tsConds.push(`(COALESCE(c.touchpoint_number, 0) >= 7 AND c.loan_released = false)`);
      }
      if (includeLoanReleased) {
        tsConds.push(`c.loan_released = true`);
      }
      if (tsConds.length > 0) {
        baseWhereConditions.push(`(${tsConds.join(' OR ')})`);
      }
    }

    // Build WHERE clause for main query
    // Note: /clients endpoint has NO WHERE clause, but /assigned HAS WHERE c.deleted_at IS NULL
    // This will be handled differently in each endpoint
    const baseWhereConditionsJoined = baseWhereConditions.length > 0 ? baseWhereConditions.join(' AND ') : '';

    // Build optimized query using denormalized columns
    // CTE only for user_areas (Caravan/Tele filtering)
    // Touchpoint data accessed directly from clients table columns

    // Add area filter conditions for Caravan/Tele roles
    // Note: Main query already has WHERE c.deleted_at IS NULL, so this only adds AND conditions
    let areaFilterWhereClause = '';
    if (shouldFilterByArea) {
      // For Caravan/Tele: Filter by assigned provinces/municipalities
      // Using the new province and municipality columns directly
      // NOTE: Using UPPER() for case-insensitive matching due to data inconsistencies
      // (e.g., "METRO MANILA" vs "Metro Manila" in database)
      areaFilterWhereClause = `AND (
        UPPER(c.province) IN (SELECT UPPER(province) FROM user_areas)
        AND UPPER(c.municipality) IN (SELECT UPPER(municipality) FROM user_areas)
      )`;
    }

    // OPTIMIZED: Use denormalized touchpoint columns directly from clients table
    // Build WITH clause only for user_areas if needed - no touchpoint_info CTE needed
    let withGroupScoreCTE = '';
    if (shouldFilterByArea) {
      withGroupScoreCTE = `WITH user_areas AS (
        SELECT province, municipality
        FROM user_locations
        WHERE user_id = '${user.sub}' AND deleted_at IS NULL
      )`;
    }

    // OPTIMIZATION: Using denormalized columns from clients table
    // No CTEs needed for touchpoint calculations - using direct column access

    // Get total count
    const countQuery = `
      ${withGroupScoreCTE}
      SELECT COUNT(*) as count
      FROM clients c
      WHERE c.deleted_at IS NULL
      ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}
      ${areaFilterWhereClause ? areaFilterWhereClause : ''}
    `;

    const countResult = await pool.query(countQuery, baseParams);
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results - direct query on clients table (no CTEs needed)
    // IMPORTANT: Query uses direct column access for optimal performance
    // Add similarity score or word match count to SELECT when search is active
    const similaritySelect = searchStrategy || '';

    const mainQuery = `
      ${withGroupScoreCTE}
      SELECT c.*,
        psg.region as psgc_region,
        psg.province as psgc_province,
        psg.mun_city as psgc_municipality,
        psg.barangay as psgc_barangay,
        COALESCE(
          addr.addresses_json, '[]'
        ) as addresses,
        COALESCE(
          phones.phones_json, '[]'
        ) as phone_numbers,
        -- touchpoint_number already stores the actual count (0-7), not next number
        COALESCE(c.touchpoint_number, 0) as completed_touchpoints,
        -- Calculate next touchpoint number (1-7 or null if complete) — mirrors /clients endpoint
        CASE
          WHEN COALESCE(c.touchpoint_number, 0) >= 7 THEN NULL
          ELSE COALESCE(c.touchpoint_number, 0) + 1
        END as next_touchpoint_number,
        c.next_touchpoint as next_touchpoint_type,
        (c.touchpoint_summary->-1->>'type') as last_touchpoint_type,
        (c.touchpoint_summary->-1->>'user_id')::uuid as last_touchpoint_user_id,
        -- Calculate group_score for ordering
        CASE
          WHEN (c.next_touchpoint IS NOT NULL OR COALESCE(c.touchpoint_number, 1) = 1)
            AND COALESCE(c.touchpoint_number, 1) < 7 AND NOT c.loan_released THEN 1
          WHEN COALESCE(c.touchpoint_number, 1) >= 7 OR c.loan_released THEN 2
          ELSE 3
        END as group_score${similaritySelect},
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM clients c
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', a.id,
          'client_id', a.client_id,
          'type', a.type,
          'street', a.street,
          'barangay', a.barangay,
          'city', a.city,
          'province', a.province,
          'postal_code', a.postal_code,
          'latitude', a.latitude,
          'longitude', a.longitude,
          'is_primary', a.is_primary,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )) as addresses_json
        FROM addresses a
        WHERE a.client_id = c.id
      ) addr ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', p.id,
          'client_id', p.client_id,
          'label', p.label,
          'number', p.number,
          'is_primary', p.is_primary,
          'created_at', p.created_at,
          'updated_at', p.updated_at
        )) as phones_json
        FROM phone_numbers p
        WHERE p.client_id = c.id
      ) phones ON true
      LEFT JOIN users lt ON lt.id = (c.touchpoint_summary->-1->>'user_id')::uuid
      WHERE c.deleted_at IS NULL
      ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}
      ${areaFilterWhereClause ? areaFilterWhereClause : ''}
      ${searchOrderBy && searchOrderBy.trim().length > 0 ? `ORDER BY ${searchOrderBy},` : `ORDER BY`}
        CASE
          WHEN (c.next_touchpoint IS NOT NULL OR COALESCE(c.touchpoint_number, 1) = 1)
            AND COALESCE(c.touchpoint_number, 1) < 7 AND NOT c.loan_released THEN 1
          WHEN COALESCE(c.touchpoint_number, 1) >= 7 OR c.loan_released THEN 2
          ELSE 3
        END ASC
      LIMIT $${baseParamIndex} OFFSET $${baseParamIndex + 1}
    `;

    const result = await pool.query(mainQuery, [...baseParams, perPage, offset]);

    // ============================================
    // CACHE POPULATION: Populate cache on miss
    // ============================================
    // If cache was empty, populate it with the client IDs from this query
    // Only cache when no additional filters were present (base assigned clients)
    if (shouldFilterByArea && !cachedClientIds && !search && sharedConditions.length === 0) {
      // Extract client IDs from the result
      const clientIds = result.rows.map(row => row.id);
      if (clientIds.length > 0) {
        // Get user's assigned areas for caching
        const areasQuery = `
          SELECT DISTINCT province, municipality
          FROM user_locations
          WHERE user_id = $1 AND deleted_at IS NULL
        `;
        const areasResult = await pool.query(areasQuery, [user.sub]);
        const areas = areasResult.rows.map(row => `${row.province}:${row.municipality}`);

        // Populate cache
        await clientsCache.setAssignedClientIds(user.sub, clientIds, areas);
        console.debug(`[AssignedClients] Cached ${clientIds.length} client IDs for user ${user.sub}`);
      }
    }

    const clientsList = result.rows.map(row => {
      const completedCount = parseInt(row.completed_touchpoints) || 0;
      const nextTouchpointNumber = row.next_touchpoint_number ?? null;
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
          canCreateTouchpoint = nextTouchpointType === 'Visit' || completedCount === 0;
          expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
        } else if (user.role === 'tele') {
          // Tele: Only Call types (2, 3, 5, 6)
          // FIX: Cannot create touchpoint 1 (Visit) - that's for Caravan
          canCreateTouchpoint = nextTouchpointType === 'Call';
          expectedRole = canCreateTouchpoint ? 'tele' : 'caravan';
        } else {
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
    console.error('Fetch assigned clients error:', error);
    // Preserve the actual error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fetch assigned clients error details:', errorMessage);
    console.error('Fetch assigned clients error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error(`Failed to fetch assigned clients: ${errorMessage}`);
  }
});

// GET /api/clients/:id - Get single client with full details
clients.get('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

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
        c.touchpoint_summary as touchpoints
       FROM clients c
       LEFT JOIN psgc psg ON psg.id = c.psgc_id
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       WHERE c.id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay, c.touchpoint_summary
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
        canCreateTouchpoint = nextTouchpointType === 'Visit' || completedTouchpoints === 0;
        expectedRole = canCreateTouchpoint ? 'caravan' : 'tele';
      } else if (user.role === 'tele') {
        // Tele: Only Call types (2, 3, 5, 6)
        // FIX: Cannot create touchpoint 1 (Visit) - that's for Caravan
        canCreateTouchpoint = nextTouchpointType === 'Call';
        expectedRole = canCreateTouchpoint ? 'tele' : 'caravan';
      } else {
        canCreateTouchpoint = true;
        expectedRole = nextTouchpointType === 'Visit' ? 'caravan' : 'tele';
      }
    }

    // Fetch visits for this client
    const visitsResult = await pool.query(
      `SELECT v.*, u.first_name as agent_first_name, u.last_name as agent_last_name
       FROM visits v
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.client_id = $1
       ORDER BY v.time_in DESC NULLS LAST`,
      [id]
    );

    return c.json({
      ...mapRowToClient(client),
      // Put touchpoints at root level for mobile Client.fromJson() compatibility
      touchpoints: client.touchpoints,
      expand: {
        addresses: client.addresses,
        phone_numbers: client.phone_numbers,
        visits: visitsResult.rows,
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const body = await c.req.json();
    const validated = createClientSchema.parse(body);

    // For Tele and Caravan users, create approval request instead of inserting directly
    if (user.role === 'tele' || user.role === 'caravan') {
      // Store client data as JSON in notes field
      const clientData = JSON.stringify(validated);

      // Create approval request for client creation
      const approvalResult = await client.query(
        `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
         VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        ['client', user.sub, user.role, 'Client Creation Request', clientData]
      );

      await client.query('COMMIT');

      return c.json({
        message: 'Client creation submitted for approval',
        approval: mapRowToApproval(approvalResult.rows[0]),
        requires_approval: true
      });
    }

    // For Admin users, create directly
    const result = await client.query(
      `INSERT INTO clients (
        id, first_name, last_name, middle_name, birth_date, email, phone,
        agency_name, department, position, employment_status, payroll_date, tenure,
        client_type, product_type, market_type, pension_type, loan_type, pan, facebook_link, remarks,
        agency_id, is_starred,
        ext_name, fullname, full_address, account_code, account_number, rank,
        monthly_pension_amount, monthly_pension_gross, atm_number, applicable_republic_act,
        unit_code, pcni_acct_code, dob, g_company, g_status, status,
        created_by
      ) VALUES (
        COALESCE($42, gen_random_uuid()), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
      ) ON CONFLICT (id) DO UPDATE SET updated_at = clients.updated_at
      RETURNING *`,
      [
        validated.first_name, validated.last_name, validated.middle_name, validated.birth_date,
        validated.email, validated.phone, validated.agency_name, validated.department,
        validated.position, validated.employment_status, validated.payroll_date, validated.tenure,
        validated.client_type, validated.product_type, validated.market_type, validated.pension_type,
        validated.loan_type,
        validated.pan, validated.facebook_link, validated.remarks, validated.agency_id,
        validated.is_starred,
        validated.ext_name, validated.fullname, validated.full_address, validated.account_code,
        validated.account_number, validated.rank, validated.monthly_pension_amount,
        validated.monthly_pension_gross, validated.atm_number, validated.applicable_republic_act,
        validated.unit_code, validated.pcni_acct_code, validated.dob, validated.g_company,
        validated.g_status, validated.status,
        user.sub,
        validated.id ?? null
      ]
    );

    await client.query('COMMIT');
    return c.json(mapRowToClient(result.rows[0]), 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create client error:', error);
    throw new Error();
  } finally {
    client.release();
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

    // Check if client exists (not soft-deleted)
    const existingResult = await client.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
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
      region: 'region',
      province: 'province',
      municipality: 'municipality',
      barangay: 'barangay',
      is_starred: 'is_starred',
      loan_released: 'loan_released',
      loan_released_at: 'loan_released_at',
      // Legacy PCNICMS fields
      ext_name: 'ext_name',
      fullname: 'fullname',
      full_address: 'full_address',
      account_code: 'account_code',
      account_number: 'account_number',
      rank: 'rank',
      monthly_pension_amount: 'monthly_pension_amount',
      monthly_pension_gross: 'monthly_pension_gross',
      atm_number: 'atm_number',
      applicable_republic_act: 'applicable_republic_act',
      unit_code: 'unit_code',
      pcni_acct_code: 'pcni_acct_code',
      dob: 'dob',
      g_company: 'g_company',
      g_status: 'g_status',
      status: 'status',
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

    // Check if client exists (not soft-deleted)
    const existingResult = await client.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
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

// DELETE /api/clients/:id - Delete client (soft delete; approval required for tele/caravan)
clients.delete('/:id', authMiddleware, requirePermission('clients', 'delete'), auditMiddleware('client'), async (c) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const user = c.get('user');
    const id = c.req.param('id');

    // Check if client exists and is not already deleted
    const existingResult = await dbClient.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existingResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      throw new NotFoundError('Client');
    }

    // Tele/Caravan: submit for approval instead of deleting directly
    if (user.role === 'tele' || user.role === 'caravan') {
      const approvalResult = await dbClient.query(
        `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        ['client_delete', id, user.sub, user.role, 'Delete Client Request', null]
      );

      await dbClient.query('COMMIT');

      return c.json({
        message: 'Client deletion submitted for approval',
        approval: mapRowToApproval(approvalResult.rows[0]),
        requires_approval: true
      });
    }

    // Admin: soft delete immediately
    await dbClient.query('UPDATE clients SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [user.sub, id]);
    await dbClient.query('COMMIT');
    return c.json({ message: 'Client deleted successfully' });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Delete client error:', error);
    throw error;
  } finally {
    dbClient.release();
  }
});

// POST /api/clients/:id/addresses - Add address to client
clients.post('/:id/addresses', authMiddleware, async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = addressSchema.parse(body);

    // For Tele and Caravan users, create approval request instead of inserting directly
    if (user.role === 'tele' || user.role === 'caravan') {
      // Store address data as JSON in notes field
      const addressData = JSON.stringify(validated);

      // Create approval request for address addition
      const approvalResult = await client.query(
        `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        ['address_add', clientId, user.sub, user.role, 'Add Address Request', addressData]
      );

      await client.query('COMMIT');

      return c.json({
        message: 'Address addition submitted for approval',
        approval: mapRowToApproval(approvalResult.rows[0]),
        requires_approval: true
      });
    }

    // For Admin users, create directly
    const result = await client.query(
      `INSERT INTO addresses (id, client_id, type, street, barangay, city, province, postal_code, latitude, longitude, is_primary)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [clientId, validated.type, validated.street, validated.barangay, validated.city,
       validated.province, validated.postal_code, validated.latitude, validated.longitude, validated.is_primary]
    );

    await client.query('COMMIT');
    return c.json(result.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add address error:', error);
    throw new Error();
  } finally {
    client.release();
  }
});

// POST /api/clients/:id/phones - Add phone number to client
clients.post('/:id/phones', authMiddleware, async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const clientId = c.req.param('id');
    const body = await c.req.json();
    const validated = phoneSchema.parse(body);

    // For Tele and Caravan users, create approval request instead of inserting directly
    if (user.role === 'tele' || user.role === 'caravan') {
      // Store phone data as JSON in notes field
      const phoneData = JSON.stringify(validated);

      // Create approval request for phone addition
      const approvalResult = await client.query(
        `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        ['phone_add', clientId, user.sub, user.role, 'Add Phone Number Request', phoneData]
      );

      await client.query('COMMIT');

      return c.json({
        message: 'Phone number addition submitted for approval',
        approval: mapRowToApproval(approvalResult.rows[0]),
        requires_approval: true
      });
    }

    // For Admin users, create directly
    const result = await client.query(
      `INSERT INTO phone_numbers (id, client_id, type, number, label, is_primary)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [clientId, validated.type, validated.number, validated.label, validated.is_primary]
    );

    await client.query('COMMIT');
    return c.json(result.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Add phone error:', error);
    throw new Error();
  } finally {
    client.release();
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
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Hybrid search: pg_trgm for 1-2 words, full-text search for 3+ words
    if (search) {
      const parsedSearch = parseHybridSearchQuery(search);

      const searchResult = buildHybridSearchClause(parsedSearch, paramIndex);
      conditions.push(searchResult.whereClause);
      params.push(...searchResult.params);
      paramIndex = searchResult.newParamIndex;

      // Log search strategy for debugging
      logSearchStrategy(parsedSearch, 'GET /api/clients/search/unassigned', searchResult.strategy);
    }

    // Soft delete filter: Only show active clients (not deleted)
    conditions.push(`c.deleted_at IS NULL`);

    if (clientType && clientType !== 'all') {
      const values = clientType.split(',').map((v: string) => v.trim()).filter(Boolean);
      conditions.push(`c.client_type = ANY($${paramIndex}::text[])`);
      params.push(values);
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

    // Step 5: Trigram fallback (Strategy 3) for clients unmatched by strategies 1 & 2
    // Uses pg_trgm similarity() to catch spelling variants like BALIUAG → Baliwag.
    // Thresholds: municipality >= 0.35, province >= 0.5 (province stricter to prevent cross-province matches).
    if (unmatched.length > 0) {
      const TRGM_CHUNK_SIZE = 1000; // 3 params per client = 3000 params per chunk
      const trigramMatched: string[] = []; // client IDs resolved by this step

      for (let i = 0; i < unmatched.length; i += TRGM_CHUNK_SIZE) {
        const chunk = unmatched.slice(i, i + TRGM_CHUNK_SIZE).filter(u => u.province && u.municipality);
        if (chunk.length === 0) continue;

        const valuesClause = chunk.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(', ');
        const params = chunk.flatMap(u => [u.client_id, u.municipality, u.province]);

        const result = await pool.query<{
          client_id: string;
          psgc_id: number;
          region: string;
          province: string;
          mun_city: string;
          barangay: string;
        }>(`
          SELECT DISTINCT ON (v.client_id)
            v.client_id,
            p.id AS psgc_id,
            p.region,
            p.province,
            p.mun_city,
            p.barangay
          FROM (VALUES ${valuesClause}) AS v(client_id, municipality, province)
          JOIN psgc p
            ON similarity(lower(p.mun_city), lower(v.municipality)) >= 0.35
           AND similarity(lower(p.province), lower(v.province)) >= 0.5
          ORDER BY v.client_id,
            (similarity(lower(p.mun_city), lower(v.municipality)) + similarity(lower(p.province), lower(v.province))) DESC
        `, params);

        for (const row of result.rows) {
          matched.push({
            client_id: row.client_id,
            client_name: chunk.find(u => u.client_id === row.client_id)?.client_name ?? '',
            psgc_id: row.psgc_id,
            match_type: 'trigram_match',
            province: row.province,
            municipality: row.mun_city,
          });
          updates.push({
            clientId: row.client_id,
            psgcId: row.psgc_id,
            region: row.region,
            province: row.province,
            municipality: row.mun_city,
            barangay: row.barangay,
          });
          trigramMatched.push(row.client_id);
        }
      }

      // Remove trigram-matched clients from unmatched list
      if (trigramMatched.length > 0) {
        const resolvedSet = new Set(trigramMatched);
        unmatched.splice(0, unmatched.length, ...unmatched.filter(u => !resolvedSet.has(u.client_id)));
      }
    }

    // Step 6: Batch UPDATE all matched clients in chunks
    // PostgreSQL has a hard limit of 65535 parameters per query (16-bit counter).
    // With 6 params per row, chunks of 1000 rows = 6000 params — safely within the limit.
    if (!dryRun && updates.length > 0) {
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const valuesClause = chunk.map((_, j) => `($${j * 6 + 1}, $${j * 6 + 2}, $${j * 6 + 3}, $${j * 6 + 4}, $${j * 6 + 5}, $${j * 6 + 6})`).join(', ');
        const params = chunk.flatMap(u => [u.clientId, u.psgcId, u.region, u.province, u.municipality, u.barangay]);

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

// POST /api/clients/:id/psgc - Assign PSGC to a single client (complete with barangay)
clients.post(
  '/:id/psgc',
  authMiddleware,
  requirePermission('clients', 'update'),
  async (c) => {
    try {
      const user = c.get('user');
      const clientId = c.req.param('id');

      // Validation schema for single PSGC assignment (with barangay)
      const singlePsgcSchema = z.object({
        psgc_id: z.number().int().positive(),
        region: z.string().optional(),
        province: z.string().optional(),
        municipality: z.string().optional(),
        barangay: z.string().optional(),
      });

      const body = await c.req.json();
      const validated = singlePsgcSchema.parse(body);

      // Verify PSGC exists in PSGC table
      const psgcCheck = await pool.query(
        'SELECT id, region, province, mun_city, barangay FROM psgc WHERE id = $1',
        [validated.psgc_id]
      );

      if (psgcCheck.rows.length === 0) {
        throw new NotFoundError('PSGC record not found');
      }

      const psgc = psgcCheck.rows[0];

      // Update client with complete PSGC information (including barangay)
      const result = await pool.query(
        `UPDATE clients
         SET psgc_id = $1,
             psgc_region = $2,
             psgc_province = $3,
             psgc_municipality = $4,
             psgc_barangay = $5,
             region = COALESCE($6, region),
             province = COALESCE($7, province),
             municipality = COALESCE($8, municipality),
             barangay = COALESCE($9, barangay),
             updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          validated.psgc_id,
          psgc.region,
          psgc.province,
          psgc.mun_city,
          psgc.barangay,
          validated.region || psgc.region,
          validated.province || psgc.province,
          validated.municipality || psgc.mun_city,
          validated.barangay || psgc.barangay,
          clientId,
        ]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Client not found');
      }

      // Log assignment for audit trail
      await pool.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.sub,
          'psgc_assigned',
          'client',
          clientId,
          JSON.stringify({
            psgc_id: validated.psgc_id,
            region: psgc.region,
            province: psgc.province,
            municipality: psgc.mun_city,
            barangay: psgc.barangay,
          }),
        ]
      );

      return c.json({
        success: true,
        message: 'PSGC assigned successfully',
        client: mapRowToClient(result.rows[0]),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid request body');
        validationError.addDetail('errors', error.errors);
        throw validationError;
      }
      throw error;
    }
  }
);

// POST /api/clients/psgc/batch - Batch assign municipality (without barangay/PSGC ID)
clients.post(
  '/psgc/batch',
  authMiddleware,
  requirePermission('clients', 'update'),
  async (c) => {
    try {
      const user = c.get('user');

      // Validation schema for batch PSGC assignment with PSGC ID (from first barangay)
      const batchPsgcSchema = z.object({
        assignments: z
          .array(
            z.object({
              client_id: z.string().uuid(),
              psgc_id: z.number().int().positive().optional(),
              region: z.string(),
              province: z.string(),
              municipality: z.string(),
            })
          )
          .min(1)
          .max(100), // Max 100 assignments per batch
      });

      const body = await c.req.json();
      const validated = batchPsgcSchema.parse(body);

      const results = {
        success: [] as string[],
        failed: [] as { client_id: string; error: string }[],
      };

      // Process each assignment
      for (const assignment of validated.assignments) {
        try {
          // Update client with municipality information only (no barangay, no PSGC ID)
          await pool.query(
            `UPDATE clients
             SET region = $1,
                 province = $2,
                 municipality = $3,
                 psgc_id = $4,  -- Use PSGC ID from first barangay
                 updated_at = NOW()
             WHERE id = $5`,
            [
              assignment.region,
              assignment.province,
              assignment.municipality,
              assignment.psgc_id || null,  // Use PSGC ID if provided, otherwise NULL
              assignment.client_id,
            ]
          );

          results.success.push(assignment.client_id);
        } catch (error) {
          results.failed.push({
            client_id: assignment.client_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Log batch assignment for audit trail
      // TODO: Implement audit logging when audit_log table is created
      // await pool.query(
      //   `INSERT INTO audit_log (user_id, action, entity_type, details)
      //      VALUES ($1, $2, $3, $4)`,
      //   [
      //     user.sub,
      //     'psgc_batch_municipality_assigned',
      //     'client',
      //     JSON.stringify({
      //       total: validated.assignments.length,
      //       successful: results.success.length,
      //       failed: results.failed.length,
      //     }),
      //   ]
      // );

      return c.json({
        success: true,
        message: `Municipality assignment completed: ${results.success.length} successful, ${results.failed.length} failed`,
        results,
        note: results.success.length > 0
          ? 'Individual barangay assignment will be required for complete PSGC matching.'
          : undefined,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid request body');
        validationError.addDetail('errors', error.errors);
        throw validationError;
      }
      throw error;
    }
  }
);

// POST /api/clients/check-duplicates - Check which name+pension_type combos already exist in DB
clients.post('/check-duplicates', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      rows: z.array(z.object({
        name: z.string(),
        pension_type: z.string()
      }))
    })
    const { rows } = schema.parse(body)

    const result = await pool.query(
      `SELECT last_name, first_name, middle_name, pension_type
       FROM clients
       WHERE deleted_at IS NULL`
    )

    const dbDupKeys = new Set<string>()
    const dbNameKeys = new Set<string>()

    for (const row of result.rows) {
      const nameKey = [row.last_name, row.first_name, row.middle_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .trim()
      dbDupKeys.add(`${nameKey}|${(row.pension_type || '').toLowerCase().trim()}`)
      dbNameKeys.add(nameKey)
    }

    const duplicates: string[] = []
    const nameConflicts: string[] = []

    for (const row of rows) {
      const normalizedName = row.name.toLowerCase().trim()
      const dupKey = `${normalizedName}|${row.pension_type.toLowerCase().trim()}`
      if (dbDupKeys.has(dupKey)) {
        duplicates.push(dupKey)
      } else if (dbNameKeys.has(normalizedName)) {
        nameConflicts.push(normalizedName)
      }
    }

    return c.json({ duplicates, nameConflicts })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400)
    }
    throw error
  }
})

// POST /api/clients/bulk-upload - Enqueue a bulk upload job
clients.post('/bulk-upload', authMiddleware, requirePermission('clients', 'create'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()

    const schema = z.object({
      rows: z.array(z.object({
        last_name: z.string().min(1),
        first_name: z.string().min(1),
        middle_name: z.string().optional(),
        ext_name: z.string().optional(),
        pension_type: z.string().min(1),
        client_type: z.string().optional(),
        product_type: z.string().optional(),
        market_type: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        birth_date: z.string().optional(),
        province: z.string().optional(),
        municipality: z.string().optional(),
        barangay: z.string().optional(),
        pan: z.string().optional(),
        facebook_link: z.string().optional(),
        remarks: z.string().optional(),
        rank: z.string().optional(),
        account_number: z.string().optional(),
        atm_number: z.string().optional(),
        unit_code: z.string().optional(),
        _originalRow: z.record(z.string()),
        _rowNumber: z.number(),
      })).min(1, 'At least one row is required')
    })

    const { rows } = schema.parse(body)

    const jobData: BulkUploadJobData = {
      userId: user.sub,
      userRole: user.role,
      rows,
    }

    const queueManager = getQueueManager()
    const queue = queueManager.getQueue({ name: QUEUE_NAMES.BULK_UPLOAD })
    const job = await queue.add(BulkJobType.BULK_UPLOAD_CLIENTS, jobData, {
      attempts: 1,
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    })

    return c.json({ jobId: job.id ?? '' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400)
    }
    throw error
  }
})

// GET /api/clients/bulk-upload/:jobId/status - Poll job status
clients.get('/bulk-upload/:jobId/status', authMiddleware, async (c) => {
  const jobId = c.req.param('jobId')
  if (!jobId) return c.json({ error: 'Job ID is required' }, 400)
  const queueManager = getQueueManager()
  const queue = queueManager.getQueue({ name: QUEUE_NAMES.BULK_UPLOAD })
  const job = await queue.getJob(jobId)

  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const state = await job.getState()

  return c.json({
    state,
    progress: job.progress,
    result: state === 'completed' ? job.returnvalue : null,
    failedReason: state === 'failed' ? job.failedReason : null,
  })
})

// POST /api/clients/bulk-create - Bulk create clients from CSV upload
clients.post('/bulk-create', authMiddleware, requirePermission('clients', 'create'), auditMiddleware('client'), async (c) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = c.get('user');
    const body = await c.req.json();

    // Validate request structure
    const bulkCreateSchema = z.object({
      clients: z.array(z.object({
        first_name: z.string().min(1).max(255),
        last_name: z.string().min(1).max(255),
        middle_name: z.string().max(255).optional(),
        birth_date: z.string().max(50).optional(),
        email: z.string().email().max(255).optional().nullable(),
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
        barangay: z.string().max(255).optional(), // For address parsing
        province: z.string().max(255).optional(),
        municipality: z.string().max(255).optional(),
      }))
    });

    const validated = bulkCreateSchema.parse(body);

    let successful = 0;
    let failed = 0;
    const errors: Array<{ client: string; error: string }> = [];

    // Process each client
    for (const clientData of validated.clients) {
      try {
        // Validate individual client
        const validatedClient = createClientSchema.parse(clientData);

        // For Tele and Caravan users, create approval request instead of inserting directly
        if (user.role === 'tele' || user.role === 'caravan') {
          // Store client data as JSON in notes field
          const clientDataJson = JSON.stringify(validatedClient);

          // Create approval request for client creation
          await client.query(
            `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
               VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, 'pending')`,
            ['client', user.sub, user.role, 'Bulk Client Creation Request', clientDataJson]
          );

          successful++;
        } else {
          // For Admin users, create directly
          await client.query(
            `INSERT INTO clients (
              id, first_name, last_name, middle_name, birth_date, email, phone,
              agency_name, department, position, employment_status, payroll_date, tenure,
              client_type, product_type, market_type, pension_type, loan_type, pan, facebook_link, remarks,
              province, municipality, barangay, is_starred,
              ext_name, fullname, full_address, account_code, account_number, rank,
              monthly_pension_amount, monthly_pension_gross, atm_number, applicable_republic_act,
              unit_code, pcni_acct_code, dob, g_company, g_status, status,
              created_by
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, false,
              $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
            )`,
            [
              validatedClient.first_name,
              validatedClient.last_name,
              validatedClient.middle_name || null,
              validatedClient.birth_date || null,
              validatedClient.email || null,
              validatedClient.phone || null,
              validatedClient.agency_name || null,
              validatedClient.department || null,
              validatedClient.position || null,
              validatedClient.employment_status || null,
              validatedClient.payroll_date || null,
              validatedClient.tenure || null,
              validatedClient.client_type,
              validatedClient.product_type || null,
              validatedClient.market_type || null,
              validatedClient.pension_type || null,
              validatedClient.loan_type || null,
              validatedClient.pan || null,
              validatedClient.facebook_link || null,
              validatedClient.remarks || null,
              validatedClient.ext_name || null,
              validatedClient.fullname || null,
              validatedClient.full_address || null,
              validatedClient.account_code || null,
              validatedClient.account_number || null,
              validatedClient.rank || null,
              validatedClient.monthly_pension_amount || null,
              validatedClient.monthly_pension_gross || null,
              validatedClient.atm_number || null,
              validatedClient.applicable_republic_act || null,
              validatedClient.unit_code || null,
              validatedClient.pcni_acct_code || null,
              validatedClient.dob || null,
              validatedClient.g_company || null,
              validatedClient.g_status || null,
              validatedClient.status || 'active',
              user.sub
            ]
          );

          successful++;
        }
      } catch (error) {
        failed++;
        const clientName = `${clientData.first_name} ${clientData.last_name}`;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ client: clientName, error: errorMsg });

        // Log individual client error for debugging
        console.error(`[Bulk Create] Failed to create client ${clientName}:`, errorMsg);
      }
    }

    await client.query('COMMIT');

    return c.json({
      successful,
      failed,
      errors,
      message: `Bulk import completed: ${successful} successful, ${failed} failed`,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Validation failed');
      validationError.addDetail('errors', error.errors);
      throw validationError;
    }

    console.error('Bulk create clients error:', error);
    throw new Error('Failed to bulk create clients');
  } finally {
    client.release();
  }
});

export default clients;
