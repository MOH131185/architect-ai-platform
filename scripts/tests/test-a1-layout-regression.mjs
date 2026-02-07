/**
 * A1 Layout & Aspect Contract Regression Tests
 *
 * Tests Phases 1-4 fixes:
 * 1. Layout alias normalization (uk-riba-standard → board-v2)
 * 2. Slot completeness (all 17 slots present in GRID_12COL)
 * 3. Aspect contract (getSlotDimensions returns non-square for rectangular slots)
 * 4. Fit policy SSOT (PANEL_FIT_POLICY covers every GRID_12COL slot)
 * 5. A1BoardSpec ghost removed from compose endpoint
 * 6. A1GridSpec12Column re-exports composeCore GRID_12COL (not independent copy)
 * 7. SCALE_TO_FILL_CONFIG removed from compose endpoint
 * 8. Dead path deprecation markers present
 *
 * Run with: node scripts/tests/test-a1-layout-regression.mjs
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "../..");

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  \u2705 ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  \u274c ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  \u2705 ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  \u274c ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ============================================================================
// 1. Layout alias normalization
// ============================================================================
console.log("\n\ud83d\udcca TEST 1: Layout Alias Normalization");
console.log("=".repeat(60));

await testAsync("normalizeLayoutTemplate maps all aliases to board-v2", async () => {
  const { normalizeLayoutTemplate } = await import(
    "../../src/services/a1/composeCore.js"
  );
  const aliases = ["uk-riba-standard", "uk-riba", "riba", "board_v2", "default", ""];
  for (const alias of aliases) {
    assertEqual(
      normalizeLayoutTemplate(alias),
      "board-v2",
      `"${alias}" should map to "board-v2"`,
    );
  }
});

await testAsync("normalizeLayoutTemplate maps legacy aliases to legacy", async () => {
  const { normalizeLayoutTemplate } = await import(
    "../../src/services/a1/composeCore.js"
  );
  for (const legacy of ["legacy", "grid-spec", "grid_spec", "v1"]) {
    assertEqual(
      normalizeLayoutTemplate(legacy),
      "legacy",
      `"${legacy}" should map to "legacy"`,
    );
  }
});

// ============================================================================
// 2. Slot completeness
// ============================================================================
console.log("\n\ud83d\udcca TEST 2: Slot Completeness");
console.log("=".repeat(60));

const EXPECTED_SLOTS = [
  "hero_3d", "interior_3d", "axonometric", "site_diagram",
  "material_palette", "climate_card",
  "floor_plan_ground", "floor_plan_first", "floor_plan_level2",
  "elevation_north", "elevation_south", "elevation_east", "elevation_west",
  "section_AA", "section_BB", "schedules_notes", "title_block",
];

await testAsync("GRID_12COL has all 17 required slots", async () => {
  const { GRID_12COL } = await import("../../src/services/a1/composeCore.js");
  const keys = Object.keys(GRID_12COL);
  for (const slot of EXPECTED_SLOTS) {
    assert(keys.includes(slot), `Missing slot: ${slot}`);
  }
  assertEqual(keys.length, 17, `Expected 17 slots, got ${keys.length}`);
});

await testAsync("resolveLayout board-v2 returns all slots for 3-floor", async () => {
  const { resolveLayout } = await import("../../src/services/a1/composeCore.js");
  const { layout, layoutTemplate } = resolveLayout({
    layoutTemplate: "uk-riba-standard",
    floorCount: 3,
  });
  assertEqual(layoutTemplate, "board-v2");
  for (const slot of EXPECTED_SLOTS) {
    assert(layout[slot], `Missing slot in resolved layout: ${slot}`);
  }
});

await testAsync("resolveLayout removes floor_plan_level2 for 2-floor", async () => {
  const { resolveLayout } = await import("../../src/services/a1/composeCore.js");
  const { layout } = resolveLayout({ floorCount: 2 });
  assert(layout.floor_plan_ground, "floor_plan_ground present");
  assert(layout.floor_plan_first, "floor_plan_first present");
  assertEqual(layout.floor_plan_level2, undefined, "floor_plan_level2 removed for 2-floor");
});

// ============================================================================
// 3. Aspect contract
// ============================================================================
console.log("\n\ud83d\udcca TEST 3: Aspect Contract (getSlotDimensions)");
console.log("=".repeat(60));

await testAsync("hero_3d slot produces landscape dimensions", async () => {
  const { getSlotDimensions } = await import("../../src/services/a1/composeCore.js");
  const hero = getSlotDimensions("hero_3d");
  assert(hero.width > hero.height, `hero_3d should be landscape: ${hero.width}x${hero.height}`);
  assert(hero.aspect > 1.4, `hero_3d aspect ${hero.aspect} should be > 1.4`);
});

await testAsync("elevation_north produces non-square landscape", async () => {
  const { getSlotDimensions } = await import("../../src/services/a1/composeCore.js");
  const elev = getSlotDimensions("elevation_north");
  assert(elev.width > elev.height, `elevation should be landscape: ${elev.width}x${elev.height}`);
  assert(elev.width !== elev.height, "elevation should not be square");
});

await testAsync("material_palette produces portrait dimensions", async () => {
  const { getSlotDimensions } = await import("../../src/services/a1/composeCore.js");
  const mat = getSlotDimensions("material_palette");
  assert(mat.height > mat.width, `material_palette should be portrait: ${mat.width}x${mat.height}`);
});

await testAsync("All dimensions are multiples of 64", async () => {
  const { getSlotDimensions } = await import("../../src/services/a1/composeCore.js");
  for (const slot of EXPECTED_SLOTS) {
    const { width, height } = getSlotDimensions(slot);
    assertEqual(width % 64, 0, `${slot} width ${width} not a multiple of 64`);
    assertEqual(height % 64, 0, `${slot} height ${height} not a multiple of 64`);
  }
});

await testAsync("Unknown panel returns safe 1024x1024 square", async () => {
  const { getSlotDimensions } = await import("../../src/services/a1/composeCore.js");
  const unknown = getSlotDimensions("nonexistent_panel");
  assertEqual(unknown.width, 1024);
  assertEqual(unknown.height, 1024);
  assertEqual(unknown.aspect, 1);
});

// ============================================================================
// 4. Fit policy SSOT
// ============================================================================
console.log("\n\ud83d\udcca TEST 4: Fit Policy SSOT");
console.log("=".repeat(60));

await testAsync("PANEL_FIT_POLICY covers every GRID_12COL slot", async () => {
  const { GRID_12COL, PANEL_FIT_POLICY } = await import(
    "../../src/services/a1/composeCore.js"
  );
  for (const slot of Object.keys(GRID_12COL)) {
    const mode = PANEL_FIT_POLICY[slot];
    assert(
      mode === "cover" || mode === "contain",
      `Missing or invalid fit policy for ${slot}: ${mode}`,
    );
  }
});

await testAsync("getPanelFitMode returns cover only for photorealistic panels", async () => {
  const { getPanelFitMode } = await import("../../src/services/a1/composeCore.js");
  assertEqual(getPanelFitMode("hero_3d"), "cover");
  assertEqual(getPanelFitMode("interior_3d"), "cover");
  assertEqual(getPanelFitMode("site_diagram"), "cover");
  assertEqual(getPanelFitMode("floor_plan_ground"), "contain");
  assertEqual(getPanelFitMode("elevation_north"), "contain");
  assertEqual(getPanelFitMode("section_AA"), "contain");
  assertEqual(getPanelFitMode("material_palette"), "contain");
});

// ============================================================================
// 5. A1BoardSpec ghost removed
// ============================================================================
console.log("\n\ud83d\udcca TEST 5: A1BoardSpec Ghost Removed");
console.log("=".repeat(60));

test("compose.js has no getA1BoardSpecModule function", () => {
  const content = readFileSync(join(repoRoot, "api/a1/compose.js"), "utf-8");
  assert(
    !content.includes("async function getA1BoardSpecModule"),
    "getA1BoardSpecModule function should be removed",
  );
});

test("compose.js has no getBoardSpec function", () => {
  const content = readFileSync(join(repoRoot, "api/a1/compose.js"), "utf-8");
  assert(
    !content.includes("async function getBoardSpec"),
    "getBoardSpec function should be removed",
  );
});

// ============================================================================
// 6. A1GridSpec12Column re-exports composeCore
// ============================================================================
console.log("\n\ud83d\udcca TEST 6: A1GridSpec12Column Re-exports composeCore");
console.log("=".repeat(60));

await testAsync("A1GridSpec12Column GRID_12COL matches composeCore", async () => {
  const composeCore = await import("../../src/services/a1/composeCore.js");
  const gridSpec = await import("../../src/services/a1/A1GridSpec12Column.js");
  const coreKeys = Object.keys(composeCore.GRID_12COL).sort();
  const specKeys = Object.keys(gridSpec.GRID_12COL).sort();
  assertEqual(
    JSON.stringify(coreKeys),
    JSON.stringify(specKeys),
    "Keys should match",
  );
  // Verify coordinates match for hero_3d
  assertEqual(
    gridSpec.GRID_12COL.hero_3d.width,
    composeCore.GRID_12COL.hero_3d.width,
    "hero_3d width should match",
  );
});

// ============================================================================
// 7. SCALE_TO_FILL_CONFIG removed
// ============================================================================
console.log("\n\ud83d\udcca TEST 7: SCALE_TO_FILL_CONFIG Removed");
console.log("=".repeat(60));

test("compose.js has no SCALE_TO_FILL_CONFIG object", () => {
  const content = readFileSync(join(repoRoot, "api/a1/compose.js"), "utf-8");
  assert(
    !content.includes("const SCALE_TO_FILL_CONFIG = {"),
    "SCALE_TO_FILL_CONFIG object should be removed",
  );
});

test("compose.js uses composeCoreGetPanelFitMode", () => {
  const content = readFileSync(join(repoRoot, "api/a1/compose.js"), "utf-8");
  assert(
    content.includes("composeCoreGetPanelFitMode"),
    "Should import composeCoreGetPanelFitMode from composeCore",
  );
});

// ============================================================================
// 8. Dead path deprecation markers
// ============================================================================
console.log("\n\ud83d\udcca TEST 8: Dead Path Deprecation Markers");
console.log("=".repeat(60));

test("design/dnaWorkflowOrchestrator.js has @deprecated marker", () => {
  const content = readFileSync(
    join(repoRoot, "src/services/design/dnaWorkflowOrchestrator.js"),
    "utf-8",
  );
  assert(content.includes("@deprecated"), "Should have @deprecated JSDoc tag");
  assert(content.includes("DEAD CODE"), "Should mention DEAD CODE");
});

test("sheetLayoutConfig.js has @deprecated marker for compose path", () => {
  const content = readFileSync(
    join(repoRoot, "src/config/sheetLayoutConfig.js"),
    "utf-8",
  );
  assert(content.includes("@deprecated"), "Should have @deprecated JSDoc tag");
  assert(
    content.includes("composeCore.js"),
    "Should reference composeCore as SSOT",
  );
});

test("multiModelImageService has style coherence gate", () => {
  const content = readFileSync(
    join(repoRoot, "src/services/multiModelImageService.js"),
    "utf-8",
  );
  assert(
    content.includes("STYLE GATE"),
    "Should have STYLE GATE blocking unstyled SDXL fallback",
  );
});

// ============================================================================
// Summary
// ============================================================================
console.log("\n" + "=".repeat(60));
console.log("A1 LAYOUT REGRESSION TEST SUMMARY");
console.log("=".repeat(60));
console.log(`Total:  ${results.passed + results.failed}`);
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);
console.log("=".repeat(60));

if (results.failed > 0) {
  console.log("\nFailed tests:");
  results.tests
    .filter((t) => t.status === "FAIL")
    .forEach((t) => console.log(`  - ${t.name}: ${t.error}`));
  process.exit(1);
} else {
  console.log("\n\u2705 All tests passed!");
  process.exit(0);
}
