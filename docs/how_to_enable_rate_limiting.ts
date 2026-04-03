/**
 * HOW TO ENABLE RATE LIMITING
 *
 * The rate limiting middleware exists but is not being used.
 * Here's how to enable it:
 */

// In backend/src/routes/auth.ts, import the rate limiters:
import { authRateLimit } from '../middleware/rate-limit.js';

// Apply to login route:
auth.post('/login', authRateLimit, async (c) => {
  // ... existing login code
});

// Apply to register route:
auth.post('/register', authRateLimit, async (c) => {
  // ... existing register code
});

// Apply to password reset:
auth.post('/reset-password', authRateLimit, async (c) => {
  // ... existing reset code
});

// Available rate limiters:
// - authRateLimit: 10 requests per 15 minutes (for auth endpoints)
// - apiRateLimit: 100 requests per minute (for general API)
// - uploadRateLimit: 10 uploads per minute (for file uploads)
// - strictRateLimit: 5 requests per 15 minutes (for sensitive operations)
