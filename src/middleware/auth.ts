import jwt from 'jsonwebtoken';
import { Context, Next } from 'hono';
import {
  AuthenticationError,
  AuthorizationError,
} from '../errors/index.js';

const { verify } = jwt;

// Load PowerSync RSA public key from environment variable for JWT verification
const envPublicKey = process.env.POWERSYNC_PUBLIC_KEY;

let publicKey: string;
if (envPublicKey && envPublicKey.trim().length > 0) {
  // Handle escaped newlines in environment variable (DigitalOcean format)
  publicKey = envPublicKey.trim().replace(/\\n/g, '\n');
  console.log('✅ Auth middleware: PowerSync public key loaded from environment');
} else {
  console.error('❌ Auth middleware: POWERSYNC_PUBLIC_KEY environment variable not set');
  throw new Error('POWERSYNC_PUBLIC_KEY environment variable is required');
}

interface JwtPayload {
  sub: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided');
  }

  const token = authHeader.slice(7);

  try {
    // Try verifying with new RS256 public key first
    let decoded: JwtPayload;
    try {
      decoded = verify(token, publicKey, { algorithms: ['RS256'] }) as JwtPayload;
    } catch (rs256Error) {
      // Fall back to old HS256 with JWT_SECRET for backward compatibility
      try {
        const jwtSecret = process.env.JWT_SECRET!;
        decoded = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
        console.log('⚠️ Auth middleware: Verified old HS256 token');
      } catch (hs256Error) {
        throw new Error('Invalid token: neither RS256 nor HS256 verification succeeded');
      }
    }
    c.set('user', decoded);
    await next();
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
};

// Optional auth middleware - sets user if token present but doesn't require it
export const optionalAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      // Try verifying with new RS256 public key first
      let decoded: JwtPayload;
      try {
        decoded = verify(token, publicKey, { algorithms: ['RS256'] }) as JwtPayload;
      } catch {
        // Fall back to old HS256 with JWT_SECRET for backward compatibility
        try {
          const jwtSecret = process.env.JWT_SECRET!;
          decoded = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
        } catch {
          // Token invalid, but continue without user
          return;
        }
      }
      c.set('user', decoded);
    } catch {
      // Token invalid, but continue without user
    }
  }

  await next();
};

// Role-based authorization middleware
export const requireRole = (...allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('Unauthorized');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError('Insufficient permissions');
    }

    await next();
  };
};

// Role-based authorization middleware - any of the provided roles
export const requireAnyRole = (...allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('Unauthorized');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError('Insufficient permissions');
    }

    await next();
  };
};
