/**
 * Request Logger Middleware
 * Logs details of every incoming request for debugging and monitoring
 */

import { Context, Next } from 'hono';

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  ip: string;
  userAgent: string;
  origin: string;
  contentType?: string;
  authorization?: boolean;
}

interface ResponseLog {
  status: number;
  duration: number;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

// Detailed logger with error information
export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).substring(2, 9);

    // Collect request details
    const query: Record<string, string> = {};
    const queryParams = c.req.queries();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) {
        query[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    const log: RequestLog = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      query,
      headers: {
        'content-type': c.req.header('content-type') || '',
        'authorization': c.req.header('authorization') ? '[REDACTED]' : '',
        'user-agent': c.req.header('user-agent') || '',
        'origin': c.req.header('origin') || '',
        'x-forwarded-for': c.req.header('x-forwarded-for') || '',
        'x-real-ip': c.req.header('x-real-ip') || '',
        'referer': c.req.header('referer') || '',
      },
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      origin: c.req.header('origin') || 'none',
      contentType: c.req.header('content-type'),
      authorization: !!c.req.header('authorization'),
    };

    // Log request details
    console.log('\n' + '='.repeat(60));
    console.log(`📋 REQUEST [${requestId}]`);
    console.log('='.repeat(60));
    console.log(`📅 Timestamp: ${log.timestamp}`);
    console.log(`🔍 Method:    ${log.method}`);
    console.log(`📍 Path:      ${log.path}`);
    console.log(`🌐 Origin:    ${log.origin}`);
    console.log(`📡 IP:        ${log.ip}`);
    console.log(`🔑 Auth:      ${log.authorization ? '✓ Present' : '✗ None'}`);
    console.log(`📦 Type:      ${log.contentType || 'N/A'}`);
    console.log(`🦄 UA:        ${log.userAgent.substring(0, 80)}${log.userAgent.length > 80 ? '...' : ''}`);

    if (Object.keys(log.query).length > 0) {
      console.log(`❓ Query Params:`);
      Object.entries(log.query).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }

    if (log.authorization) {
      const authHeader = c.req.header('authorization') || '';
      const tokenType = authHeader.split(' ')[0];
      const tokenLength = authHeader.split(' ')[1]?.length || 0;
      console.log(`🔑 Token:     ${tokenType} [${tokenLength} chars]`);
    }

    // Log body for non-GET requests (if present)
    if (log.method !== 'GET' && log.method !== 'HEAD' && log.method !== 'OPTIONS') {
      try {
        const body = await c.req.json().catch(() => null);
        if (body) {
          // Redact sensitive fields
          const safeBody = JSON.stringify(body, (key, value) => {
            if (key === 'password' || key === 'password_hash' || key === 'token') {
              return '[REDACTED]';
            }
            return value;
          });
          console.log(`📦 Body:      ${safeBody.substring(0, 200)}${safeBody.length > 200 ? '...' : ''}`);
        }
      } catch {
        // Body already consumed or not JSON
        console.log(`📦 Body:      [Cannot read - already consumed or not JSON]`);
      }
    }

    console.log('='.repeat(60) + '\n');

    // Continue processing and capture response
    let responseLog: ResponseLog = {
      status: 0,
      duration: 0,
    };

    try {
      await next();

      responseLog.status = c.res.status;
      responseLog.duration = Date.now() - start;

      const statusEmoji = responseLog.status < 300 ? '✅' : responseLog.status < 400 ? '⚠️' : responseLog.status < 500 ? '❌' : '💥';
      const statusText = getStatusText(responseLog.status);

      // Try to extract response count for GET requests
      let responseCountStr = '';
      if (log.method === 'GET' && responseLog.status >= 200 && responseLog.status < 300) {
        try {
          const clonedResponse = c.res.clone();
          const body = await clonedResponse.json();
          const count = extractResponseCount(body);
          if (count !== undefined) {
            responseCountStr = `\n📊 Count:     ${count} items`;
          }
        } catch {
          // Can't parse response body, skip count
        }
      }

      console.log(`📤 RESPONSE [${requestId}]`);
      console.log('='.repeat(60));
      console.log(`${statusEmoji} Status:    ${responseLog.status} ${statusText}`);
      console.log(`⏱️  Duration:  ${responseLog.duration}ms${responseCountStr}`);
      console.log('='.repeat(60) + '\n');

    } catch (error: any) {
      responseLog.duration = Date.now() - start;
      responseLog.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };

      console.log(`💥 ERROR [${requestId}]`);
      console.log('='.repeat(60));
      console.log(`❌ Name:      ${error.name}`);
      console.log(`📝 Message:   ${error.message}`);
      console.log(`📍 Stack:`);
      console.log(error.stack?.split('\n').slice(0, 10).join('\n'));
      console.log('='.repeat(60) + '\n');

      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Extract response count from response body
 */
function extractResponseCount(body: any): number | undefined {
  if (!body) return undefined;

  // If response is an array, return its length
  if (Array.isArray(body)) {
    return body.length;
  }

  // If response has data property that's an array
  if (body.data && Array.isArray(body.data)) {
    return body.data.length;
  }

  // If response has rows property (PostgreSQL result)
  if (body.rows && Array.isArray(body.rows)) {
    return body.rows.length;
  }

  // If response has items property (pagination)
  if (body.items && Array.isArray(body.items)) {
    return body.items.length;
  }

  // If response has clients, users, etc. property
  const arrayProperties = ['clients', 'users', 'touchpoints', 'itineraries', 'approvals', 'reports', 'municipalities', 'permissions', 'roles', 'groups', 'locations'];
  for (const prop of arrayProperties) {
    if (body[prop] && Array.isArray(body[prop])) {
      return body[prop].length;
    }
  }

  // If response has total or count property (for pagination metadata)
  if (typeof body.total === 'number') {
    return body.total;
  }
  if (typeof body.count === 'number') {
    return body.count;
  }

  return undefined;
}

// Simplified one-line logger with error details
export function simpleRequestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).substring(2, 9);
    const method = c.req.method;
    const path = c.req.path;
    const origin = c.req.header('origin') || 'none';
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const hasAuth = !!c.req.header('authorization');
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Log incoming request with debugging info
    console.log(`\n📥 [${requestId}] INCOMING REQUEST`);
    console.log(`   Method:    ${method}`);
    console.log(`   Path:      ${path}`);
    console.log(`   Origin:    ${origin}`);
    console.log(`   IP:        ${ip}`);
    console.log(`   Auth:      ${hasAuth ? '✓ Present' : '✗ None'}`);
    console.log(`   User-Agent: ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`);

    // Log query parameters if present
    const queryParams = c.req.queries();
    if (Object.keys(queryParams).length > 0) {
      console.log(`   Query:     ${JSON.stringify(queryParams)}`);
    }

    try {
      await next();

      const duration = Date.now() - start;
      const status = c.res.status;
      const statusEmoji = status < 300 ? '✅' : status < 400 ? '⚠️' : status < 500 ? '❌' : '💥';
      const statusText = getStatusText(status);

      // Try to extract response count for GET requests
      let responseCountStr = '';
      if (method === 'GET' && status >= 200 && status < 300) {
        try {
          const clonedResponse = c.res.clone();
          const body = await clonedResponse.json();
          const count = extractResponseCount(body);
          if (count !== undefined) {
            responseCountStr = ` [${count} items]`;
          }
        } catch {
          // Can't parse response body, skip count
        }
      }

      console.log(`📤 [${requestId}] RESPONSE: ${status} ${statusText} ${statusEmoji} (${duration}ms)${responseCountStr}\n`);

    } catch (error: any) {
      const duration = Date.now() - start;

      console.log(`💥 [${requestId}] ERROR: ${error.name}: ${error.message} (${duration}ms)`);
      console.log(`   Stack: ${error.stack?.split('\n').slice(1, 3).join(' | ') || 'unknown'}\n`);

      throw error;
    }
  };
}

// Helper function to get HTTP status text
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return statusTexts[status] || 'Unknown';
}
