/**
 * Shared Database Pool Configuration
 * Centralizes PostgreSQL connection pool with proper SSL settings
 */

import { Pool } from 'pg';
import fs from 'fs';

// SSL configuration for Digital Ocean Managed PostgreSQL
// Digital Ocean uses self-signed certificates, so we need to provide the CA certificate
function getSSLConfig() {
  const databaseUrl = process.env.DATABASE_URL || '';

  // Check if this is a DigitalOcean database connection
  const isDigitalOcean = databaseUrl.includes('ondigitalocean.com') || process.env.DB_CA_CERT;

  if (!isDigitalOcean) {
    return false; // No SSL needed for local development
  }

  // Try to use CA certificate from environment variable
  const dbCaCert = process.env.DB_CA_CERT;

  if (dbCaCert && dbCaCert.trim().length > 0) {
    // Use the CA certificate from environment variable
    return {
      rejectUnauthorized: true,
      ca: dbCaCert.trim().replace(/\\n/g, '\n'), // Handle escaped newlines in env var
    };
  }

  // Fallback: Try to read CA certificate from file (for local development)
  const caCertPath = process.env.DB_CA_CERT_PATH || './ca-certificate.crt';
  try {
    if (fs.existsSync(caCertPath)) {
      return {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caCertPath, 'utf8'),
      };
    }
  } catch (err) {
    console.warn('⚠️ Could not read CA certificate from file:', caCertPath);
  }

  // Final fallback: Accept self-signed certificates (not recommended for production)
  console.warn('⚠️ Using rejectUnauthorized: false - SSL certificate validation disabled');
  return {
    rejectUnauthorized: false,
  };
}

// Create and export the shared connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSSLConfig(),
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
});

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
