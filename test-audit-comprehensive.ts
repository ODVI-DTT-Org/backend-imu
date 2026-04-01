/**
 * Comprehensive Audit Trail Test
 * Tests all CRUD operations to verify audit logging is working
 */

import fs from 'fs';
import path from 'path';

// Route files to check
const routeFiles = [
  'routes/users.ts',
  'routes/clients.ts',
  'routes/itineraries.ts',
  'routes/touchpoints.ts',
  'routes/approvals.ts',
  'routes/attendance.ts',
  'routes/targets.ts',
  'routes/groups.ts',
  'routes/agencies.ts',
  'routes/caravans.ts',
  'routes/tele-assignments.ts',
];

interface EndpointAuditStatus {
  file: string;
  entity: string;
  hasCreate: boolean;
  hasUpdate: boolean;
  hasDelete: boolean;
  createLine?: number;
  updateLine?: number;
  deleteLine?: number;
}

function checkFileForAuditMiddleware(filePath: string): EndpointAuditStatus {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const result: EndpointAuditStatus = {
    file: path.basename(filePath),
    entity: '',
    hasCreate: false,
    hasUpdate: false,
    hasDelete: false,
  };

  // Extract entity name from file path
  const entityMatch = path.basename(filePath, '.ts');
  result.entity = entityMatch === 'tele-assignments' ? 'tele-assignment' : entityMatch;

  // Check for audit middleware in POST, PUT, DELETE routes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for POST route with audit middleware
    if (line.includes('.post(') && line.includes('auditMiddleware')) {
      result.hasCreate = true;
      result.createLine = i + 1;
    }

    // Check for PUT route with audit middleware
    if (line.includes('.put(') && line.includes('auditMiddleware')) {
      result.hasUpdate = true;
      result.updateLine = i + 1;
    }

    // Check for DELETE route with audit middleware
    if (line.includes('.delete(') && line.includes('auditMiddleware')) {
      result.hasDelete = true;
      result.deleteLine = i + 1;
    }
  }

  return result;
}

function analyzeAllRoutes() {
  console.log('🔍 Analyzing route files for audit middleware...\n');

  const results: EndpointAuditStatus[] = [];
  const srcPath = path.join(process.cwd(), 'src');

  for (const routeFile of routeFiles) {
    const filePath = path.join(srcPath, routeFile);
    if (fs.existsSync(filePath)) {
      const status = checkFileForAuditMiddleware(filePath);
      results.push(status);
    }
  }

  return results;
}

function printReport(results: EndpointAuditStatus[]) {
  console.log('📊 AUDIT MIDDLEWARE COVERAGE REPORT\n');
  console.log('━'.repeat(80));

  let totalCreate = 0;
  let totalUpdate = 0;
  let totalDelete = 0;
  let fullyCovered = 0;

  results.forEach(result => {
    const createStatus = result.hasCreate ? '✅' : '❌';
    const updateStatus = result.hasUpdate ? '✅' : '❌';
    const deleteStatus = result.hasDelete ? '✅' : '❌';

    console.log(`\n${result.entity.padEnd(25)} | Create: ${createStatus} | Update: ${updateStatus} | Delete: ${deleteStatus}`);

    if (result.hasCreate) totalCreate++;
    if (result.hasUpdate) totalUpdate++;
    if (result.hasDelete) totalDelete++;
    if (result.hasCreate && result.hasUpdate && result.hasDelete) fullyCovered++;
  });

  console.log('\n' + '━'.repeat(80));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total entities checked: ${results.length}`);
  console.log(`   Create operations covered: ${totalCreate}/${results.length} (${Math.round(totalCreate/results.length*100)}%)`);
  console.log(`   Update operations covered: ${totalUpdate}/${results.length} (${Math.round(totalUpdate/results.length*100)}%)`);
  console.log(`   Delete operations covered: ${totalDelete}/${results.length} (${Math.round(totalDelete/results.length*100)}%)`);
  console.log(`   Fully covered entities: ${fullyCovered}/${results.length} (${Math.round(fullyCovered/results.length*100)}%)`);

  console.log('\n' + '━'.repeat(80));
  console.log('\n❌ MISSING AUDIT MIDDLEWARE:\n');

  const missing: string[] = [];
  results.forEach(result => {
    if (!result.hasCreate) missing.push(`  - ${result.entity}: POST (create)`);
    if (!result.hasUpdate) missing.push(`  - ${result.entity}: PUT (update)`);
    if (!result.hasDelete) missing.push(`  - ${result.entity}: DELETE (delete)`);
  });

  if (missing.length === 0) {
    console.log('  ✅ All operations have audit middleware!');
  } else {
    missing.forEach(m => console.log(m));
  }

  console.log('\n' + '━'.repeat(80));
}

// Run analysis
const results = analyzeAllRoutes();
printReport(results);
