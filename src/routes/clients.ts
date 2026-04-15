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

// Helper function to ensure loan_type is always returned as string
function parseLoanType(value: any): string | null {
  if (value === null || value === undefined) return null;
  // Convert to string if it's a number or other type
  return String(value);
}

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
    const clientType = c.req.query('client_type');
    const agencyId = c.req.query('agency_id');
    const caravanId = c.req.query('caravan_id');
    // Use queries() for multi-value parameters (returns array or undefined)
    const municipalityQuery = c.req.queries('municipality');
    const provinceQuery = c.req.queries('province');
    const productType = c.req.query('product_type');
    const marketType = c.req.query('market_type');
    const pensionType = c.req.query('pension_type');
    const touchpointStatusQuery = c.req.queries('touchpoint_status'); // callable, completed, has_progress, no_progress
    const sortBy = c.req.query('sort_by'); // touchpoint_status, created_at, etc.

    // Handle multi-value query parameters
    // queries() returns array if multiple values, string if single, undefined if not provided
    const municipality = municipalityQuery && Array.isArray(municipalityQuery) ? municipalityQuery : (municipalityQuery ? [municipalityQuery] : undefined);
    const province = provinceQuery && Array.isArray(provinceQuery) ? provinceQuery : (provinceQuery ? [provinceQuery] : undefined);

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

    // Determine sort order BEFORE building CTE (needed in both CTE and final query)
    // DEFAULT: Use group scoring ordering (same as /clients/assigned)
    // Group 1 (callable): Next is Call, Group 2 (waiting): Next is Visit, Group 3: Completed, Group 4: Loan released, Group 5: No progress
    let orderByClause = `ORDER BY
      CASE
        WHEN {touchpoint_alias}.loan_released THEN 4
        WHEN COALESCE({touchpoint_alias}.completed_count, 0) >= 7 THEN 3
        WHEN {touchpoint_alias}.next_touchpoint_type = 'Call' AND COALESCE({touchpoint_alias}.completed_count, 0) < 7 THEN 1
        WHEN {touchpoint_alias}.next_touchpoint_type = 'Visit' AND COALESCE({touchpoint_alias}.completed_count, 0) < 7 THEN 2
        ELSE 5
      END ASC,
      (SELECT MAX(t.date) FROM touchpoints t WHERE t.client_id = c.id) DESC NULLS LAST,
      COALESCE({touchpoint_alias}.completed_count, 0) DESC,
      c.created_at DESC`;
    let groupScoreCase = '';

    if (sortBy === 'touchpoint_status') {
      // For Tele role with grouped CTEs: use pre-calculated group_score directly
      if (user.role === 'tele' && touchpointStatus) {
        // Tele uses grouped CTEs with pre-calculated group_score
        // Order by group_score ASC, then by completed_count DESC, then by created_at DESC
        orderByClause = `ORDER BY
          tws.group_score ASC,
          tws.completed_count DESC,
          c.created_at DESC`;
      } else {
        // For Caravan/Admin or when no touchpointStatus filter: use CASE expression
        const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

        // Determine if current user can create the next touchpoint
        let canCreateCondition = '';
        if (user.role === 'caravan') {
          canCreateCondition = `next_touchpoint_type = 'Visit' OR completed_count = 0`;
        } else {
          canCreateCondition = `next_touchpoint_type IS NOT NULL OR completed_count = 0`;
        }

        // Group score CASE expression
        groupScoreCase = `CASE
          WHEN (${canCreateCondition}) AND completed_count < 7 AND NOT c.loan_released THEN 1
          WHEN completed_count >= 7 OR c.loan_released THEN 2
          WHEN completed_count > 0 AND completed_count < 7 AND NOT (${canCreateCondition}) THEN 3
          ELSE 4
        END`;

        orderByClause = `ORDER BY
          ${groupScoreCase} ASC,
          {touchpoint_alias}.completed_count DESC,
          c.created_at DESC`;
      }
    }

    // Build WHERE clause conditions for basic client filtering
    // Note: touchpoint_status filtering will be done in CTE, not here
    const baseWhereConditions: string[] = [];
    const baseParams: any[] = [];
    let baseParamIndex = 1;
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

    if (marketType && marketType !== 'all') {
      baseWhereConditions.push(`c.market_type = $${baseParamIndex}`);
      baseParams.push(marketType);
      baseParamIndex++;
    }

    if (pensionType && pensionType !== 'all') {
      baseWhereConditions.push(`c.pension_type = $${baseParamIndex}`);
      baseParams.push(pensionType);
      baseParamIndex++;
    }

    if (agencyId) {
      baseWhereConditions.push(`c.agency_id = $${baseParamIndex}`);
      baseParams.push(agencyId);
      baseParamIndex++;
    }

    // Handle municipality filter (array for multiple selections, string for single)
    if (municipality) {
      if (Array.isArray(municipality)) {
        if (municipality.length > 0) {
          const municipalityPlaceholders = municipality.map((_, i) => `$${baseParamIndex + i}`).join(', ');
          baseWhereConditions.push(`c.municipality IN (${municipalityPlaceholders})`);
          baseParams.push(...municipality);
          baseParamIndex += municipality.length;
        }
      } else {
        baseWhereConditions.push(`c.municipality = $${baseParamIndex}`);
        baseParams.push(municipality);
        baseParamIndex++;
      }
    }

    // Handle province filter (array for multiple selections, string for single)
    if (province) {
      if (Array.isArray(province)) {
        if (province.length > 0) {
          const provincePlaceholders = province.map((_, i) => `$${baseParamIndex + i}`).join(', ');
          baseWhereConditions.push(`c.province IN (${provincePlaceholders})`);
          baseParams.push(...province);
          baseParamIndex += province.length;
        }
      } else {
        baseWhereConditions.push(`c.province = $${baseParamIndex}`);
        baseParams.push(province);
        baseParamIndex++;
      }
    }

    // Build WHERE clause for main query
    // Note: /clients endpoint has NO WHERE clause, but /assigned HAS WHERE c.deleted_at IS NULL
    // This will be handled differently in each endpoint
    const baseWhereConditionsJoined = baseWhereConditions.length > 0 ? baseWhereConditions.join(' AND ') : '';

    // ============================================
    // STANDARD QUERY PATH: CTEs with LATERAL JOINs
    // ============================================
    // Used for edge cases (Admin, search, filters, status filters)
    // Falls back to existing query logic
    // Build CTE-based query for proper filter-then-paginate behavior
    // CTE: Calculate touchpoint info for ALL clients (without area filters)

    // OPTIMIZED: Use materialized view instead of expensive CTE
    // The materialized view client_touchpoint_summary_mv is refreshed every 5 minutes
    // and pre-computes all touchpoint aggregations, eliminating expensive COUNT/GROUP_BY queries
    const touchpointInfoCTE = `touchpoint_info AS (
      SELECT
        mv.client_id,
        mv.completed_count,
        mv.total_count,
        mv.next_touchpoint_type,
        t.type as last_touchpoint_type,
        t.user_id as last_touchpoint_user_id,
        c.loan_released
      FROM client_touchpoint_summary_mv mv
      INNER JOIN clients c ON c.id = mv.client_id
      LEFT JOIN LATERAL (
        SELECT t.type, t.user_id
        FROM touchpoints t
        WHERE t.client_id = mv.client_id
        ORDER BY t.date DESC
        LIMIT 1
      ) t ON true
      WHERE c.deleted_at IS NULL
    )`;

    // Build WITH clause
    let withGroupScoreCTE = `WITH ${touchpointInfoCTE}`;
    let groupScoreFilter = '';
    let useGroupedCTEs = false;

    // Determine which touchpoint status groups to include
    // If touchpointStatus is undefined/empty, show all groups (no filtering)
    // Otherwise, only include the selected groups
    const includeCallable = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('callable');
    const includeWaitingForCaravan = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('waiting_for_caravan');
    const includeCompleted = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('completed');
    const includeLoanReleased = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('loan_released');
    const includeNoProgress = !touchpointStatus || touchpointStatus.length === 0 || touchpointStatus.includes('no_progress');

    // IMPORTANT: Create touchpoint_with_score CTE when touchpointStatus is provided OR when sortBy is touchpoint_status
    const needsGroupScoreCTE = touchpointStatus || sortBy === 'touchpoint_status';

    if (needsGroupScoreCTE) {
      // For Tele role: Use separate CTEs for each group to ensure proper ordering
      // callable (Group 1) will ALWAYS be first in the result set
      if (user.role === 'tele') {
        useGroupedCTEs = true;

        // Build CTEs dynamically based on selected touchpoint statuses
        const cteDefinitions: string[] = [];
        const unionStatements: string[] = [];

        if (includeCallable) {
          cteDefinitions.push(`callable_group AS (
            SELECT ti.*, 1 as group_score
            FROM touchpoint_info ti
            WHERE ti.next_touchpoint_type = 'Call' AND ti.completed_count < 7 AND NOT ti.loan_released
          )`);
          unionStatements.push('SELECT * FROM callable_group');
        }

        if (includeWaitingForCaravan) {
          cteDefinitions.push(`waiting_for_caravan_group AS (
            SELECT ti.*, 2 as group_score
            FROM touchpoint_info ti
            WHERE ti.next_touchpoint_type = 'Visit' AND ti.completed_count < 7 AND NOT ti.loan_released
          )`);
          unionStatements.push('SELECT * FROM waiting_for_caravan_group');
        }

        if (includeCompleted) {
          cteDefinitions.push(`completed_group AS (
            SELECT ti.*, 3 as group_score
            FROM touchpoint_info ti
            WHERE ti.completed_count >= 7 AND NOT ti.loan_released
          )`);
          unionStatements.push('SELECT * FROM completed_group');
        }

        if (includeLoanReleased) {
          cteDefinitions.push(`loan_released_group AS (
            SELECT ti.*, 4 as group_score
            FROM touchpoint_info ti
            WHERE ti.loan_released
          )`);
          unionStatements.push('SELECT * FROM loan_released_group');
        }

        if (includeNoProgress) {
          cteDefinitions.push(`no_progress_group AS (
            SELECT ti.*, 5 as group_score
            FROM touchpoint_info ti
            WHERE ti.completed_count = 0
          )`);
          unionStatements.push('SELECT * FROM no_progress_group');
        }

        // Build the final CTEs with dynamic UNION
        withGroupScoreCTE = `${withGroupScoreCTE},
          ${cteDefinitions.join(',\n          ')},
          touchpoint_with_score AS (
            ${unionStatements.join('\n            UNION ALL\n            ')}
          )`;
      } else {
        // For Caravan/Admin: Use original CASE expression approach
        let canCreateCondition = '';
        if (user.role === 'caravan') {
          canCreateCondition = `next_touchpoint_type = 'Visit' OR completed_count = 0`;
        } else {
          canCreateCondition = `next_touchpoint_type IS NOT NULL OR completed_count = 0`;
        }

        // IMPORTANT: Always create touchpoint_with_score CTE when sortBy is touchpoint_status
        // This ensures the group_score column is available for sorting
        if (sortBy === 'touchpoint_status' || touchpointStatus) {
          withGroupScoreCTE = `${withGroupScoreCTE}, touchpoint_with_score AS (
            SELECT *,
              CASE
                WHEN (${canCreateCondition}) AND completed_count < 7 AND NOT loan_released THEN 1
                WHEN completed_count >= 7 OR loan_released THEN 2
                WHEN completed_count > 0 AND completed_count < 7 AND NOT (${canCreateCondition}) THEN 3
                ELSE 4
              END as group_score
            FROM touchpoint_info
          )`;
        }

        // Map touchpoint_status to group score for filtering
        const statusToScoreMap: Record<string, number> = {
          'callable': 1,
          'completed': 2,
          'has_progress': 3,
          'no_progress': 4
        };

        // Handle multiple touchpoint status values
        if (touchpointStatus && touchpointStatus.length > 0) {
          const targetScores = touchpointStatus
            .map(status => statusToScoreMap[status])
            .filter(score => score !== undefined);

          if (targetScores.length > 0) {
            const hasExistingWhere = baseWhereConditionsJoined;
            const whereOrAnd = hasExistingWhere ? 'AND' : 'WHERE';

            if (targetScores.length === 1) {
              // Single value: use =
              groupScoreFilter = `${whereOrAnd} tws.group_score = $${baseParamIndex}`;
              baseParams.push(targetScores[0]);
              baseParamIndex++;
            } else {
              // Multiple values: use IN
              const placeholders = targetScores.map((_, i) => `$${baseParamIndex + i}`).join(', ');
              groupScoreFilter = `${whereOrAnd} tws.group_score IN (${placeholders})`;
              baseParams.push(...targetScores);
              baseParamIndex += targetScores.length;
            }
          }
        }
      }
    }

    // Get total count using CTE
    // Check if touchpoint_with_score CTE is created (for both count and main queries)
    const usesTouchpointWithScore = withGroupScoreCTE.includes('touchpoint_with_score');
    const touchpointInfoJoinForCount = usesTouchpointWithScore
      ? 'LEFT JOIN touchpoint_with_score tws ON tws.client_id = c.id'
      : 'LEFT JOIN touchpoint_info tp ON tp.client_id = c.id';

    // Build combined WHERE clause properly
    // Collect all conditions first, then build WHERE clause
    const allConditions: string[] = [];

    if (baseWhereConditionsJoined) {
      allConditions.push(baseWhereConditionsJoined);
    }

    if (groupScoreFilter) {
      // Remove "AND " or "WHERE " prefix from group filter, but keep the parameter placeholder
      allConditions.push(groupScoreFilter.replace(/^(AND |WHERE )/, ''));
    }

    const combinedWhereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : '';

    const countQuery = `
      ${withGroupScoreCTE}
      SELECT COUNT(DISTINCT c.id) as count
      FROM clients c
      ${touchpointInfoJoinForCount}
      ${combinedWhereClause}
    `;

    const countResult = await pool.query(countQuery, baseParams);
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results using CTEs
    // The CTEs filter ALL clients first, then we paginate
    // When touchpoint_with_score CTE is created, use it instead of touchpoint_info
    // Reuse usesTouchpointWithScore from count query above
    const touchpointInfoAlias = usesTouchpointWithScore ? 'tws' : 'tp';
    const touchpointInfoJoin = usesTouchpointWithScore
      ? 'LEFT JOIN touchpoint_with_score tws ON tws.client_id = c.id'
      : 'LEFT JOIN touchpoint_info tp ON tp.client_id = c.id';

    // For grouped CTEs approach (Tele role OR touchpointStatus filter), include group_score in SELECT
    const groupScoreSelect = (touchpointStatus && user.role === 'tele') || (sortBy === 'touchpoint_status' && groupScoreCase !== '')
      ? `, ${touchpointInfoAlias}.group_score`
      : '';

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
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers,
        COALESCE(${touchpointInfoAlias}.completed_count, 0) as completed_touchpoints,
        ${touchpointInfoAlias}.next_touchpoint_type,
        ${touchpointInfoAlias}.last_touchpoint_type,
        ${touchpointInfoAlias}.last_touchpoint_user_id${groupScoreSelect}${similaritySelect},
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM clients c
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN addresses a ON a.client_id = c.id
      LEFT JOIN phone_numbers p ON p.client_id = c.id
      ${touchpointInfoJoin}
      LEFT JOIN users lt ON lt.id = ${touchpointInfoAlias}.last_touchpoint_user_id
      ${combinedWhereClause}
      GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay, ${touchpointInfoAlias}.completed_count, ${touchpointInfoAlias}.next_touchpoint_type, ${touchpointInfoAlias}.last_touchpoint_type, ${touchpointInfoAlias}.last_touchpoint_user_id, ${touchpointInfoAlias}.loan_released${groupScoreSelect !== '' ? `, ${touchpointInfoAlias}.group_score` : ''}, lt.first_name, lt.last_name
      ${searchOrderBy
        ? `ORDER BY ${searchOrderBy}, ${orderByClause.replaceAll('{touchpoint_alias}', touchpointInfoAlias).split('ORDER BY')[1]?.trim() || ''}`
        : orderByClause.replaceAll('{touchpoint_alias}', touchpointInfoAlias)}
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
    const clientType = c.req.query('client_type');
    const agencyId = c.req.query('agency_id');
    const caravanId = c.req.query('caravan_id');
    // Use queries() for multi-value parameters (returns array or undefined)
    const municipalityQuery = c.req.queries('municipality');
    const provinceQuery = c.req.queries('province');
    const productType = c.req.query('product_type');
    const touchpointStatusQuery = c.req.queries('touchpoint_status'); // callable, completed, has_progress, no_progress
    const sortBy = c.req.query('sort_by'); // touchpoint_status, created_at, etc.

    // Handle multi-value query parameters
    const municipality = municipalityQuery && Array.isArray(municipalityQuery) ? municipalityQuery : (municipalityQuery ? [municipalityQuery] : undefined);
    const province = provinceQuery && Array.isArray(provinceQuery) ? provinceQuery : (provinceQuery ? [provinceQuery] : undefined);

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

    if (shouldFilterByArea && !search && !clientType && !productType && !agencyId && !municipality && !province) {
      // Only use cache when no additional filters are present
      // (cache stores base assigned client IDs for the user)
      cachedClientIds = await clientsCache.getAssignedClientIds(user.sub);
      console.debug(`[AssignedClients] Cache ${cachedClientIds ? 'HIT' : 'MISS'} for user ${user.sub}`);
    }

    // Build WHERE clause conditions for basic client filtering
    const baseWhereConditions: string[] = [];
    const baseParams: any[] = [];
    let baseParamIndex = 1;
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

    // Soft delete filter: Only show active clients (not deleted)
    baseWhereConditions.push(`c.deleted_at IS NULL`);

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

    // Handle municipality filter (array for multiple selections, string for single)
    if (municipality) {
      if (Array.isArray(municipality)) {
        if (municipality.length > 0) {
          const municipalityPlaceholders = municipality.map((_, i) => `$${baseParamIndex + i}`).join(', ');
          baseWhereConditions.push(`c.municipality IN (${municipalityPlaceholders})`);
          baseParams.push(...municipality);
          baseParamIndex += municipality.length;
        }
      } else {
        baseWhereConditions.push(`c.municipality = $${baseParamIndex}`);
        baseParams.push(municipality);
        baseParamIndex++;
      }
    }

    // Handle province filter (array for multiple selections, string for single)
    if (province) {
      if (Array.isArray(province)) {
        if (province.length > 0) {
          const provincePlaceholders = province.map((_, i) => `$${baseParamIndex + i}`).join(', ');
          baseWhereConditions.push(`c.province IN (${provincePlaceholders})`);
          baseParams.push(...province);
          baseParamIndex += province.length;
        }
      } else {
        baseWhereConditions.push(`c.province = $${baseParamIndex}`);
        baseParams.push(province);
        baseParamIndex++;
      }
    }

    // Build WHERE clause for main query
    // Note: /clients endpoint has NO WHERE clause, but /assigned HAS WHERE c.deleted_at IS NULL
    // This will be handled differently in each endpoint
    const baseWhereConditionsJoined = baseWhereConditions.length > 0 ? baseWhereConditions.join(' AND ') : '';

    // Build CTE-based query for proper filter-then-paginate behavior
    // CTE 1: Get user's assigned areas (for Caravan/Tele filtering)
    // CTE 2: Calculate touchpoint info for ALL clients (without client filters)

    // Add area filter conditions for Caravan/Tele roles
    // Note: Main query already has WHERE c.deleted_at IS NULL, so this only adds AND conditions
    let areaFilterWhereClause = '';
    if (shouldFilterByArea) {
      // For Caravan/Tele: Filter by assigned provinces/municipalities
      // Using the new province and municipality columns directly
      areaFilterWhereClause = `AND (
        c.province IN (SELECT province FROM user_areas)
        AND c.municipality IN (SELECT municipality FROM user_areas)
      )`;
    }

    // OPTIMIZED: Use materialized view instead of expensive CTE
    // The materialized view client_touchpoint_summary_mv is refreshed every 5 minutes
    // and pre-computes all touchpoint aggregations, eliminating expensive COUNT/GROUP_BY queries
    const touchpointInfoCTE = `touchpoint_info AS (
      SELECT
        mv.client_id,
        mv.completed_count,
        mv.total_count,
        mv.next_touchpoint_type,
        t.type as last_touchpoint_type,
        t.user_id as last_touchpoint_user_id,
        c.loan_released
      FROM client_touchpoint_summary_mv mv
      INNER JOIN clients c ON c.id = mv.client_id
      LEFT JOIN LATERAL (
        SELECT t.type, t.user_id
        FROM touchpoints t
        WHERE t.client_id = mv.client_id
        ORDER BY t.date DESC
        LIMIT 1
      ) t ON true
      WHERE c.deleted_at IS NULL
      ${shouldFilterByArea ? `AND EXISTS (
        SELECT 1 FROM user_areas ua
        WHERE c.province = ua.province AND c.municipality = ua.municipality
      )` : ''}
    )`;

    // Build WITH clause with user_areas CTE if needed
    let withGroupScoreCTE: string;
    if (shouldFilterByArea) {
      withGroupScoreCTE = `WITH user_areas AS (
        SELECT province, municipality
        FROM user_locations
        WHERE user_id = '${user.sub}' AND deleted_at IS NULL
      ), ${touchpointInfoCTE}`;
    } else {
      withGroupScoreCTE = `WITH ${touchpointInfoCTE}`;
    }

    // Always filter by touchpoint status for assigned endpoint
    // Use separate CTEs approach for Tele role to ensure proper ordering
    if (user.role === 'tele') {
      // Build CTEs dynamically based on selected touchpoint statuses
      const cteDefinitions: string[] = [];
      const unionStatements: string[] = [];

      // Tele-specific 5-group scoring with separate CTEs
      if (includeCallable) {
        cteDefinitions.push(`callable_group AS (
          SELECT ti.*, 1 as group_score
          FROM touchpoint_info ti
          WHERE ti.next_touchpoint_type = 'Call' AND ti.completed_count < 7 AND NOT ti.loan_released
        )`);
        unionStatements.push('SELECT * FROM callable_group');
      }

      if (includeWaitingForCaravan) {
        cteDefinitions.push(`waiting_for_caravan_group AS (
          SELECT ti.*, 2 as group_score
          FROM touchpoint_info ti
          WHERE ti.next_touchpoint_type = 'Visit' AND ti.completed_count < 7 AND NOT ti.loan_released
        )`);
        unionStatements.push('SELECT * FROM waiting_for_caravan_group');
      }

      if (includeCompleted) {
        cteDefinitions.push(`completed_group AS (
          SELECT ti.*, 3 as group_score
          FROM touchpoint_info ti
          WHERE ti.completed_count >= 7 AND NOT ti.loan_released
        )`);
        unionStatements.push('SELECT * FROM completed_group');
      }

      if (includeLoanReleased) {
        cteDefinitions.push(`loan_released_group AS (
          SELECT ti.*, 4 as group_score
          FROM touchpoint_info ti
          WHERE ti.loan_released
        )`);
        unionStatements.push('SELECT * FROM loan_released_group');
      }

      if (includeNoProgress) {
        cteDefinitions.push(`no_progress_group AS (
          SELECT ti.*, 5 as group_score
          FROM touchpoint_info ti
          WHERE ti.completed_count = 0
        )`);
        unionStatements.push('SELECT * FROM no_progress_group');
      }

      // Build the final CTEs with dynamic UNION
      withGroupScoreCTE = `${withGroupScoreCTE},
        ${cteDefinitions.join(',\n        ')},
        touchpoint_with_score AS (
          ${unionStatements.join('\n          UNION ALL\n          ')}
        ),
        assigned_clients_in_location AS (
          SELECT DISTINCT ON (client_id) * FROM touchpoint_with_score
        )`;

      // Note: Using assigned_clients_in_location CTE instead of filtering by group_score
      // This shows all assigned clients while maintaining proper sorting
    } else {
      // For Caravan/Admin: Use original CASE expression approach
      // Add touchpoint_with_score and assigned_clients_in_location CTEs
      withGroupScoreCTE = `${withGroupScoreCTE}, touchpoint_with_score AS (
        SELECT *,
          CASE
            -- Group 1 (callable): User can create next touchpoint AND loan NOT released
            WHEN (next_touchpoint_type IS NOT NULL OR completed_count = 0) AND completed_count < 7 AND NOT loan_released THEN 1
            -- Group 2 (completed): 7/7 touchpoints OR loan released (blocked from further touchpoints)
            WHEN completed_count >= 7 OR loan_released THEN 2
            -- Group 3 (no_progress): Should not happen with caravan logic above, but kept for safety
            ELSE 3
          END as group_score
        FROM touchpoint_info
      ),
      assigned_clients_in_location AS (
        SELECT DISTINCT ON (client_id) * FROM touchpoint_with_score
      )`;

      // Note: Using assigned_clients_in_location CTE instead of filtering by group_score
      // This shows all assigned clients while maintaining proper sorting
    }

    // Get total count using CTE
    const countQuery = `
      ${withGroupScoreCTE}
      SELECT COUNT(*) as count
      FROM assigned_clients_in_location acl
      JOIN clients c ON c.id = acl.client_id
      WHERE c.deleted_at IS NULL
      ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}
      ${areaFilterWhereClause ? areaFilterWhereClause : ''}
    `;

    const countResult = await pool.query(countQuery, baseParams);
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results using CTEs
    // IMPORTANT: Query FROM assigned_clients_in_location to ensure we only get assigned clients
    // and the ORDER BY works correctly (callable clients first)
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
          json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) as phone_numbers,
        COALESCE(acl.completed_count, 0) as completed_touchpoints,
        acl.next_touchpoint_type,
        acl.last_touchpoint_type,
        acl.last_touchpoint_user_id,
        acl.group_score${similaritySelect},
        lt.first_name as last_touchpoint_first_name,
        lt.last_name as last_touchpoint_last_name
      FROM assigned_clients_in_location acl
      JOIN clients c ON c.id = acl.client_id
      LEFT JOIN psgc psg ON psg.id = c.psgc_id
      LEFT JOIN addresses a ON a.client_id = c.id
      LEFT JOIN phone_numbers p ON p.client_id = c.id
      LEFT JOIN users lt ON lt.id = acl.last_touchpoint_user_id
      WHERE c.deleted_at IS NULL
      ${baseWhereConditionsJoined ? `AND ${baseWhereConditionsJoined}` : ''}
      ${areaFilterWhereClause ? areaFilterWhereClause : ''}
      GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay, acl.completed_count, acl.next_touchpoint_type, acl.last_touchpoint_type, acl.last_touchpoint_user_id, lt.first_name, lt.last_name, acl.group_score
      ${searchOrderBy ? `ORDER BY ${searchOrderBy}, acl.group_score ASC` : `ORDER BY acl.group_score ASC`}
      LIMIT $${baseParamIndex} OFFSET $${baseParamIndex + 1}
    `;

    const result = await pool.query(mainQuery, [...baseParams, perPage, offset]);

    // ============================================
    // CACHE POPULATION: Populate cache on miss
    // ============================================
    // If cache was empty, populate it with the client IDs from this query
    // Only cache when no additional filters were present (base assigned clients)
    if (shouldFilterByArea && !cachedClientIds && !search && !clientType && !productType && !agencyId && !municipality && !province) {
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
        COALESCE(
          (SELECT json_agg(json_build_object(
             'id', t.id,
             'client_id', t.client_id,
             'user_id', t.user_id,
             'touchpoint_number', t.touchpoint_number,
             'touchpoint_type', t.type,
             'rejection_reason', t.rejection_reason,
             'visit_id', t.visit_id,
             'call_id', t.call_id,
             'created_at', to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z'),
             'updated_at', to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z')
           ) ORDER BY t.touchpoint_number)
           FROM touchpoints t
           WHERE t.client_id = c.id
          ), '[]'
        ) as touchpoints
       FROM clients c
       LEFT JOIN psgc psg ON psg.id = c.psgc_id
       LEFT JOIN addresses a ON a.client_id = c.id
       LEFT JOIN phone_numbers p ON p.client_id = c.id
       WHERE c.id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id, psg.region, psg.province, psg.mun_city, psg.barangay
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
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
      ) RETURNING *`,
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
        user.sub
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

// DELETE /api/clients/:id - Delete client (soft delete, admin only)
clients.delete('/:id', authMiddleware, requirePermission('clients', 'delete'), auditMiddleware('client'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Soft delete: Only admin users can delete clients
    if (user.role !== 'admin') {
      throw new AuthorizationError('Only administrators can delete clients');
    }

    // Check if client exists and is not already deleted
    const existingResult = await pool.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Client');
    }

    // Soft delete: Set deleted_at timestamp and deleted_by user instead of deleting the record
    await pool.query('UPDATE clients SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2', [user.sub, id]);
    return c.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    throw new Error();
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
