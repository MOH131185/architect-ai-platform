/**
 * Test Seed Derivation
 *
 * Verifies deterministic seed derivation for multi-panel generation
 */

import {
  derivePanelSeeds,
  derivePanelSeedsFromDNA,
  hashDNA,
} from "./src/services/seedDerivation.js";

console.log("\n🧪 ========================================");
console.log("🧪 SEED DERIVATION TESTS");
console.log("🧪 ========================================\n");

let passed = 0;
let failed = 0;

// Test 1: Deterministic index-based derivation
console.log("Test 1: Deterministic index-based seed derivation");
const baseSeed = 12345;
const panelKeys = [
  "hero_3d",
  "interior_3d",
  "floor_plan_ground",
  "elevation_north",
];

const seeds1 = derivePanelSeeds(baseSeed, panelKeys);
const seeds2 = derivePanelSeeds(baseSeed, panelKeys);

// Verify same input produces same output
const test1Pass = JSON.stringify(seeds1) === JSON.stringify(seeds2);
if (test1Pass) {
  console.log("✅ Test 1 PASSED: Same input produces same seeds");
  console.log("   Seeds:", seeds1);
  passed++;
} else {
  console.log("❌ Test 1 FAILED: Seeds differ between runs");
  console.log("   Run 1:", seeds1);
  console.log("   Run 2:", seeds2);
  failed++;
}

// Test 2: Verify formula (baseSeed + index * 137) % 1000000
console.log("\nTest 2: Verify index*137 formula");
const expectedSeeds = {
  hero_3d: (12345 + 0 * 137) % 1000000, // 12345
  interior_3d: (12345 + 1 * 137) % 1000000, // 12482
  floor_plan_ground: (12345 + 2 * 137) % 1000000, // 12619
  elevation_north: (12345 + 3 * 137) % 1000000, // 12756
};

const formulaMatch = Object.keys(expectedSeeds).every(
  (key) => seeds1[key] === expectedSeeds[key],
);
if (formulaMatch) {
  console.log("✅ Test 2 PASSED: Seeds match index*137 formula");
  console.log("   Expected:", expectedSeeds);
  console.log("   Actual:  ", seeds1);
  passed++;
} else {
  console.log("❌ Test 2 FAILED: Seeds do not match formula");
  console.log("   Expected:", expectedSeeds);
  console.log("   Actual:  ", seeds1);
  failed++;
}

// Test 3: Order matters
console.log("\nTest 3: Panel order affects seeds");
const orderedKeys = ["hero_3d", "interior_3d", "floor_plan_ground"];
const reversedKeys = ["floor_plan_ground", "interior_3d", "hero_3d"];

const orderedSeeds = derivePanelSeeds(baseSeed, orderedKeys);
const reversedSeeds = derivePanelSeeds(baseSeed, reversedKeys);

// hero_3d should have different seeds in different positions
const orderMatters = orderedSeeds.hero_3d !== reversedSeeds.hero_3d;
if (orderMatters) {
  console.log("✅ Test 3 PASSED: Panel order affects seed values");
  console.log("   hero_3d in position 0:", orderedSeeds.hero_3d);
  console.log("   hero_3d in position 2:", reversedSeeds.hero_3d);
  passed++;
} else {
  console.log("❌ Test 3 FAILED: Order does not affect seeds");
  failed++;
}

// Test 4: DNA hash stability
console.log("\nTest 4: DNA hash produces stable base seed");
const mockDNA = {
  dimensions: { length: 15, width: 10, height: 6.4, floors: 2 },
  materials: [
    { name: "Red brick", hexColor: "#B8604E" },
    { name: "Clay tiles", hexColor: "#8B4513" },
  ],
  architecturalStyle: "Contemporary",
  projectType: "residential",
};

const hash1 = hashDNA(mockDNA);
const hash2 = hashDNA(mockDNA);

if (hash1 === hash2 && hash1 >= 0 && hash1 <= 999999) {
  console.log("✅ Test 4 PASSED: DNA hash is stable and within range");
  console.log("   Hash:", hash1);
  passed++;
} else {
  console.log("❌ Test 4 FAILED: DNA hash unstable or out of range");
  console.log("   Hash 1:", hash1);
  console.log("   Hash 2:", hash2);
  failed++;
}

// Test 5: derivePanelSeedsFromDNA produces consistent results
console.log("\nTest 5: derivePanelSeedsFromDNA consistency");
const panelKeysForDNA = [
  "hero_3d",
  "floor_plan_ground",
  "elevation_north",
  "section_AA",
];

const dnaSeeds1 = derivePanelSeedsFromDNA(mockDNA, panelKeysForDNA);
const dnaSeeds2 = derivePanelSeedsFromDNA(mockDNA, panelKeysForDNA);

const test5Pass = JSON.stringify(dnaSeeds1) === JSON.stringify(dnaSeeds2);
if (test5Pass) {
  console.log("✅ Test 5 PASSED: derivePanelSeedsFromDNA is deterministic");
  console.log("   Seeds:", dnaSeeds1);
  passed++;
} else {
  console.log(
    "❌ Test 5 FAILED: derivePanelSeedsFromDNA produces different results",
  );
  console.log("   Run 1:", dnaSeeds1);
  console.log("   Run 2:", dnaSeeds2);
  failed++;
}

// Test 6: Seed values are within Together.ai range
console.log("\nTest 6: All seeds within Together.ai range (0-999999)");
const allSeeds = Object.values(seeds1);
const allInRange = allSeeds.every((seed) => seed >= 0 && seed <= 999999);

if (allInRange) {
  console.log("✅ Test 6 PASSED: All seeds within valid range");
  console.log("   Min:", Math.min(...allSeeds));
  console.log("   Max:", Math.max(...allSeeds));
  passed++;
} else {
  console.log("❌ Test 6 FAILED: Some seeds out of range");
  console.log("   Seeds:", allSeeds);
  failed++;
}

// Test 7: Large base seed wraps correctly
console.log("\nTest 7: Large base seed wraps correctly");
const largeSeed = 999900;
const wrappedSeeds = derivePanelSeeds(largeSeed, [
  "panel1",
  "panel2",
  "panel3",
]);
const allWrappedInRange = Object.values(wrappedSeeds).every(
  (seed) => seed >= 0 && seed <= 999999,
);

if (allWrappedInRange) {
  console.log("✅ Test 7 PASSED: Large seeds wrap correctly");
  console.log("   Base:", largeSeed);
  console.log("   Derived:", wrappedSeeds);
  passed++;
} else {
  console.log("❌ Test 7 FAILED: Wrapping failed");
  console.log("   Seeds:", wrappedSeeds);
  failed++;
}

// Summary
console.log("\n🧪 ========================================");
console.log(`🧪 RESULTS: ${passed}/${passed + failed} tests passed`);
console.log("🧪 ========================================\n");

if (failed > 0) {
  console.error(`❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("✅ All tests passed!");
  process.exit(0);
}
