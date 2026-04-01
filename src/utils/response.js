/**
 * Standardized API Response Utilities
 * Ensures consistent response format across all endpoints
 */
import { z } from 'zod';
// HTTP Status codes with semantic names
export const HttpStatus = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};
// Error codes for programmatic handling
export const ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
};
// Success response helper
export function success(c, data, message, status = HttpStatus.OK) {
    const response = {
        success: true,
        data,
        ...(message && { message }),
    };
    return c.json(response, status);
}
// Paginated response helper
export function paginated(c, items, page, perPage, totalItems, message) {
    const response = {
        success: true,
        data: { items },
        ...(message && { message }),
        meta: {
            page,
            perPage,
            totalItems,
            totalPages: Math.ceil(totalItems / perPage),
        },
    };
    return c.json(response);
}
// Error response helper
export function error(c, message, status = HttpStatus.BAD_REQUEST, code, errors) {
    const response = {
        success: false,
        message,
        ...(code && { code }),
        ...(errors && { errors }),
    };
    return c.json(response, status);
}
// Validation error helper
export function validationError(c, zodError) {
    const errors = zodError.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
    }));
    return error(c, 'Validation failed', HttpStatus.UNPROCESSABLE_ENTITY, ErrorCodes.VALIDATION_ERROR, errors);
}
// Not found helper
export function notFound(c, entity = 'Resource') {
    return error(c, `${entity} not found`, HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND);
}
// Unauthorized helper
export function unauthorized(c, message = 'Unauthorized') {
    return error(c, message, HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED);
}
// Forbidden helper
export function forbidden(c, message = 'Access denied') {
    return error(c, message, HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN);
}
// Conflict helper
export function conflict(c, message) {
    return error(c, message, HttpStatus.CONFLICT, ErrorCodes.CONFLICT);
}
// Rate limited helper
export function rateLimited(c, retryAfter = 60) {
    c.header('Retry-After', retryAfter.toString());
    return error(c, 'Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMITED);
}
// Internal error helper
export function internalError(c, message = 'Internal server error', logError) {
    if (logError) {
        console.error('Internal error:', logError);
    }
    return error(c, message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_ERROR);
}
// Async handler wrapper with error catching
export function asyncHandler(fn) {
    return async (c) => {
        try {
            return await fn(c);
        }
        catch (error) {
            console.error('Async handler error:', error);
            if (error instanceof z.ZodError) {
                return validationError(c, error);
            }
            return internalError(c, error.message || 'An unexpected error occurred');
        }
    };
}
// Database error helper
export function databaseError(c, error) {
    console.error('Database error:', error);
    // Check for specific PostgreSQL errors
    if (error.code === '23505') {
        return conflict(c, 'A record with this information already exists');
    }
    if (error.code === '23503') {
        return error(c, 'Referenced resource not found', HttpStatus.BAD_REQUEST, ErrorCodes.DATABASE_ERROR);
    }
    return internalError(c, 'Database operation failed');
}
