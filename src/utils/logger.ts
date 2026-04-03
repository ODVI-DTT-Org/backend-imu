/**
 * Simplified Runtime Logger
 *
 * Provides clean, structured logging format for runtime operations.
 * Format: [ Context ]: details...
 */

import type { Context } from 'hono';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  request?: Context;
  controller?: string;
  table?: string;
  operation?: string;
  userId?: string;
  requestId?: string;
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';
  private logLevel = process.env.LOG_LEVEL || 'info';

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel as LogLevel];
  }

  private formatMessage(context: string, message: string, details?: any): string {
    let output = `[ ${context} ]: ${message}`;
    if (details && !this.isProduction) {
      output += `\n${JSON.stringify(details, null, 2)}`;
    }
    return output;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  private getDivider(): string {
    return '----';
  }

  startRequest(controller: string, details?: { method?: string; path?: string; userId?: string }): void {
    if (!this.shouldLog('info')) return;

    const timestamp = this.getTimestamp();
    const divider = this.getDivider();

    console.log(`\n${divider}`);
    console.log(`Date: ${timestamp}`);
    console.log(this.formatMessage(`Request (${controller})`, details?.path || '', {
      method: details?.method,
      userId: details?.userId,
    }));
  }

  endRequest(status: number, duration: number): void {
    if (!this.shouldLog('info')) return;

    console.log(`Response: ${status} (${duration}ms)`);
    console.log(this.getDivider());
  }

  databaseQuery(table: string, operation: string, duration?: number): void {
    if (!this.shouldLog('debug')) return;

    const message = duration
      ? `Query took ${duration}ms`
      : 'Executing query';

    console.log(this.formatMessage(`Database Query (${table})`, message, { operation }));
  }

  databaseError(table: string, error: any): void {
    if (!this.shouldLog('error')) return;

    console.log(this.formatMessage(`Database Error (${table})`, error.message || 'Unknown error'));
  }

  info(context: string, message: string, details?: any): void {
    if (!this.shouldLog('info')) return;
    console.log(this.formatMessage(context, message, details));
  }

  warn(context: string, message: string, details?: any): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage(`WARN: ${context}`, message, details));
  }

  error(context: string, error: Error | string, details?: any): void {
    if (!this.shouldLog('error')) return;

    const message = error instanceof Error ? error.message : error;
    const errorDetails = error instanceof Error && !this.isProduction
      ? { ...details, stack: error.stack }
      : details;

    console.error(this.formatMessage(`ERROR: ${context}`, message, errorDetails));
  }

  debug(context: string, message: string, details?: any): void {
    if (!this.shouldLog('debug')) return;
    console.log(this.formatMessage(`DEBUG: ${context}`, message, details));
  }
}

// Singleton instance
export const logger = new Logger();

/**
 * Request logging middleware with simplified format
 */
export async function simpleRequestLogger(c: Context, next: () => Promise<void>) {
  const startTime = Date.now();
  const controller = c.get('controller') || extractController(c.req.path);

  // Start request log
  logger.startRequest(controller, {
    method: c.req.method,
    path: c.req.path,
    userId: c.get('user')?.sub,
  });

  try {
    await next();

    // End request log
    const duration = Date.now() - startTime;
    logger.endRequest(c.res.status, duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(controller, error as Error, { duration });
    throw error;
  }
}

function extractController(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[0] || 'unknown';
}
