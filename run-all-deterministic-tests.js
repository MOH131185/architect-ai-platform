/**
 * Deterministic Test Suite Runner
 * 
 * Runs all deterministic tests in sequence and reports results.
 * Run with: node run-all-deterministic-tests.js
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  {
    name: 'Pure Orchestrator Deterministic Tests',
    file: 'test-pure-orchestrator-deterministic.js',
    description: 'Tests deterministic A1 sheet generation workflow'
  },
  {
    name: 'Drift Detection Tests',
    file: 'test-drift-detection.js',
    description: 'Tests DNA-level and image-level drift detection'
  },
  {
    name: 'Design History Repository Tests',
    file: 'test-design-history-repository.js',
    description: 'Tests design persistence and versioning'
  },
  {
    name: 'API Deterministic Tests',
    file: 'test-api-deterministic.js',
    description: 'Tests API endpoints for deterministic behavior (requires server)'
  },
  {
    name: 'E2E Deterministic Pipeline Tests',
    file: 'test-e2e-deterministic-pipeline.js',
    description: 'Tests complete workflow from site to modification'
  }
];

function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(70));

    const child = spawn('node', [testFile], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ file: testFile, passed: true });
      } else {
        resolve({ file: testFile, passed: false, code });
      }
    });

    child.on('error', (error) => {
      reject({ file: testFile, error });
    });
  });
}

async function runAllTests() {
  console.log('\n🚀 Deterministic Test Suite\n');
  console.log('Running all deterministic tests...\n');

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const test of tests) {
    console.log(`\n📦 ${test.name}`);
    console.log(`   ${test.description}`);
    
    try {
      const result = await runTest(test.file);
      results.push(result);
      
      if (result.passed) {
        totalPassed++;
      } else {
        totalFailed++;
      }
    } catch (error) {
      console.error(`\n❌ Test execution error: ${error.file}`);
      console.error(`   ${error.error.message}`);
      results.push({ file: error.file, passed: false, error: error.error });
      totalFailed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 TEST SUITE SUMMARY\n');
  console.log('='.repeat(70));

  results.forEach((result, index) => {
    const test = tests[index];
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${test.name}`);
    if (!result.passed && result.code) {
      console.log(`        Exit code: ${result.code}`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed (${tests.length} total)`);
  console.log(`Success rate: ${((totalPassed / tests.length) * 100).toFixed(1)}%\n`);

  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! Deterministic refactor is working correctly.\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${totalFailed} test suite(s) failed. Review output above.\n`);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});

