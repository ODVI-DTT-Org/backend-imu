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
  // Add explicit sslmode for production use
  if (!databaseUrl.includes('sslmode=')) {
    databaseUrl += '&sslmode=require';
  }

  // Use CA certificate from environment variable if available
  const dbCaCert = process.env.DB_CA_CERT;
  if (dbCaCert && dbCaCert.trim().length > 0) {
    // Handle escaped newlines in environment variable
    sslConfig = {
      ca: dbCaCert.trim().replace(/\\n/g, '\n'),
      rejectUnauthorized: false, // Required for self-signed certificates
    };
    console.log('✅ Database: Using CA certificate from DB_CA_CERT with rejectUnauthorized: false');
  } else {
    // Fallback to accepting self-signed certificates
    sslConfig = {
      rejectUnauthorized: false,
    };
    console.log('⚠️ Database: No DB_CA_CERT found, using rejectUnauthorized: false');
  }
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
