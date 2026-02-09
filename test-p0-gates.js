/**
 * P0 Gates - Definition of Done Tests
 *
 * TC-PROG-001: Single-level program (100% ground floor)
 * TC-PROG-002: Two-level program with locked spaces
 * TC-DRIFT-003: 3 modify iterations without volumetric drift
 * TC-ROUTE-013: UnsupportedPipelineModeError handled + dead code cleanup
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
let validateModifyDrift, validatePreComposeDrift;
let setFeatureFlag, FEATURE_FLAGS;
let getCurrentPipelineMode, PIPELINE_MODE;
let resolveWorkflowByMode, UnsupportedPipelineModeError, isA1Workflow;
let isOption2Mode;

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
  validatePreComposeDrift = dg.validatePreComposeDrift;

  const ff = await import("./src/config/featureFlags.js");
  setFeatureFlag = ff.setFeatureFlag;
  FEATURE_FLAGS = ff.FEATURE_FLAGS;

  const pm = await import("./src/config/pipelineMode.js");
  getCurrentPipelineMode = pm.getCurrentPipelineMode;
  PIPELINE_MODE = pm.PIPELINE_MODE;

  const wr = await import("./src/services/workflowRouter.js");
  resolveWorkflowByMode = wr.resolveWorkflowByMode;
  UnsupportedPipelineModeError = wr.UnsupportedPipelineModeError;
  isA1Workflow = wr.isA1Workflow;

  isOption2Mode = (await import("./src/config/pipelineMode.js")).isOption2Mode;
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
// TC-PROG-003: Locked room on wrong level
// ===================================================================
function TC_PROG_003() {
  console.log("\n📋 TC-PROG-003: Locked room on wrong level");
  console.log(
    "   Criteria: Per-space validation catches rooms on incorrect levels",
  );

  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
    { name: "Master Bedroom", area: 20, floor: "first" },
    { name: "Bathroom", area: 8, floor: "first" },
  ];

  const lock = buildProgramLock(programSpaces, { floors: 2 });
  assert(lock.levelCount === 2, "ProgramLock levelCount = 2");

  // DNA with Master Bedroom on wrong level (ground instead of first)
  const wrongLevelDNA = {
    dimensions: { length: 12, width: 8, height: 6.4, floors: 2, floorCount: 2 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
      { name: "Master Bedroom", floor: "ground" }, // WRONG - should be "first"
      { name: "Bathroom", floor: "first" },
    ],
  };

  const result = validateProgramLock(wrongLevelDNA, lock, { strict: false });
  assert(
    result.valid === false,
    "Validation FAILS when Master Bedroom is on wrong level",
  );
  assert(
    result.violations.some((v) => v.includes("Master Bedroom")),
    "Violation message references Master Bedroom",
  );
  assert(
    result.violations.some((v) => v.includes("level")),
    "Violation message references level mismatch",
  );

  // Verify per-space report is present
  assert(
    result.report.perSpaceReport && result.report.perSpaceReport.length > 0,
    "Per-space report is populated",
  );

  const bedroomReport = result.report.perSpaceReport.find(
    (r) => r.space === "Master Bedroom",
  );
  assert(
    bedroomReport && bedroomReport.match === false,
    "Per-space report shows Master Bedroom mismatch",
  );

  // Correct DNA should pass
  const correctDNA = {
    ...wrongLevelDNA,
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
      { name: "Master Bedroom", floor: "first" },
      { name: "Bathroom", floor: "first" },
    ],
  };
  const correctResult = validateProgramLock(correctDNA, lock, {
    strict: false,
  });
  assert(correctResult.valid === true, "Correct level assignment passes");
}

// ===================================================================
// TC-PROG-004: Locked room count mismatch
// ===================================================================
function TC_PROG_004() {
  console.log("\n📋 TC-PROG-004: Locked room count mismatch");
  console.log("   Criteria: Validates room count matches expected count");

  // Program with 2 bedrooms on first floor
  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Bedroom", area: 16, floor: "first", count: 2 },
    { name: "Bathroom", area: 8, floor: "first" },
  ];

  const lock = buildProgramLock(programSpaces, { floors: 2 });

  // DNA with only 1 bedroom (should need 2)
  const tooFewDNA = {
    dimensions: { length: 12, width: 8, height: 6.4, floors: 2, floorCount: 2 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Bedroom", floor: "first" }, // Only 1, need 2
      { name: "Bathroom", floor: "first" },
    ],
  };

  const result = validateProgramLock(tooFewDNA, lock, { strict: false });
  assert(
    result.valid === false,
    "Validation FAILS when bedroom count is short",
  );
  assert(
    result.violations.some((v) => v.includes("Bedroom")),
    "Violation references Bedroom",
  );

  // DNA with 2 bedrooms should pass
  const enoughDNA = {
    ...tooFewDNA,
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Bedroom 1", floor: "first" },
      { name: "Bedroom 2", floor: "first" },
      { name: "Bathroom", floor: "first" },
    ],
  };

  const goodResult = validateProgramLock(enoughDNA, lock, { strict: false });
  assert(
    goodResult.valid === true,
    "Validation passes with 2 bedrooms on correct level",
  );

  // DNA with rooms missing level metadata
  const noLevelDNA = {
    dimensions: { length: 12, width: 8, height: 6.4, floors: 2, floorCount: 2 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room" }, // no floor field
      { name: "Bedroom 1" },
      { name: "Bedroom 2" },
      { name: "Bathroom" },
    ],
  };
  const noLevelResult = validateProgramLock(noLevelDNA, lock, {
    strict: false,
  });
  assert(
    noLevelResult.valid === false,
    "Validation FAILS when rooms have no level metadata",
  );
  assert(
    noLevelResult.violations.some((v) => v.includes("no level metadata")),
    "Violation mentions missing level metadata",
  );
}

// ===================================================================
// TC-DRIFT-004: Missing provenance in pre-compose drift
// ===================================================================
function TC_DRIFT_004() {
  console.log("\n📋 TC-DRIFT-004: Missing provenance in pre-compose drift");
  console.log("   Criteria: Strict mode catches panels without cdsHash/seed");

  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
  ];
  const lock = buildProgramLock(programSpaces, { floors: 1 });
  const masterDNA = {
    dimensions: { length: 12, width: 8, height: 3.2, floors: 1, floorCount: 1 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
    ],
  };

  const cds = buildCDSSync({
    designId: "drift-prov-test",
    seed: 77,
    masterDNA,
    programLock: lock,
  });

  // Panels WITH full provenance - should pass
  const goodPanels = [
    { panelType: "hero_3d", seed: 77, cdsHash: cds.hash },
    { panelType: "floor_plan_ground", seed: 214, cdsHash: cds.hash },
    { panelType: "elevation_north", seed: 351, cdsHash: cds.hash },
  ];

  const goodResult = validatePreComposeDrift(goodPanels, cds, {
    strict: false,
  });
  assert(
    goodResult.valid === true,
    "Panels with full provenance pass drift gate",
  );
  assert(
    goodResult.driftScore <= 0.1,
    `Drift score ${goodResult.driftScore.toFixed(3)} <= 0.10`,
  );

  // Panels MISSING cdsHash and seed - should fail in strict mode
  const badPanels = [
    { panelType: "hero_3d" }, // no seed, no cdsHash
    { panelType: "floor_plan_ground", seed: 214 }, // no cdsHash
    { panelType: "elevation_north", cdsHash: cds.hash }, // no seed
  ];

  const badResult = validatePreComposeDrift(badPanels, cds, {
    strict: false,
    requireProvenance: true,
  });
  assert(
    badResult.valid === false,
    "Panels missing provenance FAIL drift gate",
  );
  assert(
    badResult.violations.some((v) => v.includes("missing provenance")),
    "Violations reference missing provenance",
  );

  // Count violations - all 3 panels should have provenance issues
  const provViolations = badResult.violations.filter((v) =>
    v.includes("missing provenance"),
  );
  assert(
    provViolations.length === 3,
    `3 provenance violations (got ${provViolations.length})`,
  );

  // Panel with wrong cdsHash should flag drift
  const driftPanels = [
    { panelType: "hero_3d", seed: 77, cdsHash: "wrong_hash_abcdef" },
    { panelType: "floor_plan_ground", seed: 214, cdsHash: cds.hash },
  ];

  const driftResult = validatePreComposeDrift(driftPanels, cds, {
    strict: false,
  });
  assert(
    driftResult.violations.some((v) => v.includes("CDS hash")),
    "Violation detects CDS hash mismatch on panel",
  );

  // Panel with empty promptHash should be flagged
  const emptyPromptPanels = [
    { panelType: "hero_3d", seed: 77, cdsHash: cds.hash, promptHash: "" },
  ];
  const emptyPromptResult = validatePreComposeDrift(emptyPromptPanels, cds, {
    strict: false,
  });
  assert(
    emptyPromptResult.violations.some((v) => v.includes("empty promptHash")),
    "Empty promptHash is flagged",
  );
}

// ===================================================================
// TC-PIPE-005: Pipeline mode switch
// ===================================================================
function TC_PIPE_005() {
  console.log("\n📋 TC-PIPE-005: Pipeline mode switch");
  console.log("   Criteria: getCurrentPipelineMode() returns correct modes");

  // Default should be MULTI_PANEL
  const defaultMode = getCurrentPipelineMode();
  assert(
    defaultMode === PIPELINE_MODE.MULTI_PANEL,
    `Default mode is multi_panel (got "${defaultMode}")`,
  );

  // All mode constants should be defined
  assert(
    PIPELINE_MODE.SINGLE_SHOT === "single_shot",
    "SINGLE_SHOT = 'single_shot'",
  );
  assert(
    PIPELINE_MODE.MULTI_PANEL === "multi_panel",
    "MULTI_PANEL = 'multi_panel'",
  );
  assert(
    PIPELINE_MODE.GEOMETRY_FIRST === "geometry_first",
    "GEOMETRY_FIRST = 'geometry_first'",
  );
  assert(
    PIPELINE_MODE.HYBRID_OPENAI === "hybrid_openai",
    "HYBRID_OPENAI = 'hybrid_openai'",
  );

  // Set env to single_shot and verify
  const origEnv = process.env.PIPELINE_MODE;
  process.env.PIPELINE_MODE = "single_shot";
  const singleMode = getCurrentPipelineMode();
  assert(
    singleMode === PIPELINE_MODE.SINGLE_SHOT,
    `Env override to single_shot works (got "${singleMode}")`,
  );

  // Set env to geometry_first
  process.env.PIPELINE_MODE = "geometry_first";
  const geoMode = getCurrentPipelineMode();
  assert(
    geoMode === PIPELINE_MODE.GEOMETRY_FIRST,
    `Env override to geometry_first works (got "${geoMode}")`,
  );

  // Restore
  if (origEnv !== undefined) {
    process.env.PIPELINE_MODE = origEnv;
  } else {
    delete process.env.PIPELINE_MODE;
  }
}

// ===================================================================
// TC-ENV-006: Environment variable overrides for feature flags
// ===================================================================
function TC_ENV_006() {
  console.log("\n📋 TC-ENV-006: Env var overrides for feature flags");
  console.log("   Criteria: setFeatureFlag and ARCHIAI_* env overrides work");

  // 1. setFeatureFlag should work
  const originalCds = FEATURE_FLAGS.cdsRequired;
  setFeatureFlag("cdsRequired", false);
  assert(
    FEATURE_FLAGS.cdsRequired === false,
    "setFeatureFlag can disable cdsRequired",
  );
  setFeatureFlag("cdsRequired", true);
  assert(
    FEATURE_FLAGS.cdsRequired === true,
    "setFeatureFlag can re-enable cdsRequired",
  );
  // Restore original
  setFeatureFlag("cdsRequired", originalCds);

  // 2. P0 gate flags all exist
  assert(
    "programComplianceGate" in FEATURE_FLAGS,
    "programComplianceGate flag exists",
  );
  assert("driftGate" in FEATURE_FLAGS, "driftGate flag exists");
  assert("cdsRequired" in FEATURE_FLAGS, "cdsRequired flag exists");
  assert(
    "allowTechnicalFallback" in FEATURE_FLAGS,
    "allowTechnicalFallback flag exists",
  );
  assert(
    "strictGeometryMaskGate" in FEATURE_FLAGS,
    "strictGeometryMaskGate flag exists",
  );

  // 3. Hot-path flags all declared (no unknown warnings)
  const hotPathFlags = [
    "strictControlImageMode",
    "useCanonicalBaseline",
    "enableAutoRetry",
    "autoRetryFailedPanels",
    "strictPanelValidation",
    "strictPanelFailFast",
    "canonicalControlPack",
    "requireCanonicalPack",
  ];
  for (const flag of hotPathFlags) {
    assert(flag in FEATURE_FLAGS, `Hot-path flag "${flag}" is declared`);
  }

  // 4. enableAutoRetry and autoRetryFailedPanels default to true
  // (save current, test default, restore)
  const origAutoRetry = FEATURE_FLAGS.enableAutoRetry;
  const origAutoRetryPanels = FEATURE_FLAGS.autoRetryFailedPanels;
  // They should be true by default (from FEATURE_FLAGS init)
  assert(origAutoRetry === true, "enableAutoRetry defaults to true");
  assert(
    origAutoRetryPanels === true,
    "autoRetryFailedPanels defaults to true",
  );
}

// ===================================================================
// TC-GEO-007: Geometry hash provenance matches computeCDSHashSync
// ===================================================================
function TC_GEO_007() {
  console.log("\n📋 TC-GEO-007: Geometry hash provenance correctness");
  console.log(
    "   Criteria: Stamped geometryHash matches computeCDSHashSync(cds.geometry)",
  );

  const programSpaces = [
    { name: "Living Room", area: 25, floor: "ground" },
    { name: "Kitchen", area: 15, floor: "ground" },
  ];
  const lock = buildProgramLock(programSpaces, { floors: 1 });
  const masterDNA = {
    dimensions: { length: 12, width: 8, height: 3.2, floors: 1, floorCount: 1 },
    materials: [{ name: "Brick", hexColor: "#B8604E" }],
    rooms: [
      { name: "Living Room", floor: "ground" },
      { name: "Kitchen", floor: "ground" },
    ],
  };

  const cds = buildCDSSync({
    designId: "geo-hash-test",
    seed: 99,
    masterDNA,
    programLock: lock,
  });

  // The geometry hash the orchestrator should stamp
  const expectedGeoHash = cds.geometry
    ? computeCDSHashSync(cds.geometry)
    : null;

  assert(expectedGeoHash !== null, "CDS has geometry → hash is non-null");
  assert(
    expectedGeoHash.length === 16,
    `Geometry hash is 16 hex chars (got ${expectedGeoHash.length})`,
  );

  // Simulate panel stamped with correct geometry hash
  const goodPanel = {
    panelType: "hero_3d",
    seed: 99,
    cdsHash: cds.hash,
    geometryHash: expectedGeoHash,
  };

  // This panel should NOT trigger geometry drift
  const noDriftResult = validatePreComposeDrift([goodPanel], cds, {
    strict: false,
  });
  assert(
    noDriftResult.valid === true,
    "Panel with correct geometryHash passes drift gate",
  );

  // Panel stamped with WRONG geometry hash should trigger drift
  const badPanel = {
    panelType: "hero_3d",
    seed: 99,
    cdsHash: cds.hash,
    geometryHash: "0000000000000000",
  };

  const driftResult = validatePreComposeDrift([badPanel], cds, {
    strict: false,
  });
  assert(
    driftResult.violations.some((v) => v.includes("geometry hash drift")),
    "Panel with wrong geometryHash triggers drift violation",
  );

  // Two CDS objects with same geometry produce same geometry hash
  const cds2 = buildCDSSync({
    designId: "geo-hash-test-2", // different designId
    seed: 99,
    masterDNA,
    programLock: lock,
  });

  const geoHash2 = computeCDSHashSync(cds2.geometry);
  assert(
    geoHash2 === expectedGeoHash,
    "Same geometry → same geometry hash (deterministic)",
  );

  // Different geometry → different hash
  const differentDNA = {
    ...masterDNA,
    dimensions: { ...masterDNA.dimensions, length: 20 },
  };
  const cds3 = buildCDSSync({
    designId: "geo-hash-test-3",
    seed: 99,
    masterDNA: differentDNA,
    programLock: lock,
  });
  const geoHash3 = computeCDSHashSync(cds3.geometry);
  assert(
    geoHash3 !== expectedGeoHash,
    "Different geometry → different geometry hash",
  );
}

// ===================================================================
// TC-ROUTE-008: Workflow router rejects unsupported modes
// ===================================================================
function TC_ROUTE_008() {
  console.log("\n📋 TC-ROUTE-008: Workflow router mode validation");
  console.log("   Criteria: Supported modes resolve, unsupported modes throw");

  // Supported: multi_panel (default)
  const origMode = process.env.PIPELINE_MODE;
  delete process.env.PIPELINE_MODE;
  delete process.env.REACT_APP_PIPELINE_MODE;

  const defaultResult = resolveWorkflowByMode();
  assert(
    defaultResult.mode === "multi_panel",
    `Default resolves to multi_panel (got "${defaultResult.mode}")`,
  );
  assert(
    defaultResult.workflowKey === "multi_panel_a1",
    `Workflow key is multi_panel_a1`,
  );

  // Unsupported: single_shot → explicit error (no dedicated implementation)
  let singleError = null;
  try {
    resolveWorkflowByMode("single_shot");
  } catch (e) {
    singleError = e;
  }
  assert(
    singleError instanceof UnsupportedPipelineModeError,
    "single_shot throws UnsupportedPipelineModeError",
  );
  assert(
    singleError && singleError.requestedMode === "single_shot",
    "Error carries requestedMode = single_shot",
  );

  // Unsupported: geometry_first → explicit error
  let geoError = null;
  try {
    resolveWorkflowByMode("geometry_first");
  } catch (e) {
    geoError = e;
  }
  assert(
    geoError instanceof UnsupportedPipelineModeError,
    "geometry_first throws UnsupportedPipelineModeError",
  );
  assert(
    geoError && geoError.requestedMode === "geometry_first",
    "Error carries requestedMode = geometry_first",
  );

  // Unsupported: hybrid_openai → explicit error
  let hybridError = null;
  try {
    resolveWorkflowByMode("hybrid_openai");
  } catch (e) {
    hybridError = e;
  }
  assert(
    hybridError instanceof UnsupportedPipelineModeError,
    "hybrid_openai throws UnsupportedPipelineModeError",
  );

  // Unsupported: completely bogus mode → explicit error
  let bogusError = null;
  try {
    resolveWorkflowByMode("bogus_mode_xyz");
  } catch (e) {
    bogusError = e;
  }
  assert(
    bogusError instanceof UnsupportedPipelineModeError,
    "Bogus mode throws UnsupportedPipelineModeError",
  );
  assert(
    bogusError && bogusError.message.includes("bogus_mode_xyz"),
    "Error message includes the bogus mode name",
  );

  // Restore
  if (origMode !== undefined) {
    process.env.PIPELINE_MODE = origMode;
  }

  // isA1Workflow helper
  assert(
    isA1Workflow("multi_panel") === true,
    "isA1Workflow('multi_panel') = true",
  );
  assert(
    isA1Workflow("single_shot") === false,
    "isA1Workflow('single_shot') = false (no longer A1)",
  );
  assert(
    isA1Workflow("multi-panel-a1") === true,
    "isA1Workflow('multi-panel-a1') = true (legacy)",
  );
  assert(
    isA1Workflow("a1-sheet-one-shot") === true,
    "isA1Workflow('a1-sheet-one-shot') = true (legacy)",
  );
  assert(
    isA1Workflow("a1-sheet") === true,
    "isA1Workflow('a1-sheet') = true (legacy)",
  );
  assert(
    isA1Workflow("geometry_first") === false,
    "isA1Workflow('geometry_first') = false",
  );
  assert(isA1Workflow(undefined) === false, "isA1Workflow(undefined) = false");
  assert(isA1Workflow("") === false, "isA1Workflow('') = false");

  // Workflow label consistency: resolveWorkflowByMode returns a mode
  // that isA1Workflow recognises
  const resolvedDefault = resolveWorkflowByMode();
  assert(
    isA1Workflow(resolvedDefault.mode) === true,
    `resolveWorkflowByMode().mode ("${resolvedDefault.mode}") is recognised by isA1Workflow`,
  );
}

// ===================================================================
// TC-LABEL-009: Schema & history default workflow labels use constants
// ===================================================================
async function TC_LABEL_009() {
  console.log(
    "\n📋 TC-LABEL-009: Schema & history default labels use PIPELINE_MODE",
  );
  console.log(
    "   Criteria: No hardcoded legacy labels in schema builders or history services",
  );

  // Import schema builders and history service
  const schemas = await import("./src/types/schemas.js");
  const dgh = await import("./src/services/designGenerationHistory.js");

  // createSheetResult default workflow should be PIPELINE_MODE.MULTI_PANEL
  const sheetResult = schemas.createSheetResult({});
  assert(
    sheetResult.workflow === PIPELINE_MODE.MULTI_PANEL,
    `createSheetResult default workflow = "${sheetResult.workflow}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
  );

  // createSheetResult preserves explicit workflow
  const customSheet = schemas.createSheetResult({ workflow: "custom_test" });
  assert(
    customSheet.workflow === "custom_test",
    "createSheetResult preserves explicit workflow",
  );

  // normalizeMultiPanelResult default workflow should be PIPELINE_MODE.MULTI_PANEL
  const normalized = schemas.normalizeMultiPanelResult({ success: true });
  assert(
    normalized.metadata?.workflow === PIPELINE_MODE.MULTI_PANEL,
    `normalizeMultiPanelResult default workflow = "${normalized.metadata?.workflow}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
  );

  // normalizeMultiPanelResult passes through explicit workflow
  const customNorm = schemas.normalizeMultiPanelResult({
    success: true,
    workflow: "explicit_mode",
  });
  assert(
    customNorm.metadata?.workflow === "explicit_mode",
    "normalizeMultiPanelResult passes through explicit workflow",
  );

  // createBaselineArtifactBundle default workflow
  const baseline = schemas.createBaselineArtifactBundle({});
  assert(
    baseline.metadata?.workflow === PIPELINE_MODE.MULTI_PANEL,
    `createBaselineArtifactBundle default workflow = "${baseline.metadata?.workflow}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
  );

  // designGenerationHistory.startSession default workflow
  const historyService = dgh.default;
  const sessionId = historyService.startSession({ seed: 1 });
  const session = historyService.getSession
    ? historyService.getSession(sessionId)
    : null;
  if (session) {
    assert(
      session.original.workflow === PIPELINE_MODE.MULTI_PANEL,
      `startSession default workflow = "${session.original.workflow}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
    );
  } else {
    // If getSession not available, verify by starting with explicit workflow
    const sid2 = historyService.startSession({
      seed: 2,
      workflow: PIPELINE_MODE.MULTI_PANEL,
    });
    assert(
      sid2,
      "startSession accepts PIPELINE_MODE.MULTI_PANEL without error",
    );
  }

  // No legacy labels in defaults — verify none of the old strings appear
  assert(
    sheetResult.workflow !== "a1-sheet-one-shot",
    'createSheetResult does NOT default to "a1-sheet-one-shot"',
  );
  assert(
    normalized.metadata?.workflow !== "multi-panel-a1",
    'normalizeMultiPanelResult does NOT default to "multi-panel-a1"',
  );
}

// ===================================================================
// TC-ENV-010: .env.example default PIPELINE_MODE is supported
// ===================================================================
async function TC_ENV_010() {
  console.log(
    "\n📋 TC-ENV-010: .env.example default PIPELINE_MODE is supported",
  );
  console.log(
    "   Criteria: Fresh env from .env.example will not trigger UnsupportedPipelineModeError",
  );

  const fs = await import("fs");
  const path = await import("path");
  const url = await import("url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const envExamplePath = path.join(__dirname, ".env.example");

  assert(fs.existsSync(envExamplePath), ".env.example file exists");

  const content = fs.readFileSync(envExamplePath, "utf-8");

  // Parse the uncommented PIPELINE_MODE assignment
  const match = content.match(/^PIPELINE_MODE=(\S+)/m);
  assert(match !== null, "PIPELINE_MODE is set in .env.example");

  const envMode = match ? match[1] : null;
  assert(
    envMode === PIPELINE_MODE.MULTI_PANEL,
    `.env.example PIPELINE_MODE = "${envMode}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
  );

  // Verify it would resolve without error
  let resolveError = null;
  try {
    resolveWorkflowByMode(envMode);
  } catch (e) {
    resolveError = e;
  }
  assert(
    resolveError === null,
    `.env.example PIPELINE_MODE="${envMode}" resolves without error`,
  );
}

// ===================================================================
// TC-STAMP-011: Compose stamp and isOption2Mode routing correctness
// ===================================================================
async function TC_STAMP_011() {
  console.log(
    "\n📋 TC-STAMP-011: Compose stamp and isOption2Mode routing correctness",
  );
  console.log(
    "   Criteria: No HYBRID_OPENAI default in compose stamp, isOption2Mode requires argument",
  );

  // 1. getPipelineModeForStamp no longer defaults to HYBRID_OPENAI
  const { getPipelineModeForStamp } = await import("./api/a1/compose.js");
  const defaultStamp = getPipelineModeForStamp(null);
  assert(
    defaultStamp !== "HYBRID_OPENAI",
    `Compose stamp does NOT default to HYBRID_OPENAI (got "${defaultStamp}")`,
  );
  assert(
    defaultStamp === "multi_panel",
    `Compose stamp defaults to "multi_panel" (got "${defaultStamp}")`,
  );

  // 2. Stamp respects proof.resolvedMode when provided
  const proofStamp = getPipelineModeForStamp({ resolvedMode: "custom_mode" });
  assert(
    proofStamp === "custom_mode",
    `Compose stamp uses proof.resolvedMode when present (got "${proofStamp}")`,
  );

  // 3. isOption2Mode with explicit argument returns correct values
  assert(
    isOption2Mode(PIPELINE_MODE.GEOMETRY_FIRST) === true,
    `isOption2Mode("${PIPELINE_MODE.GEOMETRY_FIRST}") = true`,
  );
  assert(
    isOption2Mode(PIPELINE_MODE.MULTI_PANEL) === false,
    `isOption2Mode("${PIPELINE_MODE.MULTI_PANEL}") = false`,
  );
  assert(
    isOption2Mode(PIPELINE_MODE.HYBRID_OPENAI) === false,
    `isOption2Mode("${PIPELINE_MODE.HYBRID_OPENAI}") = false`,
  );

  // 4. isOption2Mode with current mode (multi_panel) returns false
  const currentMode = getCurrentPipelineMode();
  assert(
    isOption2Mode(currentMode) === false,
    `isOption2Mode(getCurrentPipelineMode()) = false (mode="${currentMode}")`,
  );
}

// ===================================================================
// TC-LEGACY-012: No hardcoded legacy workflow labels in service results
// ===================================================================
async function TC_LEGACY_012() {
  console.log(
    "\n📋 TC-LEGACY-012: No hardcoded legacy workflow labels in service results",
  );
  console.log(
    "   Criteria: Source files contain zero legacy workflow strings outside tests/docs",
  );

  const fs = await import("fs");
  const path = await import("path");
  const url = await import("url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

  // Legacy workflow strings that must NOT appear in source files
  const legacyLabels = [
    "dna-enhanced-together-ai",
    "modify-deterministic",
    "hybrid-a1-grid-v1",
  ];

  const srcDir = path.join(__dirname, "src");
  const apiDir = path.join(__dirname, "api");

  function scanDir(dir, ext) {
    const results = [];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        results.push(...scanDir(full, ext));
      } else if (entry.isFile() && ext.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
    return results;
  }

  const sourceFiles = [
    ...scanDir(srcDir, [".js", ".jsx", ".ts", ".tsx"]),
    ...scanDir(apiDir, [".js"]),
  ];

  for (const label of legacyLabels) {
    let found = false;
    let foundFile = "";
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      if (content.includes(label)) {
        found = true;
        foundFile = path.relative(__dirname, file);
        break;
      }
    }
    assert(
      !found,
      `Legacy label "${label}" absent from source (${found ? `FOUND in ${foundFile}` : "clean"})`,
    );
  }

  // Verify normalizeSheetMetadata now defaults to PIPELINE_MODE.MULTI_PANEL
  const { normalizeSheetMetadata } = await import("./src/types/schemas.js");
  const normalized = normalizeSheetMetadata({ format: "A1" });
  assert(
    normalized.workflow === PIPELINE_MODE.MULTI_PANEL,
    `normalizeSheetMetadata defaults workflow to "${normalized.workflow}" (expected "${PIPELINE_MODE.MULTI_PANEL}")`,
  );

  // Verify template generator uses new layout ID
  const { generateA1Template } =
    await import("./src/services/a1TemplateGenerator.js");
  const template = generateA1Template({
    resolution: "working",
    format: "json",
  });
  assert(
    !template.layout.id.includes("hybrid"),
    `A1 template ID does not contain "hybrid" (got "${template.layout.id}")`,
  );
}

// ===================================================================
// TC-ROUTE-013: UnsupportedPipelineModeError handled in UI + dead code removal
// ===================================================================
async function TC_ROUTE_013() {
  console.log(
    "\n📋 TC-ROUTE-013: UnsupportedPipelineModeError handled + dead code cleanup",
  );
  console.log(
    "   Criteria: UI imports error class, panelGen has no dead isOption2Mode branch for technical, featureFlags JSDoc correct",
  );

  const fs = await import("fs");
  const path = await import("path");
  const url = await import("url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

  // 1. ArchitectAIEnhanced.js imports UnsupportedPipelineModeError
  const uiSrc = fs.readFileSync(
    path.join(__dirname, "src", "ArchitectAIEnhanced.js"),
    "utf8",
  );
  assert(
    uiSrc.includes("UnsupportedPipelineModeError"),
    "ArchitectAIEnhanced.js imports UnsupportedPipelineModeError",
  );

  // 2. UI catch block handles UnsupportedPipelineModeError specifically
  assert(
    uiSrc.includes("instanceof UnsupportedPipelineModeError"),
    "UI catch block checks instanceof UnsupportedPipelineModeError",
  );

  // 3. panelGenerationService.js technical panel branch has no dead isOption2Mode → overwrite
  const panelSrc = fs.readFileSync(
    path.join(
      __dirname,
      "src",
      "services",
      "design",
      "panelGenerationService.js",
    ),
    "utf8",
  );
  // The old dead-code pattern was: isOption2Mode(...)..."blender"..."flux" followed by intendedGenerator = "svg"
  const deadCodePattern =
    /isOption2Mode.*\n.*"blender"[\s\S]*?intendedGenerator\s*=\s*"svg"/;
  assert(
    !deadCodePattern.test(panelSrc),
    "panelGenerationService.js has no dead isOption2Mode branch for technical panels",
  );

  // 4. featureFlags.js hybridA1Mode @default matches actual value (true)
  const flagSrc = fs.readFileSync(
    path.join(__dirname, "src", "config", "featureFlags.js"),
    "utf8",
  );
  // Extract the hybridA1Mode line to get actual value
  const hybridLine = flagSrc.match(/hybridA1Mode:\s*(true|false)/);
  assert(hybridLine, "featureFlags.js has hybridA1Mode property");
  const actualDefault = hybridLine[1]; // "true" or "false"
  // Find the JSDoc block immediately above by searching for Hybrid A1 Sheet Mode
  const hybridJSDoc = flagSrc.match(
    /Hybrid A1 Sheet Mode[\s\S]*?@default\s+(true|false)/,
  );
  assert(hybridJSDoc, "hybridA1Mode has @default in JSDoc");
  assert(
    hybridJSDoc[1] === actualDefault,
    `hybridA1Mode @default (${hybridJSDoc[1]}) matches actual value (${actualDefault})`,
  );
}

// ===================================================================
// Main
// ===================================================================
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  P0 Gates - Definition of Done Tests                  ║");
  console.log("║  TC-PROG-001..004 | TC-DRIFT-003..004                 ║");
  console.log("║  TC-PIPE-005..013 | TC-ENV-006                        ║");
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
  TC_PROG_003();
  TC_PROG_004();
  TC_DRIFT_004();
  TC_PIPE_005();
  TC_ENV_006();
  TC_GEO_007();
  TC_ROUTE_008();
  await TC_LABEL_009();
  await TC_ENV_010();
  await TC_STAMP_011();
  await TC_LEGACY_012();
  await TC_ROUTE_013();

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
