/**
 * Debug Logging Middleware
 * Logs all incoming requests, responses, and errors for debugging
 * Enable by setting DEBUG_LOGS=true in environment
 */

const DEBUG_ENABLED = process.env.DEBUG_LOGS === 'true' || process.env.NODE_ENV !== 'production';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(color, text) {
  return DEBUG_ENABLED ? `${colors[color]}${text}${colors.reset}` : text;
}

/**
 * Request logging middleware
 */
export async function debugLogger(c, next) {
  if (!DEBUG_ENABLED) {
    await next();
    return;
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 9);

  // Extract request info
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const query = new URL(c.req.url).search;
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const contentType = c.req.header('content-type') || 'none';

  // Log incoming request
  console.log('');
  console.log(colorize('cyan', '════════════════════════════════════════════════════════════════'));
  console.log(colorize('bright', `📨 [${requestId}] INCOMING REQUEST`));
  console.log(colorize('blue', `   Method: ${method}`));
  console.log(colorize('blue', `   Path: ${path}${query}`));
  console.log(colorize('blue', `   IP: ${ip}`));
  console.log(colorize('blue', `   Content-Type: ${contentType}`));
  console.log(colorize('blue', `   User-Agent: ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`));

  // Log request body for non-GET requests
  if (method !== 'GET' && contentType.includes('application/json')) {
    try {
      const body = await c.req.json().catch(() => ({}));
      // Sanitize body (hide passwords, tokens, etc.)
      const sanitizedBody = sanitizeBody(body);
      console.log(colorize('magenta', `   Body: ${JSON.stringify(sanitizedBody, null, 2)}`));
      // Restore the body for the next handler
      c.req.json = async () => body;
    } catch (e) {
      // Body already read or not JSON
    }
  }

  // Log authenticated user info
  const user = c.get('user');
  if (user) {
    console.log(colorize('green', `   Auth: ${user.email} (${user.role})`));
  }

  // Capture response
  await next();

  // Calculate duration
  const duration = Date.now() - startTime;
  const status = c.res.status;

  // Log response
  const statusColor = status >= 500 ? 'red' : status >= 400 ? 'yellow' : 'green';
  console.log(colorize(statusColor, `   Status: ${status}`));
  console.log(colorize('blue', `   Duration: ${duration}ms`));

  if (status >= 400) {
    console.log(colorize('red', `   ⚠️  Request failed with status ${status}`));
  }

  console.log(colorize('cyan', '════════════════════════════════════════════════════════════════'));
}

/**
 * Sanitize request body to hide sensitive data
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'newPassword', 'currentPassword', 'confirmPassword', 'token', 'refresh_token', 'access_token'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}

/**
 * Error logging middleware
 */
export function debugErrorHandler(err, c) {
  if (!DEBUG_ENABLED) {
    return c.json({ message: 'Internal server error' }, 500);
  }

  console.log('');
  console.log(colorize('red', '════════════════════════════════════════════════════════════════'));
  console.log(colorize('bright', colorize('red', '💥 UNCAUGHT ERROR')));
  console.log(colorize('red', `   Message: ${err.message}`));
  console.log(colorize('red', `   Name: ${err.name}`));
  console.log(colorize('red', `   Path: ${new URL(c.req.url).pathname}`));

  if (err.stack) {
    console.log(colorize('red', `   Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`));
  }

  console.log(colorize('red', '════════════════════════════════════════════════════════════════'));

  return c.json({ message: 'Internal server error' }, 500);
}

/**
 * Database query logger
 */
export function logQuery(query, params, result) {
  if (!DEBUG_ENABLED) return;

  const queryShort = query.substring(0, 100) + (query.length > 100 ? '...' : '');
  console.log(colorize('yellow', `   🗄️  DB Query: ${queryShort}`));
  if (params && params.length > 0) {
    console.log(colorize('yellow', `   🗄️  DB Params: ${JSON.stringify(params)}`));
  }
  if (result) {
    console.log(colorize('yellow', `   🗄️  DB Result: ${result.rows?.length || 0} rows, ${result.rowCount} affected`));
  }
}
