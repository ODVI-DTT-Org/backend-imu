import { Context, MiddlewareHandler } from 'hono';

/**
 * Middleware to require admin role
 * Returns 403 Forbidden if user is not an admin
 */
export const requireAdmin: MiddlewareHandler = async (c: Context, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ message: 'Not authenticated' }, 401);
  }

  if (user.role !== 'admin') {
    return c.json({ message: 'Forbidden. Admin role required.' }, 403);
  }

  await next();
};
