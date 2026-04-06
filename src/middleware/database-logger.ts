/**
 * Database Query Logger Middleware
 * Logs all SQL queries executed on the database for debugging
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

interface QueryLog {
  timestamp: string;
  query: string;
  params?: any[];
  duration: number;
  rows?: number;
  error?: string;
}

// Enable/disable database logging via environment variable
const DB_LOGGING_ENABLED = process.env.DB_LOGGING !== 'false'; // Enabled by default

// Store original query methods
const originalQuery = Pool.prototype.query;
const originalConnect = Pool.prototype.connect;

/**
 * Extract table name from SQL query
 */
function extractTableName(query: string): string {
  const trimmedQuery = query.trim().toUpperCase();

  // Try to extract table name from different query types
  const patterns = [
    /FROM\s+(\w+)/i,
    /INSERT\s+INTO\s+(\w+)/i,
    /UPDATE\s+(\w+)/i,
    /DELETE\s+FROM\s+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'unknown';
}

/**
 * Extract operation type from SQL query
 */
function extractOperation(query: string): string {
  const trimmedQuery = query.trim().toUpperCase();

  if (trimmedQuery.startsWith('SELECT')) return 'SELECT';
  if (trimmedQuery.startsWith('INSERT')) return 'INSERT';
  if (trimmedQuery.startsWith('UPDATE')) return 'UPDATE';
  if (trimmedQuery.startsWith('DELETE')) return 'DELETE';
  if (trimmedQuery.startsWith('CREATE')) return 'CREATE';
  if (trimmedQuery.startsWith('ALTER')) return 'ALTER';
  if (trimmedQuery.startsWith('DROP')) return 'DROP';

  return 'QUERY';
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
 * Truncate query for logging (show first N chars)
 */
function truncateQuery(query: string, maxLength: number = 200): string {
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + '...';
}

/**
 * Log a database query with full SQL and parameters
 */
function logQuery(queryLog: QueryLog) {
  if (!DB_LOGGING_ENABLED) return;

  const tableName = extractTableName(queryLog.query);
  const operation = extractOperation(queryLog.query);
  const sanitizedParams = queryLog.params ? sanitizeParams(queryLog.params) : [];
  const truncatedQuery = truncateQuery(queryLog.query);

  if (queryLog.error) {
    logger.databaseError(tableName, {
      message: queryLog.error,
      operation,
      query: truncatedQuery,
      params: sanitizedParams,
      duration: queryLog.duration,
    });
  } else {
    logger.databaseQuery(tableName, operation, queryLog.duration, {
      query: truncatedQuery,
      params: sanitizedParams.length > 0 ? sanitizedParams : undefined,
      rows: queryLog.rows,
    });
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

  // Call original query method and ensure we get a Promise
  const method = originalQuery as any;
  let result: any;

  // Try to detect if this is a callback-based or promise-based call
  const hasCallback = args.length > 0 && typeof args[args.length - 1] === 'function';

  if (hasCallback) {
    // Callback-based call - don't wrap, just call original
    return method.apply(this, args);
  } else {
    // Promise-based call - wrap with logging
    result = method.apply(this, args);

    // Ensure result is a Promise
    if (!result || typeof result.then !== 'function') {
      // Fallback: return original result if it's not a Promise
      return result;
    }

    // Log query completion
    return result
      .then((dbResult: any) => {
        queryLog.duration = Date.now() - startTime;
        queryLog.rows = dbResult.rowCount;

        // Log all queries for debugging
        logQuery(queryLog);

        return dbResult;
      })
      .catch((error: any) => {
        queryLog.duration = Date.now() - startTime;
        queryLog.error = error.message;

        logQuery(queryLog);

        throw error;
      });
  }
};

/**
 * Wrap Pool.connect to add logging for client queries
 */
Pool.prototype.connect = function(this: Pool, ...args: any[]) {
  // Call original connect method
  const method = originalConnect as any;
  let result: any;

  // Try to detect if this is a callback-based or promise-based call
  const hasCallback = args.length > 0 && typeof args[args.length - 1] === 'function';

  if (hasCallback) {
    // Callback-based call - don't wrap, just call original
    return method.apply(this, args);
  } else {
    // Promise-based call - wrap with logging
    result = method.apply(this, args);

    // Ensure result is a Promise
    if (!result || typeof result.then !== 'function') {
      // Fallback: return original result if it's not a Promise
      return result;
    }

    return result.then((client: PoolClient) => {
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

        // Detect if this is a callback-based call
        const hasQueryCallback = clientArgs.length > 0 && typeof clientArgs[clientArgs.length - 1] === 'function';

        if (hasQueryCallback) {
          // Callback-based call - don't wrap
          return (originalClientQuery as any).apply(this, clientArgs);
        } else {
          // Promise-based call - wrap with logging
          const clientResult = (originalClientQuery as any).apply(this, clientArgs);

          // Ensure result is a Promise
          if (!clientResult || typeof (clientResult as any).then !== 'function') {
            return clientResult as any;
          }

          // Log query completion
          return (clientResult as Promise<any>)
            .then((dbResult: any) => {
              queryLog.duration = Date.now() - startTime;
              queryLog.rows = dbResult.rowCount;

              // Log all queries for debugging
              logQuery(queryLog);

              return dbResult;
            })
            .catch((error: any) => {
              queryLog.duration = Date.now() - startTime;
              queryLog.error = error.message;

              logQuery(queryLog);

              throw error;
            });
        }
      };

      return client;
    });
  }
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

// Removed verbose startup log - now handled by init-logger
