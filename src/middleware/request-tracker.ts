/**
 * Simple Request Tracker Middleware
 * Tracks endpoint calls, request parameters, and SQL queries for debugging
 */

import { Context, Next } from 'hono';
import { runInRequestContext } from './database-logger.js';

interface RequestInfo {
  requestId: string;
  timestamp: Date;
  method: string;
  path: string;
  controller: string;
  params?: Record<string, any>;
  query?: Record<string, string>;
  body?: any;
  userId?: string;
  sqlQueries: Array<{
    query: string;
    params?: any[];
    duration: number;
    rows?: number;
    error?: string;
  }>;
  responseStatus?: number;
  responseDuration?: number;
}

// Store request info in a Map (in-memory, per request)
const requestStore = new Map<string, RequestInfo>();

/**
 * Get current request info
 */
export function getRequestInfo(requestId: string): RequestInfo | undefined {
  return requestStore.get(requestId);
}

/**
 * Extract controller name from path
 */
function extractController(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] === 'api') {
    return segments[1] || 'root';
  }
  return segments[0] || 'unknown';
}

/**
 * Sanitize body for logging (hide sensitive data)
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
 * Request tracker middleware
 */
export function requestTracker() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Store requestId in context
    c.set('requestId', requestId);

    // Extract controller name
    const controller = extractController(c.req.path);

    // Collect query parameters
    const queryParams = c.req.queries();
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) {
        query[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // Get user info
    const user = c.get('user');
    const userId = user?.sub;

    // Collect request body
    let body: any = undefined;
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
      try {
        const rawBody = await c.req.json().catch(() => null);
        if (rawBody) {
          body = sanitizeBody(rawBody);
        }
      } catch {
        // Body not JSON or already consumed
      }
    }

    // Initialize request info
    const requestInfo: RequestInfo = {
      requestId,
      timestamp: new Date(),
      method: c.req.method,
      path: c.req.path,
      controller,
      params: c.req.param(),
      query: Object.keys(query).length > 0 ? query : undefined,
      body,
      userId,
      sqlQueries: [],
    };

    // Store request info
    requestStore.set(requestId, requestInfo);

    // Log request start
    console.log('\n' + '='.repeat(80));
    console.log(`📋 REQUEST [${requestId}]`);
    console.log('='.repeat(80));
    console.log(`🔹 Controller: ${controller}`);
    console.log(`🔹 Method:     ${c.req.method}`);
    console.log(`🔹 Path:       ${c.req.path}`);
    console.log(`🔹 Timestamp:  ${requestInfo.timestamp.toISOString()}`);
    if (userId) console.log(`🔹 User ID:    ${userId}`);
    if (query) console.log(`🔹 Query:      ${JSON.stringify(query)}`);
    if (c.req.param() && Object.keys(c.req.param()).length > 0) {
      console.log(`🔹 Params:     ${JSON.stringify(c.req.param())}`);
    }
    if (body) {
      console.log(`🔹 Body:       ${JSON.stringify(body).substring(0, 200)}${JSON.stringify(body).length > 200 ? '...' : ''}`);
    }
    console.log('='.repeat(80));

    // Run the request in AsyncLocalStorage context
    return runInRequestContext(
      requestId,
      (queryInfo) => {
        // Add SQL query to request info
        requestInfo.sqlQueries.push(queryInfo);
      },
      async () => {
        try {
          await next();

          const duration = Date.now() - startTime;
          const status = c.res.status;

          // Update request info
          requestInfo.responseStatus = status;
          requestInfo.responseDuration = duration;

          // Log SQL queries executed
          if (requestInfo.sqlQueries.length > 0) {
            console.log(`\n🔹 SQL Queries (${requestInfo.sqlQueries.length}):`);
            requestInfo.sqlQueries.forEach((q, index) => {
              console.log(`   ${index + 1}. ${q.query.substring(0, 100)}${q.query.length > 100 ? '...' : ''}`);
              if (q.params && q.params.length > 0) {
                console.log(`      Params: ${JSON.stringify(q.params).substring(0, 100)}...`);
              }
              console.log(`      Duration: ${q.duration}ms | Rows: ${q.rows || 0}${q.error ? ` | Error: ${q.error}` : ''}`);
            });
          } else {
            console.log(`\n🔹 SQL Queries: None`);
          }

          // Log response
          const statusEmoji = status < 300 ? '✅' : status < 400 ? '⚠️' : status < 500 ? '❌' : '💥';
          console.log(`\n📤 RESPONSE [${requestId}]`);
          console.log('='.repeat(80));
          console.log(`${statusEmoji} Status: ${status} | Duration: ${duration}ms`);
          console.log('='.repeat(80) + '\n');

        } catch (error: any) {
          const duration = Date.now() - startTime;

          // Update request info
          requestInfo.responseStatus = 500;
          requestInfo.responseDuration = duration;

          // Log SQL queries executed
          if (requestInfo.sqlQueries.length > 0) {
            console.log(`\n🔹 SQL Queries (${requestInfo.sqlQueries.length}):`);
            requestInfo.sqlQueries.forEach((q, index) => {
              console.log(`   ${index + 1}. ${q.query.substring(0, 100)}${q.query.length > 100 ? '...' : ''}`);
              if (q.error) {
                console.log(`      ❌ Error: ${q.error}`);
              } else {
                console.log(`      Duration: ${q.duration}ms | Rows: ${q.rows || 0}`);
              }
            });
          }

          // Log error
          console.log(`\n💥 ERROR [${requestId}]`);
          console.log('='.repeat(80));
          console.log(`❌ ${error.name}: ${error.message}`);
          console.log(`   Duration: ${duration}ms`);
          console.log('='.repeat(80) + '\n');

          // Clean up request info
          requestStore.delete(requestId);

          throw error;
        }

        // Clean up request info after successful completion
        // Keep it for a bit in case needed, but don't leak memory
        setTimeout(() => {
          requestStore.delete(requestId);
        }, 5000);
      }
    );
  };
}
