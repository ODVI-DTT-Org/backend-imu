/**
 * Dashboard Performance Verification Script
 * Tests dashboard API endpoints and verifies they meet performance targets
 *
 * Performance Targets:
 * - Target Progress: < 100ms
 * - Team Performance: < 150ms
 * - Action Items: < 200ms
 * - Dashboard Summary: < 100ms
 *
 * Usage: pnpm exec tsx src/scripts/verify-dashboard-performance.ts
 */

import { pool } from '../db/index.js';

interface PerformanceTest {
  name: string;
  endpoint: string;
  query: string;
  maxDuration: number; // milliseconds
  description: string;
}

interface PerformanceResult {
  name: string;
  endpoint: string;
  duration: number;
  success: boolean;
  maxDuration: number;
  description: string;
  rowCount?: number;
  error?: string;
}

const PERFORMANCE_TESTS: PerformanceTest[] = [
  {
    name: 'Target Progress',
    endpoint: '/api/dashboard/target-progress',
    query: "SELECT * FROM dashboard_target_progress_data() WHERE date_from = CURRENT_DATE - INTERVAL '30 days' AND date_to = CURRENT_DATE",
    maxDuration: 100,
    description: 'Fetch target progress for last 30 days',
  },
  {
    name: 'Team Performance',
    endpoint: '/api/dashboard/team-performance',
    query: "SELECT * FROM dashboard_team_performance_data() WHERE date_from = CURRENT_DATE - INTERVAL '30 days' AND date_to = CURRENT_DATE",
    maxDuration: 150,
    description: 'Fetch team performance for last 30 days',
  },
  {
    name: 'Action Items',
    endpoint: '/api/dashboard/action-items',
    query: "SELECT * FROM action_items LIMIT 50",
    maxDuration: 200,
    description: 'Fetch first 50 action items',
  },
  {
    name: 'Dashboard Summary',
    endpoint: '/api/dashboard/summary',
    query: "SELECT * FROM dashboard_summary_data()",
    maxDuration: 100,
    description: 'Fetch dashboard summary statistics',
  },
];

/**
 * Run a single performance test
 */
async function runTest(test: PerformanceTest): Promise<PerformanceResult> {
  const client = await pool.connect();

  try {
    console.log(`\n🧪 Testing: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    console.log(`   Query: ${test.query.substring(0, 80)}...`);

    const startTime = Date.now();

    const result = await client.query(test.query);

    const duration = Date.now() - startTime;
    const success = duration <= test.maxDuration;
    const rowCount = result.rowCount;

    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   📊 Rows: ${rowCount}`);
    console.log(`   🎯 Target: < ${test.maxDuration}ms`);
    console.log(`   ${success ? '✅ PASS' : '❌ FAIL'}: ${success ? 'Within target' : 'Exceeds target by ' + (duration - test.maxDuration) + 'ms'}`);

    return {
      name: test.name,
      endpoint: test.endpoint,
      duration,
      success,
      maxDuration: test.maxDuration,
      description: test.description,
      rowCount: rowCount ?? undefined,
    };
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return {
      name: test.name,
      endpoint: test.endpoint,
      duration: 0,
      success: false,
      maxDuration: test.maxDuration,
      description: test.description,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Generate performance report
 */
function generateReport(results: PerformanceResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PERFORMANCE VERIFICATION REPORT');
  console.log('='.repeat(80));

  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;

  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.log('\n❌ Failed Tests:');
    results
      .filter(r => !r.success)
      .forEach(result => {
        console.log(`   - ${result.name}: ${result.duration}ms (target: < ${result.maxDuration}ms)`);
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
      });
  }

  console.log('\n📈 Detailed Results:');
  console.log('─'.repeat(80));

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const durationStr = `${result.duration}ms`;
    const targetStr = `< ${result.maxDuration}ms`;
    const durationBar = '█'.repeat(Math.min(50, Math.floor(result.duration / 10)));

    console.log(`${status} ${index + 1}. ${result.name}`);
    console.log(`   ${durationBar} ${durationStr} (target: ${targetStr})`);
    console.log(`   ${result.description}`);
    if (result.rowCount !== undefined) {
      console.log(`   Rows returned: ${result.rowCount}`);
    }
    console.log('');
  });

  // Performance recommendations
  console.log('📋 Performance Recommendations:');
  console.log('─'.repeat(80));

  const slowTests = results.filter(r => !r.success && r.duration > 0);
  if (slowTests.length > 0) {
    console.log('\n⚠️  Recommendations for slow queries:');
    slowTests.forEach(result => {
      const slowness = ((result.duration - result.maxDuration) / result.maxDuration * 100).toFixed(0);
      console.log(`   - ${result.name}: ${slowness}% slower than target`);
      console.log(`     Consider: Adding indexes, optimizing query, or caching results`);
    });
  } else {
    console.log('\n✅ All endpoints are performing within targets!');
  }

  // Overall assessment
  console.log('\n' + '='.repeat(80));
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED - Dashboard performance is excellent!');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('⚠️  Most tests passed - Some optimization recommended');
  } else {
    console.log('❌ CRITICAL: Multiple tests failed - Immediate optimization required');
  }
  console.log('='.repeat(80));
}

/**
 * Main verification function
 */
export async function verifyDashboardPerformance(): Promise<void> {
  console.log('🚀 Starting Dashboard Performance Verification');
  console.log('Target: All queries must complete within their specified time limits\n');

  const results: PerformanceResult[] = [];

  // Run all tests
  for (const test of PERFORMANCE_TESTS) {
    const result = await runTest(test);
    results.push(result);
  }

  // Generate report
  generateReport(results);

  // Exit with appropriate code
  const allPassed = results.every(r => r.success);
  if (!allPassed) {
    process.exit(1);
  }
}

// Run verification if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyDashboardPerformance().catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}
