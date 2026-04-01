import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { verify } = jwt;
// Load PowerSync RSA public key for JWT verification
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicKeyPath = path.join(__dirname, '../../powersync-public-key.pem');
let publicKey;
try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
    console.log('✅ Auth middleware: PowerSync public key loaded');
}
catch (error) {
    console.error('❌ Auth middleware: Failed to load PowerSync public key:', error);
    throw new Error('PowerSync public key not found at ' + publicKeyPath);
}
export const authMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ message: 'Unauthorized - No token provided' }, 401);
    }
    const token = authHeader.slice(7);
    try {
        // Try verifying with new RS256 public key first
        let decoded;
        try {
            decoded = verify(token, publicKey, { algorithms: ['RS256'] });
        }
        catch (rs256Error) {
            // Fall back to old HS256 with JWT_SECRET for backward compatibility
            try {
                const jwtSecret = process.env.JWT_SECRET;
                decoded = verify(token, jwtSecret, { algorithms: ['HS256'] });
                console.log('⚠️ Auth middleware: Verified old HS256 token');
            }
            catch (hs256Error) {
                throw new Error('Invalid token: neither RS256 nor HS256 verification succeeded');
            }
        }
        c.set('user', decoded);
        await next();
    }
    catch (error) {
        return c.json({ message: 'Invalid or expired token' }, 401);
    }
};
// Optional auth middleware - sets user if token present but doesn't require it
export const optionalAuthMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            // Try verifying with new RS256 public key first
            let decoded;
            try {
                decoded = verify(token, publicKey, { algorithms: ['RS256'] });
            }
            catch {
                // Fall back to old HS256 with JWT_SECRET for backward compatibility
                try {
                    const jwtSecret = process.env.JWT_SECRET;
                    decoded = verify(token, jwtSecret, { algorithms: ['HS256'] });
                }
                catch {
                    // Token invalid, but continue without user
                    return;
                }
            }
            c.set('user', decoded);
        }
        catch {
            // Token invalid, but continue without user
        }
    }
    await next();
};
// Role-based authorization middleware
export const requireRole = (...allowedRoles) => {
    return async (c, next) => {
        const user = c.get('user');
        if (!user) {
            return c.json({ message: 'Unauthorized' }, 401);
        }
        if (!allowedRoles.includes(user.role)) {
            return c.json({ message: 'Forbidden - Insufficient permissions' }, 403);
        }
        await next();
    };
};
// Role-based authorization middleware - any of the provided roles
export const requireAnyRole = (...allowedRoles) => {
    return async (c, next) => {
        const user = c.get('user');
        if (!user) {
            return c.json({ message: 'Unauthorized' }, 401);
        }
        if (!allowedRoles.includes(user.role)) {
            return c.json({ message: 'Forbidden - Insufficient permissions' }, 403);
        }
        await next();
    };
};
