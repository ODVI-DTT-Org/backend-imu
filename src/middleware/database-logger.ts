/**
 * Database Query Logger Middleware
 * Logs all SQL queries executed on the database for debugging
 */

import { Pool, PoolClient } from 'pg';

interface QueryLog {
  timestamp: string;
  query: string;
  params?: any[];
  duration: number;
  rows?: number;
  error?: string;
}

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Enable/disable database logging via environment variable
const DB_LOGGING_ENABLED = process.env.DB_LOGGING !== 'false'; // Enabled by default

// Store original query methods
const originalQuery = Pool.prototype.query;
const originalConnect = Pool.prototype.connect;

/**
 * Format SQL query for better readability
 */
function formatQuery(query: string): string {
  // Remove excessive whitespace
  let formatted = query.replace(/\s+/g, ' ').trim();
  // Add newline before major SQL keywords
  const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET'];
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    formatted = formatted.replace(regex, `\n   ${keyword}`);
  });
  return formatted;
}

/**
 * Sanitize query parameters for logging (hide sensitive data)
 */
function sanitizeParams(params: any[]): any[] {
  if (!params) return [];
  return params.map(param => {
    if (typeof param === 'string') {
      // Hide passwords and tokens
      if (param.length > 100) {
        return `[STRING ${param.length} chars]`;
      }
      // Check for potential passwords
      if (/password|token|secret/i.test(param)) {
        return '[REDACTED]';
      }
    }
    return param;
  });
}

/**
 * Log a database query
 */
function logQuery(queryLog: QueryLog) {
  if (!DB_LOGGING_ENABLED) return;

  const timestamp = new Date().toISOString();
  const duration = queryLog.duration.toFixed(2);

  if (queryLog.error) {
    // Log error queries in red with full details
    console.error(`${colors.red}${colors.bright}❌ DATABASE QUERY ERROR [${timestamp}]${colors.reset}`);
    console.error(`${colors.red}${'='.repeat(60)}${colors.reset}`);
    console.error(`${colors.red}📝 Query:${colors.reset}`);
    console.error(`${colors.red}   ${formatQuery(queryLog.query)}${colors.reset}`);

    if (queryLog.params && queryLog.params.length > 0) {
      console.error(`${colors.red}📋 Parameters:${colors.reset}`);
      console.error(`${colors.red}   ${JSON.stringify(sanitizeParams(queryLog.params), null, 2)}${colors.reset}`);
    }

    console.error(`${colors.red}❌ Error Message:${colors.reset}`);
    console.error(`${colors.red}   ${queryLog.error}${colors.reset}`);

    // Try to parse PostgreSQL error details
    if (queryLog.error.includes('code:')) {
      const match = queryLog.error.match(/code: '([^']+)'/);
      if (match) {
        console.error(`${colors.red}🔍 Error Code: ${match[1]}${colors.reset}`);
      }
      const detailMatch = queryLog.error.match(/detail: '([^']+)'/);
      if (detailMatch) {
        console.error(`${colors.red}📄 Detail: ${detailMatch[1]}${colors.reset}`);
      }
      const tableMatch = queryLog.error.match(/table: '([^']+)'/);
      if (tableMatch) {
        console.error(`${colors.red}📊 Table: ${tableMatch[1]}${colors.reset}`);
      }
      const columnMatch = queryLog.error.match(/column: '([^']+)'/);
      if (columnMatch) {
        console.error(`${colors.red}📌 Column: ${columnMatch[1]}${colors.reset}`);
      }
      const constraintMatch = queryLog.error.match(/constraint: '([^']+)'/);
      if (constraintMatch) {
        console.error(`${colors.red}🔗 Constraint: ${constraintMatch[1]}${colors.reset}`);
      }
    }

    console.error(`${colors.red}${'='.repeat(60)}${colors.reset}`);
    console.error(`${colors.red}⏱️  Duration: ${duration}ms${colors.reset}\n`);
  } else if (queryLog.duration > 1000) {
    // Log slow queries in yellow
    console.warn(`${colors.yellow}⚠️  SLOW DB QUERY [${timestamp}]${colors.reset}`);
    console.warn(`${colors.yellow}   Query: ${queryLog.query.substring(0, 200)}${queryLog.query.length > 200 ? '...' : ''}${colors.reset}`);
    if (queryLog.params && queryLog.params.length > 0) {
      console.warn(`${colors.yellow}   Params: ${JSON.stringify(sanitizeParams(queryLog.params))}${colors.reset}`);
    }
    console.warn(`${colors.yellow}   Duration: ${duration}ms | Rows: ${queryLog.rows || 'N/A'}${colors.reset}\n`);
  } else {
    // Log regular queries in cyan (compact format)
    const queryPreview = queryLog.query.replace(/\s+/g, ' ').trim().substring(0, 100);
    const paramsStr = queryLog.params && queryLog.params.length > 0
      ? ` | Params: ${JSON.stringify(sanitizeParams(queryLog.params)).substring(0, 50)}...`
      : '';

    console.log(`${colors.cyan}💾 DB QUERY [${timestamp}]${colors.reset}`);
    console.log(`${colors.cyan}   ${queryPreview}${queryLog.query.length > 100 ? '...' : ''}${paramsStr}${colors.reset}`);
    console.log(`${colors.cyan}   Duration: ${duration}ms | Rows: ${queryLog.rows || 'N/A'}${colors.reset}\n`);
  }
}

/**
 * Wrap Pool.query to add logging
 */
Pool.prototype.query = function(this: Pool, ...args: any[]) {
  const startTime = Date.now();
  const query = typeof args[0] === 'string' ? args[0] : args[0].text;
  const params = args[1];

  const queryLog: QueryLog = {
    timestamp: new Date().toISOString(),
    query,
    params,
    duration: 0,
  };

  // Call original query method
  const promise = originalQuery.apply(this, args);

  // Log query completion
  return promise
    .then((result: any) => {
      queryLog.duration = Date.now() - startTime;
      queryLog.rows = result.rowCount;

      // Only log SELECT queries and slow queries to reduce noise
      if (queryLog.duration > 100 || query.toUpperCase().startsWith('SELECT')) {
        logQuery(queryLog);
      }

      return result;
    })
    .catch((error: any) => {
      queryLog.duration = Date.now() - startTime;
      queryLog.error = error.message;

      logQuery(queryLog);

      throw error;
    });
};

/**
 * Wrap Pool.connect to add logging for client queries
 */
Pool.prototype.connect = function(this: Pool, ...args: any[]) {
  const promise = originalConnect.apply(this, args);

  return promise.then((client: PoolClient) => {
    // Wrap client.query to add logging
    const originalClientQuery = client.query;
    client.query = function(...clientArgs: any[]) {
      const startTime = Date.now();
      const query = typeof clientArgs[0] === 'string' ? clientArgs[0] : clientArgs[0].text;
      const params = clientArgs[1];

      const queryLog: QueryLog = {
        timestamp: new Date().toISOString(),
        query,
        params,
        duration: 0,
      };

      // Call original query method
      const clientPromise = originalClientQuery.apply(this, clientArgs);

      // Log query completion
      return clientPromise
        .then((result: any) => {
          queryLog.duration = Date.now() - startTime;
          queryLog.rows = result.rowCount;

          // Only log SELECT queries and slow queries
          if (queryLog.duration > 100 || query.toUpperCase().startsWith('SELECT')) {
            logQuery(queryLog);
          }

          return result;
        })
        .catch((error: any) => {
          queryLog.duration = Date.now() - startTime;
          queryLog.error = error.message;

          logQuery(queryLog);

          throw error;
        });
      };

      return client;
    });
  });
};

/**
 * Enable/disable database logging at runtime
 */
export function setDatabaseLogging(enabled: boolean) {
  (process.env as any).DB_LOGGING = enabled ? 'true' : 'false';
}

/**
 * Get current database logging status
 */
export function isDatabaseLoggingEnabled(): boolean {
  return process.env.DB_LOGGING !== 'false';
}

console.log('🔍 Database query logger initialized (DB_LOGGING=' + (DB_LOGGING_ENABLED ? 'enabled' : 'disabled') + ')');
