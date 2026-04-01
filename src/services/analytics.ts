import { PostHog } from 'posthog-node';

// Initialize PostHog client (only if configured)
let posthogClient: PostHog | null = null;

if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST) {
  posthogClient = new PostHog(
    process.env.POSTHOG_API_KEY,
    {
      host: process.env.POSTHOG_HOST,
    }
  );
  console.log('✅ PostHog analytics initialized');
} else {
  console.log('⚠️  PostHog analytics not configured (set POSTHOG_API_KEY and POSTHOG_HOST)');
}

// Analytics event names
export const AnalyticsEvents = {
  // Auth events
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  PASSWORD_RESET_REQUEST: 'password_reset_request',
  PASSWORD_RESET_COMPLETE: 'password_reset_complete',

  // Client events
  CLIENT_CREATED: 'client_created',
  CLIENT_UPDATED: 'client_updated',
  CLIENT_DELETED: 'client_deleted',
  CLIENT_IMPORTED: 'client_imported',

  // Touchpoint events
  TOUCHPOINT_CREATED: 'touchpoint_created',
  TOUCHPOINT_COMPLETED: 'touchpoint_completed',
  VISIT_COMPLETED: 'visit_completed',
  CALL_COMPLETED: 'call_completed',

  // Attendance events
  CHECK_IN: 'check_in',
  CHECK_OUT: 'check_out',

  // Itinerary events
  ITINERARY_CREATED: 'itinerary_created',
  ITINERARY_STARTED: 'itinerary_started',
  ITINERARY_COMPLETED: 'itinerary_completed',

  // Group events
  GROUP_CREATED: 'group_created',
  GROUP_MEMBER_ADDED: 'group_member_added',
  GROUP_MEMBER_REMOVED: 'group_member_removed',

  // Target events
  TARGET_SET: 'target_set',
  TARGET_ACHIEVED: 'target_achieved',

  // Report events
  REPORT_GENERATED: 'report_generated',
  REPORT_EXPORTED: 'report_exported',

  // Error events
  API_ERROR: 'api_error',
  SYNC_ERROR: 'sync_error',
} as const;

// Track an analytics event
export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, any>
): void {
  if (!posthogClient) {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] ${event}:`, { distinctId, ...properties });
    }
    return;
  }

  posthogClient.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
}

// Identify a user with their properties
export function identifyUser(
  distinctId: string,
  properties: {
    email?: string;
    name?: string;
    role?: string;
    first_name?: string;
    last_name?: string;
  }
): void {
  if (!posthogClient) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] Identify user:`, { distinctId, ...properties });
    }
    return;
  }

  posthogClient.identify({
    distinctId,
    properties: {
      email: properties.email,
      name: properties.name || `${properties.first_name} ${properties.last_name}`,
      role: properties.role,
      first_name: properties.first_name,
      last_name: properties.last_name,
    },
  });
}

// Set user properties (without identifying)
export function setUserProperties(
  distinctId: string,
  properties: Record<string, any>
): void {
  if (!posthogClient) return;

  posthogClient.capture({
    distinctId,
    event: '$set',
    properties: { $set: properties },
  });
}

// Track page view (for web app)
export function trackPageView(
  distinctId: string,
  pageName: string,
  properties?: Record<string, any>
): void {
  trackEvent(distinctId, '$pageview', {
    $current_url: pageName,
    ...properties,
  });
}

// Shutdown gracefully
export async function shutdownAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}

export default {
  trackEvent,
  identifyUser,
  setUserProperties,
  trackPageView,
  shutdownAnalytics,
  AnalyticsEvents,
};
