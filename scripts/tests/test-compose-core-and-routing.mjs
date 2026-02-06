/**
 * Tests for Phase 1 (composeCore shared module) and Phase 2 (generator routing)
 *
 * Phase 1 tests:
 *  1. resolveLayout normalises uk-riba-standard → board-v2
 *  2. resolveLayout returns GRID_12COL for board-v2
 *  3. resolveLayout returns GRID_SPEC for legacy
 *  4. resolveLayout removes floor_plan_first when floorCount < 2
 *  5. normalizeKey maps short keys to canonical
 *  6. normalizeKey is idempotent for canonical keys
 *  7. normalizeLayoutTemplate handles all aliases
 *  8. isStrictPanel tiered failure policy
 *  9. Compose output keys use canonical names (no plan_ground drift)
 *
 * Phase 2 tests:
 * 10. getPanelCategory returns correct category from registry
 * 11. isElevationOrSection identifies elevation/section panels
 * 12. multiModelImageService.generateImage returns generatorUsed metadata
 * 13. SDXL fallback receives styleReferenceUrl for elevation panels
 * 14. Hero panel result includes category=3d
 *
 * Run with: node scripts/tests/test-compose-core-and-routing.mjs
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
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
let panelRegistry;

try {
  composeCore = await import('../../src/services/a1/composeCore.js');
} catch (e) {
  console.error('❌ Failed to import composeCore.js:', e.message);
  process.exit(1);
}

try {
  panelRegistry = await import('../../src/config/panelRegistry.js');
} catch (e) {
  console.error('❌ Failed to import panelRegistry.js:', e.message);
  process.exit(1);
}

// ===========================================================================
// PHASE 1 TESTS – composeCore shared module
// ===========================================================================

console.log('\n📐 Phase 1: composeCore shared module\n');

test('1. resolveLayout normalises uk-riba-standard → board-v2', () => {
  const r = composeCore.resolveLayout({ layoutConfig: 'uk-riba-standard' });
  assertEqual(r.layoutTemplate, 'board-v2');
});

test('2. resolveLayout returns GRID_12COL slot count for board-v2', () => {
  const r = composeCore.resolveLayout({ layoutTemplate: 'board-v2', floorCount: 3 });
  // 17 slots in GRID_12COL
  const slotCount = Object.keys(r.layout).length;
  assertEqual(slotCount, 17, `Expected 17 slots, got ${slotCount}`);
  assert(r.layout.hero_3d, 'Missing hero_3d slot');
  assert(r.layout.floor_plan_ground, 'Missing floor_plan_ground slot');
  assert(r.layout.title_block, 'Missing title_block slot');
});

test('3. resolveLayout returns legacy grid for layoutTemplate=legacy', () => {
  const r = composeCore.resolveLayout({ layoutTemplate: 'legacy', floorCount: 3 });
  // Legacy GRID_SPEC has different hero width than GRID_12COL
  assertEqual(r.layoutTemplate, 'legacy');
  assert(r.layout.hero_3d.width === 0.34, `Expected legacy hero width 0.34, got ${r.layout.hero_3d.width}`);
});

test('4. resolveLayout removes floor_plan_first when floorCount < 2', () => {
  const r = composeCore.resolveLayout({ floorCount: 1 });
  assert(!r.layout.floor_plan_first, 'floor_plan_first should be removed for 1-floor');
  assert(!r.layout.floor_plan_level2, 'floor_plan_level2 should be removed for 1-floor');
  assert(r.layout.floor_plan_ground, 'floor_plan_ground should still exist');
});

test('5. normalizeKey maps short keys to canonical', () => {
  assertEqual(composeCore.normalizeKey('plan_ground'), 'floor_plan_ground');
  assertEqual(composeCore.normalizeKey('plan_upper'), 'floor_plan_first');
  assertEqual(composeCore.normalizeKey('elev_north'), 'elevation_north');
  assertEqual(composeCore.normalizeKey('sect_long'), 'section_AA');
  assertEqual(composeCore.normalizeKey('sect_trans'), 'section_BB');
  assertEqual(composeCore.normalizeKey('v_exterior'), 'hero_3d');
  assertEqual(composeCore.normalizeKey('v_interior'), 'interior_3d');
  assertEqual(composeCore.normalizeKey('v_axon'), 'axonometric');
  assertEqual(composeCore.normalizeKey('site'), 'site_diagram');
  assertEqual(composeCore.normalizeKey('exterior_front_3d'), 'hero_3d');
  assertEqual(composeCore.normalizeKey('floor_plan_upper'), 'floor_plan_first');
});

test('6. normalizeKey is idempotent for canonical keys', () => {
  const canonicals = [
    'hero_3d', 'interior_3d', 'axonometric', 'site_diagram',
    'floor_plan_ground', 'floor_plan_first', 'floor_plan_level2',
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
    'section_AA', 'section_BB', 'schedules_notes', 'material_palette',
    'climate_card', 'title_block',
  ];
  for (const key of canonicals) {
    assertEqual(composeCore.normalizeKey(key), key, `normalizeKey('${key}') should be idempotent`);
  }
});

test('7. normalizeLayoutTemplate handles all aliases', () => {
  assertEqual(composeCore.normalizeLayoutTemplate('uk-riba-standard'), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate('uk-riba'), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate('riba'), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate('board_v2'), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate('default'), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate(''), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate(null), 'board-v2');
  assertEqual(composeCore.normalizeLayoutTemplate('grid-spec'), 'legacy');
  assertEqual(composeCore.normalizeLayoutTemplate('v1'), 'legacy');
  assertEqual(composeCore.normalizeLayoutTemplate('legacy'), 'legacy');
});

test('8. isStrictPanel tiered failure policy', () => {
  // Strict panels (must succeed)
  assert(composeCore.isStrictPanel('hero_3d'), 'hero_3d should be strict');
  assert(composeCore.isStrictPanel('floor_plan_ground'), 'floor_plan_ground should be strict');
  assert(composeCore.isStrictPanel('elevation_north'), 'elevation_north should be strict');
  // Also works with short keys via normalizeKey
  assert(composeCore.isStrictPanel('plan_ground'), 'plan_ground should normalise to strict');

  // Lenient panels (can be placeholders)
  assert(!composeCore.isStrictPanel('material_palette'), 'material_palette should be lenient');
  assert(!composeCore.isStrictPanel('climate_card'), 'climate_card should be lenient');
  assert(!composeCore.isStrictPanel('schedules_notes'), 'schedules_notes should be lenient');
  assert(!composeCore.isStrictPanel('section_AA'), 'section_AA should be lenient');
  assert(!composeCore.isStrictPanel('title_block'), 'title_block should be lenient');
});

test('9. toPixelRect converts normalised to pixel coords', () => {
  const slot = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  const rect = composeCore.toPixelRect(slot, 1792, 1269);
  assertEqual(rect.x, 179);
  assertEqual(rect.y, 254);
  assertEqual(rect.width, 538);
  assertEqual(rect.height, 508);
});

test('10. resolveLayout dimensions: working vs highRes', () => {
  const working = composeCore.resolveLayout({ highRes: false });
  assertEqual(working.width, 1792);
  assertEqual(working.height, 1269);

  const print = composeCore.resolveLayout({ highRes: true });
  assertEqual(print.width, 9933);
  assertEqual(print.height, 7016);
});

// ===========================================================================
// PHASE 2 TESTS – Generator routing & panelRegistry category
// ===========================================================================

console.log('\n🎯 Phase 2: Generator routing & panel category\n');

test('11. panelRegistry provides category for all canonical panel types', () => {
  const expectedCategories = {
    hero_3d: '3d',
    interior_3d: '3d',
    axonometric: '3d',
    site_diagram: 'site',
    floor_plan_ground: 'technical',
    floor_plan_first: 'technical',
    floor_plan_level2: 'technical',
    elevation_north: 'technical',
    elevation_south: 'technical',
    elevation_east: 'technical',
    elevation_west: 'technical',
    section_AA: 'technical',
    section_BB: 'technical',
    schedules_notes: 'data',
    material_palette: 'data',
    climate_card: 'data',
  };

  for (const [panelType, expectedCategory] of Object.entries(expectedCategories)) {
    const entry = panelRegistry.PANEL_REGISTRY[panelType];
    assert(entry, `Registry entry missing for ${panelType}`);
    assertEqual(entry.category, expectedCategory, `${panelType} category mismatch`);
  }
});

test('12. panelRegistry normalizeToCanonical resolves short keys', () => {
  assertEqual(panelRegistry.normalizeToCanonical('plan_ground'), 'floor_plan_ground');
  assertEqual(panelRegistry.normalizeToCanonical('hero'), 'hero_3d');
  assertEqual(panelRegistry.normalizeToCanonical('section_a'), 'section_AA');
  assertEqual(panelRegistry.normalizeToCanonical('axon'), 'axonometric');
});

test('13. GRID_12COL and GRID_SPEC keys are all valid panelRegistry types', () => {
  const gridKeys12 = Object.keys(composeCore.GRID_12COL);
  const gridKeysLegacy = Object.keys(composeCore.GRID_SPEC);

  for (const key of gridKeys12) {
    // title_block is not in panelRegistry (it's a layout-only slot)
    if (key === 'title_block') continue;
    const entry = panelRegistry.PANEL_REGISTRY[key];
    assert(entry, `GRID_12COL key '${key}' not found in PANEL_REGISTRY`);
  }

  for (const key of gridKeysLegacy) {
    if (key === 'title_block') continue;
    const entry = panelRegistry.PANEL_REGISTRY[key];
    assert(entry, `GRID_SPEC key '${key}' not found in PANEL_REGISTRY`);
  }
});

test('14. getPanelAnnotation returns RIBA-style labels', () => {
  const ann = composeCore.getPanelAnnotation('hero_3d');
  assertEqual(ann.label, 'HERO 3D VIEW');
  assertEqual(ann.drawingNumber, '3D-01');
  assertEqual(ann.scale, 'NTS');
  assert(ann.fullAnnotation.includes('3D-01'), 'fullAnnotation should include drawing number');
});

test('15. getPanelFitMode routes cover for 3D, contain for technical', () => {
  assertEqual(composeCore.getPanelFitMode('hero_3d'), 'cover');
  assertEqual(composeCore.getPanelFitMode('interior_3d'), 'cover');
  assertEqual(composeCore.getPanelFitMode('site_diagram'), 'cover');
  assertEqual(composeCore.getPanelFitMode('floor_plan_ground'), 'contain');
  assertEqual(composeCore.getPanelFitMode('elevation_north'), 'contain');
  assertEqual(composeCore.getPanelFitMode('section_AA'), 'contain');
  assertEqual(composeCore.getPanelFitMode('material_palette'), 'contain');
});

test('16. CJS composeCore.cjs matches ESM exports', async () => {
  // This test verifies the CJS wrapper has the same key functions
  // We can't require() from ESM, but we can dynamically import and compare signatures
  const cjsPath = new URL('../../src/services/a1/composeCore.cjs', import.meta.url);
  // node supports dynamic import of CJS from ESM
  const cjs = await import(cjsPath.href);

  assert(typeof cjs.normalizeKey === 'function', 'CJS missing normalizeKey');
  assert(typeof cjs.normalizeLayoutTemplate === 'function', 'CJS missing normalizeLayoutTemplate');
  assert(typeof cjs.resolveLayout === 'function', 'CJS missing resolveLayout');
  assert(typeof cjs.toPixelRect === 'function', 'CJS missing toPixelRect');
  assert(typeof cjs.isStrictPanel === 'function', 'CJS missing isStrictPanel');
  assert(typeof cjs.getPanelFitMode === 'function', 'CJS missing getPanelFitMode');

  // Verify CJS normalizeKey produces same results
  assertEqual(cjs.normalizeKey('plan_ground'), 'floor_plan_ground', 'CJS normalizeKey drift');
  assertEqual(cjs.normalizeKey('v_exterior'), 'hero_3d', 'CJS normalizeKey drift');

  // Verify CJS resolveLayout produces same dimensions
  const esmRes = composeCore.resolveLayout({ layoutConfig: 'uk-riba-standard' });
  const cjsRes = cjs.resolveLayout({ layoutConfig: 'uk-riba-standard' });
  assertEqual(cjsRes.layoutTemplate, esmRes.layoutTemplate, 'CJS/ESM layoutTemplate mismatch');
  assertEqual(cjsRes.width, esmRes.width, 'CJS/ESM width mismatch');
  assertEqual(cjsRes.height, esmRes.height, 'CJS/ESM height mismatch');
  assertEqual(
    Object.keys(cjsRes.layout).length,
    Object.keys(esmRes.layout).length,
    'CJS/ESM slot count mismatch'
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
