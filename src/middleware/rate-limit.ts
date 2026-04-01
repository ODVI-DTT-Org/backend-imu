/**
 * Rate Limiting Middleware
 * Prevents brute force attacks and API abuse
 */

import { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: Context) => string; // Custom key generator
  skipCondition?: (c: Context) => boolean; // Skip rate limiting condition
  message?: string; // Custom error message
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (use Redis in production)
const stores: { [name: string]: RateLimitStore } = {};

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const storeName in stores) {
    const store = stores[storeName];
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    }
  }
}, 60000);

// Default key generator - uses IP + User ID if available
const defaultKeyGenerator = (c: Context): string => {
  const ip = c.req.header('x-forwarded-for') ||
             c.req.header('x-real-ip') ||
             'unknown';
  const user = c.get('user');
  const userId = user?.sub || 'anonymous';
  return `${ip}:${userId}`;
};

// Create rate limiter middleware
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs = 60000, // 1 minute default
    maxRequests = 100,
    keyGenerator = defaultKeyGenerator,
    skipCondition,
    message = 'Too many requests, please try again later.',
  } = config;

  const storeName = `ratelimit-${Date.now()}-${Math.random()}`;
  stores[storeName] = {};

  return async (c: Context, next: Next) => {
    // Skip if condition met
    if (skipCondition && skipCondition(c)) {
      return next();
    }

    const key = keyGenerator(c);
    const now = Date.now();

    // Initialize or get existing entry
    if (!stores[storeName][key]) {
      stores[storeName][key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    const entry = stores[storeName][key];

    // Reset if window expired
    if (entry.resetTime < now) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    // Increment count
    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTimeSeconds = Math.ceil((entry.resetTime - now) / 1000);

    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetTimeSeconds.toString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      c.header('Retry-After', resetTimeSeconds.toString());
      return c.json({
        message,
        retryAfter: resetTimeSeconds,
      }, 429);
    }

    return next();
  };
}

// Preset rate limiters
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many attempts. Please try again in 15 minutes.',
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many authentication attempts. Please try again later.',
  keyGenerator: (c) => {
    // Rate limit by email for login attempts
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    return `auth:${ip}`;
  },
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many upload requests. Please wait before uploading more files.',
});

// Combined rate limiter - applies different limits for different users
export function tieredRateLimit(options: {
  anonymous: number;
  authenticated: number;
  admin: number;
  windowMs?: number;
}) {
  const { anonymous, authenticated, admin, windowMs = 60000 } = options;

  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const role = user?.role || 'anonymous';

    let maxRequests: number;
    switch (role) {
      case 'admin':
        maxRequests = admin;
        break;
      case 'staff':
      case 'field_agent':
        maxRequests = authenticated;
        break;
      default:
        maxRequests = anonymous;
    }

    const limiter = rateLimit({ windowMs, maxRequests });
    return limiter(c, next);
  };
}
