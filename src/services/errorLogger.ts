/**
 * Error Logging Service
 *
 * Async database logging service for errors.
 * Uses fire-and-forget pattern - errors are logged in the background
 * without blocking the response to the client.
 */

import { pool } from '../db/index.js';
import type { AppError, FieldError } from '../errors/index.js';
import type { ErrorCode } from '../errors/codes.js';

/**
 * Error log context interface
 */
export interface ErrorLogContext {
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Error log data interface (for database insertion)
 */
interface ErrorLogData {
  request_id: string;
  timestamp: Date;
  code: string;
  message: string;
  status_code: number;
  path: string;
  method: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  details: any;
  errors: any;
  stack_trace?: string;
  suggestions: string[];
  documentation_url?: string;
}

/**
 * Sensitive data patterns to redact
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /credit[_-]?card/i,
  /ssn/i,
  /social[_-]?security/i,
];

/**
 * Recursively sanitize an object by redacting sensitive data
 *
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key matches any sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize an error for logging (redact sensitive data)
 *
 * @param error - Error to sanitize
 * @returns Sanitized error data
 */
function sanitizeError(error: AppError | Error): {
  code: string;
  message: string;
  details: any;
  errors: FieldError[];
  stack?: string;
} {
  const sanitized: any = {
    code: (error as any).code || 'INTERNAL_SERVER_ERROR',
    message: error.message,
    details: {},
    errors: (error as any).errors || [],
  };

  // Sanitize details if present
  if ((error as any).details) {
    sanitized.details = sanitizeObject((error as any).details);
  }

  // Sanitize errors array if present
  if (sanitized.errors && sanitized.errors.length > 0) {
    sanitized.errors = sanitized.errors.map((fieldError: FieldError) => ({
      field: fieldError.field,
      message: fieldError.message,
      value: fieldError.value ? sanitizeObject(fieldError.value) : undefined,
    }));
  }

  // Include stack trace if available
  if (error.stack) {
    sanitized.stack = error.stack;
  }

  return sanitized;
}

/**
 * Error Logger Service
 *
 * Provides async database logging for errors.
 * Uses fire-and-forget pattern to avoid blocking responses.
 */
class ErrorLoggerService {
  /**
   * Log an error to the database (async, non-blocking)
   *
   * @param error - Error to log
   * @param context - Error context (requestId, path, method, etc.)
   */
  log(error: AppError | Error, context: ErrorLogContext): void {
    // Fire-and-forget: don't await, don't block
    this._logToDatabase(error, context).catch((err) => {
      // Silently fail - we don't want logging errors to affect the application
      console.error('Failed to log error to database:', err);
    });
  }

  /**
   * Internal method to log error to database
   *
   * @param error - Error to log
   * @param context - Error context
   * @private
   */
  private async _logToDatabase(
    error: AppError | Error,
    context: ErrorLogContext
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const sanitized = sanitizeError(error);
      const appError = error as any;

      // Extract first IP from comma-separated list (for x-forwarded-for headers)
      // PostgreSQL INET type expects a single IP address, not comma-separated list
      const firstIp = context.ipAddress?.split(',')[0]?.trim();

      const logData: ErrorLogData = {
        request_id: context.requestId,
        timestamp: new Date(context.timestamp),
        code: sanitized.code,
        message: sanitized.message,
        status_code: appError.statusCode || 500,
        path: context.path,
        method: context.method,
        user_id: context.userId,
        ip_address: firstIp,
        user_agent: context.userAgent,
        details: JSON.stringify(sanitized.details),
        errors: JSON.stringify(sanitized.errors),
        stack_trace: sanitized.stack,
        suggestions: appError.suggestions || [],
        documentation_url: appError.documentationUrl,
      };

      const query = `
        INSERT INTO error_logs (
          request_id,
          timestamp,
          code,
          message,
          status_code,
          path,
          method,
          user_id,
          ip_address,
          user_agent,
          details,
          errors,
          stack_trace,
          suggestions,
          documentation_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (request_id) DO NOTHING
      `;

      await pool.query(query, [
        logData.request_id,
        logData.timestamp,
        logData.code,
        logData.message,
        logData.status_code,
        logData.path,
        logData.method,
        logData.user_id,
        logData.ip_address,
        logData.user_agent,
        logData.details,
        logData.errors,
        logData.stack_trace,
        logData.suggestions,
        logData.documentation_url,
      ]);

      const duration = Date.now() - startTime;

      // Log slow operations (>1s)
      if (duration > 1000) {
        console.warn(`[errorLogger] Slow error logging: ${duration}ms for error ${sanitized.code}`);
      }
    } catch (err) {
      // Silently fail - we don't want logging errors to affect the application
      console.error('Failed to log error to database:', err);
    }
  }

  /**
   * Get error logs from database (for admin dashboard)
   *
   * @param filters - Filter options
   * @returns Array of error logs
   */
  async getErrorLogs(filters: {
    limit?: number;
    offset?: number;
    code?: ErrorCode;
    resolved?: boolean;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<any[]> {
    const startTime = Date.now();

    try {
      const {
        limit = 50,
        offset = 0,
        code,
        resolved,
        userId,
        startDate,
        endDate,
      } = filters;

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (code) {
        conditions.push(`code = $${paramIndex++}`);
        params.push(code);
      }

      if (resolved !== undefined) {
        conditions.push(`resolved = $${paramIndex++}`);
        params.push(resolved);
      }

      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(userId);
      }

      if (startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(startDate);
      }

      if (endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(endDate);
      }

      const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      const query = `
        SELECT
          id,
          request_id,
          timestamp,
          code,
          message,
          status_code,
          path,
          method,
          user_id,
          ip_address,
          user_agent,
          details,
          errors,
          stack_trace,
          suggestions,
          documentation_url,
          resolved,
          resolved_at,
          resolved_by,
          resolution_notes,
          created_at,
          updated_at
        FROM error_logs
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(limit, offset);

      const result = await pool.query(query, params);

      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[errorLogger] Slow getErrorLogs query: ${duration}ms`);
      }

      return result.rows;
    } catch (err) {
      console.error('Failed to get error logs:', err);
      return [];
    }
  }

  /**
   * Get error log by request ID
   *
   * @param requestId - Request ID
   * @returns Error log or null
   */
  async getErrorLogByRequestId(requestId: string): Promise<any | null> {
    try {
      const query = `
        SELECT
          id,
          request_id,
          timestamp,
          code,
          message,
          status_code,
          path,
          method,
          user_id,
          ip_address,
          user_agent,
          details,
          errors,
          stack_trace,
          suggestions,
          documentation_url,
          resolved,
          resolved_at,
          resolved_by,
          resolution_notes,
          created_at,
          updated_at
        FROM error_logs
        WHERE request_id = $1
      `;

      const result = await pool.query(query, [requestId]);
      return result.rows[0] || null;
    } catch (err) {
      console.error('Failed to get error log:', err);
      return null;
    }
  }

  /**
   * Resolve an error log
   *
   * @param id - Error log ID
   * @param resolvedBy - User ID who resolved the error
   * @param notes - Resolution notes
   */
  async resolveErrorLog(id: string, resolvedBy: string, notes?: string): Promise<boolean> {
    try {
      const query = `
        UPDATE error_logs
        SET
          resolved = true,
          resolved_at = NOW(),
          resolved_by = $1,
          resolution_notes = $2,
          updated_at = NOW()
        WHERE id = $3
      `;

      await pool.query(query, [resolvedBy, notes, id]);
      return true;
    } catch (err) {
      console.error('Failed to resolve error log:', err);
      return false;
    }
  }

  /**
   * Get error statistics
   *
   * @param startDate - Start date for statistics
   * @param endDate - End date for statistics
   * @returns Error statistics
   */
  async getErrorStats(startDate: Date, endDate: Date): Promise<{
    totalErrors: number;
    errorsByCode: Record<string, number>;
    topPaths: Array<{ path: string; count: number }>;
    unresolvedCount: number;
  }> {
    const startTime = Date.now();

    try {
      const statsQuery = `
        SELECT
          COUNT(*) as total_errors,
          code,
          path,
          COUNT(*) FILTER (WHERE resolved = false) as unresolved_count
        FROM error_logs
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY code, path
      `;

      const result = await pool.query(statsQuery, [startDate, endDate]);

      const stats = {
        totalErrors: 0,
        errorsByCode: {} as Record<string, number>,
        topPaths: [] as Array<{ path: string; count: number }>,
        unresolvedCount: 0,
      };

      result.rows.forEach(row => {
        stats.totalErrors += parseInt(row.total_errors);
        stats.errorsByCode[row.code] = (stats.errorsByCode[row.code] || 0) + parseInt(row.total_errors);
        stats.unresolvedCount += parseInt(row.unresolved_count);
      });

      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[errorLogger] Slow getErrorStats query: ${duration}ms`);
      }

      return stats;
    } catch (err) {
      console.error('Failed to get error stats:', err);
      return {
        totalErrors: 0,
        errorsByCode: {},
        topPaths: [],
        unresolvedCount: 0,
      };
    }
  }
}

// Export singleton instance
export const errorLogger = new ErrorLoggerService();

export default errorLogger;
