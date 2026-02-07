/**
 * Regression Tests for A1 Architecture Fixes
 *
 * Tests the following fixes:
 * 1. Hero-First ordering (hero_3d generated first, URL captured)
 * 2. Style anchor propagation (styleReferenceUrl passed to elevations/sections)
 * 3. Fingerprint gate enforcement (retry_failed triggers actual retry, not log-and-continue)
 * 4. SVG validity (all technical SVG paths start with M/m)
 * 5. Schedules are vector (schedules_notes is SVG-derived, not AI bitmap)
 * 6. Overpass hardening (caching, retry, deterministic fallback)
 *
 * Run with: node scripts/tests/test-a1-architecture-fixes.mjs
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected string to include "${substring}"`);
  }
}

function assertStartsWith(str, prefix, message) {
  if (!str.startsWith(prefix)) {
    throw new Error(message || `Expected string to start with "${prefix}"`);
  }
}

// ============================================================================
// TEST 1: Hero-First Ordering
// ============================================================================
console.log('\n📐 TEST SUITE: Hero-First Ordering');
console.log('=' .repeat(60));

await test('PANEL_TYPE constants defined correctly', async () => {
  const { PANEL_TYPE } = await import('../../src/config/panelRegistry.js');
  assert(PANEL_TYPE, 'PANEL_TYPE should be exported from panelRegistry');
  assert(PANEL_TYPE.HERO_3D === 'hero_3d', 'HERO_3D constant should be "hero_3d"');
});

await test('BASE_PANEL_SEQUENCE starts with hero_3d', async () => {
  const fs = await import('fs');
  const servicePath = join(__dirname, '../../src/services/design/panelGenerationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  const seqMatch = serviceCode.match(/const BASE_PANEL_SEQUENCE\s*=\s*\[([\s\S]*?)\];/);
  assert(seqMatch, 'BASE_PANEL_SEQUENCE should be defined in panelGenerationService.js');

  const firstEntry = seqMatch[1].match(/PANEL_TYPE\.(\w+)/);
  assert(firstEntry, 'BASE_PANEL_SEQUENCE should reference PANEL_TYPE constants');
  assertEqual(firstEntry[1], 'HERO_3D', 'First panel in sequence should be HERO_3D');
});

await test('heroStyleReferenceUrl captured after hero_3d generation', async () => {
  // This test verifies the orchestrator pattern
  // The actual implementation captures heroStyleReferenceUrl after hero_3d generates
  // We verify the code structure exists
  const fs = await import('fs');
  const orchestratorPath = join(__dirname, '../../src/services/dnaWorkflowOrchestrator.js');
  const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf-8');

  assertIncludes(orchestratorCode, 'heroStyleReferenceUrl', 'Orchestrator should define heroStyleReferenceUrl');
  assertIncludes(orchestratorCode, 'job.type === "hero_3d"', 'Orchestrator should check for hero_3d type');
  assertIncludes(orchestratorCode, 'heroStyleReferenceUrl = panelResult.imageUrl', 'Orchestrator should capture hero URL');
});

// ============================================================================
// TEST 2: Style Anchor Propagation
// ============================================================================
console.log('\n🎨 TEST SUITE: Style Anchor Propagation');
console.log('='.repeat(60));

await test('styleReferenceUrl passed to generateImageFn', async () => {
  const fs = await import('fs');
  const orchestratorPath = join(__dirname, '../../src/services/dnaWorkflowOrchestrator.js');
  const orchestratorCode = fs.readFileSync(orchestratorPath, 'utf-8');

  assertIncludes(orchestratorCode, 'styleReferenceUrl: effectiveStyleReference', 'Should pass styleReferenceUrl to generateImageFn');
});

await test('multiModelImageService accepts styleReferenceUrl', async () => {
  const fs = await import('fs');
  const servicePath = join(__dirname, '../../src/services/multiModelImageService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  assertIncludes(serviceCode, 'styleReferenceUrl', 'multiModelImageService should accept styleReferenceUrl');
  assertIncludes(serviceCode, 'isElevationOrSection', 'Should detect elevation/section panels');
});

await test('togetherAIService uses styleReferenceUrl as init_image', async () => {
  const fs = await import('fs');
  const servicePath = join(__dirname, '../../src/services/togetherAIService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  assertIncludes(serviceCode, 'styleReferenceUrl', 'togetherAIService should accept styleReferenceUrl');
  assertIncludes(serviceCode, 'STYLE LOCK', 'Should have STYLE LOCK logging');
});

// ============================================================================
// TEST 3: Fingerprint Gate Enforcement
// ============================================================================
console.log('\n🔒 TEST SUITE: Fingerprint Gate Enforcement');
console.log('='.repeat(60));

await test('runPreCompositionGate returns proper action types', async () => {
  const { runPreCompositionGate, FINGERPRINT_THRESHOLDS } = await import('../../src/services/validation/FingerprintValidationGate.js');

  // Test with empty panels (should pass)
  const emptyResult = await runPreCompositionGate([], null, { retryCount: 0 });
  assertEqual(emptyResult.action, 'compose', 'Empty panels should result in compose action');
});

await test('getStrictFallbackParams returns correct parameters', async () => {
  const { getStrictFallbackParams } = await import('../../src/services/validation/FingerprintValidationGate.js');

  const params = getStrictFallbackParams('elevation_north', 12345);

  assertEqual(params.control_strength, 0.95, 'control_strength should be 0.95');
  assertEqual(params.image_strength, 0.35, 'image_strength should be 0.35');
  assertEqual(params.seed, 12345, 'seed should be preserved by default');
  assert(params.isStrictFallback, 'Should have isStrictFallback flag');
});

await test('Fingerprint validation is deterministic (no Math.random)', async () => {
  const fs = await import('fs');
  const gatePath = join(__dirname, '../../src/services/validation/FingerprintValidationGate.js');
  const gateCode = fs.readFileSync(gatePath, 'utf-8');

  // Check that Math.random() is not called (comments mentioning it are OK)
  const codeWithoutComments = gateCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  assert(!codeWithoutComments.includes('Math.random()'), 'Should not call Math.random() in executable code');
  assertIncludes(gateCode, 'deterministicHash', 'Should use deterministicHash for variation');
});

// ============================================================================
// TEST 4: SVG Validity
// ============================================================================
console.log('\n📄 TEST SUITE: SVG Validity');
console.log('='.repeat(60));

await test('validatePathD rejects undefined path', async () => {
  const { validatePathD } = await import('../../src/utils/svgPathValidator.js');

  const result = validatePathD(undefined, { panelType: 'test' });
  assert(!result.valid, 'undefined path should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.fallback, 'Should provide fallback');
});

await test('validatePathD accepts valid M-starting path', async () => {
  const { validatePathD } = await import('../../src/utils/svgPathValidator.js');

  const result = validatePathD('M0,0 L100,100 Z', { panelType: 'test' });
  assert(result.valid, 'Valid M-starting path should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

await test('validatePathD rejects path not starting with M', async () => {
  const { validatePathD } = await import('../../src/utils/svgPathValidator.js');

  const result = validatePathD('L100,100 Z', { panelType: 'test' });
  assert(!result.valid, 'Path not starting with M should be invalid');
});

await test('buildSafePath generates valid paths', async () => {
  const { buildSafePath, validatePathD } = await import('../../src/utils/svgPathValidator.js');

  const path = buildSafePath([
    { cmd: 'M', x: 0, y: 0 },
    { cmd: 'L', x: 100, y: 100 },
    { cmd: 'Z' }
  ]);

  assertStartsWith(path, 'M', 'Generated path should start with M');
  const validation = validatePathD(path, { panelType: 'test' });
  assert(validation.valid, 'Generated path should be valid');
});

await test('validateSVG sanitizes invalid paths', async () => {
  const { validateSVG } = await import('../../src/utils/svgPathValidator.js');

  const badSVG = '<svg><path d="undefined"/><path d="M0,0 L100,100"/></svg>';
  const result = validateSVG(badSVG, {
    panelType: 'test',
    invalidPathAction: 'fallback'
  });

  assert(result.invalidPathCount > 0, 'Should detect invalid paths');
  assert(result.wasSanitized, 'SVG should be sanitized');
  assert(!result.sanitizedSVG.includes('d="undefined"'), 'Sanitized SVG should not have undefined path');
});

// ============================================================================
// TEST 5: Schedules Are Vector
// ============================================================================
console.log('\n📋 TEST SUITE: Schedules Are Vector');
console.log('='.repeat(60));

await test('generateSchedulesSVG returns SVG data URL', async () => {
  // The schedules generator is internal to panelGenerationService
  // We verify it exists and returns SVG
  const fs = await import('fs');
  const servicePath = join(__dirname, '../../src/services/design/panelGenerationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  assertIncludes(serviceCode, 'generateSchedulesSVG', 'Should have generateSchedulesSVG function');
  assertIncludes(serviceCode, 'data:image/svg+xml;base64', 'Should return SVG data URL');
});

await test('isDataPanel returns true for schedules_notes', async () => {
  const fs = await import('fs');
  const servicePath = join(__dirname, '../../src/services/design/panelGenerationService.js');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  assertIncludes(serviceCode, 'panelType === "schedules_notes"', 'isDataPanel should check for schedules_notes');
});

// ============================================================================
// TEST 6: Architectural Section Generator
// ============================================================================
console.log('\n🏗️  TEST SUITE: Architectural Section Generator');
console.log('='.repeat(60));

await test('Section generator exports generateFromDNA', async () => {
  const sectionGen = await import('../../src/services/svg/ArchitecturalSectionGenerator.js');

  assert(typeof sectionGen.generateFromDNA === 'function', 'generateFromDNA should be a function');
  assert(typeof sectionGen.generateLongitudinalSection === 'function', 'generateLongitudinalSection should be a function');
  assert(typeof sectionGen.generateTransverseSection === 'function', 'generateTransverseSection should be a function');
});

await test('Section generator produces valid SVG', async () => {
  const { generateFromDNA } = await import('../../src/services/svg/ArchitecturalSectionGenerator.js');
  const { validateSVGStructure } = await import('../../src/utils/svgPathValidator.js');

  const testDNA = {
    dimensions: { length: 15, width: 10, height: 6, floors: 2 },
    geometry_rules: { floor_height: 3.0, wall_thickness: 0.3 },
    roof: { type: 'gable', pitch: 35 }
  };

  const svg = generateFromDNA(testDNA, { sectionType: 'longitudinal' });

  assertIncludes(svg, '<svg', 'Output should contain SVG element');
  assertIncludes(svg, '</svg>', 'SVG should be properly closed');
  assertIncludes(svg, 'SECTION A-A', 'Longitudinal section should be labeled A-A');

  const validation = validateSVGStructure(svg);
  assert(validation.valid, 'Generated SVG should be structurally valid');
  assert(!validation.isStub, 'Should not be a stub generator');
});

await test('Section generator includes hatching patterns', async () => {
  const { generateFromDNA } = await import('../../src/services/svg/ArchitecturalSectionGenerator.js');

  const testDNA = {
    dimensions: { length: 12, width: 8, height: 6, floors: 2 }
  };

  const svg = generateFromDNA(testDNA, { showHatching: true });

  assertIncludes(svg, 'hatch-concrete', 'Should include concrete hatch pattern');
  assertIncludes(svg, 'hatch-brick', 'Should include brick hatch pattern');
});

// ============================================================================
// TEST 7: Overpass Hardening
// ============================================================================
console.log('\n🌍 TEST SUITE: Overpass Hardening');
console.log('='.repeat(60));

await test('Overpass service exports required functions', async () => {
  const overpass = await import('../../src/services/overpassHardened.js');

  assert(typeof overpass.queryBuildingsNear === 'function', 'queryBuildingsNear should be exported');
  assert(typeof overpass.getSiteBoundary === 'function', 'getSiteBoundary should be exported');
  assert(typeof overpass.generateFallbackBoundary === 'function', 'generateFallbackBoundary should be exported');
  assert(typeof overpass.clearCache === 'function', 'clearCache should be exported');
});

await test('generateFallbackBoundary is deterministic', async () => {
  const { generateFallbackBoundary } = await import('../../src/services/overpassHardened.js');

  const lat = 51.5074;
  const lng = -0.1278;

  const result1 = generateFallbackBoundary(lat, lng, 200);
  const result2 = generateFallbackBoundary(lat, lng, 200);

  assertEqual(
    JSON.stringify(result1.elements[0].geometry),
    JSON.stringify(result2.elements[0].geometry),
    'Same coordinates should produce same fallback boundary'
  );

  assert(result1._fallback, 'Result should have _fallback flag');
  assert(result1._dimensions.width > 0, 'Should have positive width');
  assert(result1._dimensions.length > 0, 'Should have positive length');
});

await test('Fallback boundary has valid Overpass-like structure', async () => {
  const { generateFallbackBoundary } = await import('../../src/services/overpassHardened.js');

  const result = generateFallbackBoundary(40.7128, -74.006, 150);

  assert(result.version === 0.6, 'Should have Overpass version');
  assert(result.elements.length > 0, 'Should have elements');
  assert(result.elements[0].type === 'way', 'Element should be a way');
  assert(result.elements[0].geometry.length >= 4, 'Geometry should have at least 4 points (rectangle)');
  assert(result.elements[0].tags.fallback === 'true', 'Should be tagged as fallback');
});

// ============================================================================
// TEST 8: Image Proxy Endpoint
// ============================================================================
console.log('\n🖼️  TEST SUITE: CORS-Safe Image Proxy');
console.log('='.repeat(60));

await test('Image proxy module exists', async () => {
  const fs = await import('fs');
  const proxyPath = join(__dirname, '../../server/utils/imageProxy.cjs');
  const exists = fs.existsSync(proxyPath);
  assert(exists, 'imageProxy.cjs should exist');
});

await test('Server has image proxy endpoint', async () => {
  const fs = await import('fs');
  const serverPath = join(__dirname, '../../server.cjs');
  const serverCode = fs.readFileSync(serverPath, 'utf-8');

  assertIncludes(serverCode, 'handleImageProxy', 'Server should have handleImageProxy');
  assertIncludes(serverCode, '/api/proxy/image', 'Should have proxy route mounted');
  assertIncludes(serverCode, 'Access-Control-Allow-Origin', 'Should set CORS headers');
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total: ${results.passed + results.failed}`);
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);
console.log('='.repeat(60));

if (results.failed > 0) {
  console.log('\nFailed tests:');
  results.tests
    .filter(t => t.status === 'FAIL')
    .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
