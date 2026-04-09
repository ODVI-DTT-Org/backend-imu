/**
 * Standard Error Response Format
 *
 * Provides consistent error response structure across all API endpoints.
 *
 * Usage:
 * ```dart
 * throw StandardError.notFound('Resource not found')
 * throw StandardError.validation('Invalid input', details: {...})
 * ```
 */

class StandardError {
  final String message;
  final String type;
  final Map<String, dynamic>? details;
  final int statusCode;

  const StandardError({
    required this.message,
    required this.type,
    this.details,
    required this.statusCode,
  });

  /// Create a NOT FOUND error (404)
  const StandardError.notFound(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'NOT_FOUND',
          details: details,
          statusCode: 404,
        );

  /// Create a VALIDATION error (400)
  const StandardError.validation(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'VALIDATION_ERROR',
          details: details,
          statusCode: 400,
        );

  /// Create an UNAUTHORIZED error (401)
  const StandardError.unauthorized(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'UNAUTHORIZED',
          details: details,
          statusCode: 401,
        );

  /// Create a FORBIDDEN error (403)
  const StandardError.forbidden(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'FORBIDDEN',
          details: details,
          statusCode: 403,
        );

  /// Create a CONFLICT error (409)
  const StandardError.conflict(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'CONFLICT',
          details: details,
          statusCode: 409,
        );

  /// Create an INTERNAL SERVER ERROR (500)
  const StandardError.internal(
    String message, {
    Map<String, dynamic>? details,
  }) : this(
          message: message,
          type: 'INTERNAL_ERROR',
          details: details,
          statusCode: 500,
        );

  /// Convert to JSON response format
  Map<String, dynamic> toJson() {
    return {
      'success': false,
      'error': {
        'message': message,
        'type': type,
        if (details != null) 'details': details,
      },
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
