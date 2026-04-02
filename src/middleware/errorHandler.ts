/**
 * Error Handler Middleware
 *
 * Catches all errors, generates request IDs, formats error responses,
 * and logs errors to the database asynchronously.
 */

import type { Context, Next } from 'hono';
import { v4 as uuidv4 } from 'uuid';

import type { AppError } from '../errors/index.js';
import {
  AppError as AppErrorClass,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  DatabaseError,
} from '../errors/index.js';
import { errorLogger } from '../services/errorLogger.js';

/**
 * Error handler middleware
 *
 * Catches all errors thrown in the application and returns
 * properly formatted error responses with request IDs.
 */
export const errorHandler = async (c: Context, next: Next) => {
  // Generate unique request ID for tracing
  const requestId = uuidv4();
  c.set('requestId', requestId);

  // Add request ID to response headers for debugging
  c.header('X-Request-Id', requestId);

  try {
    await next();
  } catch (error) {
    const timestamp = new Date().toISOString();
    const path = c.req.path;
    const method = c.req.method;

    // Get user information from context if available
    const userId = c.get('userId') as string | undefined;

    // Get IP address and user agent
    const ipAddress = c.req.header('x-forwarded-for') ||
                      c.req.header('x-real-ip') ||
                      'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Handle known AppError instances
    if (error instanceof AppErrorClass) {
      // Log error to database (async, non-blocking)
      errorLogger.log(error, {
        requestId,
        timestamp,
        path,
        method,
        userId,
        ipAddress,
        userAgent,
      });

      // Build error response
      const errorResponse = {
        ...error.toJSON(),
        requestId,
        timestamp,
        path,
        method,
      };

      // Include stack trace in development mode
      if (process.env.NODE_ENV !== 'production' && error.stack) {
        (errorResponse as any).stack = error.stack;
      }

      // Return error response with appropriate status code
      return c.json(errorResponse, error.statusCode as 400 | 401 | 403 | 404 | 409 | 423 | 429 | 500 | 503);
    }

    // Handle unknown errors
    console.error('Unhandled error:', error);

    // Create generic internal server error
    const genericError = new AppErrorClass(
      'INTERNAL_SERVER_ERROR' as any,
      'An unexpected error occurred. Please try again later.',
      500
    );

    // Log error to database (async, non-blocking)
    errorLogger.log(genericError, {
      requestId,
      timestamp,
      path,
      method,
      userId,
      ipAddress,
      userAgent,
    });

    // Build error response
    const errorResponse = {
      ...genericError.toJSON(),
      requestId,
      timestamp,
      path,
      method,
    };

    // Include stack trace in development mode
    if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.stack) {
      (errorResponse as any).stack = error.stack;
    }

    // Return error response
    return c.json(errorResponse, 500);
  }
};

/**
 * Not found handler middleware
 *
 * Handles 404 errors for unmatched routes.
 */
export const notFoundHandler = (c: Context) => {
  const requestId = c.get('requestId') || uuidv4();
  const timestamp = new Date().toISOString();
  const path = c.req.path;
  const method = c.req.method;

  const error = new NotFoundError(`Route ${method} ${path} not found`);

  const errorResponse = {
    ...error.toJSON(),
    requestId,
    timestamp,
    path,
    method,
  };

  return c.json(errorResponse, 404);
};

/**
 * Async handler wrapper
 *
 * Wraps async route handlers to catch errors and pass them to the error middleware.
 * This is useful for async route handlers that might throw errors.
 *
 * @param fn - Async function to wrap
 * @returns Wrapped function with error handling
 */
export function asyncHandler<T extends any[]>(
  fn: (c: Context, ...args: T) => Promise<Response>
) {
  return (c: Context, ...args: T) => Promise.resolve(fn(c, ...args)).catch((err) => {
    throw err; // Re-throw to be caught by errorHandler middleware
  });
}

export default errorHandler;
