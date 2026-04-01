/**
 * Shared Database Pool Configuration
 * Centralizes PostgreSQL connection pool with proper SSL settings
 */
import { Pool } from 'pg';
// SSL configuration for Digital Ocean Managed PostgreSQL
// Digital Ocean uses self-signed certificates, so we need rejectUnauthorized: false
const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
    throw new Error('DATABASE_URL is not set');
}
// Prefer validating with a provided CA cert when available.
const dbCaCertPath = process.env.DB_CA_CERT_PATH || process.env.PGSSLROOTCERT;
const ca = dbCaCertPath ? (await import('fs')).readFileSync(dbCaCertPath, 'utf-8') : undefined;
// Ensure sslmode/ssl* query params don't force stricter behavior than our ssl config.
let connectionString = rawConnectionString;
try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('sslrootcert');
    url.searchParams.delete('sslcert');
    url.searchParams.delete('sslkey');
    url.searchParams.delete('sslpassword');
    connectionString = url.toString();
}
catch {
    // Keep raw connection string if it isn't URL-parseable.
}
const sslConfig = ca
    ? { ca, rejectUnauthorized: true }
    : (rawConnectionString.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false);
// Create and export the shared connection pool
export const pool = new Pool({
    connectionString,
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
