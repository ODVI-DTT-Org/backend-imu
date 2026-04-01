/**
 * IMU Backend Health Check Script
 * Tests all connections and runs sample queries
 *
 * Usage: node health-check.cjs
 */

require('dotenv/config');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const http = require('http');
const https = require('https');

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(test, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳';
  const color = status === 'pass' ? colors.green : status === 'fail' ? colors.red : colors.yellow;
  console.log(`${color}${icon} [${test}]${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Database pool
let pool;

async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

// Test 1: Environment Variables
async function testEnvironment() {
  logSection('TEST 1: Environment Variables');

  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PORT',
    'POWERSYNC_URL'
  ];

  let allPass = true;

  for (const varName of requiredVars) {
    const exists = !!process.env[varName];
    const value = process.env[varName];

    if (exists) {
      const displayValue = varName.includes('SECRET') || varName.includes('PASSWORD')
          ? '***hidden***'
          : varName === 'DATABASE_URL'
            ? value.substring(0, 50) + '...'
            : value;
      log(`ENV: ${varName}`, 'pass', `= ${displayValue}`);
    } else {
      log(`ENV: ${varName}`, 'fail', 'NOT SET');
      allPass = false;
    }
  }

  return allPass;
}

// Test 2: Database Connection
async function testDatabaseConnection() {
  logSection('TEST 2: Database Connection');

  try {
    const pool = await getPool();
    const client = await pool.connect();

    // Test basic query
    const result = await client.query('SELECT NOW() as now, current_database() as db');
    log('Connection', 'pass', `Connected to database at ${result.rows[0].now.toISOString()}`);
    log('Database Name', 'pass', result.rows[0].db);

    client.release();
    return true;
  } catch (error) {
    log('Connection', 'fail', error.message);
    return false;
  }
}

// Test 3: Database Tables
async function testDatabaseTables() {
  logSection('TEST 3: Database Tables');

  try {
    const pool = await getPool();
    const client = await pool.connect();

    // Check required tables
    const requiredTables = [
      'users',
      'clients',
      'agencies',
      'caravans',
      'touchpoints',
      'itineraries',
      'groups',
      'targets',
      'attendance',
      'audit_logs'
    ];

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const existingTables = result.rows.map(r => r.table_name);
    let allPass = true;

    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        log(`Table: ${table}`, 'pass', 'Exists');
      } else {
        log(`Table: ${table}`, 'fail', 'Missing - will be created on demand');
        // Don't fail - tables are created on demand
      }
    }

    // Count records in each table
    log('\nRecord Counts:', 'pass');
    for (const table of existingTables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        log(`  ${table}`, 'pass', `${countResult.rows[0].count} records`);
      } catch (e) {
        log(`  ${table}`, 'fail', e.message);
      }
    }

    client.release();
    return true; // Don't fail even if tables are missing
  } catch (error) {
    log('Tables Check', 'fail', error.message);
    return false;
  }
}

// Test 4: Sample Data Queries
async function testSampleQueries() {
  logSection('TEST 4: Sample Data Queries');

  try {
    const pool = await getPool();
    const client = await pool.connect();

    // Query 1: Users
    log('Query: Users', 'pass');
    const usersResult = await client.query('SELECT id, email, role FROM users LIMIT 5');
    log(`  Found ${usersResult.rows.length} users`, 'pass');
    usersResult.rows.forEach(user => {
      console.log(`    - ${user.email} (${user.role})`);
    });

    // Query 2: Clients count
    log('\nQuery: Clients', 'pass');
    const clientsResult = await client.query('SELECT COUNT(*) as count FROM clients');
    log(`  Total clients: ${clientsResult.rows[0].count}`, 'pass');

    // Query 3: Agencies
    log('\nQuery: Agencies', 'pass');
    const agenciesResult = await client.query('SELECT id, name FROM agencies LIMIT 5');
    log(`  Found ${agenciesResult.rows.length} agencies`, 'pass');

    // Query 4: Caravans
    log('\nQuery: Caravans', 'pass');
    const caravansResult = await client.query('SELECT id, first_name, last_name FROM caravans LIMIT 5');
    log(`  Found ${caravansResult.rows.length} caravans`, 'pass');

    client.release();
    return true;
  } catch (error) {
    log('Sample Queries', 'fail', error.message);
    return false;
  }
}

// Test 5: Backend API Health
async function testBackendAPI() {
  logSection('TEST 5: Backend API');

  const port = process.env.PORT || 3000;

  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: parseInt(port),
      path: '/api/health',
      method: 'GET',
      timeout: 5000
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            log('Health Endpoint', 'pass', `Status: ${health.status}`);
            log('Database Status', health.database === 'connected' ? 'pass' : 'fail', health.database);
            log('Version', 'pass', health.version);
            resolve(health.status === 'ok');
          } catch (e) {
            log('Health Endpoint', 'fail', 'Invalid JSON response');
            resolve(false);
          }
        });
    });

    req.on('error', (error) => {
      log('Backend API', 'fail', error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      log('Backend API', 'fail', 'Request timeout');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Test 6: PowerSync Configuration
async function testPowerSyncURL() {
  logSection('TEST 6: PowerSync Configuration');

  const powersyncUrl = process.env.POWERSYNC_URL;

  if (!powersyncUrl) {
    log('PowerSync URL', 'fail', 'POWERSYNC_URL not set');
    return false;
  }

  log('PowerSync URL', 'pass', powersyncUrl);

  // Try to reach PowerSync
  try {
    const url = new URL(powersyncUrl);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: '/',
        method: 'GET',
        timeout: 10000
      }, (res) => {
        log('PowerSync Reachable', 'pass', `Status: ${res.statusCode}`);
        resolve();
      });

      req.on('error', (error) => {
        log('PowerSync Reachable', 'fail', error.message);
        reject(error);
      });

      req.on('timeout', () => {
        log('PowerSync Reachable', 'fail', 'Request timeout');
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.end();
    });

    return true;
  } catch (error) {
    return false;
  }
}

// Test 7: Authentication Test
async function testAuthentication() {
  logSection('TEST 7: Authentication Test');

  const port = process.env.PORT || 3000;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      email: 'test@example.com',
      password: 'test123456'
    });

    const req = http.request({
      hostname: 'localhost',
      port: parseInt(port),
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (result.access_token) {
              log('Login Test', 'pass', 'Successfully obtained access token');
              log('User Info', 'pass', `${result.user.email} (${result.user.role})`);
              resolve(true);
            } else {
              log('Login Test', 'fail', result.message || 'No token received');
              resolve(false);
            }
          } catch (e) {
            log('Login Test', 'fail', 'Invalid JSON response');
            resolve(false);
          }
        });
    });

    req.on('error', (error) => {
      log('Login Test', 'fail', error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      log('Login Test', 'fail', 'Request timeout');
      req.destroy();
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// Main Test Runner
async function runAllTests() {
  console.log(`\n${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║          IMU Backend Health Check Suite                   ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║          ${new Date().toISOString()}                  ║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);

  const results = {
    environment: await testEnvironment(),
    databaseConnection: await testDatabaseConnection(),
    databaseTables: await testDatabaseTables(),
    sampleQueries: await testSampleQueries(),
    backendAPI: await testBackendAPI(),
    powerSync: await testPowerSyncURL(),
    authentication: await testAuthentication()
  };

  // Summary
  logSection('SUMMARY');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  console.log(`\n${colors.bold}Total Tests: ${total}${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${total - passed}${colors.reset}\n`);

  for (const [test, result] of Object.entries(results)) {
    log(test.toUpperCase(), result ? 'pass' : 'fail');
  }

  console.log(`\n${colors.bold}${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // Cleanup
  if (pool) {
    await pool.end();
  }

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
