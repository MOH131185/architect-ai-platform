/**
 * Test Design ID Generation
 * Verifies that designId is never undefined
 */

console.log('🧪 Testing Design ID Generation\n');

// Test various scenarios
const testScenarios = [
  {
    name: 'AI provides projectID',
    aiResult: { masterDNA: { projectID: 'AI_PROJECT_123', seed: 456 } },
    projectSeed: 789,
    expected: 'AI_PROJECT_123'
  },
  {
    name: 'AI provides seed but no projectID',
    aiResult: { masterDNA: { seed: 456 } },
    projectSeed: 789,
    expected: 'design_seed_456'
  },
  {
    name: 'Only projectSeed available',
    aiResult: { masterDNA: {} },
    projectSeed: 789,
    expected: 'design_seed_789'
  },
  {
    name: 'Nothing available (ultimate fallback)',
    aiResult: { masterDNA: {} },
    projectSeed: null,
    expected: /^design_\d+_[a-z0-9]+$/
  },
  {
    name: 'AI returns "undefined" string',
    aiResult: { masterDNA: { projectID: 'undefined', seed: 456 } },
    projectSeed: 789,
    expected: 'design_seed_456'
  }
];

let passed = 0;
let failed = 0;

for (const scenario of testScenarios) {
  console.log(`📋 Test: ${scenario.name}`);
  
  const { aiResult, projectSeed } = scenario;
  
  // Simulate the designId generation logic
  let designId = null;
  
  if (aiResult?.masterDNA?.projectID && aiResult.masterDNA.projectID !== 'undefined') {
    designId = aiResult.masterDNA.projectID;
  } else if (aiResult?.masterDNA?.seed) {
    designId = `design_seed_${aiResult.masterDNA.seed}`;
  } else if (projectSeed) {
    designId = `design_seed_${projectSeed}`;
  } else {
    designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Double-check validation
  if (!designId || designId === 'undefined' || designId === 'null' || typeof designId !== 'string') {
    designId = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Check result
  const expectedPattern = scenario.expected;
  const isValid = typeof designId === 'string' && 
                  designId !== 'undefined' && 
                  designId !== 'null' && 
                  designId.length > 0;
  
  let matches = false;
  if (typeof expectedPattern === 'string') {
    matches = designId === expectedPattern;
  } else if (expectedPattern instanceof RegExp) {
    matches = expectedPattern.test(designId);
  }
  
  if (isValid && matches) {
    console.log(`   ✅ PASS: Generated "${designId}"`);
    passed++;
  } else {
    console.log(`   ❌ FAIL: Generated "${designId}", expected ${expectedPattern}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed}/${testScenarios.length} tests passed`);

if (failed === 0) {
  console.log('✅ All tests passed - designId generation is robust\n');
  process.exit(0);
} else {
  console.log(`❌ ${failed} tests failed\n`);
  process.exit(1);
}

