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

export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();

    // Collect request details
    const query: Record<string, string> = {};
    const queryParams = c.req.queries();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) {
        // Handle both string and string[] values
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
      },
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent') || 'unknown',
      origin: c.req.header('origin') || 'none',
      contentType: c.req.header('content-type'),
      authorization: !!c.req.header('authorization'),
    };

    // Log request details
    console.log('\n========== INCOMING REQUEST ==========');
    console.log(`📅 ${log.timestamp}`);
    console.log(`🔍 ${log.method} ${log.path}`);

    if (Object.keys(log.query).length > 0) {
      console.log(`❓ Query:`, log.query);
    }

    console.log(`🌐 Origin: ${log.origin}`);
    console.log(`📡 IP: ${log.ip}`);
    console.log(`🦄 User-Agent: ${log.userAgent.substring(0, 100)}${log.userAgent.length > 100 ? '...' : ''}`);

    if (log.authorization) {
      console.log(`🔑 Auth: [Token Present]`);
    } else {
      console.log(`🔑 Auth: [No Token]`);
    }

    if (log.contentType) {
      console.log(`📦 Content-Type: ${log.contentType}`);
    }

    console.log('=====================================\n');

    // Continue processing
    await next();

    // Log response
    const duration = Date.now() - start;
    const status = c.res.status;

    console.log(`✅ RESPONSE: ${log.method} ${log.path} → ${status} (${duration}ms)\n`);
  };
}

// Simplified one-line logger for less verbose output
export function simpleRequestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const origin = c.req.header('origin') || 'none';
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const hasAuth = !!c.req.header('authorization');

    console.log(`📥 [${method}] ${path} | Origin: ${origin} | IP: ${ip} | Auth: ${hasAuth ? '✓' : '✗'}`);

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    console.log(`📤 [${method}] ${path} → ${status} (${duration}ms)`);
  };
}
