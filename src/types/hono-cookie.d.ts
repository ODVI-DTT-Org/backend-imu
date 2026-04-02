/**
 * Type declarations for Hono cookie support
 * Extends Hono's Context type to include cookie methods
 */

import type { Context } from 'hono';

declare module 'hono' {
  interface Context {
    /**
     * Set a cookie in the response
     */
    cookie(name: string, value: string, options?: {
      path?: string;
      domain?: string;
      expires?: Date;
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
      secret?: string;
      prefix?: string;
      signed?: boolean;
    }): void;

    /**
     * Get a cookie value from the request
     */
    cookie(name: string): string | undefined;
  }
}
