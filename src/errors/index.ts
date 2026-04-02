/**
 * Error Classes
 *
 * Custom error classes with fluent API for consistent error handling.
 * All errors extend from AppError base class.
 */

import type { ErrorCode } from './codes';
import { ErrorCodes } from './codes';
import { getSuggestionTexts } from './suggestions';

/**
 * Field error interface for validation errors
 */
export interface FieldError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Base error class
 *
 * Provides fluent API for building detailed error responses.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public details: Record<string, any>;
  public suggestions: string[];
  public documentationUrl?: string;
  public errors: FieldError[];

  /**
   * Create a new AppError
   *
   * @param code - Error code
   * @param message - User-friendly error message
   * @param statusCode - HTTP status code (default: 500)
   */
  constructor(code: string | ErrorCode, message: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code as ErrorCode;
    this.statusCode = statusCode;
    this.details = {};
    this.suggestions = getSuggestionTexts(code);
    this.errors = [];

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Add a detail to the error
   *
   * @param key - Detail key
   * @param value - Detail value
   * @returns This error instance for chaining
   */
  addDetail(key: string, value: any): this {
    this.details[key] = value;
    return this;
  }

  /**
   * Add multiple details to the error
   *
   * @param details - Object containing key-value pairs
   * @returns This error instance for chaining
   */
  addDetails(details: Record<string, any>): this {
    this.details = { ...this.details, ...details };
    return this;
  }

  /**
   * Add a suggestion to the error
   *
   * @param text - Suggestion text
   * @returns This error instance for chaining
   */
  addSuggestion(text: string): this {
    this.suggestions.push(text);
    return this;
  }

  /**
   * Set documentation URL for the error
   *
   * @param url - Documentation URL
   * @returns This error instance for chaining
   */
  setDocumentation(url: string): this {
    this.documentationUrl = url;
    return this;
  }

  /**
   * Add a field error (for validation errors)
   *
   * @param field - Field name
   * @param message - Error message
   * @param value - Field value (optional)
   * @returns This error instance for chaining
   */
  addFieldError(field: string, message: string, value?: any): this {
    this.errors.push({ field, message, value });
    return this;
  }

  /**
   * Convert error to JSON for API response
   *
   * @returns Error object as JSON
   */
  toJSON() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      details: this.details,
      errors: this.errors,
      suggestions: this.suggestions,
      documentationUrl: this.documentationUrl,
    };
  }
}

/**
 * Validation Error (400)
 *
 * Used when user input fails validation rules.
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(ErrorCodes.VALIDATION_ERROR, message, 400);
  }
}

/**
 * Not Found Error (404)
 *
 * Used when a requested resource doesn't exist.
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(ErrorCodes.NOT_FOUND, `${resource} not found`, 404);
    this.addDetail('resource', resource);
  }
}

/**
 * Authentication Error (401)
 *
 * Used when user is not authenticated.
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(ErrorCodes.UNAUTHORIZED, message, 401);
  }
}

/**
 * Authorization Error (403)
 *
 * Used when user lacks permissions for an action.
 */
export class AuthorizationError extends AppError {
  constructor(action: string = 'perform this action') {
    super(ErrorCodes.FORBIDDEN, `You don't have permission to ${action}`, 403);
    this.addDetail('action', action);
  }
}

/**
 * Conflict Error (409)
 *
 * Used when request conflicts with existing state.
 */
export class ConflictError extends AppError {
  constructor(message: string, resource: string = 'Resource') {
    super(ErrorCodes.CONFLICT, message, 409);
    this.addDetail('resource', resource);
  }
}

/**
 * Rate Limit Error (429)
 *
 * Used when rate limit is exceeded.
 */
export class RateLimitError extends AppError {
  constructor(limit: number = 60, window: number = 60) {
    super(
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded. Maximum ${limit} requests per ${window} seconds.`,
      429
    );
    this.addDetail('limit', limit);
    this.addDetail('window', window);
  }
}

/**
 * Database Error (500)
 *
 * Used when database operations fail.
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(ErrorCodes.DATABASE_ERROR, message, 500);
  }
}

/**
 * Invalid Credentials Error (401)
 *
 * Used specifically for invalid login credentials.
 */
export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(ErrorCodes.INVALID_CREDENTIALS, message, 401);
  }
}

/**
 * Token Expired Error (401)
 *
 * Used when authentication token has expired.
 */
export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired') {
    super(ErrorCodes.TOKEN_EXPIRED, message, 401);
  }
}

/**
 * Token Invalid Error (401)
 *
 * Used when authentication token is invalid.
 */
export class TokenInvalidError extends AppError {
  constructor(message: string = 'Invalid token') {
    super(ErrorCodes.TOKEN_INVALID, message, 401);
  }
}

/**
 * Insufficient Permissions Error (403)
 *
 * Used when user lacks specific permissions.
 */
export class InsufficientPermissionsError extends AppError {
  constructor(permission: string) {
    super(
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      `Insufficient permissions: ${permission} required`,
      403
    );
    this.addDetail('permission', permission);
  }
}

/**
 * Resource Locked Error (423)
 *
 * Used when a resource is locked.
 */
export class ResourceLockedError extends AppError {
  constructor(resource: string = 'Resource') {
    super(ErrorCodes.RESOURCE_LOCKED, `${resource} is currently locked`, 423);
    this.addDetail('resource', resource);
  }
}

/**
 * Network Error (503)
 *
 * Used when external service is unavailable.
 */
export class NetworkError extends AppError {
  constructor(service: string = 'External service') {
    super(ErrorCodes.NETWORK_ERROR, `${service} is unavailable`, 503);
    this.addDetail('service', service);
  }
}

// Export all error types
export default {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  InsufficientPermissionsError,
  ResourceLockedError,
  NetworkError,
};
