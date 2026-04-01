#!/usr/bin/env node
/**
 * IMU Backend API Comprehensive Test Suite
 *
 * Tests all 89 endpoints with realistic user scenarios:
 * - Seeds realistic test data
 * - Tests CRUD operations
 * - Tests relationships between entities
 * - Updates endpoint-test-log.md with results
 */

const BASE_URL = 'http://localhost:3000/api';
const TEST_RESULTS = {};
const ENTITIES = {};

// Test counters
let PASS = 0;
let FAIL = 0;
const CATEGORIES = {};

// Colors for console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test helper function
async function test(category, name, method, endpoint, options = {}) {
  const { body, expectedStatus = 200, auth = true } = options;

  // Initialize category if not exists
  if (!CATEGORIES[category]) {
    CATEGORIES[category] = { passed: 0, failed: 0, tests: [] };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (auth && ENTITIES.token) {
    headers['Authorization'] = `Bearer ${ENTITIES.token}`;
  }

  const fetchOptions = {
    method,
    headers,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);
    const status = response.status;
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }

    const passed = status === expectedStatus;

    const result = {
      name,
      method,
      endpoint,
      expectedStatus,
      status,
      passed,
      data,
    };

    if (passed) {
      PASS++;
      CATEGORIES[category].passed++;
      log('green', `✅ PASS: ${name} (${status})`);
    } else {
      FAIL++;
      CATEGORIES[category].failed++;
      log('red', `❌ FAIL: ${name} (expected ${expectedStatus}, got ${status})`);
      if (data) {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        log('yellow', `   Response: ${dataStr.substring(0, 200)}`);
      }
    }

    CATEGORIES[category].tests.push(result);
    return { status, data, passed };
  } catch (error) {
    FAIL++;
    CATEGORIES[category].failed++;
    log('red', `❌ ERROR: ${name} - ${error.message}`);
    CATEGORIES[category].tests.push({
      name,
      method,
      endpoint,
      expectedStatus,
      status: 0,
      passed: false,
      error: error.message,
    });
    return { status: 0, data: null, passed: false };
  }
}

// Seed data function
async function seedData() {
  log('cyan', '\n📦 Seeding realistic test data...\n');

  const timestamp = Date.now();

  // Create admin user
  const adminResult = await test('Auth', 'Register Admin User', 'POST', '/auth/register', {
    body: {
      email: `admin.${timestamp}@imu.test`,
      password: 'AdminPass123!',
      first_name: 'Admin',
      last_name: 'TestUser',
      role: 'admin',
    },
    expectedStatus: 201,
    auth: false,
  });
  if (adminResult.data?.user) {
    ENTITIES.adminUser = adminResult.data.user;
    ENTITIES.adminEmail = adminResult.data.user.email;
  }

  // Create staff user
  const staffResult = await test('Auth', 'Register Staff User', 'POST', '/auth/register', {
    body: {
      email: `staff.${timestamp}@imu.test`,
      password: 'StaffPass123!',
      first_name: 'Staff',
      last_name: 'TestUser',
      role: 'staff',
    },
    expectedStatus: 201,
    auth: false,
  });
  if (staffResult.data?.user) {
    ENTITIES.staffUser = staffResult.data.user;
  }

  // Create field agent user (will become caravan)
  const agentResult = await test('Auth', 'Register Field Agent', 'POST', '/auth/register', {
    body: {
      email: `fieldagent.${timestamp}@imu.test`,
      password: 'AgentPass123!',
      first_name: 'Field',
      last_name: 'Agent',
      role: 'field_agent',
    },
    expectedStatus: 201,
    auth: false,
  });
  if (agentResult.data?.user) {
    ENTITIES.fieldAgent = agentResult.data.user;
  }

  // Login as admin
  const loginResult = await test('Auth', 'Login as Admin', 'POST', '/auth/login', {
    body: {
      email: ENTITIES.adminEmail,
      password: 'AdminPass123!',
    },
    expectedStatus: 200,
    auth: false,
  });
  if (loginResult.data?.access_token) {
    ENTITIES.token = loginResult.data.access_token;
    ENTITIES.refreshToken = loginResult.data.refresh_token;
  }

  // Create agencies
  const agency1Result = await test('Agencies', 'Create Agency - PNP Retirement', 'POST', '/agencies', {
    body: {
      name: 'PNP Retirement and Benefits Administration Service',
      code: `PNP-${timestamp}`,
      address: 'Camp Crame, Quezon City',
      contact_number: '+63 2 8123 4567',
      status: 'active',
    },
    expectedStatus: 201,
  });
  if (agency1Result.data?.id) {
    ENTITIES.agency1 = agency1Result.data;
  }

  const agency2Result = await test('Agencies', 'Create Agency - BFP', 'POST', '/agencies', {
    body: {
      name: 'Bureau of Fire Protection',
      code: `BFP-${timestamp}`,
      address: 'Quezon City, Metro Manila',
      contact_number: '+63 2 8911 5056',
      status: 'active',
    },
    expectedStatus: 201,
  });
  if (agency2Result.data?.id) {
    ENTITIES.agency2 = agency2Result.data;
  }

  // Create caravans (field agents) - with UNIQUE emails
  const caravan1Result = await test('Caravans', 'Create Caravan - Metro Manila North', 'POST', '/caravans', {
    body: {
      name: 'Juan Dela Cruz',
      email: `caravan1.${timestamp}@imu.test`,
      phone: '+63 917 123 4567',
      assigned_area: 'Metro Manila - North',
      status: 'active',
    },
    expectedStatus: 201,
  });
  if (caravan1Result.data?.id) {
    ENTITIES.caravan1 = caravan1Result.data;
  }

  const caravan2Result = await test('Caravans', 'Create Caravan - Quezon City', 'POST', '/caravans', {
    body: {
      name: 'Maria Santos',
      email: `caravan2.${timestamp}@imu.test`,
      phone: '+63 918 765 4321',
      assigned_area: 'Quezon City',
      status: 'active',
    },
    expectedStatus: 201,
  });
  if (caravan2Result.data?.id) {
    ENTITIES.caravan2 = caravan2Result.data;
  }

  // Create clients
  const client1Result = await test('Clients', 'Create Client - Retiree (Existing)', 'POST', '/clients', {
    body: {
      first_name: 'Roberto',
      last_name: 'Reyes',
      middle_name: 'Cruz',
      email: 'roberto.reyes@email.com',
      phone: '+63 919 111 2222',
      client_type: 'EXISTING',
      product_type: 'Pension Loan',
      market_type: 'Retiree',
      pension_type: 'PNP Pension',
      agency_id: ENTITIES.agency1?.id,
      caravan_id: ENTITIES.caravan1?.id,
    },
    expectedStatus: 201,
  });
  if (client1Result.data?.id) {
    ENTITIES.client1 = client1Result.data;
  }

  const client2Result = await test('Clients', 'Create Client - Potential', 'POST', '/clients', {
    body: {
      first_name: 'Elena',
      last_name: 'Garcia',
      middle_name: 'Santos',
      email: 'elena.garcia@email.com',
      phone: '+63 920 333 4444',
      client_type: 'POTENTIAL',
      product_type: 'Emergency Loan',
      market_type: 'Active Service',
      pension_type: 'BFP Pension',
      agency_id: ENTITIES.agency2?.id,
      caravan_id: ENTITIES.caravan1?.id,
    },
    expectedStatus: 201,
  });
  if (client2Result.data?.id) {
    ENTITIES.client2 = client2Result.data;
  }

  // Create a client for deletion (not associated with any agency to avoid constraint issues)
  const client3Result = await test('Clients', 'Create Client - For Deletion', 'POST', '/clients', {
    body: {
      first_name: 'Fernando',
      last_name: 'Cruz',
      email: `fernando.${timestamp}@email.com`,
      phone: '+63 921 555 6666',
      client_type: 'POTENTIAL',
      caravan_id: ENTITIES.caravan2?.id,
    },
    expectedStatus: 201,
  });
  if (client3Result.data?.id) {
    ENTITIES.client3 = client3Result.data;
  }

  // Create touchpoints
  const touchpoint1Result = await test('Touchpoints', 'Create Touchpoint - 1st Visit', 'POST', '/touchpoints', {
    body: {
      type: 'Visit',
      date: new Date().toISOString(),
      client_id: ENTITIES.client1?.id,
      reason: 'New Client',
      status: 'Interested',
      touchpoint_number: 1,
      notes: 'Initial visit to discuss pension loan options',
      location_lat: 14.5995,
      location_long: 120.9842,
    },
    expectedStatus: 201,
  });
  if (touchpoint1Result.data?.id) {
    ENTITIES.touchpoint1 = touchpoint1Result.data;
  }

  const touchpoint2Result = await test('Touchpoints', 'Create Touchpoint - 2nd Call', 'POST', '/touchpoints', {
    body: {
      type: 'Call',
      date: new Date(Date.now() + 86400000).toISOString(),
      client_id: ENTITIES.client1?.id,
      reason: 'Follow-up',
      status: 'Very Interested',
      touchpoint_number: 2,
      notes: 'Follow-up call scheduled',
    },
    expectedStatus: 201,
  });
  if (touchpoint2Result.data?.id) {
    ENTITIES.touchpoint2 = touchpoint2Result.data;
  }

  // Create itineraries
  const itinerary1Result = await test('Itineraries', 'Create Itinerary - Today', 'POST', '/itineraries', {
    body: {
      caravan_id: ENTITIES.caravan1?.id,
      client_id: ENTITIES.client1?.id,
      scheduled_date: new Date().toISOString().split('T')[0],
      scheduled_time: '09:00:00',
      status: 'pending',
      priority: 'high',
      notes: 'First visit of the day',
    },
    expectedStatus: 201,
  });
  if (itinerary1Result.data?.id) {
    ENTITIES.itinerary1 = itinerary1Result.data;
  }

  const itinerary2Result = await test('Itineraries', 'Create Itinerary - Tomorrow', 'POST', '/itineraries', {
    body: {
      caravan_id: ENTITIES.caravan1?.id,
      client_id: ENTITIES.client2?.id,
      scheduled_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      scheduled_time: '14:00:00',
      status: 'pending',
      priority: 'normal',
      notes: 'Afternoon appointment',
    },
    expectedStatus: 201,
  });
  if (itinerary2Result.data?.id) {
    ENTITIES.itinerary2 = itinerary2Result.data;
  }

  // Create groups
  const group1Result = await test('Groups', 'Create Group - PNP Retirees QC', 'POST', '/groups', {
    body: {
      name: 'PNP Retirees - Quezon City',
      description: 'Group of PNP retirees in Quezon City area',
      status: 'active',
    },
    expectedStatus: 201,
  });
  if (group1Result.data?.id) {
    ENTITIES.group1 = group1Result.data;
  }

  // Create targets for the field agent (caravan)
  const target1Result = await test('Targets', 'Create Target - Monthly KPIs', 'POST', '/targets', {
    body: {
      user_id: ENTITIES.caravan1?.id,
      period: 'monthly',
      year: 2026,
      month: 3,
      target_clients: 50,
      target_touchpoints: 150,
      target_visits: 40,
    },
    expectedStatus: 201,
  });
  if (target1Result.data?.id) {
    ENTITIES.target1 = target1Result.data;
  }

  // Check in attendance
  const attendanceResult = await test('Attendance', 'Attendance Check-In', 'POST', '/attendance/check-in', {
    body: {
      caravan_id: ENTITIES.caravan1?.id,
      location_lat: 14.5995,
      location_long: 120.9842,
    },
    expectedStatus: 201,
  });
  if (attendanceResult.data?.id) {
    ENTITIES.attendance = attendanceResult.data;
  }

  // Create approvals
  const approval1Result = await test('Approvals', 'Create Approval - Client Type', 'POST', '/approvals', {
    body: {
      type: 'client',
      client_id: ENTITIES.client1?.id,
      caravan_id: ENTITIES.caravan1?.id,
      role: 'Marketing Representative',
      reason: 'New client registration',
      notes: 'First time client registration approval request',
    },
    expectedStatus: 201,
  });
  if (approval1Result.data?.id) {
    ENTITIES.approval1 = approval1Result.data;
  }

  const approval2Result = await test('Approvals', 'Create Approval - UDI Type', 'POST', '/approvals', {
    body: {
      type: 'udi',
      client_id: ENTITIES.client2?.id,
      caravan_id: ENTITIES.caravan1?.id,
      touchpoint_number: 1,
      role: 'Account Specialist',
      notes: 'UDI approval for first touchpoint',
    },
    expectedStatus: 201,
  });
  if (approval2Result.data?.id) {
    ENTITIES.approval2 = approval2Result.data;
  }

  log('cyan', '\n✨ Data seeding complete!\n');
}

// Run all endpoint tests
async function runAllTests() {
  log('blue', '\n' + '='.repeat(60));
  log('blue', 'IMU Backend API - Comprehensive Endpoint Testing');
  log('blue', '='.repeat(60) + '\n');

  // ========== HEALTH ==========
  log('cyan', '\n📍 HEALTH ENDPOINTS\n');
  await test('Health', 'Health Check', 'GET', '/health', { auth: false });

  // ========== AUTH ==========
  log('cyan', '\n📍 AUTH ENDPOINTS\n');
  await test('Auth', 'Get Current User', 'GET', '/auth/me');
  await test('Auth', 'Refresh Token', 'POST', '/auth/refresh', {
    body: { refresh_token: ENTITIES.refreshToken },
  });
  await test('Auth', 'Invalid Login', 'POST', '/auth/login', {
    body: { email: 'wrong@test.com', password: 'wrongpass' },
    expectedStatus: 401,
    auth: false,
  });
  await test('Auth', 'Forgot Password', 'POST', '/auth/forgot-password', {
    body: { email: ENTITIES.adminEmail },
    auth: false,
  });

  // ========== USERS ==========
  log('cyan', '\n📍 USERS ENDPOINTS\n');
  await test('Users', 'List Users', 'GET', '/users?page=1&perPage=10');
  await test('Users', 'Get User by ID', 'GET', `/users/${ENTITIES.staffUser?.id}`);
  await test('Users', 'Update User', 'PUT', `/users/${ENTITIES.staffUser?.id}`, {
    body: { first_name: 'Staff Updated' },
  });

  // ========== CLIENTS ==========
  log('cyan', '\n📍 CLIENTS ENDPOINTS\n');
  await test('Clients', 'List Clients', 'GET', '/clients?page=1&perPage=10');
  await test('Clients', 'Search Clients', 'GET', '/clients?search=Roberto');
  await test('Clients', 'Filter Clients by Type', 'GET', '/clients?client_type=POTENTIAL');
  await test('Clients', 'Get Client by ID', 'GET', `/clients/${ENTITIES.client1?.id}`);
  await test('Clients', 'Update Client - Change Type', 'PUT', `/clients/${ENTITIES.client2?.id}`, {
    body: { client_type: 'EXISTING', remarks: 'Converted from potential' },
  });

  // ========== CARAVANS ==========
  log('cyan', '\n📍 CARAVANS ENDPOINTS\n');
  await test('Caravans', 'List Caravans', 'GET', '/caravans?page=1&perPage=10');
  await test('Caravans', 'Get Caravan by ID', 'GET', `/caravans/${ENTITIES.caravan1?.id}`);
  await test('Caravans', 'Update Caravan - Change Area', 'PUT', `/caravans/${ENTITIES.caravan1?.id}`, {
    body: { assigned_area: 'Metro Manila - Updated Area', name: 'Juan Dela Cruz Updated' },
  });

  // ========== AGENCIES ==========
  log('cyan', '\n📍 AGENCIES ENDPOINTS\n');
  await test('Agencies', 'List Agencies', 'GET', '/agencies?page=1&perPage=10');
  await test('Agencies', 'Get Agency by ID', 'GET', `/agencies/${ENTITIES.agency1?.id}`);
  await test('Agencies', 'Update Agency - Change Contact', 'PUT', `/agencies/${ENTITIES.agency1?.id}`, {
    body: { contact_number: '+63 2 8999 8888', name: 'PNP Retirement Service Updated' },
  });

  // ========== TOUCHPOINTS ==========
  log('cyan', '\n📍 TOUCHPOINTS ENDPOINTS\n');
  await test('Touchpoints', 'List Touchpoints', 'GET', '/touchpoints?page=1&perPage=10');
  await test('Touchpoints', 'Filter Touchpoints by Client', 'GET', `/touchpoints?client_id=${ENTITIES.client1?.id}`);
  await test('Touchpoints', 'Get Touchpoint by ID', 'GET', `/touchpoints/${ENTITIES.touchpoint1?.id}`);
  await test('Touchpoints', 'Update Touchpoint - Add Notes', 'PUT', `/touchpoints/${ENTITIES.touchpoint1?.id}`, {
    body: { status: 'Converted', notes: 'Client agreed to proceed with loan application' },
  });

  // ========== ITINERARIES ==========
  log('cyan', '\n📍 ITINERARIES ENDPOINTS\n');
  await test('Itineraries', 'List Itineraries', 'GET', '/itineraries?page=1&perPage=10');
  await test('Itineraries', 'Filter Itineraries by Date', 'GET', `/itineraries?date=${new Date().toISOString().split('T')[0]}`);
  await test('Itineraries', 'Get Itinerary by ID', 'GET', `/itineraries/${ENTITIES.itinerary1?.id}`);
  await test('Itineraries', 'Update Itinerary - Mark Completed', 'PUT', `/itineraries/${ENTITIES.itinerary1?.id}`, {
    body: { status: 'completed', notes: 'Visit completed successfully' },
  });

  // ========== GROUPS ==========
  log('cyan', '\n📍 GROUPS ENDPOINTS\n');
  await test('Groups', 'List Groups', 'GET', '/groups?page=1&perPage=10');
  await test('Groups', 'Get Group by ID', 'GET', `/groups/${ENTITIES.group1?.id}`);
  await test('Groups', 'Add Members to Group', 'POST', `/groups/${ENTITIES.group1?.id}/members`, {
    body: { client_ids: [ENTITIES.client1?.id, ENTITIES.client2?.id] },
  });
  await test('Groups', 'Update Group - Change Description', 'PUT', `/groups/${ENTITIES.group1?.id}`, {
    body: { description: 'Updated group for PNP retirees in QC area', name: 'PNP Retirees QC - Updated' },
  });

  // ========== TARGETS ==========
  log('cyan', '\n📍 TARGETS ENDPOINTS\n');
  await test('Targets', 'List Targets', 'GET', '/targets');
  await test('Targets', 'Get Current Targets', 'GET', '/targets/current');
  await test('Targets', 'Get Target History', 'GET', '/targets/history');

  // ========== ATTENDANCE ==========
  log('cyan', '\n📍 ATTENDANCE ENDPOINTS\n');
  await test('Attendance', 'Get Today Attendance', 'GET', '/attendance/today');
  await test('Attendance', 'Get Attendance History', 'GET', '/attendance/history?limit=10');
  await test('Attendance', 'Check Out', 'POST', '/attendance/check-out', {
    body: { location_lat: 14.5995, location_long: 120.9842 },
  });

  // ========== APPROVALS ==========
  log('cyan', '\n📍 APPROVALS ENDPOINTS\n');
  await test('Approvals', 'List Approvals', 'GET', '/approvals?page=1&perPage=10');
  await test('Approvals', 'Filter Approvals by Status', 'GET', '/approvals?status=pending');
  await test('Approvals', 'Filter Approvals by Type', 'GET', '/approvals?type=client');
  await test('Approvals', 'Get Approval by ID', 'GET', `/approvals/${ENTITIES.approval1?.id}`);
  await test('Approvals', 'Get Approval Stats', 'GET', '/approvals/stats/summary');
  await test('Approvals', 'Approve an Approval', 'POST', `/approvals/${ENTITIES.approval1?.id}/approve`, {
    body: { notes: 'Approved by admin' },
  });
  await test('Approvals', 'Reject an Approval', 'POST', `/approvals/${ENTITIES.approval2?.id}/reject`, {
    body: { reason: 'Incomplete documentation', notes: 'Please resubmit with complete documents' },
  });
  await test('Approvals', 'Update Approval Notes', 'PUT', `/approvals/${ENTITIES.approval1?.id}`, {
    body: { notes: 'Updated notes after approval' },
  });

  // ========== MY-DAY ==========
  log('cyan', '\n📍 MY-DAY ENDPOINTS\n');
  await test('My-Day', 'Get Today Tasks', 'GET', `/my-day/tasks?caravan_id=${ENTITIES.caravan1?.id}`);
  await test('My-Day', 'Get My-Day Stats', 'GET', `/my-day/stats?caravan_id=${ENTITIES.caravan1?.id}`);

  // ========== PROFILE ==========
  log('cyan', '\n📍 PROFILE ENDPOINTS\n');
  await test('Profile', 'Get Profile', 'GET', `/profile/${ENTITIES.adminUser?.id}`);
  await test('Profile', 'Update Profile - Change Name', 'PUT', `/profile/${ENTITIES.adminUser?.id}`, {
    body: { first_name: 'Admin Updated', last_name: 'TestUser Updated' },
  });

  // ========== DASHBOARD ==========
  log('cyan', '\n📍 DASHBOARD ENDPOINTS\n');
  await test('Dashboard', 'Get Dashboard Stats', 'GET', '/dashboard');
  await test('Dashboard', 'Get Dashboard Performance', 'GET', `/dashboard/performance?caravan_id=${ENTITIES.caravan1?.id}`);

  // ========== UPLOAD ==========
  log('cyan', '\n📍 UPLOAD ENDPOINTS\n');
  await test('Upload', 'Get Upload Categories', 'GET', '/upload/categories');
  await test('Upload', 'Get Pending Uploads', 'GET', '/upload/pending');

  // ========== REPORTS ==========
  log('cyan', '\n📍 REPORTS ENDPOINTS\n');
  await test('Reports', 'Agent Performance Report', 'GET', '/reports/agent-performance?period=month');
  await test('Reports', 'Client Activity Report', 'GET', '/reports/client-activity?period=month');
  await test('Reports', 'Touchpoint Summary Report', 'GET', '/reports/touchpoint-summary?period=month');
  await test('Reports', 'Attendance Summary Report', 'GET', '/reports/attendance-summary?period=month');
  await test('Reports', 'Target Achievement Report', 'GET', '/reports/target-achievement');
  await test('Reports', 'Conversion Report', 'GET', '/reports/conversion?period=month');
  await test('Reports', 'Area Coverage Report', 'GET', '/reports/area-coverage?period=month');
  await test('Reports', 'Export Report', 'GET', '/reports/export?type=touchpoints&period=month');

  // ========== DELETE OPERATIONS ==========
  log('cyan', '\n📍 DELETE OPERATIONS (Cleanup)\n');

  // Delete approval
  await test('Approvals', 'Delete Approval', 'DELETE', `/approvals/${ENTITIES.approval1?.id}`);

  // Delete touchpoint
  await test('Touchpoints', 'Delete Touchpoint', 'DELETE', `/touchpoints/${ENTITIES.touchpoint2?.id}`);

  // Delete itinerary
  await test('Itineraries', 'Delete Itinerary', 'DELETE', `/itineraries/${ENTITIES.itinerary2?.id}`);

  // Remove group member
  await test('Groups', 'Remove Group Member', 'DELETE', `/groups/${ENTITIES.group1?.id}/members/${ENTITIES.client2?.id}`);

  // Delete group
  await test('Groups', 'Delete Group', 'DELETE', `/groups/${ENTITIES.group1?.id}`);

  // Delete client (the one without agency association)
  await test('Clients', 'Delete Client', 'DELETE', `/clients/${ENTITIES.client3?.id}`);

  // Delete target
  if (ENTITIES.target1?.id) {
    await test('Targets', 'Delete Target', 'DELETE', `/targets/${ENTITIES.target1?.id}`);
  }

  // Delete caravan
  await test('Caravans', 'Delete Caravan', 'DELETE', `/caravans/${ENTITIES.caravan2?.id}`);

  // Delete agency - this should fail because it has associated clients
  // This is expected behavior - we test that the constraint works
  await test('Agencies', 'Delete Agency - With Clients (Expected to Fail)', 'DELETE', `/agencies/${ENTITIES.agency2?.id}`, {
    expectedStatus: 400, // Expect failure due to foreign key constraint
  });
}

// Generate markdown report
function generateMarkdownReport() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US');

  let md = `# API Endpoint Test Log

**Test Date:** ${dateStr} ${timeStr}
**Backend URL:** http://localhost:3000

---

## Test Summary

| Category | Endpoints | Passed | Failed | Status |
|----------|----------|-------|--------|--------|
`;

  let totalEndpoints = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  // Sort categories by order
  const categoryOrder = ['Health', 'Auth', 'Users', 'Clients', 'Caravans', 'Agencies', 'Touchpoints', 'Itineraries', 'Groups', 'Targets', 'Attendance', 'Approvals', 'My-Day', 'Profile', 'Dashboard', 'Upload', 'Reports'];

  for (const category of categoryOrder) {
    const cat = CATEGORIES[category];
    if (!cat || cat.tests.length === 0) continue;
    const failed = cat.failed;
    totalEndpoints += cat.tests.length;
    totalPassed += cat.passed;
    totalFailed += cat.failed;
    const status = failed === 0 ? '✅ Complete' : '❌ Failed';
    md += `| ${category} | ${cat.tests.length} | ${cat.passed} | ${cat.failed} | ${status} |\n`;
  }

  const overallStatus = totalFailed === 0 ? '100% ✅' : `${Math.round((totalPassed / totalEndpoints) * 100)}%`;
  md += `| **TOTAL** | **${totalEndpoints}** | **${totalPassed}** | **${totalFailed}** | **${overallStatus}** |\n`;
  md += '\n---\n\n## Detailed Test Results\n';

  let testNum = 1;
  for (const category of categoryOrder) {
    const cat = CATEGORIES[category];
    if (!cat || cat.tests.length === 0) continue;
    md += `\n### ${testNum}. ${category}\n\n`;

    for (const result of cat.tests) {
      md += `**${result.name}**\n`;
      md += `**Endpoint:** \`${result.method} ${result.endpoint}\`\n`;
      if (result.data) {
        const jsonStr = JSON.stringify(result.data, null, 2);
        md += '```json\n' + jsonStr.substring(0, 500) + (jsonStr.length > 500 ? '...' : '') + '\n```\n';
      }
      md += `**Status:** ${result.status} ${result.passed ? '✅' : '❌'}\n`;
      md += `**Result:** ${result.passed ? '✅ PASS' : '❌ FAIL'}\n`;
      md += '\n---\n';
    }
    testNum++;
  }

  return md;
}

// Main execution
async function main() {
  try {
    // Seed data first
    await seedData();

    // Run all tests
    await runAllTests();

    // Print summary
    log('blue', '\n' + '='.repeat(60));
    log('blue', 'TEST SUMMARY');
    log('blue', '='.repeat(60));
    log('green', `✅ Passed: ${PASS}`);
    log('red', `❌ Failed: ${FAIL}`);
    log('cyan', `📊 Total: ${PASS + FAIL}`);
    const successRate = PASS + FAIL > 0 ? Math.round((PASS / (PASS + FAIL)) * 100) : 0;
    log('yellow', `📈 Success Rate: ${successRate}%`);

    // Generate markdown report
    const mdReport = generateMarkdownReport();

    // Write to file
    const fs = await import('fs');
    const path = await import('path');
    const reportPath = path.resolve('../docs/endpoint-test-log.md');
    fs.writeFileSync(reportPath, mdReport);
    log('green', `\n📄 Report saved to: ${reportPath}`);

    // Exit with appropriate code
    process.exit(FAIL === 0 ? 0 : 1);
  } catch (error) {
    log('red', `\n❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
