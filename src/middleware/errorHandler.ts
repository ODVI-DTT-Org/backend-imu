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
  } catch (error) {
    // DEBUG: This should ALWAYS execute when an error is caught
    console.error('🔍🔍🔍 ERROR HANDLER CATCH BLOCK EXECUTED 🔍🔍🔍');
    console.error('🔍 Error type:', error instanceof Error ? error.name : typeof error);
    console.error('🔍 Error statusCode:', (error as any).statusCode);

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

      // Set status code explicitly and return error response
      const statusCode = error.statusCode;

      // DEBUG: Log what we're about to return
      console.error('🔍 ERROR HANDLER: About to return response with statusCode:', statusCode);
      console.error('🔍 ERROR HANDLER: errorResponse keys:', Object.keys(errorResponse));

      // Use newResponse to create a Response with explicit status code
      // Set Content-Type header explicitly
      c.header('Content-Type', 'application/json');

      // Return response with status code
      const response = c.newResponse(JSON.stringify(errorResponse), statusCode as any);
      console.error('🔍 ERROR HANDLER: Created response, status:', response.status);
      return response;
    }

    // Handle unknown errors with detailed logging
    console.error('\n' + '='.repeat(60));
    console.error('💥 UNHANDLED ERROR');
    console.error('='.repeat(60));
    console.error(`📋 Request ID: ${requestId}`);
    console.error(`📍 Path:       ${method} ${path}`);
    console.error(`⏰ Timestamp:  ${timestamp}`);
    console.error(`🌐 IP:         ${ipAddress}`);
    if (userId) {
      console.error(`👤 User ID:    ${userId}`);
    }

    // Check if this is a database error
    if (error instanceof Error && 'code' in error) {
      const dbError = error as any;
      console.error(`\n🗄️  DATABASE ERROR:`);
      console.error(`   Code:       ${dbError.code || 'Unknown'}`);
      console.error(`   Message:    ${dbError.message}`);
      if (dbError.detail) {
        console.error(`   Detail:     ${dbError.detail}`);
      }
      if (dbError.schema) {
        console.error(`   Schema:     ${dbError.schema}`);
      }
      if (dbError.table) {
        console.error(`   Table:      ${dbError.table}`);
      }
      if (dbError.column) {
        console.error(`   Column:     ${dbError.column}`);
      }
      if (dbError.constraint) {
        console.error(`   Constraint: ${dbError.constraint}`);
      }
    } else {
      console.error(`\n❌ Error:      ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof Error && error.stack) {
        console.error(`📍 Stack Trace:`);
        console.error(error.stack.split('\n').slice(0, 5).join('\n'));
      }
    }

    console.error('='.repeat(60) + '\n');

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

    // Set status code explicitly and return error response
    c.header('Content-Type', 'application/json');
    return c.newResponse(JSON.stringify(errorResponse), 500);
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
