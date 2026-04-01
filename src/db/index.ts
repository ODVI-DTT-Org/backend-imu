/**
 * Shared Database Pool Configuration
 * Centralizes PostgreSQL connection pool with proper SSL settings
 */

import { Pool } from 'pg';

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
