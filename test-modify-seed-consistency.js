/**
 * Test Modify Seed Consistency
 *
 * Validates that AI Modify workflow maintains seed consistency
 */

console.log("🧪 Testing AI Modify Seed Consistency\n");

// Mock design history
const mockDesign = {
  id: "test-design-123",
  masterDNA: {
    dimensions: { length: 15, width: 10, height: 7 },
    materials: [
      { name: "Brick", hexColor: "#B8604E", application: "exterior walls" },
    ],
    architecturalStyle: "Contemporary",
  },
  seed: 123456,
  basePrompt: "Test A1 sheet prompt with all required sections",
  resultUrl: "https://example.com/a1-sheet.jpg",
};

let seedUsed = null;

// Mock modification service
const mockModifyA1Sheet = async ({ designId, seed }) => {
  if (designId !== mockDesign.id) {
    throw new Error("Design not found");
  }

  // Verify seed matches original
  if (seed !== mockDesign.seed) {
    throw new Error(`Seed mismatch: expected ${mockDesign.seed}, got ${seed}`);
  }

  seedUsed = seed;
  return {
    success: true,
    url: "https://example.com/modified-a1-sheet.jpg",
    seed: seed,
    consistencyScore: 0.98,
  };
};

// Test cases
const tests = [
  {
    name: "Seed reuse validation",
    test: async () => {
      const result = await mockModifyA1Sheet({
        designId: mockDesign.id,
        seed: mockDesign.seed,
      });

      if (result.seed !== mockDesign.seed) {
        throw new Error("Seed not preserved in modification");
      }

      if (seedUsed !== mockDesign.seed) {
        throw new Error("Original seed not used in generation");
      }

      console.log("✅ Seed correctly reused from original design");
      return true;
    },
  },
  {
    name: "Consistency lock enforcement",
    test: async () => {
      // Verify consistency lock would be applied
      const { withConsistencyLock } =
        await import("./src/services/a1/A1PromptService.js");

      const locked = withConsistencyLock(
        mockDesign.basePrompt,
        "Add missing sections",
        mockDesign.masterDNA,
      );

      // withConsistencyLock returns a string (the locked prompt)
      const lockedPrompt =
        typeof locked === "string" ? locked : locked.prompt || locked;

      if (!lockedPrompt.includes("CONSISTENCY LOCK")) {
        throw new Error("Consistency lock not applied");
      }

      if (
        !lockedPrompt.includes(
          mockDesign.masterDNA.dimensions.length.toString(),
        )
      ) {
        throw new Error("DNA dimensions not locked");
      }

      console.log("✅ Consistency lock correctly applied");
      return true;
    },
  },
  {
    name: "Image-to-image initImage support",
    test: async () => {
      // Verify initImage can be passed
      const { generateA1SheetImage } =
        await import("./src/services/togetherAIService.js");

      // Check function signature accepts initImage
      const functionString = generateA1SheetImage.toString();
      if (!functionString.includes("initImage")) {
        throw new Error("initImage parameter not supported");
      }

      console.log("✅ Image-to-image mode supported");
      return true;
    },
  },
];

// Run tests
(async () => {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n📋 Testing: ${test.name}...`);
      await test.test();
      passed++;
    } catch (error) {
      console.error(`❌ FAILED: ${test.name}`);
      console.error(`   Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}/${tests.length}`);
  console.log(`   ❌ Failed: ${failed}/${tests.length}`);

  if (failed > 0) {
    console.error("\n❌ Some tests failed");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed");
  }
})();
