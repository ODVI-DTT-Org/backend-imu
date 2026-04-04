/**
 * Initialization Logger
 *
 * Provides structured logging for backend service initialization.
 * Shows clear success/failure indicators, timing, and safe connection details.
 */

import { pool } from '../db/index.js';
import { QueueManager } from '../queues/queue-manager.js';
import { storageService } from '../services/storage.js';
import { emailService } from '../services/email.js';
import { logger } from './logger.js';

export interface InitResult {
  service: string;
  status: 'success' | 'error' | 'warning' | 'skipped';
  message: string;
  duration?: number;
  details?: Record<string, any>;
  error?: Error;
}

export interface InitSummary {
  total: number;
  success: number;
  error: number;
  warning: number;
  skipped: number;
  duration: number;
}

/**
 * Get status emoji for display
 */
function getStatusEmoji(status: InitResult['status']): string {
  switch (status) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'skipped': return '⊘';
  }
}

/**
 * Get status color for display (terminal escape codes)
 */
function getStatusColor(status: InitResult['status']): string {
  switch (status) {
    case 'success': return '\x1b[32m'; // Green
    case 'error': return '\x1b[31m'; // Red
    case 'warning': return '\x1b[33m'; // Yellow
    case 'skipped': return '\x1b[90m'; // Gray
  }
}

/**
 * Reset terminal color
 */
const resetColor = '\x1b[0m';

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Sanitize connection string for logging (remove secrets)
 */
function sanitizeConnectionString(connectionString: string | undefined): string {
  if (!connectionString) return 'not configured';

  // Remove password from connection string
  return connectionString
    .replace(/:([^:@]{1,})@/, ':****@')
    .replace(/\/([^/@]{1,})@/, '/****@');
}

/**
 * Log initialization header
 */
export function logInitHeader(): void {
  const separator = '═'.repeat(70);
  const title = 'IMU Backend Initialization';
  const padding = ' '.repeat(Math.floor((70 - title.length - 2) / 2));

  console.log('\n' + separator);
  console.log(`║${padding}${title}${padding}║`);
  console.log(separator);
  console.log(`║ Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(50)}║`);
  console.log(`║ Version:     ${process.env.npm_package_version || '1.0.0'}${' '.repeat(54)}║`);
  console.log(`║ Port:        ${process.env.PORT || 3000}${' '.repeat(58)}║`);
  console.log(`║ Time:        ${new Date().toISOString()}${' '.repeat(48)}║`);
  console.log(separator + '\n');
}

/**
 * Log initialization result
 */
export function logInitResult(result: InitResult): void {
  const emoji = getStatusEmoji(result.status);
  const color = getStatusColor(result.status);
  const duration = result.duration ? ` (${formatDuration(result.duration)})` : '';
  const statusText = `${color}${result.status.toUpperCase()}${resetColor}`;

  console.log(`${emoji} [${statusText}] ${result.service}${duration}`);

  if (result.message) {
    console.log(`   └─ ${result.message}`);
  }

  if (result.details && Object.keys(result.details).length > 0) {
    const details = Object.entries(result.details)
      .map(([key, value]) => `      ${key}: ${value}`)
      .join('\n');
    console.log(`   └─ Details:\n${details}`);
  }

  if (result.error) {
    console.log(`   └─ Error: ${result.error.message}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`      ${result.error.stack}`);
    }
  }

  console.log('');
}

/**
 * Log initialization summary
 */
export function logInitSummary(summary: InitSummary): void {
  const separator = '═'.repeat(70);
  const successRate = summary.total > 0
    ? Math.round((summary.success / summary.total) * 100)
    : 0;

  console.log(separator);
  console.log('║ Initialization Summary' + ' '.repeat(46) + '║');
  console.log(separator);
  console.log(`║ Total Services:     ${summary.total}${' '.repeat(63 - String(summary.total).length)}║`);
  console.log(`║ ✅ Successful:      ${summary.success}${' '.repeat(63 - String(summary.success).length)}║`);
  console.log(`║ ⚠️  Warnings:        ${summary.warning}${' '.repeat(63 - String(summary.warning).length)}║`);
  console.log(`║ ❌ Errors:          ${summary.error}${' '.repeat(63 - String(summary.error).length)}║`);
  console.log(`║ ⊘ Skipped:          ${summary.skipped}${' '.repeat(63 - String(summary.skipped).length)}║`);
  console.log(`║ Success Rate:       ${successRate}%${' '.repeat(63 - String(successRate).length + 1)}║`);
  console.log(`║ Total Duration:     ${formatDuration(summary.duration)}${' '.repeat(63 - formatDuration(summary.duration).length)}║`);
  console.log(separator);

  if (summary.error > 0) {
    console.log('\n⚠️  WARNING: Some services failed to initialize. Check logs above for details.\n');
  } else if (summary.warning > 0) {
    console.log('\n⚠️  WARNING: Some services initialized with warnings. Check logs above for details.\n');
  } else {
    console.log('\n✅ All services initialized successfully!\n');
  }
}

/**
 * Check if running in production or QA environment
 */
function isProductionOrQA(): boolean {
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'production' || env === 'prod' || env === 'qa';
}

/**
 * Initialize and log database connection
 */
export async function initDatabase(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    // Test database connection
    const result = await pool.query(`
      SELECT
        version(),
        current_database(),
        current_user,
        inet_server_addr(),
        inet_server_port()
    `);

    const duration = Date.now() - startTime;
    const version = result.rows[0].version;
    const databaseName = result.rows[0].current_database;
    const user = result.rows[0].current_user;
    const serverAddr = result.rows[0].inet_server_addr;
    const serverPort = result.rows[0].inet_server_port;

    // Extract PostgreSQL version
    const pgVersionMatch = version.match(/PostgreSQL (\d+\.\d+\.\d+)/);
    const pgVersion = pgVersionMatch ? pgVersionMatch[1] : 'unknown';

    // Check pool settings
    const poolConfig = (pool as any).options;
    const maxClients = poolConfig.max || 20;
    const idleTimeout = poolConfig.idleTimeoutMillis || 30000;
    const connectionTimeout = poolConfig.connectionTimeoutMillis || 2000;

    // Check SSL status
    const isSSL = process.env.DATABASE_URL?.includes('sslmode=require') ||
                  process.env.DATABASE_URL?.includes('ssl=true');

    // Check if using localhost in production/qa
    const isLocalhost = serverAddr === '127.0.0.1' || serverAddr === '::1' || serverAddr === 'localhost';
    const isProdOrQA = isProductionOrQA();
    const status = (isProdOrQA && isLocalhost) ? 'warning' : 'success';
    const message = (isProdOrQA && isLocalhost)
      ? `Connected to ${databaseName} as ${user} (WARNING: Using localhost in ${process.env.NODE_ENV} environment)`
      : `Connected to ${databaseName} as ${user}`;

    return {
      service: 'PostgreSQL Database',
      status,
      message,
      duration,
      details: {
        'PostgreSQL Version': pgVersion,
        'Database': databaseName,
        'User': user,
        'Host': `${serverAddr}:${serverPort}`,
        'SSL': isSSL ? 'enabled' : 'disabled',
        'Max Connections': maxClients,
        'Idle Timeout': `${idleTimeout}ms`,
        'Connection Timeout': `${connectionTimeout}ms`,
        ...(isProdOrQA && isLocalhost ? {
          '⚠️ WARNING': 'Using localhost database in production/qa is not recommended',
        } : {}),
      },
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const connectionString = sanitizeConnectionString(process.env.DATABASE_URL);

    return {
      service: 'PostgreSQL Database',
      status: 'error',
      message: 'Failed to connect to database',
      duration,
      details: {
        'Connection String': connectionString,
      },
      error,
    };
  }
}

/**
 * Initialize and log Redis/BullMQ connection
 */
export async function initRedis(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    const redisDb = process.env.REDIS_DB;

    if (!redisUrl && !redisHost) {
      return {
        service: 'Redis / BullMQ',
        status: 'skipped',
        message: 'Redis not configured (BullMQ features disabled)',
        duration: Date.now() - startTime,
      };
    }

    // Get queue manager instance
    const queueManager = QueueManager.getInstance();

    const duration = Date.now() - startTime;

    // Queue names in the system
    const queueNames = ['bulk-operations', 'reports', 'location-assignments', 'sync-operations'];

    // Check if using localhost in production/qa
    const isLocalhost = !redisUrl && (
      redisHost === 'localhost' ||
      redisHost === '127.0.0.1' ||
      redisHost === '::1' ||
      redisUrl?.includes('localhost') ||
      redisUrl?.includes('127.0.0.1')
    );
    const isProdOrQA = isProductionOrQA();
    const status = (isProdOrQA && isLocalhost) ? 'warning' : 'success';
    const message = (isProdOrQA && isLocalhost)
      ? `Connected with ${queueNames.length} queues configured (WARNING: Using localhost in ${process.env.NODE_ENV})`
      : `Connected with ${queueNames.length} queues configured`;

    return {
      service: 'Redis / BullMQ',
      status,
      message,
      duration,
      details: {
        'Connection': sanitizeConnectionString(redisUrl) || `${redisHost}:${redisPort}/${redisDb}`,
        'Queues': queueNames.join(', '),
        ...(isProdOrQA && isLocalhost ? {
          '⚠️ WARNING': 'Using localhost Redis in production/qa is not recommended',
        } : {}),
      },
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const connectionString = sanitizeConnectionString(process.env.REDIS_URL);

    return {
      service: 'Redis / BullMQ',
      status: 'error',
      message: 'Failed to connect to Redis',
      duration,
      details: {
        'Connection': connectionString || `${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/${process.env.REDIS_DB}`,
      },
      error,
    };
  }
}

/**
 * Initialize and log storage service
 */
export async function initStorage(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    const provider = process.env.STORAGE_PROVIDER || 'local';
    const bucket = process.env.STORAGE_BUCKET || 'imu-uploads';

    let details: Record<string, any> = {
      'Provider': provider,
      'Bucket': bucket,
    };

    // Provider-specific details
    if (provider === 's3') {
      const region = process.env.AWS_REGION;
      const hasKeyId = !!process.env.AWS_ACCESS_KEY_ID;
      const hasSecret = !!process.env.AWS_SECRET_ACCESS_KEY;

      details = {
        ...details,
        'Region': region || 'default',
        'Access Key ID': hasKeyId ? 'configured' : 'missing',
        'Secret Access Key': hasSecret ? 'configured' : 'missing',
      };

      if (!hasKeyId || !hasSecret) {
        return {
          service: 'Storage Service (S3)',
          status: 'warning',
          message: 'S3 configuration incomplete',
          duration: Date.now() - startTime,
          details,
        };
      }
    } else if (provider === 'r2') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const hasKeyId = !!process.env.AWS_ACCESS_KEY_ID;
      const hasSecret = !!process.env.AWS_SECRET_ACCESS_KEY;

      details = {
        ...details,
        'Account ID': accountId ? `${accountId.substring(0, 8)}...` : 'missing',
        'Access Key ID': hasKeyId ? 'configured' : 'missing',
        'Secret Access Key': hasSecret ? 'configured' : 'missing',
      };

      if (!accountId || !hasKeyId || !hasSecret) {
        return {
          service: 'Storage Service (R2)',
          status: 'warning',
          message: 'R2 configuration incomplete',
          duration: Date.now() - startTime,
          details,
        };
      }
    } else if (provider === 'supabase') {
      const url = process.env.SUPABASE_URL;
      const hasKey = !!process.env.SUPABASE_SERVICE_KEY;

      details = {
        ...details,
        'URL': url || 'missing',
        'Service Key': hasKey ? 'configured' : 'missing',
      };

      if (!url || !hasKey) {
        return {
          service: 'Storage Service (Supabase)',
          status: 'warning',
          message: 'Supabase configuration incomplete',
          duration: Date.now() - startTime,
          details,
        };
      }
    } else if (provider === 'local') {
      details = {
        ...details,
        'Storage Path': './uploads (local filesystem)',
      };

      // Check if using local storage in production/qa
      const isProdOrQA = isProductionOrQA();
      if (isProdOrQA) {
        return {
          service: 'Storage Service (LOCAL)',
          status: 'warning',
          message: `Storage service ready (WARNING: Using local filesystem in ${process.env.NODE_ENV})`,
          duration: Date.now() - startTime,
          details: {
            ...details,
            '⚠️ WARNING': 'Local filesystem storage is not recommended for production/qa. Use S3, R2, or Supabase Storage.',
          },
        };
      }
    }

    return {
      service: `Storage Service (${provider.toUpperCase()})`,
      status: 'success',
      message: `Storage service ready (${provider})`,
      duration: Date.now() - startTime,
      details,
    };
  } catch (error: any) {
    return {
      service: 'Storage Service',
      status: 'error',
      message: 'Failed to initialize storage service',
      duration: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Initialize and log email service
 */
export async function initEmailService(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    const provider = process.env.EMAIL_PROVIDER || 'console';
    const from = process.env.EMAIL_FROM || 'not configured';

    let details: Record<string, any> = {
      'Provider': provider,
      'From': from,
    };

    if (provider === 'resend') {
      const hasKey = !!process.env.RESEND_API_KEY;
      details = {
        ...details,
        'API Key': hasKey ? 'configured' : 'missing',
      };

      if (!hasKey) {
        return {
          service: 'Email Service (Resend)',
          status: 'warning',
          message: 'Resend API key not configured',
          duration: Date.now() - startTime,
          details,
        };
      }
    } else if (provider === 'sendgrid') {
      const hasKey = !!process.env.SENDGRID_API_KEY;
      details = {
        ...details,
        'API Key': hasKey ? 'configured' : 'missing',
      };

      if (!hasKey) {
        return {
          service: 'Email Service (SendGrid)',
          status: 'warning',
          message: 'SendGrid API key not configured',
          duration: Date.now() - startTime,
          details,
        };
      }
    } else if (provider === 'console') {
      details = {
        ...details,
        'Note': 'Emails will be logged to console (development mode)',
      };

      // Check if using console email in production/qa
      const isProdOrQA = isProductionOrQA();
      if (isProdOrQA) {
        return {
          service: 'Email Service (CONSOLE)',
          status: 'warning',
          message: `Email service ready (WARNING: Using console output in ${process.env.NODE_ENV})`,
          duration: Date.now() - startTime,
          details: {
            ...details,
            '⚠️ WARNING': 'Console email provider is not recommended for production/qa. Use Resend or SendGrid.',
          },
        };
      }
    } else if (provider === 'mock') {
      details = {
        ...details,
        'Note': 'Email service is mocked (no emails sent)',
      };

      // Check if using mock email in production/qa
      const isProdOrQA = isProductionOrQA();
      if (isProdOrQA) {
        return {
          service: 'Email Service (MOCK)',
          status: 'warning',
          message: `Email service ready (WARNING: Using mock provider in ${process.env.NODE_ENV})`,
          duration: Date.now() - startTime,
          details: {
            ...details,
            '⚠️ WARNING': 'Mock email provider will not send any emails. Use Resend or SendGrid for production/qa.',
          },
        };
      }
    }

    return {
      service: `Email Service (${provider.toUpperCase()})`,
      status: 'success',
      message: `Email service ready (${provider})`,
      duration: Date.now() - startTime,
      details,
    };
  } catch (error: any) {
    return {
      service: 'Email Service',
      status: 'error',
      message: 'Failed to initialize email service',
      duration: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Initialize and log PowerSync configuration
 */
export async function initPowerSync(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    const url = process.env.POWERSYNC_URL;
    const hasPrivateKey = !!process.env.POWERSYNC_PRIVATE_KEY;
    const hasPublicKey = !!process.env.POWERSYNC_PUBLIC_KEY;
    const keyId = process.env.POWERSYNC_KEY_ID || 'imu-production-key';

    if (!url) {
      return {
        service: 'PowerSync',
        status: 'skipped',
        message: 'PowerSync not configured',
        duration: Date.now() - startTime,
      };
    }

    const details: Record<string, any> = {
      'URL': url,
      'Key ID': keyId,
      'Private Key': hasPrivateKey ? 'configured' : 'missing',
      'Public Key': hasPublicKey ? 'configured' : 'missing',
    };

    if (!hasPrivateKey || !hasPublicKey) {
      return {
        service: 'PowerSync',
        status: 'warning',
        message: 'PowerSync keys not configured',
        duration: Date.now() - startTime,
        details,
      };
    }

    // Validate key format (basic check)
    const privateKey = process.env.POWERSYNC_PRIVATE_KEY;
    const isValidKey = privateKey?.includes('BEGIN PRIVATE KEY') ||
                       privateKey?.includes('BEGIN RSA PRIVATE KEY');

    if (!isValidKey) {
      return {
        service: 'PowerSync',
        status: 'warning',
        message: 'PowerSync private key format appears invalid',
        duration: Date.now() - startTime,
        details: {
          ...details,
          'Warning': 'Private key should be in PEM format',
        },
      };
    }

    return {
      service: 'PowerSync',
      status: 'success',
      message: 'PowerSync JWT token generation ready',
      duration: Date.now() - startTime,
      details,
    };
  } catch (error: any) {
    return {
      service: 'PowerSync',
      status: 'error',
      message: 'Failed to initialize PowerSync',
      duration: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Initialize and log JWT configuration
 */
export async function initJWT(): Promise<InitResult> {
  const startTime = Date.now();

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return {
        service: 'JWT Authentication',
        status: 'error',
        message: 'JWT_SECRET not configured',
        duration: Date.now() - startTime,
        details: {
          'Required': 'JWT_SECRET environment variable (min 32 characters)',
        },
      };
    }

    const secretLength = secret.length;
    const isStrong = secretLength >= 32;

    const details: Record<string, any> = {
      'Algorithm': 'RS256',
      'Token Expiry': '15 minutes (access), 30 days (refresh)',
      'Secret Length': `${secretLength} characters`,
      'Secret Strength': isStrong ? 'strong' : 'weak (min 32 chars recommended)',
    };

    if (!isStrong) {
      return {
        service: 'JWT Authentication',
        status: 'warning',
        message: 'JWT_SECRET is too weak',
        duration: Date.now() - startTime,
        details,
      };
    }

    return {
      service: 'JWT Authentication',
      status: 'success',
      message: 'JWT authentication configured',
      duration: Date.now() - startTime,
      details,
    };
  } catch (error: any) {
    return {
      service: 'JWT Authentication',
      status: 'error',
      message: 'Failed to initialize JWT',
      duration: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Run all initialization checks
 */
export async function initializeBackend(): Promise<{ summary: InitSummary; results: InitResult[] }> {
  const startTime = Date.now();
  const results: InitResult[] = [];

  // Log header
  logInitHeader();

  // Initialize services in order
  results.push(await initJWT());
  results.push(await initDatabase());
  results.push(await initRedis());
  results.push(await initStorage());
  results.push(await initEmailService());
  results.push(await initPowerSync());

  // Calculate summary
  const summary: InitSummary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    error: results.filter(r => r.status === 'error').length,
    warning: results.filter(r => r.status === 'warning').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    duration: Date.now() - startTime,
  };

  // Log summary
  logInitSummary(summary);

  // Log to file for persistence
  logger.info('backend/init', 'Backend initialization complete', {
    summary,
    results: results.map(r => ({
      service: r.service,
      status: r.status,
      duration: r.duration,
    })),
  });

  return { summary, results };
}

/**
 * Check if initialization was successful (no critical errors)
 */
export function isInitializationSuccessful(summary: InitSummary, results: InitResult[]): boolean {
  // Critical services that must succeed
  const criticalServices = ['JWT Authentication', 'PostgreSQL Database'];
  const failedCriticalServices = results.some(r =>
    r.status === 'error' && criticalServices.some(cs => r.service.includes(cs))
  );

  return summary.error === 0 || !failedCriticalServices;
}
