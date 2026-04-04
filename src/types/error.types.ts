/**
 * Error Reporting Types
 *
 * Types for system-wide error logging from all platforms (mobile, web, backend).
 * Supports error deduplication, rate limiting, and platform-specific context.
 *
 * @file
 * @module error.types
 */

// ============================================
// Type Definitions
// ============================================

/**
 * Error reporting request from client platforms (mobile, web, backend)
 *
 * @interface ErrorReportRequest
 */
export interface ErrorReportRequest {
  /** Error code (e.g., "DATABASE_ERROR", "NETWORK_ERROR") */
  code: string;

  /** Human-readable error message */
  message: string;

  /** HTTP status code (if applicable) */
  statusCode?: number;

  /** Platform that generated the error */
  platform: 'mobile' | 'web' | 'backend';

  /** Stack trace for debugging */
  stackTrace?: string;

  /** User ID who experienced the error (if available) */
  userId?: string;

  /** Unique request ID for tracing */
  requestId?: string;

  /** SHA-256 fingerprint for deduplication */
  fingerprint?: string;

  // Platform-specific fields

  /** Mobile app version (e.g., "1.0.0") */
  appVersion?: string;

  /** Mobile OS version (e.g., "iOS 15.0") */
  osVersion?: string;

  /** Mobile device information (model, manufacturer, etc.) */
  deviceInfo?: Record<string, any>;

  /** Web page URL where error occurred */
  pageUrl?: string;

  /** Vue component stack trace */
  componentStack?: string;

  /** Additional error context */
  details?: Record<string, any>;

  /** Suggested fixes for the error */
  suggestions?: string[];

  /** Link to documentation */
  documentationUrl?: string;
}

/**
 * Error reporting response from backend
 *
 * @interface ErrorReportResponse
 */
export interface ErrorReportResponse {
  /** Whether the request was successful */
  success: boolean;

  /** Whether the error was logged (false for duplicates) */
  logged: boolean;

  /** Unique ID of the error log entry */
  errorId: string;

  /** Reason why error was not logged (duplicate or rate_limited) */
  reason?: 'duplicate' | 'rate_limited';
}

/**
 * Sanitized error details with sensitive data redacted
 *
 * @interface SanitizedErrorDetails
 */
export interface SanitizedErrorDetails {
  [key: string]: any;
}

/**
 * Error fingerprint for deduplication
 *
 * @interface ErrorFingerprint
 */
export interface ErrorFingerprint {
  /** SHA-256 hash of error content */
  hash: string;

  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Stack trace (optional) */
  stackTrace?: string;
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if an object is a valid ErrorReportRequest
 *
 * @param obj - Object to check
 * @returns True if object matches ErrorReportRequest interface
 */
export function isErrorReportRequest(obj: unknown): obj is ErrorReportRequest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    'platform' in obj &&
    typeof obj.code === 'string' &&
    typeof obj.message === 'string' &&
    ['mobile', 'web', 'backend'].includes(obj.platform as string)
  );
}

/**
 * Check if an object is a valid ErrorReportResponse
 *
 * @param obj - Object to check
 * @returns True if object matches ErrorReportResponse interface
 */
export function isErrorReportResponse(obj: unknown): obj is ErrorReportResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'success' in obj &&
    'logged' in obj &&
    'errorId' in obj &&
    typeof obj.success === 'boolean' &&
    typeof obj.logged === 'boolean' &&
    typeof obj.errorId === 'string'
  );
}
