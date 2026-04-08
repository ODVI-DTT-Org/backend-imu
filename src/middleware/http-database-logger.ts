/**
 * HTTP Request Database Logger Middleware
 * Stores all HTTP requests and responses in the database for analysis and debugging
 */

import { Context, Next } from 'hono';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

interface RequestLogData {
  requestId: string;
  timestamp: Date;
  method: string;
  path: string;
  query: Record<string, string> | null;
  headers: Record<string, string>;
  body: any;
  ip: string;
  userAgent: string;
  origin: string;
  userId?: string;
  userRole?: string;
}

interface ResponseLogData {
  status: number;
  duration: number;
  responseSize?: number;
  error?: {
    message: string;
    name?: string;
    code?: string;
  };
}

// Enable/disable HTTP database logging via environment variable
const HTTP_DB_LOGGING_ENABLED = process.env.HTTP_DB_LOGGING !== 'false';

/**
 * Sanitize request body by removing sensitive fields
 */
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = [
    'password',
    'password_hash',
    'token',
    'secret',
    'api_key',
    'access_token',
    'refresh_token',
    'authorization',
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitize headers by removing sensitive information
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      const parts = value.split(' ');
      if (parts.length > 1) {
        sanitized[key] = `${parts[0]} [REDACTED]`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (key.toLowerCase() === 'cookie') {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extract user information from context
 */
function extractUserInfo(c: Context): { userId?: string; userRole?: string } {
  const user = c.get('user');
  if (user?.sub) {
    return {
      userId: user.sub,
      userRole: (user as any).role || (user as any).role_slug,
    };
  }
  return {};
}

/**
 * Save request log to database
 */
async function saveRequestLog(requestData: RequestLogData): Promise<void> {
  if (!HTTP_DB_LOGGING_ENABLED) return;

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO request_logs (
        request_id,
        timestamp,
        method,
        path,
        query_params,
        headers,
        body,
        ip_address,
        user_agent,
        origin,
        user_id,
        user_role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        requestData.requestId,
        requestData.timestamp,
        requestData.method,
        requestData.path,
        JSON.stringify(requestData.query),
        JSON.stringify(requestData.headers),
        JSON.stringify(requestData.body),
        requestData.ip,
        requestData.userAgent,
        requestData.origin,
        requestData.userId || null,
        requestData.userRole || null,
      ]
    );
  } catch (error: any) {
    // Don't throw errors from logging to prevent breaking the main request
    logger.error('http-database-logger', `Failed to save request log: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Update request log with response data
 */
async function updateRequestLog(requestId: string, responseData: ResponseLogData): Promise<void> {
  if (!HTTP_DB_LOGGING_ENABLED) return;

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE request_logs SET
        status_code = $1,
        duration_ms = $2,
        response_size = $3,
        error_message = $4,
        error_name = $5,
        error_code = $6,
        completed_at = NOW()
      WHERE request_id = $7`,
      [
        responseData.status,
        responseData.duration,
        responseData.responseSize || null,
        responseData.error?.message || null,
        responseData.error?.name || null,
        responseData.error?.code || null,
        requestId,
      ]
    );
  } catch (error: any) {
    // Don't throw errors from logging to prevent breaking the main request
    logger.error('http-database-logger', `Failed to update request log: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * HTTP Database Logger Middleware
 * Logs all HTTP requests and responses to the database
 */
export function httpDatabaseLogger() {
  return async (c: Context, next: Next) => {
    if (!HTTP_DB_LOGGING_ENABLED) {
      await next();
      return;
    }

    const startTime = Date.now();
    const requestId = c.get('requestId') || `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Store requestId in context for later use
    c.set('requestId', requestId);

    // Collect query parameters
    const queryParams = c.req.queries();
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) {
        query[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // Collect headers
    const headers: Record<string, string> = {
      'content-type': c.req.header('content-type') || '',
      'user-agent': c.req.header('user-agent') || '',
      'origin': c.req.header('origin') || '',
      'referer': c.req.header('referer') || '',
      'x-forwarded-for': c.req.header('x-forwarded-for') || '',
      'x-real-ip': c.req.header('x-real-ip') || '',
    };

    // Get user info
    const { userId, userRole } = extractUserInfo(c);

    // Collect request body
    let body: any = null;
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
      try {
        const rawBody = await c.req.json().catch(() => null);
        if (rawBody) {
          body = sanitizeBody(rawBody);
        }
      } catch {
        // Body not JSON or already consumed
        body = null;
      }
    }

    // Prepare request log data
    const requestData: RequestLogData = {
      requestId,
      timestamp: new Date(),
      method: c.req.method,
      path: c.req.path,
      query: Object.keys(query).length > 0 ? query : null,
      headers: sanitizeHeaders(headers),
      body,
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      origin: c.req.header('origin') || 'none',
      userId,
      userRole,
    };

    // Save request log asynchronously (non-blocking)
    saveRequestLog(requestData).catch(error => {
      logger.error('http-database-logger', `Failed to save request log: ${error}`);
    });

    try {
      await next();

      // Calculate response data
      const duration = Date.now() - startTime;
      const status = c.res.status;

      // Estimate response size
      let responseSize: number | undefined;
      try {
        const contentLength = c.res.headers.get('content-length');
        if (contentLength) {
          responseSize = parseInt(contentLength, 10);
        }
      } catch {
        // Ignore error
      }

      const responseData: ResponseLogData = {
        status,
        duration,
        responseSize,
      };

      // Update request log asynchronously (non-blocking)
      updateRequestLog(requestId, responseData).catch(error => {
        logger.error('http-database-logger', `Failed to update request log: ${error}`);
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;

      const responseData: ResponseLogData = {
        status: c.res.status || 500,
        duration,
        error: {
          message: error.message || 'Unknown error',
          name: error.name,
          code: error.code,
        },
      };

      // Update request log with error asynchronously (non-blocking)
      updateRequestLog(requestId, responseData).catch(err => {
        logger.error('http-database-logger', `Failed to update request log: ${err}`);
      });

      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Enable/disable HTTP database logging at runtime
 */
export function setHttpDatabaseLogging(enabled: boolean) {
  (process.env as any).HTTP_DB_LOGGING = enabled ? 'true' : 'false';
}

/**
 * Get current HTTP database logging status
 */
export function isHttpDatabaseLoggingEnabled(): boolean {
  return process.env.HTTP_DB_LOGGING !== 'false';
}
