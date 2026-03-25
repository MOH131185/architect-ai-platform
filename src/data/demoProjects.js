/**
 * Demo Projects — curated pre-generated outputs for investor demo mode.
 *
 * Artifacts live in public/demo/ and are served as static assets.
 * Data sourced from debug_runs/three_tier_1770763566251/ (real generation output).
 */

// --- Master DNA (inlined from debug run) ---
const RESIDENTIAL_DNA = {
  dimensions: {
    length: 10.9,
    width: 7.2,
    height: 6.4,
    floors: 2,
    totalHeight: 6.4,
    floorCount: 2,
  },
  materials: [
    { name: "brick", hexColor: "#B8604E", application: "exterior walls" },
    { name: "wood", hexColor: "#8B4513", application: "roof" },
    { name: "glass", hexColor: "#CCCCCC", application: "trim" },
  ],
  roof: { type: "gable", pitch: 35, material: "wood" },
  rooms: [
    {
      name: "Living Room",
      area_m2: 28,
      floor: "ground",
      orientation: "any",
      instanceId: "room_gf_001",
    },
    {
      name: "Kitchen-Dining",
      area_m2: 30,
      floor: "ground",
      orientation: "any",
      instanceId: "room_gf_002",
    },
    {
      name: "Hallway",
      area_m2: 8,
      floor: "ground",
      orientation: "any",
      instanceId: "room_gf_003",
    },
    {
      name: "WC",
      area_m2: 3,
      floor: "ground",
      orientation: "any",
      instanceId: "room_gf_004",
    },
    {
      name: "Utility",
      area_m2: 5,
      floor: "ground",
      orientation: "any",
      instanceId: "room_gf_005",
    },
    {
      name: "Master Bedroom",
      area_m2: 22,
      floor: "first",
      orientation: "any",
      instanceId: "room_ff_001",
    },
    {
      name: "Bedroom 2",
      area_m2: 16,
      floor: "first",
      orientation: "any",
      instanceId: "room_ff_002",
    },
    {
      name: "Bedroom 3",
      area_m2: 12,
      floor: "first",
      orientation: "any",
      instanceId: "room_ff_003",
    },
    {
      name: "Bathroom",
      area_m2: 8,
      floor: "first",
      orientation: "any",
      instanceId: "room_ff_004",
    },
    {
      name: "En-suite",
      area_m2: 5,
      floor: "first",
      orientation: "any",
      instanceId: "room_ff_005",
    },
  ],
  architecturalStyle: "modern",
  locationContext: "temperate oceanic climate, northern hemisphere orientation",
  climateDesign: {
    zone: "temperate oceanic",
    orientation: "northern hemisphere",
  },
  _structured: {
    version: "2.0",
    site: {
      polygon: [],
      area_m2: 150,
      orientation: 0,
      climate_zone: "temperate oceanic",
      sun_path: "northern hemisphere",
      wind_profile: "moderate",
    },
    program: { floors: 2, rooms: [] }, // trimmed — full DNA is in masterDNA.json
    style: {
      architecture: "modern",
      materials: ["brick", "wood", "glass"],
      windows: { pattern: "regular", proportion: "large" },
    },
    geometry_rules: { grid: "rectangular", max_span: "6m", roof_type: "gable" },
    dnaHash: "491d6cab0ea44008",
  },
  designFingerprint: "design_77777_1770763573403",
};

// --- SVG panel list (Tier 1 — locally generated, always available) ---
const SVG_PANELS = [
  "floor_plan_ground",
  "floor_plan_first",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
];

// --- Demo projects ---
export const DEMO_PROJECTS = [
  {
    id: "demo_residential_001",
    name: "Modern Family Home — London",
    description: "2-storey brick & timber home, 150 m², 10 rooms, gable roof",
    masterDNA: RESIDENTIAL_DNA,
    composedSheetUrl: "/demo/residential/a1_sheet.png",
    svgPanels: SVG_PANELS,
    seed: 77777,
    elapsedSeconds: 175,
    report: {
      totalPanels: 15,
      fluxCallCount: 4,
      tier1: { count: 8, allUsedSVG: true },
      tier2: { count: 2, panels: ["hero_3d", "axonometric"] },
      tier3: { count: 2, panels: ["interior_3d", "site_diagram"] },
      data: {
        count: 3,
        panels: ["schedules_notes", "material_palette", "climate_card"],
      },
    },
  },
];

/**
 * Check if demo mode is active.
 */
export function isDemoMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("demo") === "true" ||
    sessionStorage.getItem("investorDemo") === "true"
  );
}

/**
 * Get a demo project by ID.
 */
export function getDemoProject(id) {
  return DEMO_PROJECTS.find((p) => p.id === id) || DEMO_PROJECTS[0];
}

/**
 * Build a result object matching the shape consumed by ResultsStep / A1SheetViewer / A1PanelGallery.
 */
export function buildDemoResult(project) {
  const basePath = "/demo/residential";

  const panels = project.svgPanels.map((type) => ({
    type,
    imageUrl: `${basePath}/panels/${type}.svg`,
    url: `${basePath}/panels/${type}.svg`,
    dataUrl: `${basePath}/panels/${type}.svg`,
    svg: true,
  }));

  const panelMap = {};
  for (const p of panels) {
    panelMap[p.type] = p;
  }

  return {
    // Primary URLs consumed by A1SheetViewer
    composedSheetUrl: project.composedSheetUrl,
    url: project.composedSheetUrl,

    success: true,
    workflow: "multi_panel",
    seed: project.seed,

    // DNA
    masterDNA: project.masterDNA,
    dna: project.masterDNA,

    // Panels — consumed by ResultsStep.a1SheetData and A1PanelGallery
    panels,
    panelMap,

    // Metadata
    metadata: {
      panelCount: project.report.totalPanels,
      totalElapsed: project.elapsedSeconds,
      workflow: "multi_panel",
      tier1: project.report.tier1,
      tier2: project.report.tier2,
      tier3: project.report.tier3,
      data: project.report.data,
      fluxCallCount: project.report.fluxCallCount,
      isDemo: true,
    },

    designId: project.id,

    // Flag for components to detect demo mode
    _isDemo: true,
  };
}
