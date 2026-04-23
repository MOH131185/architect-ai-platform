/**
 * Prompt 7 integration benchmark:
 * - compiles 5 fixed residential cases into CompiledProject authority
 * - builds compiled-project canonical technical packs
 * - verifies technical A1 routing uses compiled_project authority
 * - verifies 2D and 3D stay on one geometryHash
 * - fails if legacy BuildingModel/Projections2D authority leaks back in
 * - runs publishability consistency gating on the assembled board artifact
 *
 * Run with:
 *   node scripts/tests/test-compiled-project-benchmark.mjs
 */

import fs from "node:fs/promises";

import { compileProject } from "../../src/services/compiler/index.js";
import { buildCanonicalPack } from "../../src/services/canonical/CanonicalGeometryPackService.js";
import { buildCompiledProjectTechnicalPanels } from "../../src/services/canonical/compiledProjectTechnicalPackBuilder.js";
import {
  isTechnicalPanel,
  resolveDirectPanelRoute,
} from "../../src/services/design/panelAuthorityRouter.js";
import { runUnifiedPipeline } from "../../src/services/pipeline/unifiedGeometryPipeline.js";
import { validateBeforeGeneration } from "../../src/services/canonical/CanonicalPackGate.js";
import { computeCDSHashSync } from "../../src/services/validation/cdsHash.js";

const results = { passed: 0, failed: 0, tests: [] };
let testChain = Promise.resolve();

function test(name, fn) {
  testChain = testChain.then(async () => {
    try {
      await fn();
      results.passed += 1;
      results.tests.push({ name, status: "PASS" });
      console.log(`  ✅ ${name}`);
    } catch (error) {
      results.failed += 1;
      results.tests.push({ name, status: "FAIL", error: error.message });
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
    }
  });
  return testChain;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message ||
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function roofPrimitives(mode, x0, y0, x1, y1, ridgeHeightM, eaveDepthM) {
  const midX = Number(((x0 + x1) / 2).toFixed(3));
  const midY = Number(((y0 + y1) / 2).toFixed(3));

  if (mode === "flat") {
    return [
      {
        id: "parapet-north",
        primitive_family: "parapet",
        side: "north",
        start: { x: x0, y: y0 },
        end: { x: x1, y: y0 },
      },
      {
        id: "parapet-south",
        primitive_family: "parapet",
        side: "south",
        start: { x: x0, y: y1 },
        end: { x: x1, y: y1 },
      },
      {
        id: "parapet-east",
        primitive_family: "parapet",
        side: "east",
        start: { x: x1, y: y0 },
        end: { x: x1, y: y1 },
      },
      {
        id: "parapet-west",
        primitive_family: "parapet",
        side: "west",
        start: { x: x0, y: y0 },
        end: { x: x0, y: y1 },
      },
      {
        id: "roof-break-center",
        primitive_family: "roof_break",
        start: { x: midX, y: y0 },
        end: { x: midX, y: y1 },
      },
    ];
  }

  return [
    {
      id: "plane-west",
      primitive_family: "roof_plane",
      polygon: rectangle(x0, y0, midX, y1),
      slope_deg: ridgeHeightM >= 4 ? 38 : 32,
      eave_depth_m: eaveDepthM,
    },
    {
      id: "plane-east",
      primitive_family: "roof_plane",
      polygon: rectangle(midX, y0, x1, y1),
      slope_deg: ridgeHeightM >= 4 ? 38 : 32,
      eave_depth_m: eaveDepthM,
    },
    {
      id: "ridge-main",
      primitive_family: "ridge",
      start: { x: midX, y: y0 },
      end: { x: midX, y: y1 },
      ridge_height_m: ridgeHeightM,
    },
    {
      id: "eave-north",
      primitive_family: "eave",
      side: "north",
      start: { x: x0, y: y0 },
      end: { x: x1, y: y0 },
    },
    {
      id: "eave-south",
      primitive_family: "eave",
      side: "south",
      start: { x: x0, y: y1 },
      end: { x: x1, y: y1 },
    },
  ];
}

function createBenchmarkInput(config) {
  const {
    id,
    city,
    region,
    country,
    climateType,
    climateZone,
    localeStyle,
    portfolioStyle,
    localMaterials,
    facadeLanguage,
    roofMode = "gable",
    roofLabel = roofMode === "flat" ? "flat parapet" : "pitched gable",
    width = 12,
    depth = 8,
    levels = 2,
    localWeight = 0.4,
    portfolioWeight = 0.6,
    buildingOrientation = 180,
    ridgeHeightM = roofMode === "flat" ? 0.8 : 3.6,
    eaveDepthM = roofMode === "flat" ? 0.15 : 0.65,
  } = config;

  const x0 = 3;
  const y0 = 2;
  const x1 = x0 + width;
  const y1 = y0 + depth;
  const midX = Number(((x0 + x1) / 2).toFixed(3));
  const qxLeft = Number((x0 + width * 0.22).toFixed(3));
  const qxRight = Number((x0 + width * 0.78).toFixed(3));
  const qyMid = Number((y0 + depth * 0.42).toFixed(3));
  const qyUpper = Number((y0 + depth * 0.66).toFixed(3));

  const projectLevels = [];
  const projectRooms = [];
  const projectWalls = [];
  const projectWindows = [];
  const projectDoors = [];

  for (let levelIndex = 0; levelIndex < levels; levelIndex += 1) {
    const levelId = levelIndex === 0 ? "ground" : `level-${levelIndex}`;
    const levelName =
      levelIndex === 0 ? "Ground Floor" : `Level ${levelIndex + 1}`;

    projectLevels.push({
      id: levelId,
      level_number: levelIndex,
      name: levelName,
      height_m: levelIndex === levels - 1 ? 3.0 : 3.2,
      footprint: rectangle(x0, y0, x1, y1),
    });

    projectWalls.push(
      {
        id: `${levelId}-north`,
        level_id: levelId,
        exterior: true,
        kind: "exterior",
        side: "north",
        start: { x: x0, y: y0 },
        end: { x: x1, y: y0 },
        thickness_m: 0.24,
        metadata: levelIndex > 0 ? { features: ["dormer"] } : {},
      },
      {
        id: `${levelId}-south`,
        level_id: levelId,
        exterior: true,
        kind: "exterior",
        side: "south",
        start: { x: x0, y: y1 },
        end: { x: x1, y: y1 },
        thickness_m: 0.24,
        metadata: levelIndex === 0 ? { features: ["porch"] } : {},
      },
      {
        id: `${levelId}-east`,
        level_id: levelId,
        exterior: true,
        kind: "exterior",
        side: "east",
        start: { x: x1, y: y0 },
        end: { x: x1, y: y1 },
        thickness_m: 0.24,
      },
      {
        id: `${levelId}-west`,
        level_id: levelId,
        exterior: true,
        kind: "exterior",
        side: "west",
        start: { x: x0, y: y0 },
        end: { x: x0, y: y1 },
        thickness_m: 0.24,
      },
      {
        id: `${levelId}-core`,
        level_id: levelId,
        exterior: false,
        kind: "interior",
        start: { x: midX, y: y0 + 0.4 },
        end: { x: midX, y: y1 - 0.6 },
        thickness_m: 0.14,
      },
    );

    projectWindows.push(
      {
        id: `${levelId}-north-left-window`,
        level_id: levelId,
        wall_id: `${levelId}-north`,
        width_m: 1.7,
        sill_height_m: 0.9,
        head_height_m: 2.1,
        position_m: { x: qxLeft, y: y0 },
      },
      {
        id: `${levelId}-north-right-window`,
        level_id: levelId,
        wall_id: `${levelId}-north`,
        width_m: 1.6,
        sill_height_m: 0.9,
        head_height_m: 2.1,
        position_m: { x: qxRight, y: y0 },
      },
      {
        id: `${levelId}-south-window`,
        level_id: levelId,
        wall_id: `${levelId}-south`,
        width_m: 1.8,
        sill_height_m: 0.9,
        head_height_m: 2.1,
        position_m: {
          x: Number((x0 + width * (levelIndex === 0 ? 0.76 : 0.7)).toFixed(3)),
          y: y1,
        },
      },
      {
        id: `${levelId}-east-window`,
        level_id: levelId,
        wall_id: `${levelId}-east`,
        width_m: 1.3,
        sill_height_m: 0.9,
        head_height_m: 2.1,
        position_m: { x: x1, y: qyMid },
      },
      {
        id: `${levelId}-west-window`,
        level_id: levelId,
        wall_id: `${levelId}-west`,
        width_m: 1.3,
        sill_height_m: 0.9,
        head_height_m: 2.1,
        position_m: { x: x0, y: qyUpper },
      },
    );

    if (levelIndex === 0) {
      projectDoors.push({
        id: `${levelId}-main-door`,
        level_id: levelId,
        wall_id: `${levelId}-south`,
        width_m: 1.05,
        head_height_m: 2.2,
        position_m: { x: Number((x0 + width * 0.36).toFixed(3)), y: y1 },
        swing: "left-in",
      });

      projectRooms.push(
        {
          id: "living",
          level_id: levelId,
          name: "Living Room",
          type: "living",
          actual_area: Number((width * depth * 0.24).toFixed(2)),
          polygon: rectangle(x0 + 0.4, y0 + 0.4, midX - 0.3, y0 + depth * 0.52),
        },
        {
          id: "kitchen",
          level_id: levelId,
          name: "Kitchen",
          type: "kitchen",
          actual_area: Number((width * depth * 0.2).toFixed(2)),
          polygon: rectangle(midX + 0.2, y0 + 0.4, x1 - 0.4, y0 + depth * 0.52),
        },
        {
          id: "entry",
          level_id: levelId,
          name: "Entry",
          type: "circulation",
          actual_area: Number((width * depth * 0.09).toFixed(2)),
          polygon: rectangle(midX - 1.3, y0 + depth * 0.56, midX + 1.2, y1 - 0.5),
        },
      );
    } else {
      projectRooms.push(
        {
          id: `${levelId}-bed-left`,
          level_id: levelId,
          name: `Bedroom ${levelIndex * 2 - 1}`,
          type: "bedroom",
          actual_area: Number((width * depth * 0.18).toFixed(2)),
          polygon: rectangle(x0 + 0.5, y0 + 0.4, midX - 0.5, y0 + depth * 0.54),
        },
        {
          id: `${levelId}-bed-right`,
          level_id: levelId,
          name: `Bedroom ${levelIndex * 2}`,
          type: "bedroom",
          actual_area: Number((width * depth * 0.18).toFixed(2)),
          polygon: rectangle(midX + 0.3, y0 + 0.4, x1 - 0.5, y0 + depth * 0.54),
        },
        {
          id: `${levelId}-landing`,
          level_id: levelId,
          name: "Landing",
          type: "circulation",
          actual_area: Number((width * depth * 0.08).toFixed(2)),
          polygon: rectangle(midX - 1.2, y0 + depth * 0.58, midX + 1.2, y1 - 0.6),
        },
      );
    }
  }

  return {
    project_id: id,
    locationData: {
      city,
      region,
      country,
      recommendedStyle: localeStyle,
      localMaterials,
      climate: {
        type: climateType,
        zone: climateZone,
      },
      optimalOrientation: buildingOrientation,
    },
    materialPriority: {
      primary: localMaterials[0],
      secondary: localMaterials[1] || localMaterials[0],
    },
    masterDNA: {
      buildingOrientation,
      climateDesign: {
        thermal: {
          strategy:
            climateType.toLowerCase().includes("cold") ||
            climateType.toLowerCase().includes("continental")
              ? "high-insulation envelope"
              : climateType.toLowerCase().includes("hot")
                ? "shaded ventilated envelope"
                : "compact insulated envelope",
        },
        solar: {
          shading:
            climateType.toLowerCase().includes("hot") ? "deep external shading" : "moderate seasonal shading",
        },
        ventilation: {
          strategy:
            climateType.toLowerCase().includes("humid")
              ? "cross ventilation"
              : "controlled mixed-mode ventilation",
        },
      },
      styleWeights: {
        local: localWeight,
        portfolio: portfolioWeight,
        localStyle: localeStyle,
        portfolioStyle,
        dominantInfluence:
          portfolioWeight >= localWeight ? "portfolio" : "local",
      },
    },
    styleDNA: {
      vernacularStyle: localeStyle,
      facade_language: facadeLanguage,
      roof_language: roofLabel,
      window_language: "grouped rhythmic",
      roof_material: localMaterials[2] || localMaterials[0],
      materials: localMaterials,
    },
    projectGeometry: {
      project_id: id,
      site: {
        boundary_bbox: {
          min_x: 0,
          min_y: 0,
          max_x: x1 + 3,
          max_y: y1 + 4,
          width: x1 + 3,
          height: y1 + 4,
        },
        buildable_bbox: {
          min_x: 1,
          min_y: 1,
          max_x: x1 + 2,
          max_y: y1 + 3,
          width: x1 + 1,
          height: y1 + 2,
        },
        boundary_polygon: rectangle(0, 0, x1 + 3, y1 + 4),
        buildable_polygon: rectangle(1, 1, x1 + 2, y1 + 3),
      },
      metadata: {
        style_dna: {
          facade_language: facadeLanguage,
          roof_language: roofLabel,
        },
      },
      levels: projectLevels,
      rooms: projectRooms,
      walls: projectWalls,
      windows: projectWindows,
      doors: projectDoors,
      stairs: [
        {
          id: "stair-main",
          level_id: "ground",
          type: "straight_run",
          polygon: rectangle(midX - 1.25, y0 + depth * 0.54, midX + 1.25, y1 - 0.45),
        },
      ],
      roof: {
        id: "roof-main",
        type: roofLabel,
        polygon: rectangle(x0, y0, x1, y1),
      },
      roof_primitives: roofPrimitives(
        roofMode,
        x0,
        y0,
        x1,
        y1,
        ridgeHeightM,
        eaveDepthM,
      ),
    },
  };
}

function deriveRoofSilhouetteHash(compiledProject = {}) {
  return computeCDSHashSync({
    roofType: compiledProject.roof?.type || "unknown",
    planes: (compiledProject.roof?.planes || []).map((entry) => ({
      polygon: entry.polygon || [],
      slope_deg: entry.slope_deg || entry.slopeDeg || null,
    })),
    ridges: (compiledProject.roof?.ridges || []).map((entry) => ({
      start: entry.start || null,
      end: entry.end || null,
    })),
    eaves: (compiledProject.roof?.eaves || []).map((entry) => ({
      side: entry.side || null,
      start: entry.start || null,
      end: entry.end || null,
    })),
    parapets: (compiledProject.roof?.parapets || []).map((entry) => ({
      side: entry.side || null,
      start: entry.start || null,
      end: entry.end || null,
    })),
  });
}

function computeFacadeOpeningCounts(projectGeometry = {}) {
  const wallSides = new Map(
    (projectGeometry.walls || []).map((wall) => [
      wall.id,
      String(wall.side || wall.metadata?.side || "").trim().toUpperCase().slice(0, 1),
    ]),
  );
  const counts = { N: 0, S: 0, E: 0, W: 0 };

  const countOpenings = (entries = []) => {
    entries.forEach((entry) => {
      const side = wallSides.get(entry.wall_id);
      if (side && counts[side] !== undefined) {
        counts[side] += 1;
      }
    });
  };

  countOpenings(projectGeometry.windows || []);
  countOpenings(projectGeometry.doors || []);
  return counts;
}

function mapTechnicalPanelsToPublishArtifact(
  pack = {},
  compiledProject = {},
  projectGeometry = {},
  unified = {},
  boardQuality = {},
) {
  const roofSilhouetteHash = deriveRoofSilhouetteHash(compiledProject);
  const planEntries = [];
  const elevationEntries = [];
  const sectionEntries = [];

  Object.entries(pack.panels || {}).forEach(([panelType, panel]) => {
    if (!isTechnicalPanel(panelType)) {
      return;
    }

    const technicalQualityMetadata = panel.technicalQualityMetadata || {};
    const baseEntry = {
      panelType,
      type: panelType,
      svg: panel.svgString,
      renderer: panel.renderer || "deterministic-svg",
      format: "svg",
      geometryHash: panel.geometryHash,
      technical_quality_metadata: technicalQualityMetadata,
      roofSilhouetteHash:
        technicalQualityMetadata.roof_silhouette_hash || roofSilhouetteHash,
    };

    if (panelType.startsWith("floor_plan_")) {
      planEntries.push({
        ...baseEntry,
        level_id:
          projectGeometry.levels?.[planEntries.length]?.id ||
          panelType.replace("floor_plan_", ""),
      });
      return;
    }

    if (panelType.startsWith("elevation_")) {
      elevationEntries.push({
        ...baseEntry,
        orientation: panelType.replace("elevation_", ""),
        window_count:
          technicalQualityMetadata.window_count ||
          technicalQualityMetadata.windowCount ||
          0,
        door_count:
          technicalQualityMetadata.door_count ||
          technicalQualityMetadata.doorCount ||
          0,
      });
      return;
    }

    sectionEntries.push({
      ...baseEntry,
      section_type: panelType === "section_AA" ? "longitudinal" : "transverse",
      sectionCutIntersectsGeometry:
        Number(technicalQualityMetadata.section_direct_evidence_count || 0) > 0,
    });
  });

  return {
    geometryHashes: {
      twoD: pack.geometryHash,
      threeD: unified.results?.metadata?.geometryHash || null,
    },
    projectGeometry,
    geometry: projectGeometry,
    compiledGeometry: {
      facadeOpeningCounts: computeFacadeOpeningCounts(projectGeometry),
      roofSilhouetteHash,
    },
    roofSilhouetteHash,
    hero: {
      ...(unified.results?.stylizedViews?.hero_3d || {}),
      panelType: "hero_3d",
      roofSilhouetteHash,
    },
    panels: Object.entries(unified.results?.stylizedViews || {})
      .filter(([panelType]) => !isTechnicalPanel(panelType))
      .map(([, entry]) => entry),
    drawings: {
      plan: planEntries,
      elevation: elevationEntries,
      section: sectionEntries,
    },
    board: {
      metrics: {
        occupancyRatio: boardQuality.occupancyRatio ?? 0.64,
      },
      readability: {
        score: boardQuality.readabilityScore ?? 0.84,
      },
    },
  };
}

async function withMockedFetch(fn) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      mode: "edit",
      geometryPreserved: true,
      data: [{ url: "https://example.com/stylized.png" }],
    }),
  });

  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

async function assertNoLegacyAuthorityLabel() {
  const orchestratorPath =
    "C:/Users/21366/OneDrive/Documents/GitHub/architect-ai-platform/src/services/dnaWorkflowOrchestrator.js";
  const source = await fs.readFile(orchestratorPath, "utf8");
  assert(
    !source.includes('"buildingmodel_projections2d"'),
    "Legacy BuildingModel/Projections2D label still exists in the live A1 orchestrator path.",
  );
}

const BENCHMARK_CASES = [
  {
    id: "bench-uk-temperate",
    city: "York",
    region: "North Yorkshire",
    country: "United Kingdom",
    climateType: "temperate oceanic",
    climateZone: "Cfb",
    localeStyle: "Contemporary Vernacular",
    portfolioStyle: "Nordic Minimal",
    localMaterials: ["brick", "timber", "slate"],
    facadeLanguage: "stacked-solid-void-rhythm",
    roofMode: "gable",
  },
  {
    id: "bench-spain-mediterranean",
    city: "Seville",
    region: "Andalusia",
    country: "Spain",
    climateType: "hot-summer Mediterranean",
    climateZone: "Csa",
    localeStyle: "Mediterranean Vernacular",
    portfolioStyle: "Warm Minimal",
    localMaterials: ["lime render", "terracotta", "tile"],
    facadeLanguage: "shaded-courtyard-rhythm",
    roofMode: "flat",
    width: 13,
    depth: 8.5,
    localWeight: 0.55,
    portfolioWeight: 0.45,
  },
  {
    id: "bench-us-humid-subtropical",
    city: "Miami",
    region: "Florida",
    country: "United States",
    climateType: "humid subtropical",
    climateZone: "Cfa",
    localeStyle: "Coastal Modern",
    portfolioStyle: "Portfolio Warm Modern",
    localMaterials: ["stucco", "timber", "metal"],
    facadeLanguage: "shaded-horizontal-composition",
    roofMode: "flat",
    width: 12.5,
    depth: 8.2,
    buildingOrientation: 165,
  },
  {
    id: "bench-de-cold-continental",
    city: "Munich",
    region: "Bavaria",
    country: "Germany",
    climateType: "cold continental",
    climateZone: "Dfb",
    localeStyle: "Alpine Contemporary",
    portfolioStyle: "Nordic Crafted",
    localMaterials: ["stone", "timber", "metal"],
    facadeLanguage: "solid-base-light-upper-rhythm",
    roofMode: "gable",
    width: 11.8,
    depth: 8.6,
    localWeight: 0.48,
    portfolioWeight: 0.52,
    ridgeHeightM: 4.1,
    eaveDepthM: 0.75,
  },
  {
    id: "bench-sg-tropical",
    city: "Singapore",
    region: "Central Region",
    country: "Singapore",
    climateType: "tropical rainforest",
    climateZone: "Af",
    localeStyle: "Tropical Contemporary",
    portfolioStyle: "Lightweight Modern",
    localMaterials: ["render", "timber", "aluminium"],
    facadeLanguage: "deep-shade-void-rhythm",
    roofMode: "flat",
    width: 12.2,
    depth: 8.4,
    localWeight: 0.5,
    portfolioWeight: 0.5,
    buildingOrientation: 150,
  },
];

async function runBenchmarkCase(config) {
  const input = createBenchmarkInput(config);
  const compiledProject = compileProject(input);

  assertEqual(
    compiledProject.metadata?.source,
    "compiled_project",
    `${config.id}: compileProject did not return compiled_project authority`,
  );

  const technicalBuild = buildCompiledProjectTechnicalPanels({
    compiledProject,
    styleDNA: input.styleDNA,
  });
  assert(
    technicalBuild.ok,
    `${config.id}: technical build failed: ${technicalBuild.failures
      .map((failure) => `${failure.panelType}: ${failure.message}`)
      .join("; ")}`,
  );

  const canonicalPack = buildCanonicalPack({
    compiledProject,
    styleDNA: input.styleDNA,
    designFingerprint: config.id,
  });

  assertEqual(
    canonicalPack.metadata?.source,
    "compiled_project",
    `${config.id}: canonical pack source is not compiled_project`,
  );
  assertEqual(
    canonicalPack.geometryHash,
    compiledProject.geometryHash,
    `${config.id}: canonical pack geometryHash drifted from CompiledProject`,
  );

  const technicalPanelTypes = Object.keys(canonicalPack.panels || {}).filter(
    isTechnicalPanel,
  );
  assert(
    technicalPanelTypes.length >= 7,
    `${config.id}: expected a full technical set, got ${technicalPanelTypes.length} panels`,
  );

  technicalPanelTypes.forEach((panelType) => {
    const decision = resolveDirectPanelRoute(panelType, {
      canonicalPack,
      hasCompiledCanonicalAsset: Boolean(canonicalPack.panels?.[panelType]?.dataUrl),
    });

    assert(decision.direct, `${config.id}:${panelType} did not route as direct SVG`);
    assertEqual(
      decision.authority,
      "compiled_project_canonical_pack",
      `${config.id}:${panelType} is not using compiled-project canonical authority`,
    );
    assert(
      !String(decision.reason || "").toLowerCase().includes("legacy"),
      `${config.id}:${panelType} still reports legacy authority`,
    );
  });

  const unified = await withMockedFetch(() =>
    runUnifiedPipeline(
      {
        style: {
          architecture: input.styleDNA.vernacularStyle,
        },
        program: {
          floors: compiledProject.levels.length,
          buildingType: "residential",
        },
      },
      {
        compiledProject,
        canonicalPack,
        views: ["hero_3d", "axonometric", "elevation_north", "section_AA"],
        useMeshy: false,
      },
    ),
  );

  assert(unified.success, `${config.id}: unified pipeline failed: ${unified.error}`);
  assertEqual(
    unified.results?.metadata?.geometryHash,
    compiledProject.geometryHash,
    `${config.id}: unified pipeline metadata geometryHash drifted`,
  );
  assertEqual(
    unified.results?.stylizedViews?.hero_3d?.geometryHash,
    compiledProject.geometryHash,
    `${config.id}: hero_3d geometryHash drifted`,
  );
  assertEqual(
    unified.results?.stylizedViews?.axonometric?.geometryHash,
    compiledProject.geometryHash,
    `${config.id}: axonometric geometryHash drifted`,
  );
  assertEqual(
    unified.results?.stylizedViews?.elevation_north?.sourceMetadata?.stylizationMode,
    "deterministic_passthrough",
    `${config.id}: elevation_north should remain deterministic`,
  );
  assertEqual(
    unified.results?.stylizedViews?.section_AA?.sourceMetadata?.stylizationMode,
    "deterministic_passthrough",
    `${config.id}: section_AA should remain deterministic`,
  );

  const compiledProjectArtifact = mapTechnicalPanelsToPublishArtifact(
    canonicalPack,
    compiledProject,
    technicalBuild.projectGeometry,
    unified,
    {
      occupancyRatio: 0.63,
      readabilityScore: 0.82,
    },
  );

  const gateResult = validateBeforeGeneration(
    canonicalPack,
    null,
    { levelCount: compiledProject.levels.length },
    {
      strict: false,
      compiledProject: compiledProjectArtifact,
    },
  );

  assert(
    gateResult.valid,
    `${config.id}: compiled-project publish gate failed: ${gateResult.errors.join("; ")}`,
  );
  assertEqual(
    gateResult.compiledProjectReport?.summary?.issueCount || 0,
    0,
    `${config.id}: compiled-project report still contains issues`,
  );

  return {
    id: config.id,
    geometryHash: compiledProject.geometryHash,
    technicalPanelCount: technicalPanelTypes.length,
    heroAuthority:
      unified.results?.stylizedViews?.hero_3d?.sourceMetadata?.authorityType,
    elevationMode:
      unified.results?.stylizedViews?.elevation_north?.sourceMetadata
        ?.stylizationMode,
  };
}

console.log("\n🏗️ Prompt 7: compiled-project end-to-end benchmark\n");

test("0. live A1 orchestrator no longer advertises legacy BuildingModel/Projections2D authority", async () => {
  await assertNoLegacyAuthorityLabel();
});

for (const config of BENCHMARK_CASES) {
  test(`benchmark ${config.id} keeps one compiled-project authority across 2D and 3D`, async () => {
    const summary = await runBenchmarkCase(config);
    console.log(
      `     ↳ ${summary.id}: hash=${summary.geometryHash}, technicalPanels=${summary.technicalPanelCount}, heroAuthority=${summary.heroAuthority}, elevationMode=${summary.elevationMode}`,
    );
  });
}

await testChain;

console.log("\n📊 Summary\n");
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);

if (results.failed > 0) {
  process.exit(1);
}
