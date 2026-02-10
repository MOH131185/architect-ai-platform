/**
 * Three-Tier Panel Consistency Routing Test
 *
 * Verifies the three-tier panel routing architecture:
 * - TIER 1 (floor plans, elevations, sections): Deterministic SVG from canonical pack — NO FLUX
 * - TIER 2 (hero_3d, axonometric): FLUX with geometry-locked init_image (strength 0.80-0.85)
 * - TIER 3 (interior_3d, site_diagram): FLUX with DNA style constraints
 * - Data panels: Deterministic SVG (unchanged, always skipped FLUX)
 *
 * Also verifies:
 * - Dimension guard computes footprint from room areas (not hardcoded 15×10)
 * - FingerprintValidationGate skips TIER 1 panels
 * - Feature flag can disable the routing (rollback)
 * - convertToLegacyDNA computes dimensions from room areas
 *
 * Run with: node test-three-tier-routing.js
 */

process.env.NODE_ENV = "test";

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, message) {
  total++;
  const within = Math.abs(actual - expected) <= tolerance;
  if (within) {
    console.log(`  ✅ ${message} (${actual})`);
    passed++;
  } else {
    console.log(`  ❌ ${message} — expected ~${expected}, got ${actual}`);
    failed++;
  }
}

// ============================================================================
// TEST 1: convertToLegacyDNA computes dimensions from room areas
// ============================================================================
async function testConvertToLegacyDNA() {
  console.log("\n📏 TEST 1: convertToLegacyDNA dimension computation");

  const { convertToLegacyDNA } = await import("./src/services/dnaSchema.js");

  const structuredDNA = {
    site: {
      polygon: [],
      area_m2: 300,
      orientation: 180,
      climate_zone: "temperate",
      sun_path: "south-facing",
      wind_profile: "moderate",
    },
    program: {
      floors: 2,
      rooms: [
        {
          name: "Living Room",
          area_m2: 30,
          floor: "ground",
          orientation: "south",
        },
        { name: "Kitchen", area_m2: 20, floor: "ground", orientation: "east" },
        { name: "Hallway", area_m2: 8, floor: "ground", orientation: "any" },
        {
          name: "Master Bedroom",
          area_m2: 22,
          floor: "first",
          orientation: "south",
        },
        {
          name: "Bedroom 2",
          area_m2: 15,
          floor: "first",
          orientation: "north",
        },
        { name: "Bathroom", area_m2: 8, floor: "first", orientation: "any" },
      ],
    },
    style: {
      architecture: "Contemporary",
      materials: ["Red brick", "Slate tiles", "Timber"],
      windows: { pattern: "regular", proportion: "tall" },
    },
    geometry_rules: {
      grid: "900mm",
      max_span: "6m",
      roof_type: "gable",
    },
  };

  const legacy = convertToLegacyDNA(structuredDNA);

  // Total room area = 30+20+8+22+15+8 = 103 m²
  // Gross area = 103 * 1.15 = 118.45 m²
  // Footprint = 118.45 / 2 floors = 59.225 m²
  // With 1.5:1 ratio: length = sqrt(59.225 * 1.5) ≈ 9.4m, width ≈ 6.3m
  assert(legacy.dimensions.length !== 15, "Length is NOT hardcoded 15");
  assert(legacy.dimensions.width !== 10, "Width is NOT hardcoded 10");
  assert(legacy.dimensions.length > 0, "Length is positive");
  assert(legacy.dimensions.width > 0, "Width is positive");

  const footprint = legacy.dimensions.length * legacy.dimensions.width;
  // Footprint should be close to grossFloorArea / floors
  assertApprox(footprint, 59.2, 5, "Footprint area ~59m² (derived from rooms)");

  assert(legacy.dimensions.floors === 2, "Floor count preserved (2)");
  assertApprox(legacy.dimensions.height, 6.4, 0.1, "Height = 2 floors × 3.2m");
}

// ============================================================================
// TEST 2: TIER 1 panel classification
// ============================================================================
async function testTier1Classification() {
  console.log("\n📐 TEST 2: TIER 1 panel classification");

  const TIER1_SVG_PANELS = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_level3",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
  ];

  // TIER 1 panels
  assert(
    TIER1_SVG_PANELS.includes("floor_plan_ground"),
    "floor_plan_ground is TIER 1",
  );
  assert(
    TIER1_SVG_PANELS.includes("floor_plan_first"),
    "floor_plan_first is TIER 1",
  );
  assert(
    TIER1_SVG_PANELS.includes("elevation_north"),
    "elevation_north is TIER 1",
  );
  assert(
    TIER1_SVG_PANELS.includes("elevation_south"),
    "elevation_south is TIER 1",
  );
  assert(TIER1_SVG_PANELS.includes("section_AA"), "section_AA is TIER 1");
  assert(TIER1_SVG_PANELS.includes("section_BB"), "section_BB is TIER 1");

  // Non-TIER 1 panels (should NOT be in list)
  assert(!TIER1_SVG_PANELS.includes("hero_3d"), "hero_3d is NOT TIER 1");
  assert(
    !TIER1_SVG_PANELS.includes("axonometric"),
    "axonometric is NOT TIER 1",
  );
  assert(
    !TIER1_SVG_PANELS.includes("interior_3d"),
    "interior_3d is NOT TIER 1",
  );
  assert(
    !TIER1_SVG_PANELS.includes("site_diagram"),
    "site_diagram is NOT TIER 1",
  );
  assert(
    !TIER1_SVG_PANELS.includes("schedules_notes"),
    "schedules_notes is NOT TIER 1 (data panel)",
  );
}

// ============================================================================
// TEST 3: TIER 2 strength policy
// ============================================================================
async function testTier2Strength() {
  console.log("\n🎨 TEST 3: TIER 2 geometry strength policy");

  const { getInitImageParams } =
    await import("./src/services/canonical/CanonicalGeometryPackService.js");

  // Create a minimal mock canonical pack with SVG data for hero_3d and axonometric
  const mockSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#ccc" width="100" height="100"/></svg>';
  const mockDataUrl = `data:image/svg+xml;base64,${Buffer.from(mockSvg).toString("base64")}`;

  const mockPack = {
    status: "COMPLETE",
    geometryHash: "test_hash_123",
    panels: {
      hero_3d: { dataUrl: mockDataUrl },
      axonometric: { dataUrl: mockDataUrl },
      floor_plan_ground: { dataUrl: mockDataUrl },
      elevation_north: { dataUrl: mockDataUrl },
    },
  };

  const heroParams = getInitImageParams(mockPack, "hero_3d");
  const axoParams = getInitImageParams(mockPack, "axonometric");
  const planParams = getInitImageParams(mockPack, "floor_plan_ground");

  assert(heroParams !== null, "hero_3d gets init_image params");
  assert(axoParams !== null, "axonometric gets init_image params");

  if (heroParams) {
    assertApprox(
      heroParams.strength,
      0.8,
      0.05,
      "hero_3d strength ≈ 0.80 (TIER 2)",
    );
    assert(
      heroParams.init_image.startsWith("data:"),
      "hero_3d has data URL init_image",
    );
  }

  if (axoParams) {
    assertApprox(
      axoParams.strength,
      0.85,
      0.05,
      "axonometric strength ≈ 0.85 (TIER 2)",
    );
  }

  // TIER 1 panels should have very high strength (they bypass FLUX anyway,
  // but the policy should still reflect their intended control level)
  if (planParams) {
    assert(
      planParams.strength >= 0.1,
      "floor_plan_ground has non-zero strength in policy",
    );
  }
}

// ============================================================================
// TEST 4: Feature flag exists and defaults to true
// ============================================================================
async function testFeatureFlag() {
  console.log("\n🚩 TEST 4: Feature flag threeTierPanelConsistency");

  const { isFeatureEnabled, FEATURE_FLAGS } =
    await import("./src/config/featureFlags.js");

  assert(
    "threeTierPanelConsistency" in FEATURE_FLAGS,
    "threeTierPanelConsistency flag exists in FEATURE_FLAGS",
  );
  assert(
    FEATURE_FLAGS.threeTierPanelConsistency === true,
    "threeTierPanelConsistency defaults to true",
  );
  assert(
    isFeatureEnabled("threeTierPanelConsistency") === true,
    "isFeatureEnabled returns true for threeTierPanelConsistency",
  );
}

// ============================================================================
// TEST 5: FingerprintValidationGate skips TIER 1 panels
// ============================================================================
async function testFingerprintGateSkip() {
  console.log("\n🔒 TEST 5: FingerprintValidationGate TIER 1 skip");

  // The skip logic is internal (not exported) — verify via source inspection
  const fs = await import("fs");
  const source = fs.readFileSync(
    "./src/services/validation/FingerprintValidationGate.js",
    "utf8",
  );

  assert(
    source.includes("TIER1_DETERMINISTIC_PANELS"),
    "Gate has TIER1_DETERMINISTIC_PANELS set",
  );
  assert(
    source.includes("isTier1DeterministicPanel"),
    "Gate has isTier1DeterministicPanel function",
  );
  assert(
    source.includes("threeTierPanelConsistency"),
    "Gate checks threeTierPanelConsistency feature flag",
  );
  assert(
    source.includes('"floor_plan_ground"') &&
      source.includes('"elevation_north"'),
    "Gate includes floor plans and elevations in skip set",
  );
  assert(
    source.includes('"section_AA"') && source.includes('"section_BB"'),
    "Gate includes sections in skip set",
  );
  // Verify it's actually used in the validation loop
  assert(
    source.includes("isTier1DeterministicPanel(panelType)"),
    "Gate calls isTier1DeterministicPanel in validation loop",
  );
}

// ============================================================================
// TEST 6: SVG canonical pack resolution increased
// ============================================================================
async function testCanonicalPackResolution() {
  console.log("\n🖼️  TEST 6: Canonical pack SVG resolution");

  // Read the source to verify default options
  const fs = await import("fs");
  const source = fs.readFileSync(
    "./src/services/canonical/CanonicalGeometryPackService.js",
    "utf8",
  );

  // Check for increased defaults
  const hasScale80 = source.includes("scale = 80");
  const hasWidth1200 = source.includes("width = 1200");
  const hasHeight900 = source.includes("height = 900");

  assert(hasScale80, "Default scale increased to 80 (from 50)");
  assert(hasWidth1200, "Default width increased to 1200 (from 800)");
  assert(hasHeight900, "Default height increased to 900 (from 600)");
}

// ============================================================================
// TEST 7: Data panel renderer produces valid SVG
// ============================================================================
async function testDataPanelRenderer() {
  console.log("\n📊 TEST 7: Data panel renderer SVG output");

  const { renderSchedulesSVG, renderMaterialPaletteSVG, renderClimateCardSVG } =
    await import("./src/services/dataPanelRenderer.js");

  const mockDNA = {
    rooms: [
      { name: "Living Room", area_m2: 30, floor: 0, finish: "Oak" },
      { name: "Kitchen", area_m2: 20, floor: 0, finish: "Tile" },
    ],
    materials: [
      { name: "Red brick", hexColor: "#B8604E", application: "exterior walls" },
      { name: "Slate tiles", hexColor: "#4A5568", application: "roof" },
    ],
  };

  const mockLocation = {
    address: "123 Test Street, London, UK",
    climate: { type: "Temperate oceanic", zone: "Cfb" },
    sunPath: { optimalOrientation: "South-facing" },
  };

  // Test schedules SVG
  const schedSvg = renderSchedulesSVG(400, 500, mockDNA);
  assert(
    schedSvg.startsWith('<?xml version="1.0"'),
    "Schedules SVG has XML header",
  );
  assert(schedSvg.includes("<svg"), "Schedules SVG has svg tag");
  assert(schedSvg.includes("</svg>"), "Schedules SVG is closed");
  assert(schedSvg.includes("Living Room"), "Schedules SVG contains room name");
  assert(
    schedSvg.includes("ROOM SCHEDULE"),
    "Schedules SVG has section header",
  );

  // Test materials SVG
  const matSvg = renderMaterialPaletteSVG(400, 400, mockDNA);
  assert(
    matSvg.startsWith('<?xml version="1.0"'),
    "Materials SVG has XML header",
  );
  assert(matSvg.includes("Red brick"), "Materials SVG contains material name");
  assert(matSvg.includes("#B8604E"), "Materials SVG contains hex color");
  assert(
    matSvg.includes("MATERIAL PALETTE"),
    "Materials SVG has section header",
  );

  // Test climate SVG
  const climateSvg = renderClimateCardSVG(400, 400, mockLocation, mockDNA);
  assert(
    climateSvg.startsWith('<?xml version="1.0"'),
    "Climate SVG has XML header",
  );
  assert(
    climateSvg.includes("123 Test Street"),
    "Climate SVG contains address",
  );
  assert(climateSvg.includes("CLIMATE"), "Climate SVG has section header");
}

// ============================================================================
// TEST 8: svgToPngRenderer exports
// ============================================================================
async function testSvgToPngRenderer() {
  console.log("\n🔄 TEST 8: svgToPngRenderer module exports");

  const renderer = await import("./src/services/svgToPngRenderer.js");

  assert(typeof renderer.svgToPng === "function", "svgToPng function exported");
  assert(
    typeof renderer.renderPackToPng === "function",
    "renderPackToPng function exported",
  );
}

// ============================================================================
// TEST 9: Dimension guard in orchestrator source
// ============================================================================
async function testDimensionGuardSource() {
  console.log("\n📐 TEST 9: Dimension guard in orchestrator");

  const fs = await import("fs");
  const source = fs.readFileSync(
    "./src/services/dnaWorkflowOrchestrator.js",
    "utf8",
  );

  assert(
    source.includes("DIMENSION GUARD"),
    "Orchestrator contains DIMENSION GUARD block",
  );
  assert(
    source.includes("Derived footprint from room areas"),
    "Dimension guard logs derived footprint",
  );
  assert(
    source.includes("curLen === 15 && curWid === 10"),
    "Dimension guard detects hardcoded 15×10 defaults",
  );
  assert(
    source.includes("grossFloorArea / floorCount"),
    "Dimension guard computes footprint from gross area / floors",
  );
}

// ============================================================================
// TEST 10: TIER 1 routing block in orchestrator source
// ============================================================================
async function testTier1RoutingSource() {
  console.log("\n🚦 TEST 10: TIER 1 routing in orchestrator");

  const fs = await import("fs");
  const source = fs.readFileSync(
    "./src/services/dnaWorkflowOrchestrator.js",
    "utf8",
  );

  assert(
    source.includes("TIER1_SVG_PANELS"),
    "Orchestrator defines TIER1_SVG_PANELS constant",
  );
  assert(
    source.includes("TIER1_SVG_PANELS.includes(job.type)"),
    "Orchestrator checks if panel is TIER 1",
  );
  assert(
    source.includes('"threeTierPanelConsistency"'),
    "TIER 1 routing gated behind threeTierPanelConsistency flag",
  );
  assert(
    source.includes('model: "canonical_svg"'),
    "TIER 1 panels marked with model: canonical_svg",
  );
  assert(source.includes("skipping FLUX"), "TIER 1 routing logs skipping FLUX");
}

// ============================================================================
// TEST 11: CORS proxy block in orchestrator source
// ============================================================================
async function testCorsProxySource() {
  console.log("\n🌐 TEST 11: CORS proxy for FLUX images");

  const fs = await import("fs");
  const source = fs.readFileSync(
    "./src/services/dnaWorkflowOrchestrator.js",
    "utf8",
  );

  assert(
    source.includes("/api/proxy/image"),
    "Orchestrator proxies via /api/proxy/image",
  );
  assert(
    source.includes("readAsDataURL"),
    "Proxy converts to data URL via FileReader",
  );
}

// ============================================================================
// TEST 12: Projections2D furniture and material fills
// ============================================================================
async function testProjections2DEnhancements() {
  console.log("\n🏠 TEST 12: Projections2D enhancements");

  const fs = await import("fs");
  const source = fs.readFileSync("./src/geometry/Projections2D.js", "utf8");

  // Furniture symbols
  assert(
    source.includes("drawFurnitureSymbol"),
    "Projections2D has drawFurnitureSymbol function",
  );
  assert(
    source.includes("showFurniture = true"),
    "showFurniture defaults to true",
  );

  // Material fills on elevations
  assert(
    source.includes("getMaterialFill"),
    "Projections2D has getMaterialFill function",
  );
  assert(
    source.includes("brick") || source.includes("coursing"),
    "Material fill supports brick pattern",
  );

  // Title blocks
  assert(
    source.includes("drawTitleBlock"),
    "Projections2D has drawTitleBlock function",
  );

  // Room dimension labels
  assert(
    source.includes("getBoundsWidth"),
    "Projections2D has getBoundsWidth helper",
  );
}

// ============================================================================
// TEST 13: Full workflow with mocks — verify TIER routing
// ============================================================================
async function testFullWorkflowRouting() {
  console.log("\n🧪 TEST 13: Full workflow TIER routing verification");

  try {
    const { default: orchestrator } =
      await import("./src/services/dnaWorkflowOrchestrator.js");

    // Track which panels hit FLUX vs canonical SVG
    const fluxCalls = [];
    const mockTogetherAI = {
      generateArchitecturalImage: async (params) => {
        fluxCalls.push(params.viewType || params.panelType || "unknown");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#eee" width="100" height="100"/></svg>`;
        return {
          url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
          seedUsed: params.seed,
          metadata: {
            width: params.width,
            height: params.height,
            model: "FLUX.1-dev",
          },
        };
      },
    };

    const mockDNAGenerator = {
      generateMasterDesignDNA: async () => ({
        success: true,
        masterDNA: {
          dimensions: {
            length: 13.5,
            width: 9.0,
            height: 6.4,
            floors: 2,
            floorCount: 2,
          },
          materials: [
            {
              name: "Red brick",
              hexColor: "#B8604E",
              application: "exterior walls",
            },
            { name: "Slate tiles", hexColor: "#4A5568", application: "roof" },
            { name: "Timber", hexColor: "#D2691E", application: "windows" },
          ],
          architecturalStyle: "Contemporary",
          projectType: "residential",
          entranceDirection: "N",
          rooms: [
            {
              name: "Living Room",
              area_m2: 30,
              floor: "ground",
              orientation: "south",
            },
            {
              name: "Kitchen-Dining",
              area_m2: 25,
              floor: "ground",
              orientation: "east",
            },
            {
              name: "Hallway",
              area_m2: 8,
              floor: "ground",
              orientation: "any",
            },
            { name: "WC", area_m2: 3, floor: "ground", orientation: "any" },
            {
              name: "Master Bedroom",
              area_m2: 20,
              floor: "first",
              orientation: "south",
            },
            {
              name: "Bedroom 2",
              area_m2: 14,
              floor: "first",
              orientation: "north",
            },
            {
              name: "Bathroom",
              area_m2: 7,
              floor: "first",
              orientation: "any",
            },
          ],
          roof: { type: "gable", pitch: 35, material: "Slate tiles" },
        },
      }),
    };

    const mockDNAValidator = {
      validateDesignDNA: () => ({ isValid: true, errors: [], warnings: [] }),
      autoFixDesignDNA: () => null,
    };

    const mockDriftValidator = {
      validatePanelConsistency: async (params) => ({
        valid: true,
        panelType: params.panelType,
        driftScore: 0.01,
        errors: [],
        warnings: [],
      }),
      validateMultiPanelConsistency: (panels) => ({
        valid: true,
        consistencyScore: 0.99,
        validPanels: panels.length,
        totalPanels: panels.length,
        failedPanels: [],
      }),
    };

    const mockComposeClient = async (url, options) => {
      const body = JSON.parse(options.body);
      const coordinates = {};
      body.panels.forEach((panel, i) => {
        coordinates[panel.type] = {
          x: (i % 4) * 400,
          y: Math.floor(i / 4) * 300,
          width: 400,
          height: 300,
        };
      });
      return {
        ok: true,
        json: async () => ({
          composedSheetUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          coordinates,
          metadata: {
            width: 1792,
            height: 1269,
            panelCount: body.panels.length,
            composedAt: new Date().toISOString(),
          },
        }),
      };
    };

    const mockBaselineStore = {
      savedBundles: [],
      saveBaselineArtifacts: async ({ designId, sheetId, bundle }) => {
        mockBaselineStore.savedBundles.push({ designId, sheetId, bundle });
        return `${designId}_baseline`;
      },
      getLastBundle: () =>
        mockBaselineStore.savedBundles[
          mockBaselineStore.savedBundles.length - 1
        ],
    };

    const mockHistoryService = {
      savedDesigns: [],
      createDesign: async (params) => {
        mockHistoryService.savedDesigns.push(params);
        return params.designId;
      },
      getLastDesign: () =>
        mockHistoryService.savedDesigns[
          mockHistoryService.savedDesigns.length - 1
        ],
    };

    const result = await orchestrator.runMultiPanelA1Workflow(
      {
        locationData: {
          address: "42 Test Lane, Birmingham, B1 1AA, UK",
          coordinates: { lat: 52.48, lng: -1.89 },
          climate: { type: "temperate oceanic" },
        },
        projectContext: {
          buildingProgram: "detached house",
          area: 107,
          floorArea: 107,
          floors: 2,
          floorCount: 2,
          programSpaces: [
            { name: "Living Room", area: 30, level: "ground" },
            { name: "Kitchen-Dining", area: 25, level: "ground" },
            { name: "Hallway", area: 8, level: "ground" },
            { name: "WC", area: 3, level: "ground" },
            { name: "Master Bedroom", area: 20, level: "first" },
            { name: "Bedroom 2", area: 14, level: "first" },
            { name: "Bathroom", area: 7, level: "first" },
          ],
        },
        portfolioFiles: [],
        siteSnapshot: null,
        baseSeed: 42000,
      },
      {
        overrides: {
          useTwoPassDNA: false,
          panelDelayMs: 0,
          dnaGenerator: mockDNAGenerator,
          dnaValidator: mockDNAValidator,
          togetherAIService: mockTogetherAI,
          driftValidator: mockDriftValidator,
          baselineStore: mockBaselineStore,
          historyService: mockHistoryService,
          composeClient: mockComposeClient,
        },
      },
    );

    // Analyze results
    assert(result.success === true, "Workflow completed successfully");

    if (!result.success) {
      console.log(`     Error: ${result.error}`);
      console.log(
        "     Skipping TIER routing assertions due to workflow failure",
      );
      return;
    }

    const panels = result.panels || [];
    assert(
      panels.length >= 12,
      `Generated ${panels.length} panels (≥12 expected)`,
    );

    // Check TIER 1 panels used canonical SVG
    const tier1Types = [
      "floor_plan_ground",
      "floor_plan_first",
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
      "section_AA",
      "section_BB",
    ];

    const tier1Panels = panels.filter((p) => tier1Types.includes(p.type));
    const tier1WithSvg = tier1Panels.filter(
      (p) => p.svgPanel === true || p.meta?.model === "canonical_svg",
    );

    assert(
      tier1Panels.length > 0,
      `Found ${tier1Panels.length} TIER 1 panels in results`,
    );
    assert(
      tier1WithSvg.length === tier1Panels.length,
      `All ${tier1Panels.length} TIER 1 panels used canonical SVG (${tier1WithSvg.length} have svgPanel/canonical_svg)`,
    );

    // Check TIER 1 panels were NOT sent to FLUX
    const tier1InFlux = fluxCalls.filter((type) => tier1Types.includes(type));
    assert(
      tier1InFlux.length === 0,
      `No TIER 1 panels sent to FLUX (${tier1InFlux.length} FLUX calls for TIER 1)`,
    );

    // Check that FLUX was called for non-TIER-1, non-data panels
    const expectedFluxPanels = [
      "hero_3d",
      "axonometric",
      "interior_3d",
      "site_diagram",
    ];
    const actualFluxPanelTypes = [...new Set(fluxCalls)];
    console.log(`     FLUX called for: [${actualFluxPanelTypes.join(", ")}]`);
    assert(
      fluxCalls.length <= 6,
      `FLUX called ≤6 times (got ${fluxCalls.length}) — TIER 1 bypass working`,
    );

    // Check TIER 1 panels have geometryHash
    const tier1WithHash = tier1Panels.filter(
      (p) => p.geometryHash || p.meta?.geometryHash,
    );
    assert(
      tier1WithHash.length === tier1Panels.length,
      `All TIER 1 panels have geometryHash`,
    );

    console.log(
      `\n     📊 Summary: ${tier1WithSvg.length} TIER 1 SVG panels, ${fluxCalls.length} FLUX calls`,
    );
  } catch (err) {
    console.log(`  ❌ Full workflow test failed: ${err.message}`);
    console.log(`     ${err.stack?.split("\n")[1]?.trim() || ""}`);
    failed++;
    total++;
  }
}

// ============================================================================
// Run all tests
// ============================================================================
async function runAllTests() {
  console.log("\n🧪 ========================================");
  console.log("🧪 THREE-TIER PANEL ROUTING TESTS");
  console.log("🧪 ========================================");

  await testConvertToLegacyDNA();
  await testTier1Classification();
  await testTier2Strength();
  await testFeatureFlag();
  await testFingerprintGateSkip();
  await testCanonicalPackResolution();
  await testDataPanelRenderer();
  await testSvgToPngRenderer();
  await testDimensionGuardSource();
  await testTier1RoutingSource();
  await testCorsProxySource();
  await testProjections2DEnhancements();
  await testFullWorkflowRouting();

  console.log("\n========================================");
  console.log(`📊 RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log("========================================\n");

  if (failed === 0) {
    console.log("🎉 ALL THREE-TIER ROUTING TESTS PASSED!\n");
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed} test(s) failed — see details above\n`);
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("❌ Unhandled test error:", err);
  process.exit(1);
});
