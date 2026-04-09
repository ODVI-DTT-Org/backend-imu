/**
 * Standard Error Response Format
 *
 * Provides consistent error response structure across all API endpoints.
 *
 * Usage:
 * ```typescript
 * throw StandardError.notFound('Resource not found')
 * throw StandardError.validation('Invalid input', details)
 * ```
 */

export class StandardError extends Error {
  public readonly message: string;
  public readonly type: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;

  constructor({
    message,
    type,
    details,
    statusCode,
  }: {
    message: string;
    type: string;
    details?: Record<string, unknown>;
    statusCode: number;
  }) {
    super(message);
    this.message = message;
    this.type = type;
    this.details = details;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Create a NOT FOUND error (404) */
  static notFound(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'NOT_FOUND',
      details,
      statusCode: 404,
    });
  }

  /** Create a VALIDATION error (400) */
  static validation(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'VALIDATION_ERROR',
      details,
      statusCode: 400,
    });
  }

  /** Create an UNAUTHORIZED error (401) */
  static unauthorized(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'UNAUTHORIZED',
      details,
      statusCode: 401,
    });
  }

  /** Create a FORBIDDEN error (403) */
  static forbidden(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'FORBIDDEN',
      details,
      statusCode: 403,
    });
  }

  /** Create a CONFLICT error (409) */
  static conflict(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'CONFLICT',
      details,
      statusCode: 409,
    });
  }

  /** Create an INTERNAL SERVER ERROR (500) */
  static internal(message: string, details?: Record<string, unknown>): StandardError {
    return new StandardError({
      message,
      type: 'INTERNAL_ERROR',
      details,
      statusCode: 500,
    });
  }

  /** Convert to JSON response format */
  toJSON(): Record<string, unknown> {
    return {
      success: false,
      error: {
        message: this.message,
        type: this.type,
        ...(this.details && { details: this.details }),
      },
    };
  }
}
    };
  }

  /// Create from existing exception
  factory StandardError.fromException(dynamic exception) {
    if (exception is StandardError) return exception;

    return StandardError.internal(
      exception.toString(),
      details: {'exception_type': exception.runtimeType.toString()},
    );
  }
}
