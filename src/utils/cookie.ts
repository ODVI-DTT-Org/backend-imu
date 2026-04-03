/**
 * Cookie utility functions for Hono
 * Hono 4.x doesn't have built-in c.cookie() method, so we use set-cookie headers
 */

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
}

export interface Cookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Convert a cookie object to a Set-Cookie header value
 */
export function cookieToString(cookie: Cookie): string {
  const { name, value, options = {} } = cookie;
  let cookieString = `${name}=${value}`;

  if (options.maxAge) {
    cookieString += `; Max-Age=${options.maxAge}`;
  }

  if (options.expires) {
    cookieString += `; Expires=${options.expires.toUTCString()}`;
  }

  if (options.domain) {
    cookieString += `; Domain=${options.domain}`;
  }

  if (options.path) {
    cookieString += `; Path=${options.path}`;
  }

  if (options.httpOnly) {
    cookieString += `; HttpOnly`;
  }

  if (options.secure) {
    cookieString += `; Secure`;
  }

  if (options.sameSite) {
    cookieString += `; SameSite=${options.sameSite}`;
  }

  return cookieString;
}

/**
 * Set a cookie using Hono's set-cookie header
 */
export function setCookie(c: any, cookie: Cookie): void {
  const cookieString = cookieToString(cookie);
  c.header('set-cookie', cookieString);
}

/**
 * Set multiple cookies
 */
export function setCookies(c: any, cookies: Cookie[]): void {
  cookies.forEach(cookie => setCookie(c, cookie));
}
