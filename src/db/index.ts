/**
 * Shared Database Pool Configuration
 * Centralizes PostgreSQL connection pool with proper SSL settings
 */

import { Pool } from 'pg';

// Parse DATABASE_URL to extract connection parameters
function parseDatabaseUrl(url: string) {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 5432,
      database: urlObj.pathname.slice(1), // Remove leading slash
      user: urlObj.username,
      password: urlObj.password,
      ssl: urlObj.searchParams.get('sslmode') || undefined,
    };
  } catch {
    return null;
  }
}

// SSL configuration for Digital Ocean Managed PostgreSQL
// Digital Ocean uses self-signed certificates
function getSSLConfig() {
  const databaseUrl = process.env.DATABASE_URL || '';

  // Check if this is a DigitalOcean database connection
  const isDigitalOcean = databaseUrl.includes('ondigitalocean.com');

  if (isDigitalOcean) {
    // For DigitalOcean, we need to accept self-signed certificates
    // TODO: Use DB_CA_CERT environment variable for proper SSL validation
    console.log('🔓 SSL: Accepting self-signed certificates for DigitalOcean');
    return {
      rejectUnauthorized: false,
    };
  }

  // For local development, no SSL needed
  return false;
}

// Create connection config
let connectionConfig: any;

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl && databaseUrl.includes('ondigitalocean.com')) {
  // For DigitalOcean, parse the URL and use individual parameters
  // This avoids issues with sslmode in the connection string
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed) {
    connectionConfig = {
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      password: parsed.password,
      ssl: getSSLConfig(),
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
    console.log('📊 Database: Using individual connection parameters for DigitalOcean');
  } else {
    // Fallback to connection string
    connectionConfig = {
      connectionString: databaseUrl,
      ssl: getSSLConfig(),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
    console.log('📊 Database: Using connection string');
  }
} else {
  // Local development or other databases
  connectionConfig = {
    connectionString: databaseUrl,
    ssl: getSSLConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  if (databaseUrl) {
    console.log('📊 Database: Local development');
  } else {
    console.warn('⚠️  Database: DATABASE_URL not set');
  }
}

// Create and export the shared connection pool
export const pool = new Pool(connectionConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

// Test connection on module load
pool.connect()
  .then(client => {
    console.log('✅ Database pool connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database pool connection failed:', err.message);
  });

export default pool;
