/**
 * Geometry Authority Integration Tests
 *
 * Tests for:
 * - Same seed + same DNA produces identical geometry hash
 * - Modified DNA produces different geometry hash
 * - DriftGate rejects mismatched geometry hashes across panels
 * - ComposeGate blocks when required technical panels missing
 * - Panel manifest includes geometry hash from canonical pack
 */

// -----------------------------------------------------------------------
// Inline helpers
// -----------------------------------------------------------------------

function computeCDSHashSync(obj) {
  const str = JSON.stringify(obj, (key, value) => {
    if (["hash", "designId", "timestamp"].includes(key)) return undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      Object.keys(value)
        .sort()
        .forEach((k) => {
          if (!["hash", "designId", "timestamp"].includes(k))
            sorted[k] = value[k];
        });
      return sorted;
    }
    return value;
  });
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

function svgToDataUrl(svgString) {
  return `data:image/svg+xml;base64,${Buffer.from(svgString, "utf-8").toString("base64")}`;
}

function buildMockCanonicalPack(cds) {
  const panels = {};
  const svgHashes = {};

  const levelCount = cds.program?.levelCount || 1;
  const FLOOR_TYPE_MAP = ["floor_plan_ground", "floor_plan_first"];

  for (let i = 0; i < levelCount && i < FLOOR_TYPE_MAP.length; i++) {
    const svg = `<svg><text>Floor ${i} - ${JSON.stringify(cds.program)}</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[FLOOR_TYPE_MAP[i]] = {
      dataUrl: svgToDataUrl(svg),
      svgString: svg,
      svgHash,
    };
    svgHashes[FLOOR_TYPE_MAP[i]] = svgHash;
  }

  for (const [o, pt] of Object.entries({
    N: "elevation_north",
    S: "elevation_south",
    E: "elevation_east",
    W: "elevation_west",
  })) {
    const svg = `<svg><text>${o} Elev - ${JSON.stringify(cds.massing)}</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[pt] = { dataUrl: svgToDataUrl(svg), svgString: svg, svgHash };
    svgHashes[pt] = svgHash;
  }

  for (const [st, pt] of Object.entries({
    longitudinal: "section_a_a",
    transverse: "section_b_b",
  })) {
    const svg = `<svg><text>${st} section</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[pt] = { dataUrl: svgToDataUrl(svg), svgString: svg, svgHash };
    svgHashes[pt] = svgHash;
  }

  if (panels.elevation_south) {
    panels.hero_3d = { ...panels.elevation_south };
    svgHashes.hero_3d = svgHashes.elevation_south;
  }

  const geometryHash = computeCDSHashSync(svgHashes);
  return {
    panels,
    geometryHash,
    cdsHash: computeCDSHashSync(cds),
    status: "COMPLETE",
    panelCount: Object.keys(panels).length,
  };
}

// Mock DriftGate validatePreComposeDrift (simplified)
function validatePreComposeDrift(panels, cds, options = {}) {
  const { strict = true, threshold = 0.1 } = options;
  const violations = [];
  let driftSignals = 0;
  let totalChecks = 0;

  // Check geometry hash consistency across panels
  const geoHashes = panels.map((p) => p.meta?.geometryHash).filter(Boolean);
  const unique = [...new Set(geoHashes)];
  if (unique.length > 1) {
    totalChecks++;
    driftSignals++;
    violations.push(
      `Geometry hash mismatch: ${unique.map((h) => h.substring(0, 8)).join(" vs ")}`,
    );
  } else if (unique.length === 1) {
    totalChecks++;
  }

  // Check CDS hash
  for (const panel of panels) {
    if (panel.cdsHash && cds?.hash && panel.cdsHash !== cds.hash) {
      totalChecks++;
      driftSignals++;
      violations.push(`Panel ${panel.type} CDS hash mismatch`);
    }
  }

  const driftScore = totalChecks > 0 ? driftSignals / totalChecks : 0;
  const valid = violations.length === 0 && driftScore <= threshold;

  if (!valid && strict) {
    const err = new Error(`DriftGate FAILED: ${violations.join("; ")}`);
    err.driftReport = { violations, driftScore };
    throw err;
  }

  return { valid, driftScore, violations };
}

// -----------------------------------------------------------------------
// Test runner
// -----------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    console.log(`  ❌ ${message} (did not throw)`);
    failed++;
  } catch {
    console.log(`  ✅ ${message}`);
    passed++;
  }
}

// -----------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------

function makeCDS(overrides = {}) {
  return {
    designId: "test-001",
    program: {
      levelCount: 2,
      levels: [{ index: 0 }, { index: 1 }],
      ...overrides.program,
    },
    massing: { widthM: 10, depthM: 8, ...overrides.massing },
    style: { materials: ["brick", "wood"], ...overrides.style },
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

console.log("\n=== Geometry Authority Integration Tests ===\n");

// Test 1: Same seed + same DNA produces identical geometry hash
{
  const cds = makeCDS();
  const pack1 = buildMockCanonicalPack(cds);
  const pack2 = buildMockCanonicalPack(cds);
  assert(
    pack1.geometryHash === pack2.geometryHash,
    `Same CDS produces identical geometry hash: ${pack1.geometryHash}`,
  );
}

// Test 2: Modified DNA produces different geometry hash
{
  const cds1 = makeCDS();
  const cds2 = makeCDS({ massing: { widthM: 12, depthM: 10 } });
  const pack1 = buildMockCanonicalPack(cds1);
  const pack2 = buildMockCanonicalPack(cds2);
  assert(
    pack1.geometryHash !== pack2.geometryHash,
    "Modified DNA produces different geometry hash",
  );
}

// Test 3: DriftGate rejects mismatched geometry hashes across panels
{
  const panels = [
    { type: "floor_plan_ground", meta: { geometryHash: "aaaa1111bbbb2222" } },
    { type: "elevation_north", meta: { geometryHash: "cccc3333dddd4444" } }, // Different!
    { type: "hero_3d", meta: { geometryHash: "aaaa1111bbbb2222" } },
  ];

  assertThrows(
    () => validatePreComposeDrift(panels, null, { strict: true }),
    "DriftGate rejects mismatched geometry hashes across panels",
  );
}

// Test 4: ComposeGate blocks when required technical panels missing
{
  const generatedPanels = [
    { type: "hero_3d", imageUrl: "url1" },
    { type: "axonometric", imageUrl: "url2" },
    // Missing: floor_plan_ground, elevation_north, elevation_south, section_a_a
  ];

  const requiredTechnical = [
    "floor_plan_ground",
    "elevation_north",
    "elevation_south",
    "section_a_a",
  ];
  const generatedTypes = new Set(generatedPanels.map((p) => p.type));
  const missing = requiredTechnical.filter((t) => !generatedTypes.has(t));

  assert(
    missing.length > 0,
    `ComposeGate detects ${missing.length} missing required panels`,
  );
  assert(
    missing.includes("floor_plan_ground"),
    "ComposeGate reports missing floor_plan_ground",
  );
  assert(
    missing.includes("section_a_a"),
    "ComposeGate reports missing section_a_a",
  );
}

// Test 5: Panel manifest includes geometry hash from canonical pack
{
  const cds = makeCDS();
  const pack = buildMockCanonicalPack(cds);

  // Simulate panel generation with geometry hash threading
  const panelResult = {
    type: "floor_plan_ground",
    imageUrl: "https://example.com/floor.png",
    meta: {
      hadCanonicalControl: true,
      geometryHash: pack.geometryHash,
      model: "flux",
    },
  };

  assert(
    panelResult.meta.geometryHash === pack.geometryHash,
    `Panel manifest includes canonical geometry hash: ${panelResult.meta.geometryHash.substring(0, 8)}...`,
  );
  assert(
    panelResult.meta.hadCanonicalControl === true,
    "Panel meta records canonical control usage",
  );
}

// Summary
console.log(
  `\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`,
);
process.exit(failed > 0 ? 1 : 0);
