/**
 * P0 Gates - Definition of Done Tests
 *
 * TC-PROG-001: Single-level program (100% ground floor)
 * TC-PROG-002: Two-level program with locked spaces
 * TC-DRIFT-003: 3 modify iterations without volumetric drift
 *
 * Run: node test-p0-gates.js
 */

// ===================================================================
// Shims for browser-only APIs (sessionStorage, crypto)
// ===================================================================
if (typeof sessionStorage === "undefined") {
  global.sessionStorage = {
    _store: {},
    getItem(k) {
      return this._store[k] || null;
    },
    setItem(k, v) {
      this._store[k] = v;
    },
    removeItem(k) {
      delete this._store[k];
    },
    clear() {
      this._store = {};
    },
  };
}

// ===================================================================
// Imports (CommonJS-compatible dynamic import)
// ===================================================================
let buildProgramLock,
  getSpacesForLevel,
  getLevels,
  validatePanelPlanAgainstLock;
let buildCDSSync, verifyCDSSync;
let computeCDSHashSync;
let validateProgramLock, validatePanelsAgainstProgram, validateBeforeCompose;
let validateModifyDrift;

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

async function loadModules() {
  // Use dynamic import for ES modules
  const plm = await import("./src/services/validation/programLockSchema.js");
  buildProgramLock = plm.buildProgramLock;
  getSpacesForLevel = plm.getSpacesForLevel;
  getLevels = plm.getLevels;
  validatePanelPlanAgainstLock = plm.validatePanelPlanAgainstLock;

  const cdsm =
    await import("./src/services/validation/CanonicalDesignState.js");
  buildCDSSync = cdsm.buildCDSSync;
  verifyCDSSync = cdsm.verifyCDSSync;

  const hashm = await import("./src/services/validation/cdsHash.js");
  computeCDSHashSync = hashm.computeCDSHashSync;

  const pcg =
    await import("./src/services/validation/ProgramComplianceGate.js");
  validateProgramLock = pcg.validateProgramLock;
  validatePanelsAgainstProgram = pcg.validatePanelsAgainstProgram;
  validateBeforeCompose = pcg.validateBeforeCompose;

  const dg = await import("./src/services/validation/DriftGate.js");
  validateModifyDrift = dg.validateModifyDrift;
}

// ===================================================================
// TC-PROG-001: Single-level program (100% ground floor)
// ===================================================================
function TC_PROG_001() {
  console.log("\n📋 TC-PROG-001: Single-level program (100% ground floor)");
  console.log(
    "   Criteria: 0 violations, no upper floor panels, sections show 1 level",
  );

  // 1. Build a 1-level program lock
  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
    { name: "Bedroom", area: 18, floor: "ground" },
    { name: "Bathroom", area: 6, floor: "ground" },
    { name: "Hallway", area: 8, floor: "ground" },
  ];

  const lock = buildProgramLock(programSpaces, { floors: 1 });
  assert(lock.levelCount === 1, "ProgramLock levelCount = 1");
  assert(lock.spaces.length === 5, "ProgramLock has 5 spaces");
  assert(lock.hash && lock.hash.length > 0, "ProgramLock has hash");
  assert(
    lock.invariants.forbidUnexpectedLevels === true,
    "forbidUnexpectedLevels = true",
  );
  assert(
    lock.invariants.maxProgramViolations === 0,
    "maxProgramViolations = 0",
  );

  // 2. All spaces are on level 0
  const levels = getLevels(lock);
  assert(levels.length === 1 && levels[0] === 0, "Only level 0 exists");
  assert(getSpacesForLevel(lock, 1).length === 0, "No spaces on level 1");

  // 3. Validate DNA with 1 floor
  const masterDNA = {
    dimensions: {
      length: 15,
      width: 10,
      height: 3.2,
      floors: 1,
      floorCount: 1,
    },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
      { name: "Bedroom", floor: "ground" },
      { name: "Bathroom", floor: "ground" },
      { name: "Hallway", floor: "ground" },
    ],
  };

  const postDna = validateProgramLock(masterDNA, lock, { strict: false });
  assert(postDna.valid === true, "Post-DNA validation passes");
  assert(postDna.violations.length === 0, "Post-DNA: 0 violations");

  // 4. Panel plan should NOT include upper floor panels
  const validPanels = [
    { panelType: "floor_plan_ground" },
    { panelType: "hero_3d" },
    { panelType: "elevation_north" },
    { panelType: "section_AA" },
  ];
  const validResult = validatePanelPlanAgainstLock(lock, validPanels);
  assert(
    validResult.valid === true,
    "Valid panel plan accepted (no upper floors)",
  );

  // 5. Panel plan WITH upper floor panels should FAIL
  const invalidPanels = [
    { panelType: "floor_plan_ground" },
    { panelType: "floor_plan_first" }, // VIOLATION: no level 1 in lock
    { panelType: "hero_3d" },
  ];
  const invalidResult = validatePanelPlanAgainstLock(lock, invalidPanels);
  assert(
    invalidResult.valid === false,
    "Panel plan with floor_plan_first REJECTED for 1-level program",
  );
  assert(
    invalidResult.violations.length > 0,
    `Violations detected: ${invalidResult.violations[0]}`,
  );

  // 6. Post-render validation
  const postRender = validatePanelsAgainstProgram(
    validPanels.map((p) => ({ panelType: p.panelType, type: p.panelType })),
    lock,
    { strict: false },
  );
  assert(
    postRender.valid === true,
    "Post-render validation passes for valid panels",
  );

  const postRenderInvalid = validatePanelsAgainstProgram(
    invalidPanels.map((p) => ({ panelType: p.panelType, type: p.panelType })),
    lock,
    { strict: false },
  );
  assert(
    postRenderInvalid.valid === false,
    "Post-render validation FAILS for invalid panels",
  );

  // 7. Pre-compose validation with CDS
  const cds = buildCDSSync({
    designId: "test-001",
    seed: 42,
    masterDNA,
    programLock: lock,
  });
  assert(cds.hash && cds.hash.length > 0, "CDS has hash");
  assert(verifyCDSSync(cds), "CDS hash verifies");
  assert(cds.program.levelCount === 1, "CDS program levelCount = 1");

  const preCompose = validateBeforeCompose(
    validPanels.map((p) => ({ panelType: p.panelType, type: p.panelType })),
    lock,
    cds,
    { strict: false },
  );
  assert(preCompose.valid === true, "Pre-compose validation passes");
}

// ===================================================================
// TC-PROG-002: Two-level program with locked spaces
// ===================================================================
function TC_PROG_002() {
  console.log("\n📋 TC-PROG-002: Two-level program with locked spaces");
  console.log("   Criteria: Each locked space at correct level, 0 mismatch");

  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
    { name: "Hallway", area: 8, floor: "ground" },
    { name: "WC", area: 4, floor: "ground" },
    { name: "Master Bedroom", area: 20, floor: "first" },
    { name: "Bedroom 2", area: 14, floor: "first" },
    { name: "Family Bathroom", area: 8, floor: "first" },
  ];

  const lock = buildProgramLock(programSpaces, { floors: 2 });
  assert(lock.levelCount === 2, "ProgramLock levelCount = 2");
  assert(lock.spaces.length === 7, "ProgramLock has 7 spaces");

  // Verify level assignments
  const groundSpaces = getSpacesForLevel(lock, 0);
  const firstSpaces = getSpacesForLevel(lock, 1);
  assert(groundSpaces.length === 4, "4 spaces on ground floor");
  assert(firstSpaces.length === 3, "3 spaces on first floor");
  assert(
    groundSpaces.some((s) => s.name === "Living Room"),
    "Living Room on ground",
  );
  assert(
    firstSpaces.some((s) => s.name === "Master Bedroom"),
    "Master Bedroom on first",
  );

  // DNA with 2 floors
  const masterDNA = {
    dimensions: { length: 12, width: 8, height: 6.4, floors: 2, floorCount: 2 },
    materials: [{ name: "Stone", hexColor: "#A0A0A0" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
      { name: "Hallway", floor: "ground" },
      { name: "WC", floor: "ground" },
      { name: "Master Bedroom", floor: "first" },
      { name: "Bedroom 2", floor: "first" },
      { name: "Family Bathroom", floor: "first" },
    ],
  };

  const postDna = validateProgramLock(masterDNA, lock, { strict: false });
  assert(
    postDna.valid === true,
    "Post-DNA validation passes for 2-level program",
  );
  assert(postDna.violations.length === 0, "0 violations");

  // Valid panel plan
  const panels = [
    { panelType: "floor_plan_ground" },
    { panelType: "floor_plan_first" },
    { panelType: "hero_3d" },
    { panelType: "elevation_north" },
    { panelType: "section_AA" },
  ];

  const planResult = validatePanelPlanAgainstLock(lock, panels);
  assert(planResult.valid === true, "Panel plan with 2 floor plans accepted");

  // Invalid: 3rd floor plan for a 2-level program
  const invalidPanels = [
    ...panels,
    { panelType: "floor_plan_level2" }, // VIOLATION
  ];
  const invalidResult = validatePanelPlanAgainstLock(lock, invalidPanels);
  assert(
    invalidResult.valid === false,
    "Panel plan with floor_plan_level2 REJECTED for 2-level program",
  );

  // DNA that has wrong floor count should fail
  const wrongDNA = {
    ...masterDNA,
    dimensions: { ...masterDNA.dimensions, floors: 3, floorCount: 3 },
  };
  const wrongResult = validateProgramLock(wrongDNA, lock, { strict: false });
  assert(
    wrongResult.valid === false,
    "DNA with 3 floors fails for 2-level lock",
  );

  // CDS build and verify
  const cds = buildCDSSync({
    designId: "test-002",
    seed: 100,
    masterDNA,
    programLock: lock,
  });
  assert(cds.program.levelCount === 2, "CDS program levelCount = 2");
  assert(cds.program.levels.length === 2, "CDS has 2 program levels");
  assert(
    cds.program.levels[0].spaces.length === 4,
    "CDS ground level has 4 spaces",
  );
  assert(
    cds.program.levels[1].spaces.length === 3,
    "CDS first level has 3 spaces",
  );
}

// ===================================================================
// TC-DRIFT-003: 3 modify iterations without volumetric drift
// ===================================================================
function TC_DRIFT_003() {
  console.log(
    "\n📋 TC-DRIFT-003: 3 modify iterations without volumetric drift",
  );
  console.log(
    "   Criteria: seed stable, geometry hash identical, drift <= threshold",
  );

  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
    { name: "Bedroom", area: 18, floor: "first" },
    { name: "Bathroom", area: 8, floor: "first" },
  ];

  const lock = buildProgramLock(programSpaces, { floors: 2 });

  const masterDNA = {
    dimensions: { length: 12, width: 8, height: 6.4, floors: 2, floorCount: 2 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
      { name: "Bedroom", floor: "first" },
      { name: "Bathroom", floor: "first" },
    ],
  };

  const baseSeed = 42;

  // Build original CDS (iteration 0)
  const originalCDS = buildCDSSync({
    designId: "drift-test",
    seed: baseSeed,
    masterDNA,
    programLock: lock,
  });

  const originalGeometryHash = computeCDSHashSync(originalCDS.geometry);
  assert(originalCDS.hash.length > 0, "Original CDS has hash");

  // Simulate 3 modify iterations
  for (let iteration = 1; iteration <= 3; iteration++) {
    console.log(`\n  --- Modify iteration ${iteration} ---`);

    // Rebuild CDS with same DNA (modify only changes appearance, not structure)
    const modifiedCDS = buildCDSSync({
      designId: "drift-test",
      seed: baseSeed, // Same seed
      masterDNA, // Same DNA
      programLock: lock, // Same lock
    });

    const modifiedGeometryHash = computeCDSHashSync(modifiedCDS.geometry);

    // Check seed stability
    assert(
      modifiedCDS.seed === baseSeed,
      `Iteration ${iteration}: seed stable (${modifiedCDS.seed} === ${baseSeed})`,
    );

    // Check geometry hash stability
    assert(
      modifiedGeometryHash === originalGeometryHash,
      `Iteration ${iteration}: geometry hash identical`,
    );

    // Check CDS hash stability
    assert(
      modifiedCDS.hash === originalCDS.hash,
      `Iteration ${iteration}: CDS hash identical`,
    );

    // Run DriftGate
    const baseline = {
      cds: originalCDS,
      seed: baseSeed,
      geometryHash: originalGeometryHash,
      programLockHash: lock.hash,
    };

    const modified = {
      cds: modifiedCDS,
      seed: baseSeed,
      geometryHash: modifiedGeometryHash,
      programLockHash: lock.hash,
    };

    const driftResult = validateModifyDrift(baseline, modified, {
      strict: false,
    });
    assert(
      driftResult.valid === true,
      `Iteration ${iteration}: DriftGate passes`,
    );
    assert(
      driftResult.driftScore <= 0.1,
      `Iteration ${iteration}: driftScore ${driftResult.driftScore.toFixed(3)} <= 0.10`,
    );
  }

  // Test: DriftGate should FAIL if seed changes
  const seedChangedResult = validateModifyDrift(
    {
      cds: originalCDS,
      seed: baseSeed,
      geometryHash: originalGeometryHash,
      programLockHash: lock.hash,
    },
    {
      cds: originalCDS,
      seed: baseSeed + 1,
      geometryHash: originalGeometryHash,
      programLockHash: lock.hash,
    },
    { strict: false },
  );
  assert(
    seedChangedResult.valid === false,
    "DriftGate FAILS when seed changes",
  );

  // Test: DriftGate should FAIL if geometry changes
  const geoChangedDNA = {
    ...masterDNA,
    dimensions: { ...masterDNA.dimensions, length: 20 },
  };
  const changedCDS = buildCDSSync({
    designId: "drift-test-changed",
    seed: baseSeed,
    masterDNA: geoChangedDNA,
    programLock: lock,
  });
  const changedGeoHash = computeCDSHashSync(changedCDS.geometry);
  const geoChangedResult = validateModifyDrift(
    {
      cds: originalCDS,
      seed: baseSeed,
      geometryHash: originalGeometryHash,
      programLockHash: lock.hash,
    },
    {
      cds: changedCDS,
      seed: baseSeed,
      geometryHash: changedGeoHash,
      programLockHash: lock.hash,
    },
    { strict: false },
  );
  assert(
    geoChangedResult.valid === false,
    "DriftGate FAILS when geometry changes",
  );
}

// ===================================================================
// Main
// ===================================================================
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  P0 Gates - Definition of Done Tests                  ║");
  console.log("║  TC-PROG-001 | TC-PROG-002 | TC-DRIFT-003            ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  try {
    await loadModules();
  } catch (e) {
    console.error("Failed to load modules:", e.message);
    console.error(e.stack);
    process.exit(1);
  }

  TC_PROG_001();
  TC_PROG_002();
  TC_DRIFT_003();

  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════════");

  if (failed > 0) {
    console.error("\n❌ SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ ALL TESTS PASSED - Definition of Done met");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
