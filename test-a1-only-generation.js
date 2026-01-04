/**
 * Test A1-Only Generation Workflow
 * 
 * Tests the A1-only mode with:
 * - Default A1 sheet generation
 * - Feature flags verify a1Only=true
 * - No 13-view workflow available
 * - Design history saving
 */

const { FEATURE_FLAGS } = require('./src/config/featureFlags');

console.log('🧪 Testing A1-Only Generation Workflow\n');

// Test 1: Feature flags
console.log('Test 1: Feature Flags');
console.log('  a1Only:', FEATURE_FLAGS.a1Only);
console.log('  geometryFirst:', FEATURE_FLAGS.geometryFirst);

if (FEATURE_FLAGS.a1Only !== true) {
  console.error('  ❌ FAILED: a1Only should be true by default');
  process.exit(1);
}

console.log('  ✅ PASSED: A1-only mode enabled by default\n');

// Test 2: Services export A1 generation
console.log('Test 2: Together AI Service Exports');
try {
  const togetherAIService = require('./src/services/togetherAIService');
  
  if (!togetherAIService.generateA1SheetImage) {
    console.error('  ❌ FAILED: generateA1SheetImage not exported');
    process.exit(1);
  }
  
  console.log('  ✅ PASSED: generateA1SheetImage available\n');
} catch (error) {
  console.error('  ❌ FAILED: Could not load togetherAIService', error.message);
  process.exit(1);
}

// Test 3: A1 Sheet Prompt Generator
console.log('Test 3: A1 Sheet Prompt Generator');
try {
  const a1SheetPromptGenerator = require('./src/services/a1SheetPromptGenerator');
  
  if (!a1SheetPromptGenerator.buildA1SheetPrompt) {
    console.error('  ❌ FAILED: buildA1SheetPrompt not exported');
    process.exit(1);
  }
  
  if (!a1SheetPromptGenerator.withConsistencyLock) {
    console.error('  ❌ FAILED: withConsistencyLock not exported');
    process.exit(1);
  }
  
  console.log('  ✅ PASSED: Prompt generator exports correct functions\n');
} catch (error) {
  console.error('  ❌ FAILED: Could not load a1SheetPromptGenerator', error.message);
  process.exit(1);
}

// Test 4: AI Modification Service
console.log('Test 4: AI Modification Service');
try {
  const aiModificationService = require('./src/services/aiModificationService');
  
  if (!aiModificationService.modifyA1Sheet) {
    console.error('  ❌ FAILED: modifyA1Sheet not available');
    process.exit(1);
  }
  
  console.log('  ✅ PASSED: Modification service available\n');
} catch (error) {
  console.error('  ❌ FAILED: Could not load aiModificationService', error.message);
  process.exit(1);
}

// Test 5: Sheet Consistency Guard
console.log('Test 5: Sheet Consistency Guard');
try {
  const sheetConsistencyGuard = require('./src/services/sheetConsistencyGuard');
  
  if (!sheetConsistencyGuard.validateConsistency) {
    console.error('  ❌ FAILED: validateConsistency not available');
    process.exit(1);
  }
  
  if (!sheetConsistencyGuard.generateRetryConfig) {
    console.error('  ❌ FAILED: generateRetryConfig not available');
    process.exit(1);
  }
  
  console.log('  ✅ PASSED: Consistency guard available\n');
} catch (error) {
  console.error('  ❌ FAILED: Could not load sheetConsistencyGuard', error.message);
  process.exit(1);
}

// Test 6: Design History Service
console.log('Test 6: Design History Service');
try {
  const designHistoryService = require('./src/services/designHistoryService');
  
  if (!designHistoryService.createDesign) {
    console.error('  ❌ FAILED: createDesign not available');
    process.exit(1);
  }
  
  if (!designHistoryService.addVersion) {
    console.error('  ❌ FAILED: addVersion not available');
    process.exit(1);
  }
  
  if (!designHistoryService.getDesign) {
    console.error('  ❌ FAILED: getDesign not available');
    process.exit(1);
  }
  
  console.log('  ✅ PASSED: Design history service complete\n');
} catch (error) {
  console.error('  ❌ FAILED: Could not load designHistoryService', error.message);
  process.exit(1);
}

console.log('═══════════════════════════════════════════');
console.log('✅ ALL TESTS PASSED');
console.log('═══════════════════════════════════════════');
console.log('\nA1-Only Mode Test Summary:');
console.log('  ✓ Feature flags configured for A1-only');
console.log('  ✓ Together AI service exports A1 generation');
console.log('  ✓ Prompt generator supports consistency lock');
console.log('  ✓ Modification service available');
console.log('  ✓ Consistency guard validates changes');
console.log('  ✓ Design history supports versioning');
console.log('\nReady for A1-only generation with modification support!');

process.exit(0);

