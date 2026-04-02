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

  // DEBUG: Log that error handler was invoked
  console.log('🔍 ERROR HANDLER INVOKED for requestId:', requestId);

  try {
    await next();
    console.log('🔍 ERROR HANDLER: next() completed successfully');
  } catch (error) {
    // DEBUG: This should ALWAYS execute when an error is caught
    console.error('🔍🔍🔍 ERROR HANDLER CATCH BLOCK EXECUTED 🔍🔍🔍');
    console.error('🔍 Error type:', error instanceof Error ? error.name : typeof error);
    console.error('🔍 Error constructor:', error?.constructor?.name);
    console.error('🔍 Error statusCode:', (error as any).statusCode);
    console.error('🔍 Error message:', error instanceof Error ? error.message : String(error));

    // SIMPLIFIED: Just return a simple response for debugging
    const statusCode = (error as any).statusCode || 500;
    console.error('🔍 Returning response with status:', statusCode);

    // IMPORTANT: Don't use c.json() - it might not work properly in error handler
    // Use c.newResponse() with explicit status
    c.header('Content-Type', 'application/json');
    const response = c.newResponse(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      statusCode: statusCode,
      requestId: requestId,
    }), statusCode);

    console.error('🔍 Created response, status:', response.status);
    return response;
  }

  // If we get here, next() completed without error
  console.log('🔍 ERROR HANDLER: Request completed without error');
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
