/**
 * Regression tests for compose-time cross-view image validation.
 *
 * Run with:
 *   node scripts/tests/test-cross-view-image-validator.mjs
 */

const results = { passed: 0, failed: 0 };

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function test(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    results.failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

async function createPngBuffer(svgMarkup) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default || sharpModule;
  return sharp(Buffer.from(svgMarkup)).png().toBuffer();
}

function buildHeroSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="#f5f1e8"/>
      <rect x="24" y="40" width="80" height="56" fill="#3f3f46"/>
      <polygon points="20,40 64,16 108,40" fill="#7c3aed"/>
      <rect x="36" y="54" width="16" height="16" fill="#f8fafc"/>
      <rect x="76" y="54" width="16" height="16" fill="#f8fafc"/>
      <rect x="58" y="68" width="12" height="28" fill="#a16207"/>
    </svg>
  `;
}

function buildSiteDiagramSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="#ffffff"/>
      <rect x="12" y="12" width="104" height="104" fill="none" stroke="#111827" stroke-width="3"/>
      <path d="M32 88 L32 48 L64 30 L96 48 L96 88 Z" fill="none" stroke="#111827" stroke-width="4"/>
      <path d="M24 104 L104 104" stroke="#059669" stroke-width="4"/>
      <path d="M104 104 L98 98 M104 104 L98 110" stroke="#059669" stroke-width="4" fill="none"/>
      <text x="18" y="26" font-size="10" fill="#111827">N</text>
    </svg>
  `;
}

function buildDifferentVisualSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="#020617"/>
      <circle cx="64" cy="64" r="40" fill="#0ea5e9"/>
      <path d="M18 110 L110 18" stroke="#facc15" stroke-width="10"/>
      <path d="M18 18 L110 110" stroke="#ef4444" stroke-width="10"/>
    </svg>
  `;
}

console.log("\n🧪 Cross-view image validator regression tests\n");

const { validateAllPanels } = await import(
  "../../src/services/validation/crossViewImageValidator.js"
);

const heroBuffer = await createPngBuffer(buildHeroSvg());
const siteDiagramBuffer = await createPngBuffer(buildSiteDiagramSvg());
const differentVisualBuffer = await createPngBuffer(buildDifferentVisualSvg());

await test("site_diagram is skipped from hero-image comparison", async () => {
  const result = await validateAllPanels({
    hero_3d: { buffer: heroBuffer, geometryHash: "geom-1" },
    site_diagram: { buffer: siteDiagramBuffer, geometryHash: "geom-1" },
  });

  assert(result.pass === true, "Expected validation to pass");
  assert(
    !result.failedPanels.some((panel) => panel.panelType === "site_diagram"),
    "site_diagram should not fail hero-image comparison",
  );
  assert(
    result.comparisons.some(
      (comparison) =>
        comparison.panelType === "site_diagram" && comparison.skipped === true,
    ),
    "site_diagram should be marked as skipped",
  );
});

await test("visual panels still fail when they diverge from hero_3d", async () => {
  const result = await validateAllPanels(
    {
      hero_3d: { buffer: heroBuffer, geometryHash: "geom-1" },
      axonometric: { buffer: differentVisualBuffer, geometryHash: "geom-1" },
    },
    {
      thresholds: {
        maxPHashDistance: 1,
        minCombinedSimilarity: 0.95,
      },
    },
  );

  assert(result.pass === false, "Expected divergent axonometric view to fail");
  assert(
    result.failedPanels.some((panel) => panel.panelType === "axonometric"),
    "axonometric should remain a blocking visual comparison",
  );
});

await test("geometry hash mismatches still block composition", async () => {
  const result = await validateAllPanels({
    hero_3d: { buffer: heroBuffer, geometryHash: "geom-1" },
    site_diagram: { buffer: siteDiagramBuffer, geometryHash: "geom-2" },
  });

  assert(result.pass === false, "Expected geometry hash mismatch to fail");
  assert(
    result.failedPanels.some((panel) => panel.panelType === "all"),
    "hash mismatch should still fail closed before visual comparison",
  );
});

console.log(
  `\nResult: ${results.passed} passed, ${results.failed} failed`,
);

if (results.failed > 0) {
  process.exit(1);
}
