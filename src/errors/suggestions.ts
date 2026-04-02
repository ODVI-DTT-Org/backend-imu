/**
 * Error Suggestions Engine
 *
 * Provides user-friendly suggestions for common error scenarios.
 * Suggestions help users understand what went wrong and how to fix it.
 */

import type { ErrorCode } from './codes';

/**
 * Error suggestion interface
 */
export interface ErrorSuggestion {
  title: string;
  description: string;
  actions?: string[];
}

/**
 * Error suggestions registry
 */
const errorSuggestions: Record<ErrorCode, ErrorSuggestion> = {
  VALIDATION_ERROR: {
    title: 'Invalid Input',
    description: 'The information you provided is not valid. Please check the form for specific error messages.',
    actions: [
      'Review the highlighted fields in the form',
      'Ensure all required fields are filled',
      'Check for proper formatting (email, phone number, etc.)',
    ],
  },

  UNAUTHORIZED: {
    title: 'Authentication Required',
    description: 'You need to log in to access this resource.',
    actions: [
      'Log in with your credentials',
      'If you just logged in, you may need to refresh the page',
    ],
  },

  FORBIDDEN: {
    title: 'Access Denied',
    description: 'You don\'t have permission to access this resource.',
    actions: [
      'Contact your administrator if you believe you should have access',
      'Ensure you are logged in with the correct account',
    ],
  },

  NOT_FOUND: {
    title: 'Resource Not Found',
    description: 'The requested resource could not be found.',
    actions: [
      'Verify the URL or resource identifier is correct',
      'The resource may have been deleted or moved',
      'Try searching for the resource',
    ],
  },

  CONFLICT: {
    title: 'Resource Conflict',
    description: 'This request conflicts with existing data.',
    actions: [
      'A similar resource may already exist',
      'Check for duplicate entries',
      'Contact support if this issue persists',
    ],
  },

  INTERNAL_SERVER_ERROR: {
    title: 'Server Error',
    description: 'Something went wrong on our end. Our team has been notified.',
    actions: [
      'Try refreshing the page',
      'If the problem persists, contact support with the error code',
    ],
  },

  DATABASE_ERROR: {
    title: 'Database Error',
    description: 'We encountered an issue accessing our database.',
    actions: [
      'Try again in a moment',
      'If the problem persists, contact support',
    ],
  },

  NETWORK_ERROR: {
    title: 'Network Error',
    description: 'Unable to connect to the server. Please check your internet connection.',
    actions: [
      'Check your internet connection',
      'Try again when your connection is stable',
      'Contact support if the issue persists',
    ],
  },

  RATE_LIMIT_EXCEEDED: {
    title: 'Too Many Requests',
    description: 'You\'ve made too many requests. Please wait before trying again.',
    actions: [
      'Wait a few minutes before trying again',
      'Contact support if you need higher rate limits',
    ],
  },

  INVALID_CREDENTIALS: {
    title: 'Invalid Credentials',
    description: 'The email or password you provided is incorrect.',
    actions: [
      'Check your email and password',
      'Reset your password if you\'ve forgotten it',
    ],
  },

  TOKEN_EXPIRED: {
    title: 'Session Expired',
    description: 'Your session has expired. Please log in again.',
    actions: [
      'Log in again to continue',
    ],
  },

  TOKEN_INVALID: {
    title: 'Invalid Session',
    description: 'Your session is invalid. Please log in again.',
    actions: [
      'Clear your browser cache and log in again',
      'Contact support if the issue persists',
    ],
  },

  INSUFFICIENT_PERMISSIONS: {
    title: 'Insufficient Permissions',
    description: 'Your account doesn\'t have the required permissions for this action.',
    actions: [
      'Contact your administrator to request access',
      'Ensure you\'re logged in with the correct account',
    ],
  },

  RESOURCE_LOCKED: {
    title: 'Resource Locked',
    description: 'This resource is currently locked by another user or process.',
    actions: [
      'Wait a moment and try again',
      'Contact the user who may be editing this resource',
    ],
  },
};

/**
 * Get suggestions for an error code
 *
 * @param code - Error code
 * @returns Error suggestion object
 */
export function getSuggestionsForError(code: ErrorCode | string): ErrorSuggestion {
  return errorSuggestions[code as ErrorCode] || {
    title: 'Unknown Error',
    description: 'An unexpected error occurred. Please contact support.',
    actions: [
      'Try refreshing the page',
      'Contact support with the error code',
    ],
  };
}

/**
 * Get suggestion text as an array of strings
 *
 * @param code - Error code
 * @returns Array of suggestion strings
 */
export function getSuggestionTexts(code: ErrorCode | string): string[] {
  const suggestion = getSuggestionsForError(code);
  const texts: string[] = [
    suggestion.title,
    suggestion.description,
  ];

  if (suggestion.actions && suggestion.actions.length > 0) {
    texts.push(...suggestion.actions);
  }

  return texts;
}
