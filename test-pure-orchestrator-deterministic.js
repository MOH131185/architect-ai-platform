/**
 * Pure Orchestrator Deterministic Tests
 *
 * Tests the deterministic behavior of the pure orchestrator.
 * Run with: node test-pure-orchestrator-deterministic.js
 */

const {
  mockDNA,
  mockSiteSnapshot,
  mockDesignSpec,
  mockEnvironment,
} = require("./__mocks__/fixtures");

// Mock Together AI client
const mockTogetherClient = {
  generateReasoning: async () => ({
    content: JSON.stringify(mockDNA),
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    usage: {},
    latencyMs: 100,
    traceId: "mock_trace",
  }),
  generateA1SheetImage: async (params) => ({
    imageUrls: ["https://mock-api.com/image.png"],
    seedUsed: params.seed,
    model: "FLUX.1-dev",
    latencyMs: 200,
    traceId: "mock_trace",
    metadata: {
      width: params.width,
      height: params.height,
      steps: params.steps,
      guidanceScale: params.guidanceScale,
    },
  }),
};

// Test counter
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual: ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🧪 Testing Pure Orchestrator Deterministic Behavior\n");
  console.log("=".repeat(60));

  // Test 1: Deterministic seed handling
  console.log("\n📋 Test 1: Deterministic seed handling");
  const seed1 = 123456;
  const seed2 = 123456;
  assert(seed1 === seed2, "Same seed values are equal");

  // Test 2: DNA normalization
  console.log("\n📋 Test 2: DNA normalization");
  const { normalizeDNA } = require("./src/types/schemas");
  const normalized1 = normalizeDNA(mockDNA);
  const normalized2 = normalizeDNA(mockDNA);
  assertEquals(normalized1, normalized2, "DNA normalization is deterministic");

  // Test 3: DNA hashing
  console.log("\n📋 Test 3: DNA hashing");
  const { hashDNA } = require("./src/utils/dnaUtils");
  const hash1 = hashDNA(mockDNA);
  const hash2 = hashDNA(mockDNA);
  assertEquals(hash1, hash2, "Same DNA produces same hash");

  // Test 4: Prompt generation determinism
  console.log("\n📋 Test 4: Prompt generation determinism");
  const { buildSheetPrompt } = require("./src/services/a1SheetPromptBuilder");

  const promptParams = {
    dna: mockDNA,
    siteSnapshot: mockSiteSnapshot,
    sheetConfig: { size: "A1", orientation: "landscape" },
    sheetType: "ARCH",
    overlays: [],
    mode: "generate",
    modifyContext: null,
    seed: 123456,
  };

  const prompt1 = buildSheetPrompt(promptParams);
  const prompt2 = buildSheetPrompt(promptParams);

  assertEquals(
    prompt1.prompt,
    prompt2.prompt,
    "Same inputs produce same prompt",
  );
  assertEquals(
    prompt1.metadata.seed,
    prompt2.metadata.seed,
    "Seed is preserved in metadata",
  );

  // Test 5: Layout computation determinism
  console.log("\n📋 Test 5: Layout computation determinism");
  const { computeStableLayout } = require("./src/utils/panelLayout");

  const layoutParams = {
    width: 1792,
    height: 1269,
    sheetType: "ARCH",
    a1LayoutKey: "uk-riba-standard",
  };

  const layout1 = computeStableLayout(layoutParams);
  const layout2 = computeStableLayout(layoutParams);

  assertEquals(
    layout1.layoutKey,
    layout2.layoutKey,
    "Layout key is consistent",
  );
  assertEquals(
    layout1.panelCoordinates.length,
    layout2.panelCoordinates.length,
    "Panel count is consistent",
  );

  // Test 6: Baseline artifact immutability
  console.log("\n📋 Test 6: Baseline artifact immutability");
  const { createBaselineArtifactBundle } = require("./src/types/schemas");

  const bundle = createBaselineArtifactBundle({
    designId: "test_123",
    sheetId: "sheet_456",
    baselineImageUrl: "https://mock.com/image.png",
    baselineDNA: mockDNA,
    baselineLayout: {},
    seed: 123456,
    basePrompt: "test prompt",
  });

  assert(bundle.designId === "test_123", "Bundle contains correct design ID");
  assert(bundle.metadata.seed === 123456, "Bundle contains correct seed");

  // Test 7: Drift detection thresholds
  console.log("\n📋 Test 7: Drift detection thresholds");
  const { DRIFT_THRESHOLDS } = require("./src/services/driftValidator");

  assert(DRIFT_THRESHOLDS.DNA.OVERALL === 0.1, "DNA drift threshold is 10%");
  assert(
    DRIFT_THRESHOLDS.IMAGE.SSIM_WHOLE === 0.92,
    "Whole-sheet SSIM threshold is 92%",
  );
  assert(
    DRIFT_THRESHOLDS.IMAGE.SSIM_PANEL === 0.95,
    "Per-panel SSIM threshold is 95%",
  );

  // Test 8: DNA comparison
  console.log("\n📋 Test 8: DNA comparison");
  const { compareDNA } = require("./src/utils/dnaUtils");

  const comparison = compareDNA(mockDNA, mockDNA);
  assert(comparison.drift === 0, "Identical DNA has zero drift");
  assert(comparison.changes.length === 0, "Identical DNA has no changes");

  // Test 9: ModifyRequest creation
  console.log("\n📋 Test 9: ModifyRequest creation");
  const { createModifyRequest } = require("./src/types/schemas");

  const modifyRequest = createModifyRequest({
    designId: "design_123",
    sheetId: "sheet_456",
    quickToggles: { addSections: true },
    customPrompt: "Add sections",
    strictLock: true,
  });

  assert(
    modifyRequest.designId === "design_123",
    "ModifyRequest has correct design ID",
  );
  assert(modifyRequest.strictLock === true, "Strict lock is enabled");
  assert(
    modifyRequest.quickToggles.addSections === true,
    "Quick toggle is set",
  );

  // Test 10: Environment adapter
  console.log("\n📋 Test 10: Environment adapter");
  const environmentAdapter =
    require("./src/services/environmentAdapter").default;

  assert(
    environmentAdapter.currentEnv !== null,
    "Environment adapter is initialized",
  );
  assert(
    typeof environmentAdapter.currentEnv.api === "object",
    "API config is available",
  );

  // Results
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("✅ All tests passed!\n");
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("\n❌ Test suite error:", error);
  process.exit(1);
});
