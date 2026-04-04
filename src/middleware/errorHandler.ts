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
    // Log error to database (async, non-blocking)
    const err = error instanceof Error ? error : new Error(String(error));

    // Extract context from request
    const context = {
      requestId,
      timestamp: new Date().toISOString(),
      path: c.req.path,
      method: c.req.method,
      userId: (c as any).get('userId') as string | undefined,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    };

    // Log to database (fire-and-forget)
    errorLogger.log(err, context);

    // Build error response
    const statusCode = (error as any).statusCode || 500;
    const errorCode = (error as any).code || 'INTERNAL_SERVER_ERROR';
    const suggestions = (error as any).suggestions || [];
    const fieldErrors = (error as any).errors || [];

    c.header('Content-Type', 'application/json');
    const response = c.newResponse(JSON.stringify({
      success: false,
      message: err.message,
      statusCode,
      code: errorCode,
      requestId,
      ...(fieldErrors.length > 0 && { errors: fieldErrors }),
      ...(suggestions.length > 0 && { suggestions }),
    }), statusCode);

    return response;
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

  c.header('Content-Type', 'application/json');
  return c.newResponse(JSON.stringify(errorResponse), 404);
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
