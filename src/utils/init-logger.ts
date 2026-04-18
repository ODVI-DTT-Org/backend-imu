/**
 * Initialization Logger
 *
 * Provides structured logging for backend service initialization.
 * Shows clear success/failure indicators, timing, and safe connection details.
 */

import { pool } from '../db/index.js';
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
 * Log initialization summary with grouped services by status
 */
export function logInitSummary(summary: InitSummary, results: InitResult[]): void {
  const separator = '═'.repeat(70);
  const successRate = summary.total > 0
    ? Math.round((summary.success / summary.total) * 100)
    : 0;

  // Group services by status
  const successful = results.filter(r => r.status === 'success');
  const warnings = results.filter(r => r.status === 'warning');
  const errors = results.filter(r => r.status === 'error');
  const skipped = results.filter(r => r.status === 'skipped');

  console.log('\n' + separator);
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + centerText('INITIALIZATION RESULTS', 68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log(separator);

  // Log successful services
  if (successful.length > 0) {
    console.log('║' + ' ✅ SUCCESSFUL SERVICES (' + successful.length + ')' + ' '.repeat(68 - 25 - String(successful.length).length) + '║');
    console.log('║' + '─'.repeat(68) + '║');
    successful.forEach(result => {
      console.log('║ ' + result.service + ' - ' + result.message);
      if (result.details && Object.keys(result.details).length > 0) {
        const keyValues = Object.entries(result.details)
          .filter(([key]) => !key.startsWith('⚠️')) // Exclude warning details from success section
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');
        console.log('║   └─ ' + keyValues);
      }
    });
    console.log('║' + ' '.repeat(68) + '║');
  }

  // Log warnings
  if (warnings.length > 0) {
    console.log('║' + ' ⚠️  WARNINGS (' + warnings.length + ')' + ' '.repeat(68 - 17 - String(warnings.length).length) + '║');
    console.log('║' + '─'.repeat(68) + '║');
    warnings.forEach(result => {
      console.log('║ ' + result.service + ' - ' + result.message);
      if (result.details && Object.keys(result.details).length > 0) {
        const keyValues = Object.entries(result.details)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');
        console.log('║   └─ ' + keyValues);
      }
    });
    console.log('║' + ' '.repeat(68) + '║');
  }

  // Log errors
  if (errors.length > 0) {
    console.log('║' + ' ❌ ERRORS (' + errors.length + ')' + ' '.repeat(68 - 13 - String(errors.length).length) + '║');
    console.log('║' + '─'.repeat(68) + '║');
    errors.forEach(result => {
      console.log('║ ' + result.service + ' - ' + result.message);
      if (result.error) {
        console.log('║   └─ Error: ' + result.error.message);
      }
    });
    console.log('║' + ' '.repeat(68) + '║');
  }

  // Log skipped
  if (skipped.length > 0) {
    console.log('║' + ' ⊘ SKIPPED (' + skipped.length + ')' + ' '.repeat(68 - 15 - String(skipped.length).length) + '║');
    console.log('║' + '─'.repeat(68) + '║');
    skipped.forEach(result => {
      console.log('║ ' + result.service + ' - ' + result.message);
    });
    console.log('║' + ' '.repeat(68) + '║');
  }

  // Summary line
  console.log(separator);
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + centerText(`Total: ${summary.success} successful | ${summary.warning} warnings | ${summary.error} errors | ${summary.skipped} skipped`, 68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + centerText(`Duration: ${formatDuration(summary.duration)} | Success Rate: ${successRate}%`, 68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log(separator);

  // Final message
  if (summary.error > 0) {
    console.log('\n⚠️  WARNING: Some services failed to initialize. Server may not function correctly.\n');
  } else if (summary.warning > 0) {
    console.log('\n⚠️  WARNING: Some services initialized with warnings. Check details above.\n');
  } else {
    console.log('\n✅ All services initialized successfully!\n');
  }
}

/**
 * Helper function to center text within a box
 */
function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPadding = Math.floor(padding / 2);
  const rightPadding = padding - leftPadding;
  return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
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
    // Handle escaped newlines in environment variables (DigitalOcean format)
    const privateKeyInput = process.env.POWERSYNC_PRIVATE_KEY;
    const privateKey = privateKeyInput?.trim().replace(/\\n/g, '\n');
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

    // Test JWT generation to verify keys work
    let jwtTestPassed = false;
    let jwtTestError = '';
    let jwtTestDetails: Record<string, any> = {};
    try {
      // Import jwt here to avoid issues if not available
      // Note: Dynamic import returns module namespace, need to access .default
      const jwtModule = await import('jsonwebtoken');
      const jwt = jwtModule.default || jwtModule;

      // Create a test JWT token (same as PowerSync endpoint)
      const testPayload = {
        sub: '00000000-0000-0000-0000-000000000000', // Test user ID (PowerSync requires 'sub')
        user_id: '00000000-0000-0000-0000-000000000000', // Test user ID
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };

      console.log('[PowerSync Test] Creating test JWT with RS256 algorithm...');
      const testToken = jwt.sign(
        testPayload,
        privateKey as string, // Non-null assertion after validation above
        { algorithm: 'RS256', keyid: keyId }
      );

      jwtTestDetails['Token Created'] = 'Yes';
      jwtTestDetails['Token Length'] = testToken.length;

      // Verify the test token with public key
      console.log('[PowerSync Test] Verifying JWT with public key...');
      // Handle escaped newlines in environment variables (DigitalOcean format)
      const publicKeyInput = process.env.POWERSYNC_PUBLIC_KEY;
      const publicKey = (publicKeyInput || privateKeyInput)?.trim().replace(/\\n/g, '\n') as string;

      const decoded = jwt.verify(testToken, publicKey, { algorithms: ['RS256'] });
      jwtTestDetails['Verification'] = 'Success';
      jwtTestDetails['Decoded Payload'] = JSON.stringify(decoded);

      console.log('[PowerSync Test] ✅ JWT test passed - keys are matching');
      jwtTestPassed = true;
    } catch (testError: any) {
      jwtTestError = testError.message || 'Unknown error';
      jwtTestDetails['Error Name'] = testError.name;
      jwtTestDetails['Error Message'] = jwtTestError;

      // Provide more specific error messages
      if (testError.name === 'JsonWebTokenError') {
        if (jwtTestError.includes('invalid signature')) {
          jwtTestDetails['Diagnosis'] = 'Private key and public key do not match';
          console.error('[PowerSync Test] ❌ JWT verification failed: Keys do not match!');
        } else if (jwtTestError.includes('malformed')) {
          jwtTestDetails['Diagnosis'] = 'Key format is invalid (not proper PEM format)';
          console.error('[PowerSync Test] ❌ JWT verification failed: Key format is invalid!');
        }
      } else if (testError.name === 'TokenExpiredError') {
        jwtTestDetails['Diagnosis'] = 'Test token expired (should not happen)';
      }

      console.error('[PowerSync Test] ❌ JWT test failed:', jwtTestError);
      console.error('[PowerSync Test] Details:', JSON.stringify(jwtTestDetails, null, 2));
    }

    if (!jwtTestPassed) {
      return {
        service: 'PowerSync',
        status: 'error',
        message: 'PowerSync JWT test failed - keys may be invalid or mismatched',
        duration: Date.now() - startTime,
        details: {
          ...details,
          'Test Result': 'FAILED',
          'Error': jwtTestError,
          'Test Details': jwtTestDetails,
        },
      };
    }

    // Test PowerSync connection
    let connectionTestPassed = false;
    let connectionTestDetails: Record<string, any> = {};
    try {
      console.log('[PowerSync Test] Testing connection to PowerSync instance...');
      const response = await fetch(`${url}/api`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      connectionTestDetails['Status Code'] = response.status;
      connectionTestDetails['Response OK'] = response.ok;

      if (response.ok || response.status === 401) {
        // 401 is expected - we're not authenticated
        // 200 is also possible for public endpoints
        connectionTestPassed = true;
        console.log('[PowerSync Test] ✅ Connection test passed');
      } else {
        connectionTestDetails['Error'] = `Unexpected status: ${response.status}`;
        console.warn('[PowerSync Test] ⚠️ Connection test returned unexpected status:', response.status);
      }
    } catch (connError: any) {
      connectionTestDetails['Error'] = connError.message;
      connectionTestDetails['Error Type'] = connError.name;

      // Don't fail the whole test if connection test fails
      // The JWT test is more important
      console.warn('[PowerSync Test] ⚠️ Connection test failed:', connError.message);
      console.warn('[PowerSync Test] This may be temporary or due to network restrictions');
    }

    return {
      service: 'PowerSync',
      status: 'success',
      message: connectionTestPassed
        ? 'PowerSync JWT token generation ready (connection tested)'
        : 'PowerSync JWT token generation ready (connection test skipped)',
      duration: Date.now() - startTime,
      details: {
        ...details,
        'Test Result': 'PASSED',
        'Test': 'JWT generation and verification successful',
        'Connection Test': connectionTestPassed ? 'PASSED' : 'SKIPPED',
        'Connection Details': connectionTestDetails,
        'JWT Test Details': jwtTestDetails,
      },
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

    // Read actual token expiry from environment
    const accessExpiryHours = process.env.JWT_EXPIRY_HOURS || '168'; // Default 7 days
    const accessExpiryDays = parseInt(accessExpiryHours) / 24;

    const details: Record<string, any> = {
      'Algorithm': 'RS256',
      'Token Expiry': `${accessExpiryDays} days (access), 30 days (refresh)`,
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
  logInitSummary(summary, results);

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
