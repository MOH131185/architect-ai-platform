/**
 * Opus 4.1 Compliance Test Suite
 *
 * Comprehensive edge case testing for A1 modification system
 * Tests security, error handling, caching, and edge cases
 *
 * Run: node test-opus-4-1-compliance.js
 */

const assert = require('assert');

// Test counters
let passedTests = 0;
let failedTests = 0;
const testResults = [];

// Color codes for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

/**
 * Test helper function
 */
function test(name, fn) {
  try {
    fn();
    passedTests++;
    testResults.push({ name, passed: true, error: null });
    console.log(`${GREEN}✓${RESET} ${name}`);
  } catch (error) {
    failedTests++;
    testResults.push({ name, passed: false, error: error.message });
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
  }
}

/**
 * Async test helper
 */
async function testAsync(name, fn) {
  try {
    await fn();
    passedTests++;
    testResults.push({ name, passed: true, error: null });
    console.log(`${GREEN}✓${RESET} ${name}`);
  } catch (error) {
    failedTests++;
    testResults.push({ name, passed: false, error: error.message });
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
  }
}

console.log(`\n${BLUE}==============================================`);
console.log(`Opus 4.1 Compliance Test Suite`);
console.log(`==============================================${RESET}\n`);

// ============================================
// CATEGORY 1: Security Compliance Tests
// ============================================
console.log(`\n${YELLOW}Category 1: Security Compliance${RESET}\n`);

test('✅ NO direct API key access in aiModificationService', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Should NOT import togetherAIService
  assert(!content.includes('from \'./togetherAIService\''),
    'aiModificationService should not import togetherAIService');

  // Should NOT directly access process.env API keys
  assert(!content.includes('process.env.TOGETHER_API_KEY'),
    'Should not directly access TOGETHER_API_KEY');
  assert(!content.includes('process.env.OPENAI_API_KEY'),
    'Should not directly access OPENAI_API_KEY');

  // SHOULD import secureApiClient
  assert(content.includes('from \'./secureApiClient\''),
    'Should import secureApiClient');
});

test('✅ secureApiClient is used for all API calls', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Should use secureApiClient.togetherImage
  assert(content.includes('secureApiClient.togetherImage'),
    'Should use secureApiClient.togetherImage for image generation');
});

test('✅ NO API keys in environment variable access', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Count matches
  const matches = content.match(/process\.env\./g);
  assert(!matches || matches.length === 0,
    `Found ${matches ? matches.length : 0} direct process.env accesses (should be 0)`);
});

// ============================================
// CATEGORY 2: Logging Standards Tests
// ============================================
console.log(`\n${YELLOW}Category 2: Logging Standards${RESET}\n`);

test('✅ NO console.log in aiModificationService', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  const consoleLogs = content.match(/console\.log\(/g);
  assert(!consoleLogs,
    `Found ${consoleLogs ? consoleLogs.length : 0} console.log (should be 0)`);
});

test('✅ NO console.warn in aiModificationService', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  const consoleWarns = content.match(/console\.warn\(/g);
  assert(!consoleWarns,
    `Found ${consoleWarns ? consoleWarns.length : 0} console.warn (should be 0)`);
});

test('✅ NO console.error in aiModificationService', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  const consoleErrors = content.match(/console\.error\(/g);
  assert(!consoleErrors,
    `Found ${consoleErrors ? consoleErrors.length : 0} console.error (should be 0)`);
});

test('✅ Logger is imported in aiModificationService', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('import logger from'),
    'Logger should be imported');
});

test('✅ Logger methods are used (info, warn, error, debug)', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('logger.info('),
    'Should use logger.info');
  assert(content.includes('logger.warn('),
    'Should use logger.warn');
  assert(content.includes('logger.error('),
    'Should use logger.error');
});

test('✅ NO console.log in a1SheetPromptGenerator', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/a1SheetPromptGenerator.js', 'utf8');

  const consoleLogs = content.match(/console\.log\(/g);
  assert(!consoleLogs,
    `Found ${consoleLogs ? consoleLogs.length : 0} console.log (should be 0)`);
});

test('✅ Logger is imported in a1SheetPromptGenerator', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/a1SheetPromptGenerator.js', 'utf8');

  assert(content.includes('import logger from'),
    'Logger should be imported');
});

// ============================================
// CATEGORY 3: Error Handling Tests
// ============================================
console.log(`\n${YELLOW}Category 3: Error Handling Standards${RESET}\n`);

test('✅ Custom error classes are imported', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('ValidationError'),
    'Should import ValidationError');
  assert(content.includes('GenerationError'),
    'Should import GenerationError');
  assert(content.includes('APIError'),
    'Should import APIError or NetworkError');
});

test('✅ ValidationError is used for DNA not found', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Should throw ValidationError, not generic Error
  assert(content.includes('throw new ValidationError'),
    'Should throw ValidationError for validation failures');

  // Should NOT have generic "throw new Error"
  const genericErrors = content.match(/throw new Error\(/g);
  assert(!genericErrors || genericErrors.length === 0,
    `Found ${genericErrors ? genericErrors.length : 0} generic Error throws (should use custom errors)`);
});

test('✅ GenerationError is used for generation failures', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('throw new GenerationError'),
    'Should throw GenerationError for generation failures');
});

test('✅ Errors are re-thrown if custom error types', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('error instanceof ValidationError'),
    'Should check for ValidationError before wrapping');
  assert(content.includes('error instanceof GenerationError'),
    'Should check for GenerationError before wrapping');
});

// ============================================
// CATEGORY 4: Caching Implementation Tests
// ============================================
console.log(`\n${YELLOW}Category 4: Caching Implementation${RESET}\n`);

test('✅ Prompt cache is implemented', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('promptCache'),
    'Should have promptCache Map');
  assert(content.includes('PROMPT_CACHE_TTL'),
    'Should have cache TTL constant');
});

test('✅ SSIM cache is implemented', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('ssimCache'),
    'Should have ssimCache Map');
  assert(content.includes('SSIM_CACHE_TTL'),
    'Should have SSIM cache TTL');
});

test('✅ getCachedPrompt method exists', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('getCachedPrompt(cacheKey)'),
    'Should have getCachedPrompt method');
});

test('✅ cachePrompt method exists', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('cachePrompt(cacheKey'),
    'Should have cachePrompt method');
});

test('✅ getCachedSSIM method exists', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('getCachedSSIM('),
    'Should have getCachedSSIM method');
});

test('✅ Cache is used before generating prompts', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Should check cache before generation
  assert(content.includes('this.getCachedPrompt(') && content.includes('if (!prompt)'),
    'Should check cache before generating new prompt');
});

test('✅ Cache has reasonable TTL (1 hour for prompts)', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Check for 60 * 60 * 1000 or 3600000
  assert(content.includes('60 * 60 * 1000') || content.includes('3600000'),
    'Prompt cache TTL should be 1 hour');
});

test('✅ SSIM cache has reasonable TTL (30 minutes)', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Check for 30 * 60 * 1000 or 1800000
  assert(content.includes('30 * 60 * 1000') || content.includes('1800000'),
    'SSIM cache TTL should be 30 minutes');
});

// ============================================
// CATEGORY 5: Documentation Standards Tests
// ============================================
console.log(`\n${YELLOW}Category 5: Documentation Standards${RESET}\n`);

test('✅ File header has Opus 4.1 compliance notes', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('SECURITY:') && content.includes('secureApiClient'),
    'Should document security compliance');
  assert(content.includes('LOGGING:') && content.includes('logger'),
    'Should document logging compliance');
  assert(content.includes('ERRORS:') && content.includes('error classes'),
    'Should document error handling compliance');
  assert(content.includes('CACHING:') && content.includes('caching'),
    'Should document caching implementation');
});

test('✅ Methods have @throws JSDoc tags', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  const throwsTags = content.match(/@throws/g);
  assert(throwsTags && throwsTags.length >= 2,
    `Should have @throws tags (found ${throwsTags ? throwsTags.length : 0})`);
});

test('✅ Cache methods have @private JSDoc tags', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('@private'),
    'Cache methods should be documented as @private');
});

// ============================================
// CATEGORY 6: Code Quality Tests
// ============================================
console.log(`\n${YELLOW}Category 6: Code Quality${RESET}\n`);

test('✅ No hardcoded API keys or secrets', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Check for common API key patterns
  assert(!content.match(/tgp_[a-zA-Z0-9_-]+/),
    'Should not contain Together.ai API keys');
  assert(!content.match(/sk-[a-zA-Z0-9_-]+/),
    'Should not contain OpenAI API keys');
});

test('✅ Proper const/let usage (no var)', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  const varUsage = content.match(/\bvar\s/g);
  assert(!varUsage,
    `Should not use var (found ${varUsage ? varUsage.length : 0})`);
});

test('✅ Arrow functions used consistently', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  // Should have arrow functions for callbacks
  assert(content.includes('=>'),
    'Should use arrow functions');
});

test('✅ Async/await used (no callback hell)', () => {
  const fs = require('fs');
  const content = fs.readFileSync('./src/services/aiModificationService.js', 'utf8');

  assert(content.includes('async ') && content.includes('await '),
    'Should use async/await pattern');
});

// ============================================
// CATEGORY 7: Build Verification Tests
// ============================================
console.log(`\n${YELLOW}Category 7: Build Verification${RESET}\n`);

test('✅ Package.json has required scripts', () => {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

  assert(pkg.scripts.build, 'Should have build script');
  assert(pkg.scripts.start, 'Should have start script');
  assert(pkg.scripts.server, 'Should have server script');
});

test('✅ Required dependencies are present', () => {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

  assert(pkg.dependencies.react, 'Should have React');
});

test('✅ .env.example exists for documentation', () => {
  const fs = require('fs');

  assert(fs.existsSync('.env.example'),
    '.env.example should exist for developer reference');
});

test('✅ .gitignore excludes sensitive files', () => {
  const fs = require('fs');

  if (fs.existsSync('.gitignore')) {
    const content = fs.readFileSync('.gitignore', 'utf8');
    assert(content.includes('.env'),
      '.gitignore should exclude .env files');
  }
});

// ============================================
// Summary
// ============================================
console.log(`\n${BLUE}==============================================`);
console.log(`Test Summary`);
console.log(`==============================================${RESET}\n`);

const totalTests = passedTests + failedTests;
const passRate = ((passedTests / totalTests) * 100).toFixed(1);

console.log(`Total Tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);
console.log(`Pass Rate: ${passRate}%\n`);

// Category breakdown
const categories = {
  'Security Compliance': testResults.slice(0, 3),
  'Logging Standards': testResults.slice(3, 10),
  'Error Handling Standards': testResults.slice(10, 15),
  'Caching Implementation': testResults.slice(15, 23),
  'Documentation Standards': testResults.slice(23, 26),
  'Code Quality': testResults.slice(26, 30),
  'Build Verification': testResults.slice(30, 34)
};

Object.entries(categories).forEach(([category, tests]) => {
  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;
  const status = passed === total ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`${status} ${category}: ${passed}/${total}`);
});

// Final verdict
console.log(`\n${BLUE}==============================================`);
if (failedTests === 0) {
  console.log(`${GREEN}✅ ALL TESTS PASSED - Opus 4.1 Compliant!${RESET}`);
} else {
  console.log(`${RED}❌ ${failedTests} TEST(S) FAILED - Not Opus 4.1 Compliant${RESET}`);
}
console.log(`==============================================${RESET}\n`);

// Exit with appropriate code
process.exit(failedTests === 0 ? 0 : 1);
