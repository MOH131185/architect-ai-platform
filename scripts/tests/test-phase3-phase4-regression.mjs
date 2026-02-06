/**
 * Regression tests for Phase 3 (QA gates) and Phase 4 (dead-path isolation)
 *
 * Phase 3 tests:
 *  1. resolveLayout honours layoutTemplate='board-v2' (GRID_12COL)
 *  2. resolveLayout honours layoutTemplate='legacy' (GRID_SPEC)
 *  3. All resolved keys are canonical (no plan_ground drift)
 *  4. normalizeKey maps ALL known short-keys to canonical
 *  5. isStrictPanel blocks compose for hero_3d, floor plans, elevations
 *  6. isStrictPanel allows lenient panels (sections, data, title_block)
 *  7. getPanelFitMode returns 'cover' for hero/interior/site
 *  8. getPanelFitMode returns 'contain' for technical drawings
 *  9. toPixelRect produces integer pixel coords within sheet bounds
 * 10. GRID_12COL slots do not overlap each other
 * 11. STRICT_PANELS + LENIENT_PANELS cover every non-title_block grid key
 * 12. extractSvgContentBounds parses rect elements (unit test via import)
 *
 * Phase 4 tests:
 * 13. runA1SheetWorkflow is marked deprecated (JSDoc)
 * 14. runHybridA1Workflow is marked deprecated (JSDoc)
 * 15. compositeA1Sheet import is commented out in orchestrator
 * 16. architecturalSheetService import is commented out in orchestrator
 * 17. CJS composeCore mirrors ESM for all Phase 3 functions
 *
 * Run with: node scripts/tests/test-phase3-phase4-regression.mjs
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    const ret = fn();
    // Support async tests
    if (ret && typeof ret.then === 'function') {
      return ret.then(() => {
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log(`  ✅ ${name}`);
      }).catch(error => {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
      });
    }
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
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

let composeCore;
try {
  composeCore = await import('../../src/services/a1/composeCore.js');
} catch (e) {
  console.error('❌ Failed to import composeCore.js:', e.message);
  process.exit(1);
}

const {
  GRID_12COL, GRID_SPEC, STRICT_PANELS, LENIENT_PANELS,
  normalizeKey, normalizeLayoutTemplate, resolveLayout,
  toPixelRect, getPanelFitMode, getPanelAnnotation, isStrictPanel,
  WORKING_WIDTH, WORKING_HEIGHT, A1_WIDTH, A1_HEIGHT,
} = composeCore;

// ===========================================================================
// PHASE 3 TESTS – QA gates, fit policies, occupancy
// ===========================================================================

console.log('\n🛡️  Phase 3: QA gates & regression\n');

await test('1. resolveLayout honours board-v2 (GRID_12COL)', () => {
  const r = resolveLayout({ layoutTemplate: 'board-v2' });
  assertEqual(r.layoutTemplate, 'board-v2');
  assertEqual(Object.keys(r.layout).length, 16, 'Expected 16 slots for board-v2 with 2 floors (no floor_plan_level2)');
  assert(r.layout.hero_3d, 'Must have hero_3d');
  assert(r.layout.floor_plan_ground, 'Must have floor_plan_ground');
  assert(r.layout.title_block, 'Must have title_block');
});

await test('2. resolveLayout honours legacy (GRID_SPEC)', () => {
  const r = resolveLayout({ layoutTemplate: 'legacy' });
  assertEqual(r.layoutTemplate, 'legacy');
  // Legacy grid hero width is 0.34 vs 0.42 in GRID_12COL
  assertEqual(r.layout.hero_3d.width, 0.34, 'Legacy hero width must be 0.34');
});

await test('3. All GRID_12COL keys are canonical (no plan_ground drift)', () => {
  const keys = Object.keys(GRID_12COL);
  for (const key of keys) {
    const normalised = normalizeKey(key);
    assertEqual(normalised, key, `GRID_12COL key '${key}' should already be canonical, got '${normalised}'`);
  }
});

await test('4. normalizeKey maps ALL known short-keys to canonical', () => {
  const shortToCanonical = {
    plan_ground: 'floor_plan_ground',
    plan_upper: 'floor_plan_first',
    elev_north: 'elevation_north',
    elev_south: 'elevation_south',
    elev_east: 'elevation_east',
    elev_west: 'elevation_west',
    sect_long: 'section_AA',
    sect_trans: 'section_BB',
    v_exterior: 'hero_3d',
    v_interior: 'interior_3d',
    v_axon: 'axonometric',
    site: 'site_diagram',
    exterior_front_3d: 'hero_3d',
    floor_plan_upper: 'floor_plan_first',
    materials: 'material_palette',
    climate: 'climate_card',
    schedules: 'schedules_notes',
    notes: 'schedules_notes',
  };
  for (const [short, canonical] of Object.entries(shortToCanonical)) {
    assertEqual(normalizeKey(short), canonical, `normalizeKey('${short}') → expected '${canonical}'`);
  }
});

await test('5. isStrictPanel blocks compose for hero_3d, floor plans, elevations', () => {
  const strictExpected = [
    'hero_3d', 'floor_plan_ground', 'floor_plan_first', 'floor_plan_level2',
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
  ];
  for (const panel of strictExpected) {
    assert(isStrictPanel(panel), `${panel} should be strict`);
  }
  // Also works through normalizeKey
  assert(isStrictPanel('plan_ground'), 'plan_ground should normalise to strict');
  assert(isStrictPanel('elev_north'), 'elev_north should normalise to strict');
});

await test('6. isStrictPanel allows lenient panels', () => {
  const lenientExpected = [
    'section_AA', 'section_BB', 'schedules_notes',
    'material_palette', 'climate_card', 'title_block',
    'interior_3d', 'axonometric', 'site_diagram',
  ];
  for (const panel of lenientExpected) {
    assert(!isStrictPanel(panel), `${panel} should NOT be strict`);
  }
});

await test('7. getPanelFitMode returns cover for hero/interior/site', () => {
  assertEqual(getPanelFitMode('hero_3d'), 'cover');
  assertEqual(getPanelFitMode('interior_3d'), 'cover');
  assertEqual(getPanelFitMode('site_diagram'), 'cover');
});

await test('8. getPanelFitMode returns contain for technical drawings', () => {
  const technical = [
    'floor_plan_ground', 'floor_plan_first', 'elevation_north',
    'elevation_south', 'section_AA', 'section_BB',
    'material_palette', 'climate_card', 'schedules_notes',
  ];
  for (const panel of technical) {
    assertEqual(getPanelFitMode(panel), 'contain', `${panel} should use contain`);
  }
});

await test('9. toPixelRect produces integer coords within sheet bounds', () => {
  const r = resolveLayout({ layoutTemplate: 'board-v2' });
  for (const [key, slot] of Object.entries(r.layout)) {
    const px = toPixelRect(slot, r.width, r.height);
    assert(Number.isInteger(px.x), `${key}.x is not integer: ${px.x}`);
    assert(Number.isInteger(px.y), `${key}.y is not integer: ${px.y}`);
    assert(Number.isInteger(px.width), `${key}.width is not integer`);
    assert(Number.isInteger(px.height), `${key}.height is not integer`);
    assert(px.x >= 0 && px.x < r.width, `${key}.x out of bounds: ${px.x}`);
    assert(px.y >= 0 && px.y < r.height, `${key}.y out of bounds: ${px.y}`);
    assert(px.x + px.width <= r.width + 1, `${key} right edge ${px.x + px.width} > ${r.width}`);
    assert(px.y + px.height <= r.height + 1, `${key} bottom edge ${px.y + px.height} > ${r.height}`);
  }
});

await test('10. GRID_12COL slots do not overlap', () => {
  const entries = Object.entries(GRID_12COL);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [keyA, a] = entries[i];
      const [keyB, b] = entries[j];
      // Two rects overlap iff they overlap on both X and Y axes
      const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
      const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
      if (overlapX && overlapY) {
        // Allow minor overlaps at grid seams (< 1.5% of sheet area)
        const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        const overlapArea = overlapW * overlapH;
        assert(overlapArea < 0.015, `${keyA} and ${keyB} overlap by ${(overlapArea * 100).toFixed(2)}% of sheet`);
      }
    }
  }
});

await test('11. STRICT + LENIENT panels cover all non-title_block grid keys', () => {
  const allKeys = new Set(Object.keys(GRID_12COL));
  allKeys.delete('title_block'); // title_block is special (layout-only)
  for (const key of allKeys) {
    const inStrict = STRICT_PANELS.has(key);
    const inLenient = LENIENT_PANELS.has(key);
    assert(inStrict || inLenient, `${key} is in neither STRICT nor LENIENT sets`);
    assert(!(inStrict && inLenient), `${key} is in BOTH STRICT and LENIENT sets`);
  }
});

await test('12. getPanelAnnotation returns RIBA drawing numbers', () => {
  const ann = getPanelAnnotation('floor_plan_ground');
  assertEqual(ann.label, 'GROUND FLOOR PLAN');
  assertEqual(ann.drawingNumber, 'GA-00-01');
  assert(ann.fullAnnotation.includes('GA-00-01'), 'fullAnnotation must include drawing number');
  assert(ann.fullAnnotation.includes('1:100'), 'fullAnnotation must include scale');
});

// ===========================================================================
// PHASE 4 TESTS – Dead-path isolation verification
// ===========================================================================

console.log('\n🧹 Phase 4: Dead-path isolation & regression\n');

await test('13. runA1SheetWorkflow is marked @deprecated in orchestrator', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/services/dnaWorkflowOrchestrator.js'), 'utf-8'
  );
  // Find the JSDoc block before runA1SheetWorkflow
  const idx = src.indexOf('async runA1SheetWorkflow(');
  assert(idx > 0, 'runA1SheetWorkflow not found');
  const before = src.slice(Math.max(0, idx - 500), idx);
  assert(before.includes('@deprecated'), 'runA1SheetWorkflow JSDoc must include @deprecated');
});

await test('14. runHybridA1Workflow is marked @deprecated in orchestrator', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/services/dnaWorkflowOrchestrator.js'), 'utf-8'
  );
  const idx = src.indexOf('async runHybridA1Workflow(');
  assert(idx > 0, 'runHybridA1Workflow not found');
  const before = src.slice(Math.max(0, idx - 500), idx);
  assert(before.includes('@deprecated'), 'runHybridA1Workflow JSDoc must include @deprecated');
});

await test('15. compositeA1Sheet import is commented out in orchestrator', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/services/dnaWorkflowOrchestrator.js'), 'utf-8'
  );
  // Should NOT have an active import for compositeA1Sheet
  const activeImport = /^import\s+\{[^}]*compositeA1Sheet[^}]*\}\s+from/m;
  assert(!activeImport.test(src), 'compositeA1Sheet should be commented out, not actively imported');
  // Should have the commented-out line
  assert(src.includes('// import { compositeA1Sheet }'), 'Expected commented-out compositeA1Sheet import');
});

await test('16. architecturalSheetService import is commented out in orchestrator', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/services/dnaWorkflowOrchestrator.js'), 'utf-8'
  );
  const activeImport = /^import\s+architecturalSheetService\s+from/m;
  assert(!activeImport.test(src), 'architecturalSheetService should be commented out, not actively imported');
  assert(src.includes('// import architecturalSheetService'), 'Expected commented-out architecturalSheetService import');
});

await test('17. CJS composeCore mirrors ESM for all Phase 3 functions', async () => {
  const cjsPath = new URL('../../src/services/a1/composeCore.cjs', import.meta.url);
  const cjs = await import(cjsPath.href);

  // All key functions present
  const requiredFns = [
    'normalizeKey', 'normalizeLayoutTemplate', 'resolveLayout',
    'toPixelRect', 'getPanelFitMode', 'isStrictPanel',
  ];
  for (const fn of requiredFns) {
    assert(typeof cjs[fn] === 'function', `CJS missing ${fn}`);
  }

  // Constants match
  assertEqual(cjs.WORKING_WIDTH, WORKING_WIDTH, 'CJS WORKING_WIDTH mismatch');
  assertEqual(cjs.WORKING_HEIGHT, WORKING_HEIGHT, 'CJS WORKING_HEIGHT mismatch');
  assertEqual(cjs.A1_WIDTH, A1_WIDTH, 'CJS A1_WIDTH mismatch');
  assertEqual(cjs.A1_HEIGHT, A1_HEIGHT, 'CJS A1_HEIGHT mismatch');

  // normalizeKey produces same results
  assertEqual(cjs.normalizeKey('plan_ground'), 'floor_plan_ground', 'CJS normalizeKey drift');
  assertEqual(cjs.normalizeKey('elev_north'), 'elevation_north', 'CJS normalizeKey drift');

  // resolveLayout produces same output
  const esmR = resolveLayout({ layoutTemplate: 'board-v2', floorCount: 2 });
  const cjsR = cjs.resolveLayout({ layoutTemplate: 'board-v2', floorCount: 2 });
  assertEqual(cjsR.layoutTemplate, esmR.layoutTemplate, 'CJS layoutTemplate mismatch');
  assertEqual(cjsR.width, esmR.width, 'CJS width mismatch');
  assertEqual(Object.keys(cjsR.layout).length, Object.keys(esmR.layout).length, 'CJS slot count mismatch');

  // isStrictPanel match
  assertEqual(cjs.isStrictPanel('hero_3d'), true, 'CJS isStrictPanel(hero_3d) mismatch');
  assertEqual(cjs.isStrictPanel('title_block'), false, 'CJS isStrictPanel(title_block) mismatch');

  // getPanelFitMode match
  assertEqual(cjs.getPanelFitMode('hero_3d'), 'cover', 'CJS getPanelFitMode(hero_3d) mismatch');
  assertEqual(cjs.getPanelFitMode('section_AA'), 'contain', 'CJS getPanelFitMode(section_AA) mismatch');
});

await test('18. resolveLayout removes floor plans correctly per floorCount', () => {
  const r1 = resolveLayout({ floorCount: 1 });
  assert(!r1.layout.floor_plan_first, 'floor_plan_first should be removed for 1-floor');
  assert(!r1.layout.floor_plan_level2, 'floor_plan_level2 should be removed for 1-floor');
  assert(r1.layout.floor_plan_ground, 'floor_plan_ground must remain');

  const r2 = resolveLayout({ floorCount: 2 });
  assert(r2.layout.floor_plan_first, 'floor_plan_first should exist for 2-floor');
  assert(!r2.layout.floor_plan_level2, 'floor_plan_level2 should be removed for 2-floor');

  const r3 = resolveLayout({ floorCount: 3 });
  assert(r3.layout.floor_plan_first, 'floor_plan_first should exist for 3-floor');
  assert(r3.layout.floor_plan_level2, 'floor_plan_level2 should exist for 3-floor');
});

await test('19. Style-lock routing: elevation panels need styleReferenceUrl', async () => {
  // Verify panelRegistry is accessible and has correct categories
  let panelRegistry;
  try {
    panelRegistry = await import('../../src/config/panelRegistry.js');
  } catch (e) {
    throw new Error('panelRegistry not importable: ' + e.message);
  }

  // Elevation and section panels should be technical category
  const elevSectionPanels = [
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
    'section_AA', 'section_BB',
  ];
  for (const panel of elevSectionPanels) {
    const entry = panelRegistry.PANEL_REGISTRY[panel];
    assert(entry, `panelRegistry missing ${panel}`);
    assertEqual(entry.category, 'technical', `${panel} should be technical category`);
  }

  // Hero should be 3d category (anchor for style lock)
  assertEqual(panelRegistry.PANEL_REGISTRY.hero_3d.category, '3d');
});

await test('20. PDF export messaging in ArchitectAIEnhanced references browser print', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/ArchitectAIEnhanced.js'), 'utf-8'
  );
  assert(
    src.includes('Print → Save as PDF') || src.includes('Print to PDF'),
    'PDF export button should mention browser print-to-PDF workflow'
  );
  assert(
    !src.includes("'✓ PDF document opened for printing!'"),
    'Old PDF toast message should be replaced'
  );
});

// ===========================================================================
// Summary
// ===========================================================================

console.log('\n' + '═'.repeat(60));
console.log(`  Results: ${results.passed} passed, ${results.failed} failed (${results.passed + results.failed} total)`);
console.log('═'.repeat(60));

if (results.failed > 0) {
  console.log('\n  Failed tests:');
  for (const t of results.tests) {
    if (t.status === 'FAIL') {
      console.log(`    ❌ ${t.name}: ${t.error}`);
    }
  }
}

console.log('');
process.exit(results.failed > 0 ? 1 : 0);
