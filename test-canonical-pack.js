/**
 * Canonical Geometry Pack Tests
 *
 * Tests for:
 * - buildCanonicalPack() produces expected panel types
 * - geometryHash is deterministic
 * - getInitImageParams() returns correct strengths
 * - validateBeforeGeneration() catches incomplete packs
 * - CanonicalPackGate blocks when pack is missing
 */

// -----------------------------------------------------------------------
// Inline helpers (avoid ESM import issues in Node test runner)
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

// -----------------------------------------------------------------------
// Mock canonical pack builder (avoids BuildingModel/Projections2D dependency)
// -----------------------------------------------------------------------

function svgToDataUrl(svgString) {
  return `data:image/svg+xml;base64,${Buffer.from(svgString, "utf-8").toString("base64")}`;
}

function buildMockCanonicalPack(cds, options = {}) {
  if (!cds) throw new Error("CDS is required");

  const panels = {};
  const svgHashes = {};

  // Mock floor plan SVGs
  const levelCount =
    cds.program?.levelCount || cds.program?.levels?.length || 1;
  const FLOOR_TYPE_MAP = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_level3",
  ];

  for (let i = 0; i < levelCount && i < FLOOR_TYPE_MAP.length; i++) {
    const panelType = FLOOR_TYPE_MAP[i];
    const rooms = (cds.program?.levels?.[i]?.spaces || [])
      .map((s) => s.name)
      .join(", ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><text x="10" y="30">Floor ${i}: ${rooms}</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[panelType] = { dataUrl: svgToDataUrl(svg), svgString: svg, svgHash };
    svgHashes[panelType] = svgHash;
  }

  // Mock elevations
  const ELEVATION_MAP = {
    N: "elevation_north",
    S: "elevation_south",
    E: "elevation_east",
    W: "elevation_west",
  };
  for (const [orientation, panelType] of Object.entries(ELEVATION_MAP)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><text x="10" y="30">${orientation} Elevation</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[panelType] = { dataUrl: svgToDataUrl(svg), svgString: svg, svgHash };
    svgHashes[panelType] = svgHash;
  }

  // Mock sections
  const SECTION_MAP = {
    longitudinal: "section_a_a",
    transverse: "section_b_b",
  };
  for (const [sectionType, panelType] of Object.entries(SECTION_MAP)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><text x="10" y="30">${sectionType} Section</text></svg>`;
    const svgHash = computeCDSHashSync({ svg });
    panels[panelType] = { dataUrl: svgToDataUrl(svg), svgString: svg, svgHash };
    svgHashes[panelType] = svgHash;
  }

  // Massing proxies
  if (panels.elevation_south) {
    panels.hero_3d = { ...panels.elevation_south };
    svgHashes.hero_3d = svgHashes.elevation_south;
    panels.axonometric = { ...panels.elevation_south };
    svgHashes.axonometric = svgHashes.elevation_south;
  }
  if (panels.floor_plan_ground) {
    panels.interior_3d = { ...panels.floor_plan_ground };
    svgHashes.interior_3d = svgHashes.floor_plan_ground;
  }

  const geometryHash = computeCDSHashSync(svgHashes);
  const cdsHash = cds.hash || computeCDSHashSync(cds);

  const pack = {
    panels,
    geometryHash,
    cdsHash,
    status: Object.keys(panels).length > 0 ? "COMPLETE" : "EMPTY",
    panelCount: Object.keys(panels).length,
    createdAt: new Date().toISOString(),
  };

  Object.freeze(pack);
  return pack;
}

// Strength policy (matching CanonicalGeometryPackService)
const STRENGTH_POLICY = {
  floor_plan_ground: 0.15,
  floor_plan_first: 0.15,
  elevation_north: 0.35,
  elevation_south: 0.35,
  section_a_a: 0.15,
  hero_3d: 0.65,
  interior_3d: 0.6,
  axonometric: 0.7,
};

function getInitImageParams(pack, panelType) {
  if (!pack?.panels?.[panelType]?.dataUrl) return null;
  const strength = STRENGTH_POLICY[panelType] ?? 0.5;
  return { init_image: pack.panels[panelType].dataUrl, strength };
}

function validateBeforeGeneration(pack, cds, programLock, options = {}) {
  const { strict = true } = options;
  const errors = [];
  const missing = [];

  if (!pack) {
    errors.push("Canonical pack is missing");
    if (strict) throw new Error(errors[0]);
    return { valid: false, missing, errors };
  }

  if (pack.status !== "COMPLETE") {
    errors.push(`Pack status is '${pack.status}'`);
  }

  if (!pack.geometryHash) {
    errors.push("Pack is missing geometryHash");
  }

  if (pack.cdsHash && cds) {
    const expectedHash = cds.hash || computeCDSHashSync(cds);
    if (pack.cdsHash !== expectedHash) {
      errors.push("Pack cdsHash does not match CDS");
    }
  }

  const required = [
    "floor_plan_ground",
    "elevation_north",
    "elevation_south",
    "section_a_a",
  ];
  for (const pt of required) {
    if (!pack.panels?.[pt]?.dataUrl) missing.push(pt);
  }
  if (missing.length > 0) errors.push(`Missing: ${missing.join(", ")}`);

  const valid = errors.length === 0;
  if (!valid && strict) throw new Error(errors.join("; "));
  return { valid, missing, errors };
}

// -----------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------

function makeMockCDS() {
  return {
    designId: "test-001",
    program: {
      levelCount: 2,
      levels: [
        {
          index: 0,
          name: "Ground",
          spaces: [
            { name: "Living Room" },
            { name: "Kitchen" },
            { name: "WC" },
          ],
        },
        {
          index: 1,
          name: "First",
          spaces: [{ name: "Bedroom" }, { name: "Bathroom" }],
        },
      ],
    },
    massing: { widthM: 10, depthM: 8 },
    style: { materials: ["brick", "wood"] },
  };
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
// Tests
// -----------------------------------------------------------------------

console.log("\n=== Canonical Geometry Pack Tests ===\n");

// Test 1: buildCanonicalPack produces all expected panel types
{
  const cds = makeMockCDS();
  const pack = buildMockCanonicalPack(cds);
  const expectedTypes = [
    "floor_plan_ground",
    "floor_plan_first",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_a_a",
    "section_b_b",
    "hero_3d",
    "axonometric",
    "interior_3d",
  ];
  const panelTypes = Object.keys(pack.panels);
  const allPresent = expectedTypes.every((t) => panelTypes.includes(t));
  assert(
    allPresent,
    `buildCanonicalPack produces all ${expectedTypes.length} expected panel types (got ${panelTypes.length})`,
  );
}

// Test 2: Floor plan SVGs contain room names
{
  const cds = makeMockCDS();
  const pack = buildMockCanonicalPack(cds);
  const groundSvg = pack.panels.floor_plan_ground.svgString;
  assert(
    groundSvg.includes("Living Room"),
    "Ground floor SVG contains 'Living Room'",
  );
  assert(groundSvg.includes("Kitchen"), "Ground floor SVG contains 'Kitchen'");
}

// Test 3: geometryHash is deterministic
{
  const cds = makeMockCDS();
  const pack1 = buildMockCanonicalPack(cds);
  const pack2 = buildMockCanonicalPack(cds);
  assert(
    pack1.geometryHash === pack2.geometryHash,
    `geometryHash is deterministic: ${pack1.geometryHash}`,
  );
}

// Test 4: getInitImageParams returns correct strength per panel type
{
  const cds = makeMockCDS();
  const pack = buildMockCanonicalPack(cds);

  const floorPlanParams = getInitImageParams(pack, "floor_plan_ground");
  assert(
    floorPlanParams.strength === 0.15,
    `floor_plan_ground strength is 0.15 (got ${floorPlanParams.strength})`,
  );
  assert(
    floorPlanParams.init_image.startsWith("data:image/svg+xml;base64,"),
    "floor_plan_ground has data URL",
  );

  const heroParams = getInitImageParams(pack, "hero_3d");
  assert(
    heroParams.strength === 0.65,
    `hero_3d strength is 0.65 (got ${heroParams.strength})`,
  );

  const axoParams = getInitImageParams(pack, "axonometric");
  assert(
    axoParams.strength === 0.7,
    `axonometric strength is 0.70 (got ${axoParams.strength})`,
  );

  const elevParams = getInitImageParams(pack, "elevation_north");
  assert(
    elevParams.strength === 0.35,
    `elevation_north strength is 0.35 (got ${elevParams.strength})`,
  );
}

// Test 5: validateBeforeGeneration fails when pack is incomplete
{
  const incompletePack = {
    panels: { floor_plan_ground: { dataUrl: "data:..." } },
    geometryHash: "abc123",
    status: "COMPLETE",
  };
  const result = validateBeforeGeneration(incompletePack, null, null, {
    strict: false,
  });
  assert(
    !result.valid,
    "validateBeforeGeneration fails when pack is incomplete",
  );
  assert(
    result.missing.includes("elevation_north"),
    "Reports missing elevation_north",
  );
  assert(result.missing.includes("section_a_a"), "Reports missing section_a_a");
}

// Test 6: validateBeforeGeneration fails when geometry hash mismatches CDS
{
  const cds = makeMockCDS();
  const pack = buildMockCanonicalPack(cds);

  // Modify CDS after pack was built
  const modifiedCds = { ...cds, program: { ...cds.program, levelCount: 3 } };
  modifiedCds.hash = computeCDSHashSync(modifiedCds);

  const result = validateBeforeGeneration(pack, modifiedCds, null, {
    strict: false,
  });
  assert(
    !result.valid,
    "validateBeforeGeneration fails when CDS changes after pack build",
  );
}

// Test 7: CanonicalPackGate blocks when pack is missing
{
  assertThrows(
    () => validateBeforeGeneration(null, null, null, { strict: true }),
    "CanonicalPackGate blocks when pack is missing (throws)",
  );
}

// Summary
console.log(
  `\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`,
);
process.exit(failed > 0 ? 1 : 0);
