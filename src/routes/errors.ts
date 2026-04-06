/**
 * Error Reporting Routes
 *
 * Public endpoint for receiving error reports from all platforms (mobile, web, backend).
 * Implements error deduplication, rate limiting, and platform-specific context handling.
 *
 * POST /api/errors - Receive error reports from any platform
 */

import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { apiRateLimit } from '../middleware/rate-limit.js';
import type {
  ErrorReportRequest,
  ErrorReportResponse,
} from '../types/error.types.js';
import { isErrorReportRequest } from '../types/error.types.js';

const errors = new Hono();

// Apply rate limiting to all error reporting routes (100 requests per minute per IP)
errors.use('*', apiRateLimit);

/**
 * Sensitive data patterns to redact from error reports
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
  /bearer/i,
  /jwt/i,
];

/**
 * Recursively sanitize an object by redacting sensitive data
 *
 * @param obj - Object to sanitize
 * @returns Sanitized object with sensitive data redacted
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
 * Generate SHA-256 fingerprint for error deduplication
 *
 * @param code - Error code
 * @param message - Error message
 * @param stackTrace - Stack trace (optional)
 * @returns SHA-256 hash as hex string
 */
async function generateFingerprint(
  code: string,
  message: string,
  stackTrace?: string
): Promise<string> {
  // Create fingerprint content: code:message:stackTrace (or code:message if no stack)
  const content = stackTrace ? `${code}:${message}:${stackTrace}` : `${code}:${message}`;

  // Use Web Crypto API (available in Node.js 18+)
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * POST /api/errors
 *
 * Receive error reports from all platforms (mobile, web, backend).
 * Implements error deduplication and rate limiting.
 *
 * Request body:
 * {
 *   code: string,
 *   message: string,
 *   platform: 'mobile' | 'web' | 'backend',
 *   stackTrace?: string,
 *   userId?: string,
 *   requestId?: string,
 *   appVersion?: string,
 *   osVersion?: string,
 *   deviceInfo?: Record<string, any>,
 *   pageUrl?: string,
 *   componentStack?: string,
 *   details?: Record<string, any>,
 *   suggestions?: string[],
 *   documentationUrl?: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   logged: boolean,
 *   errorId: string,
 *   reason?: 'duplicate' | 'rate_limited'
 * }
 */
errors.post('/', async (c) => {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await c.req.json();

    // Validate request type
    if (!isErrorReportRequest(body)) {
      return c.json(
        {
          success: false,
          logged: false,
          errorId: '',
          message: 'Invalid error report request',
        },
        400
      );
    }

    const report: ErrorReportRequest = body;

    // Sanitize sensitive data from details and deviceInfo
    if (report.details) {
      report.details = sanitizeObject(report.details);
    }
    if (report.deviceInfo) {
      report.deviceInfo = sanitizeObject(report.deviceInfo);
    }

    // Generate fingerprint for deduplication
    const fingerprint = report.fingerprint ||
      await generateFingerprint(report.code, report.message, report.stackTrace);

    // Check for duplicate error within 1 minute
    const duplicateCheckQuery = `
      SELECT id, fingerprint, last_fingerprint_seen_at, occurrences_count
      FROM error_logs
      WHERE fingerprint = $1
        AND last_fingerprint_seen_at > NOW() - INTERVAL '1 minute'
      ORDER BY last_fingerprint_seen_at DESC
      LIMIT 1
    `;

    const duplicateResult = await pool.query(duplicateCheckQuery, [fingerprint]);

    if (duplicateResult.rows.length > 0) {
      const existingError = duplicateResult.rows[0];

      // Update occurrences count and last seen timestamp
      await pool.query(
        `UPDATE error_logs
         SET occurrences_count = occurrences_count + 1,
             last_fingerprint_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [existingError.id]
      );

      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[errors] Slow duplicate check: ${duration}ms for fingerprint ${fingerprint}`);
      }

      return c.json({
        success: true,
        logged: false,
        errorId: existingError.id,
        reason: 'duplicate',
      } as ErrorReportResponse);
    }

    // Get client IP address
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
                     c.req.header('x-real-ip') ||
                     'unknown';

    // Get user agent
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Build details JSONB with platform-specific context
    const details: any = {
      platform: report.platform,
    };

    // Add platform-specific context
    if (report.platform === 'mobile') {
      if (report.appVersion) details.appVersion = report.appVersion;
      if (report.osVersion) details.osVersion = report.osVersion;
      if (report.deviceInfo) details.deviceInfo = report.deviceInfo;
    } else if (report.platform === 'web') {
      if (report.pageUrl) details.pageUrl = report.pageUrl;
      if (report.componentStack) details.componentStack = report.componentStack;
    } else if (report.platform === 'backend') {
      // Backend errors may include request path, method, etc.
      if (report.details?.path) details.path = report.details.path;
      if (report.details?.method) details.method = report.details.method;
    }

    // Add additional details if provided
    if (report.details) {
      Object.assign(details, report.details);
    }

    // Insert error log into database
    const insertQuery = `
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
        component_stack,
        fingerprint,
        last_fingerprint_seen_at,
        occurrences_count,
        app_version,
        os_version,
        platform,
        device_info,
        is_synced,
        suggestions,
        documentation_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
      )
      RETURNING id
    `;

    const insertValues = [
      report.requestId || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      new Date(),
      report.code,
      report.message,
      report.statusCode || 500,
      report.pageUrl || report.details?.path || 'unknown',
      report.details?.method || 'POST',
      report.userId || null,
      ipAddress,
      userAgent,
      JSON.stringify(details),
      '[]', // Empty errors array for client reports
      report.stackTrace || null,
      report.componentStack || null,
      fingerprint,
      new Date(),
      1,
      report.appVersion || null,
      report.osVersion || null,
      report.platform || null,
      report.deviceInfo ? JSON.stringify(report.deviceInfo) : null,
      false, // is_synced: false by default (will be synced for mobile)
      report.suggestions || [],
      report.documentationUrl || null,
    ];

    const insertResult = await pool.query(insertQuery, insertValues);
    const errorId = insertResult.rows[0].id;

    const duration = Date.now() - startTime;

    // Log slow operations (>1s)
    if (duration > 1000) {
      console.warn(`[errors] Slow error logging: ${duration}ms for error ${report.code}`);
    }

    return c.json({
      success: true,
      logged: true,
      errorId,
    } as ErrorReportResponse);

  } catch (error: any) {
    console.error('Error logging error report:', error);

    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.warn(`[errors] Slow error handling: ${duration}ms`);
    }

    return c.json(
      {
        success: false,
        logged: false,
        errorId: '',
        message: 'Failed to log error',
      },
      500
    );
  }
});

export default errors;
