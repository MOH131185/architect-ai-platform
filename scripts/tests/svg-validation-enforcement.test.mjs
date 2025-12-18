/**
 * SVG Validation Enforcement Test
 *
 * This test verifies that the SVG rasterization pipeline REJECTS thin/collapsed
 * SVG content instead of just logging warnings and continuing.
 *
 * BUG: rasterizeSVGToPNG currently logs warnings but doesn't throw when
 * validation fails, allowing thin elevations to pass through the pipeline.
 *
 * FIX: rasterizeSVGToPNG should throw an error when validation.valid === false
 *
 * Run: node scripts/tests/svg-validation-enforcement.test.mjs
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Helper to create file:// URLs for Windows compatibility
function toFileUrl(path) {
  return pathToFileURL(path).href;
}

// =============================================================================
// TEST UTILITIES
// =============================================================================

class TestRunner {
  constructor() {
    this.results = [];
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.push({ name, passed: true });
      console.log(`  PASS  ${name}`);
    } catch (error) {
      this.results.push({ name, passed: false, error: error.message });
      console.log(`  FAIL  ${name}: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const failed = this.results.filter(r => !r.passed);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS: ${passed}/${total} passed`);

    if (failed.length > 0) {
      console.log(`\nFailed tests:`);
      failed.forEach(f => {
        console.log(`  - ${f.name}: ${f.error}`);
      });
    }

    console.log(`${'='.repeat(60)}`);
    return passed === total;
  }
}

// =============================================================================
// TEST SVGs
// =============================================================================

// BAD SVG: Content is only 4px wide in a 1024px canvas (0.4% width)
// This represents the "thin elevation" bug
const THIN_ELEVATION_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="100%" height="100%" fill="white"/>
  <!-- Thin tower: only 4px wide -->
  <rect x="510" y="100" width="4" height="800" fill="black"/>
</svg>`;

// GOOD SVG: Content fills reasonable portion of canvas (80% width)
const GOOD_ELEVATION_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="1024" height="768">
  <rect width="100%" height="100%" fill="white"/>
  <!-- Good building: 800px wide, 500px tall -->
  <rect x="112" y="134" width="800" height="500" fill="none" stroke="black" stroke-width="2"/>
  <!-- Windows -->
  <rect x="200" y="200" width="100" height="150" fill="none" stroke="black"/>
  <rect x="400" y="200" width="100" height="150" fill="none" stroke="black"/>
  <rect x="600" y="200" width="100" height="150" fill="none" stroke="black"/>
</svg>`;

// COLLAPSED SVG: Content is smaller than minimum dimensions
const COLLAPSED_FLOOR_PLAN_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="100%" height="100%" fill="white"/>
  <!-- Collapsed: only 20x20px content -->
  <rect x="502" y="502" width="20" height="20" fill="black"/>
</svg>`;

// =============================================================================
// TESTS
// =============================================================================

async function runTests() {
  const runner = new TestRunner();

  console.log('\n' + '='.repeat(60));
  console.log('SVG VALIDATION ENFORCEMENT TEST');
  console.log('='.repeat(60) + '\n');
  console.log('Testing that SVGRasterizer rejects thin/collapsed content...\n');

  // Import modules dynamically
  let SVGRasterizer;
  try {
    SVGRasterizer = await import(toFileUrl(join(projectRoot, 'src/services/rendering/SVGRasterizer.js')));
  } catch (error) {
    console.error('Failed to import SVGRasterizer:', error.message);
    console.log('\nThis test requires the SVGRasterizer module to be available.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: validateSVGForRasterization correctly identifies thin content
  // ---------------------------------------------------------------------------
  await runner.test('validateSVGForRasterization detects thin elevation', async () => {
    const validation = SVGRasterizer.validateSVGForRasterization(THIN_ELEVATION_SVG, 'elevation_south');

    console.log(`    validation.valid: ${validation.valid}`);
    console.log(`    issues: ${JSON.stringify(validation.issues)}`);
    console.log(`    bounds: ${JSON.stringify(validation.bounds)}`);

    runner.assert(!validation.valid, 'Should detect thin elevation as invalid');
    runner.assert(validation.issues.length > 0, 'Should have validation issues');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: validateSVGForRasterization passes good content
  // ---------------------------------------------------------------------------
  await runner.test('validateSVGForRasterization passes good elevation', async () => {
    const validation = SVGRasterizer.validateSVGForRasterization(GOOD_ELEVATION_SVG, 'elevation_south');

    console.log(`    validation.valid: ${validation.valid}`);
    console.log(`    bounds: ${JSON.stringify(validation.bounds)}`);

    runner.assert(validation.valid, 'Should pass good elevation');
    runner.assert(validation.issues.length === 0, 'Should have no issues');
  });

  // ---------------------------------------------------------------------------
  // TEST 3: validateSVGForRasterization detects collapsed floor plan
  // ---------------------------------------------------------------------------
  await runner.test('validateSVGForRasterization detects collapsed floor plan', async () => {
    const validation = SVGRasterizer.validateSVGForRasterization(COLLAPSED_FLOOR_PLAN_SVG, 'floor_plan_ground');

    console.log(`    validation.valid: ${validation.valid}`);
    console.log(`    issues: ${JSON.stringify(validation.issues)}`);

    runner.assert(!validation.valid, 'Should detect collapsed floor plan as invalid');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: rasterizeSVGToPNG SHOULD throw on thin elevation (BUG TEST)
  // ---------------------------------------------------------------------------
  await runner.test('rasterizeSVGToPNG throws on thin elevation', async () => {
    let threwError = false;
    let errorMessage = '';

    try {
      // This SHOULD throw because the SVG is invalid
      await SVGRasterizer.rasterizeSVGToPNG(THIN_ELEVATION_SVG, 'elevation_south', {
        validate: true,
        throwOnValidationFailure: true, // This option may need to be added
      });
    } catch (error) {
      threwError = true;
      errorMessage = error.message;
    }

    console.log(`    threw error: ${threwError}`);
    console.log(`    error message: ${errorMessage || '(none)'}`);

    // BUG: Currently this test will FAIL because rasterizeSVGToPNG doesn't throw
    // FIX: Add throwOnValidationFailure option or always throw on invalid SVG
    runner.assert(threwError, 'rasterizeSVGToPNG should throw on invalid SVG (currently it just logs warnings - BUG!)');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: rasterizeSVGToPNG SHOULD throw on collapsed floor plan (BUG TEST)
  // ---------------------------------------------------------------------------
  await runner.test('rasterizeSVGToPNG throws on collapsed floor plan', async () => {
    let threwError = false;

    try {
      await SVGRasterizer.rasterizeSVGToPNG(COLLAPSED_FLOOR_PLAN_SVG, 'floor_plan_ground', {
        validate: true,
        throwOnValidationFailure: true,
      });
    } catch (error) {
      threwError = true;
    }

    // BUG: Currently this test will FAIL because rasterizeSVGToPNG doesn't throw
    runner.assert(threwError, 'rasterizeSVGToPNG should throw on collapsed floor plan (currently it just logs warnings - BUG!)');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: rasterizeSVGToPNG should succeed on good content
  // ---------------------------------------------------------------------------
  await runner.test('rasterizeSVGToPNG succeeds on good elevation', async () => {
    let succeeded = false;
    let errorMessage = '';

    try {
      const result = await SVGRasterizer.rasterizeSVGToPNG(GOOD_ELEVATION_SVG, 'elevation_south', {
        validate: true,
        throwOnValidationFailure: true,
      });
      succeeded = result && result.length > 0;
    } catch (error) {
      errorMessage = error.message;
    }

    console.log(`    succeeded: ${succeeded}`);
    if (errorMessage) console.log(`    error: ${errorMessage}`);

    runner.assert(succeeded, `rasterizeSVGToPNG should succeed on valid SVG: ${errorMessage}`);
  });

  // Print summary
  return runner.summary();
}

// =============================================================================
// MAIN
// =============================================================================

runTests()
  .then(success => {
    if (!success) {
      console.log('\n>>> EXPECTED: Tests 4 and 5 should FAIL until the bug is fixed <<<');
      console.log('>>> The bug is that rasterizeSVGToPNG logs warnings but does not throw <<<\n');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
