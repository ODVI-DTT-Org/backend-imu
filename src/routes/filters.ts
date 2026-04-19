/**
 * Filters Routes
 * Provides distinct values from database columns for filter dropdowns
 * Eliminates hardcoded filter values in frontend applications
 */

import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

const filtersRouter = new Hono();

// Apply auth middleware to all routes
filtersRouter.use('*', authMiddleware);

/**
 * Label mapping for special cases
 * Provides human-readable labels for database values
 */
const LABEL_MAP: Record<string, string> = {
  // Touchpoint statuses
  'Interested': 'Interested',
  'Undecided': 'Undecided',
  'Not Interested': 'Not Interested',
  'Completed': 'Completed',

  // Touchpoint types
  'Visit': 'Visit',
  'Call': 'Call',

  // Client types
  'POTENTIAL': 'Potential',
  'EXISTING': 'Existing',

  // Product types
  'BFP ACTIVE': 'BFP ACTIVE',
  'BFP PENSION': 'BFP PENSION',
  'PNP PENSION': 'PNP PENSION',
  'NAPOLCOM': 'NAPOLCOM',
  'BFP STP': 'BFP STP',

  // Loan types
  'PRETERM': 'PRETERM',
  'NEW': 'NEW',
  'ADDITIONAL': 'ADDITIONAL',
  'RENEWAL': 'RENEWAL',

  // Pension types
  'PRIVATE': 'Private',
  'SSS': 'SSS',
  'GSIS': 'GSIS',
  'NONE': 'None',

  // Market types
  'RESIDENTIAL': 'Residential',
  'COMMERCIAL': 'Commercial',
  'INDUSTRIAL': 'Industrial',

  // User roles
  'admin': 'Admin',
  'area_manager': 'Area Manager',
  'assistant_area_manager': 'Assistant Area Manager',
  'caravan': 'Caravan',
  'tele': 'Tele',

  // Common statuses
  'active': 'Active',
  'inactive': 'Inactive',
  'deleted': 'Deleted',
  'pending': 'Pending',
  'assigned': 'Assigned',
};

/**
 * Format label with custom mapping
 * Handles underscores, special cases, and null values
 */
function formatLabel(rawValue: string | null): string {
  if (rawValue === null) return 'Unspecified';

  // Use custom label if exists
  if (LABEL_MAP[rawValue]) {
    return LABEL_MAP[rawValue];
  }

  // Default: Title case with underscores replaced by spaces
  return rawValue
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Allowed tables and their columns for filtering
 * Prevents SQL injection by whitelisting valid combinations
 */
const ALLOWED_FILTERS: Record<string, readonly string[]> = {
  clients: ['client_type', 'product_type', 'market_type', 'pension_type', 'loan_type'],
  touchpoints: ['type', 'status', 'reason'],
  users: ['role', 'status'],
  itineraries: ['status'],
  groups: ['status'],
  approvals: ['status', 'type'],
  touchpoint_reasons: ['touchpoint_type', 'role', 'category'],
};

/**
 * GET /api/filters/values
 *
 * Query Parameters:
 * - table: 'clients' | 'touchpoints' | 'users' | 'itineraries' | 'groups' | 'approvals' | 'touchpoint_reasons'
 * - column: Column name to fetch distinct values from
 * - withCounts: boolean (default: true) - Include record counts for each value
 * - includeNull: boolean (default: false) - Include null values as "Unspecified"
 * - includeAll: boolean (default: true) - Add "All" option at the beginning
 *
 * Response:
 * {
 *   "items": [
 *     { "value": "all", "label": "All Client Types" },
 *     { "value": "POTENTIAL", "label": "Potential", "count": 150 },
 *     { "value": "EXISTING", "label": "Existing", "count": 320 }
 *   ],
 *   "table": "clients",
 *   "column": "client_type",
 *   "total": 3
 * }
 */
filtersRouter.get('/values', async (c) => {
  const table = c.req.query('table');
  const column = c.req.query('column');
  const withCounts = c.req.query('withCounts') !== 'false'; // default true
  const includeNull = c.req.query('includeNull') === 'true'; // default false
  const includeAll = c.req.query('includeAll') !== 'false'; // default true

  // Validate table name
  if (!table || !ALLOWED_FILTERS[table]) {
    return c.json({
      error: 'Invalid table',
      message: `Table must be one of: ${Object.keys(ALLOWED_FILTERS).join(', ')}`
    }, 400);
  }

  // Validate column name
  const allowedColumns = ALLOWED_FILTERS[table];
  if (!column || !allowedColumns.includes(column)) {
    return c.json({
      error: 'Invalid column',
      message: `Column must be one of: ${allowedColumns.join(', ')}`
    }, 400);
  }

  try {
    // Build query with null handling and count ordering
    // GROUP BY the normalized value to deduplicate case/whitespace variants
    const nullFilter = includeNull ? '' : `AND ${column} IS NOT NULL`;
    const countSelect = withCounts ? `, COUNT(*) as count` : '';
    const groupBy = `GROUP BY UPPER(TRIM(${column}))`;
    const orderBy = withCounts
      ? `ORDER BY count DESC, value ASC`
      : `ORDER BY value ASC`;

    const query = `
      SELECT
        UPPER(TRIM(COALESCE(${column}, 'Unspecified'))) as value,
        UPPER(TRIM(${column})) as raw_value
        ${countSelect}
      FROM ${table}
      WHERE 1=1
        ${nullFilter}
      ${groupBy}
      ${orderBy}
    `;

    const result = await pool.query(query);

    // Format labels in application code
    const items = result.rows.map((row: any) => ({
      value: row.value,
      label: formatLabel(row.raw_value),
      ...(withCounts && { count: parseInt(row.count) })
    }));

    // Add "All" option at the beginning if requested
    if (includeAll) {
      const allLabel = `All ${column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
      items.unshift({
        value: 'all',
        label: allLabel,
        ...(withCounts && { count: 0 }) // Add count when withCounts is true
      });
    }

    return c.json({
      items,
      table,
      column,
      total: items.length
    });
  } catch (error: any) {
    console.error('Error fetching filter values:', error);
    return c.json({
      error: 'Database error',
      message: error.message
    }, 500);
  }
});

/**
 * GET /api/filters/schema
 *
 * Returns the available tables and columns that can be queried
 * Useful for dynamically generating filter UIs
 */
filtersRouter.get('/schema', (c) => {
  return c.json({
    tables: ALLOWED_FILTERS,
    version: '1.0.0'
  });
});

/**
 * GET /api/filters/batch
 *
 * Query Parameters:
 * - filters: JSON array of { table, column } objects
 * - withCounts: boolean (default: true)
 * - includeNull: boolean (default: false)
 * - includeAll: boolean (default: true)
 *
 * Fetches multiple filter values in a single request
 * Reduces HTTP requests for initial page load
 *
 * Example:
 * GET /api/filters/batch?filters=[{"table":"clients","column":"client_type"},{"table":"touchpoints","column":"status"}]
 */
filtersRouter.get('/batch', async (c) => {
  const filtersParam = c.req.query('filters');
  const withCounts = c.req.query('withCounts') !== 'false';
  const includeNull = c.req.query('includeNull') === 'true';
  const includeAll = c.req.query('includeAll') !== 'false';

  if (!filtersParam) {
    return c.json({
      error: 'Missing filters parameter',
      message: 'Please provide filters as JSON array: [{"table":"clients","column":"client_type"}]'
    }, 400);
  }

  let filters: Array<{ table: string; column: string }>;
  try {
    filters = JSON.parse(filtersParam);
  } catch (error: any) {
    return c.json({
      error: 'Invalid filters JSON',
      message: error.message
    }, 400);
  }

  // Validate all filters
  for (const filter of filters) {
    if (!filter.table || !filter.column) {
      return c.json({
        error: 'Invalid filter format',
        message: 'Each filter must have "table" and "column" properties'
      }, 400);
    }

    if (!ALLOWED_FILTERS[filter.table]) {
      return c.json({
        error: 'Invalid table',
        message: `Table "${filter.table}" is not allowed. Valid tables: ${Object.keys(ALLOWED_FILTERS).join(', ')}`
      }, 400);
    }

    if (!ALLOWED_FILTERS[filter.table].includes(filter.column)) {
      return c.json({
        error: 'Invalid column',
        message: `Column "${filter.column}" is not allowed for table "${filter.table}"`
      }, 400);
    }
  }

  try {
    // Fetch all filter values in parallel
    const results = await Promise.all(
      filters.map(async (filter) => {
        const nullFilter = includeNull ? '' : `AND ${filter.column} IS NOT NULL`;
        const countSelect = withCounts ? `, COUNT(*) as count` : '';
        const groupBy = `GROUP BY UPPER(TRIM(${filter.column}))`;
        const orderBy = withCounts
          ? `ORDER BY count DESC, value ASC`
          : `ORDER BY value ASC`;

        const query = `
          SELECT
            UPPER(TRIM(COALESCE(${filter.column}, 'Unspecified'))) as value,
            UPPER(TRIM(${filter.column})) as raw_value
            ${countSelect}
          FROM ${filter.table}
          WHERE 1=1
            ${nullFilter}
          ${groupBy}
          ${orderBy}
        `;

        const result = await pool.query(query);

        const items = result.rows.map((row: any) => ({
          value: row.value,
          label: formatLabel(row.raw_value),
          ...(withCounts && { count: parseInt(row.count) })
        }));

        if (includeAll) {
          const allLabel = `All ${filter.column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
          items.unshift({
            value: 'all',
            label: allLabel,
            ...(withCounts && { count: 0 }) // Add count when withCounts is true
          });
        }

        return {
          table: filter.table,
          column: filter.column,
          items,
          total: items.length
        };
      })
    );

    return c.json({
      results,
      total: results.length
    });
  } catch (error: any) {
    console.error('Error fetching batch filter values:', error);
    return c.json({
      error: 'Database error',
      message: error.message
    }, 500);
  }
});

export default filtersRouter;
