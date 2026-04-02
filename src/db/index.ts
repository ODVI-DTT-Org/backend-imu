/**
 * Shared Database Pool Configuration
 * Centralizes PostgreSQL connection pool with proper SSL settings
 */

import { Pool } from 'pg';

// SSL configuration for Digital Ocean Managed PostgreSQL
// Read CA certificate from environment variable for DigitalOcean deployment
let sslConfig: { ca: string; rejectUnauthorized: boolean } | { rejectUnauthorized: boolean } | false = false;

// Append sslmode=require to DATABASE_URL for DigitalOcean PostgreSQL
let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl?.includes('ondigitalocean.com')) {
  // For DigitalOcean Managed PostgreSQL with self-signed certificates,
  // we need to disable certificate verification completely.
  // IMPORTANT: Do NOT add sslmode to the connection string, as pg will treat
  // 'require' as 'verify-full' and override our rejectUnauthorized: false setting.
  sslConfig = {
    rejectUnauthorized: false,
  };
  console.log('✅ Database: SSL enabled with rejectUnauthorized: false for self-signed certificates');
}

// Create and export the shared connection pool
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfig,
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
