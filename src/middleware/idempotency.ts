/**
 * Idempotency Middleware
 * Prevents duplicate POST/PUT requests from processing multiple times
 *
 * Usage: Send idempotency-key header with requests
 * Backend will return cached result for duplicate requests
 */

import { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// In-memory cache (in production, use Redis)
const idempotencyCache = new Map<string, {
  response: any;
  status: ContentfulStatusCode;
  timestamp: number;
}>();

const CACHE_TTL = 60000; // 1 minute

export function idempotency(options?: {
  expireAfter?: number;
}) {
  const expireAfter = options?.expireAfter ?? CACHE_TTL;

  return async (c: Context, next: Next) => {
    // Only apply to POST, PUT, PATCH requests
    const method = c.req.method;
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return next();
    }

    const idempotencyKey = c.req.header('idempotency-key');

    if (!idempotencyKey) {
      // No idempotency key, proceed normally
      return next();
    }

    // Check if we have a cached response
    const cached = idempotencyCache.get(idempotencyKey);

    if (cached) {
      // Check if cache is still valid
      const now = Date.now();
      if (now - cached.timestamp < expireAfter) {
        console.log(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
        // Return cached response
        return c.json(cached.response, cached.status);
      } else {
        // Cache expired, remove it
        idempotencyCache.delete(idempotencyKey);
      }
    }

    // Store original json method
    const originalJson = c.json.bind(c);

    // Override to intercept response
    c.json = ((data: any, arg?: any) => {
      // Handle both status number and init object
      const status = typeof arg === 'number' ? arg : arg?.status;
      const statusCode = (status ?? 200) as ContentfulStatusCode;

      // Cache the response
      idempotencyCache.set(idempotencyKey, {
        response: data,
        status: statusCode,
        timestamp: Date.now()
      });

      // Clean up expired entries periodically
      if (idempotencyCache.size > 1000) {
        const now = Date.now();
        for (const [key, value] of idempotencyCache.entries()) {
          if (now - value.timestamp > expireAfter) {
            idempotencyCache.delete(key);
          }
        }
      }

      return originalJson(data, arg);
    }) as typeof c.json;

    return next();
  };
}

/**
 * Generate idempotency key for client-side
 */
export function generateIdempotencyKey(): string {
  return `idemp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
