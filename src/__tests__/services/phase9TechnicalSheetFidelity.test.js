import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { extractSideFacade } from "../../services/facade/sideFacadeExtractor.js";
import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { selectSectionCandidates } from "../../services/drawing/sectionCutPlanner.js";
import { runA1FinalSheetRegression } from "../../services/a1/a1FinalSheetRegressionService.js";
import { buildA1ComposeBlockingState } from "../../services/a1/a1ComposeBlockingService.js";
import { assessA1ComposeReadiness } from "../../services/a1/a1ComposeReadinessService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createGeometry() {
  return {
    project_id: "phase9-tech-sheet",
    schema_version: "canonical-project-geometry-v2",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0, 0, 12, 10),
    },
    roof: {
      type: "pitched gable",
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 24,
        bbox: { min_x: 0, min_y: 0, max_x: 6, max_y: 4.5 },
      },
      {
        id: "kitchen",
        name: "Kitchen",
        level_id: "ground",
        actual_area: 18,
        bbox: { min_x: 6, min_y: 0, max_x: 12, max_y: 4.5 },
      },
      {
        id: "bedroom",
        name: "Bedroom 1",
        level_id: "first",
        actual_area: 16,
        bbox: { min_x: 0, min_y: 0, max_x: 6, max_y: 4.5 },
      },
    ],
    walls: [
      {
        id: "wall-south-ground",
        level_id: "ground",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        metadata: { side: "south", features: ["porch"] },
      },
      {
        id: "wall-east-ground",
        level_id: "ground",
        exterior: true,
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east" },
      },
      {
        id: "wall-west-ground",
        level_id: "ground",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west" },
      },
      {
        id: "wall-east-first",
        level_id: "first",
        exterior: true,
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east", features: ["balcony"] },
      },
      {
        id: "wall-west-first",
        level_id: "first",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west", features: ["dormer"] },
      },
    ],
    windows: [
      {
        id: "window-east-ground",
        wall_id: "wall-east-ground",
        level_id: "ground",
        position_m: { x: 12, y: 3 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-east-first",
        wall_id: "wall-east-first",
        level_id: "first",
        position_m: { x: 12, y: 6.5 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-west-ground",
        wall_id: "wall-west-ground",
        level_id: "ground",
        position_m: { x: 0, y: 2.5 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-east-ground",
        wall_id: "wall-east-ground",
        level_id: "ground",
        position_m: { x: 12, y: 7.8 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        bbox: { min_x: 5.2, min_y: 1.5, max_x: 6.8, max_y: 7.8 },
      },
    ],
    entrances: [
      {
        id: "main-entry",
        position_m: { x: 11.8, y: 7.8 },
      },
    ],
    circulation: [
      {
        id: "main-circulation",
        polyline: [
          { x: 2, y: 7.8 },
          { x: 6, y: 7.8 },
          { x: 10, y: 7.8 },
        ],
      },
    ],
    metadata: {},
  };
}

function createFacadeGrammar() {
  return {
    orientations: [
      {
        side: "east",
        material_zones: [
          { material: "primary facade" },
          { material: "secondary accent" },
        ],
        opening_rhythm: { opening_count: 3 },
        components: {
          bays: [{ id: "bay-east-1" }, { id: "bay-east-2" }],
          balconies: [{ id: "balcony-east-1" }],
        },
      },
      {
        side: "west",
        material_zones: [{ material: "primary facade" }],
        opening_rhythm: { opening_count: 2 },
        components: {
          bays: [{ id: "bay-west-1" }],
          feature_frames: [{ id: "frame-west-1" }],
        },
      },
    ],
  };
}

describe("Phase 9 technical sheet fidelity", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("extracts canonical side facade data for east and west elevations", () => {
    const geometry = createGeometry();
    const facadeGrammar = createFacadeGrammar();

    const eastFacade = extractSideFacade(
      geometry,
      { roof_language: "pitched gable" },
      { orientation: "east", facadeGrammar },
    );
    const westFacade = extractSideFacade(
      geometry,
      { roof_language: "pitched gable" },
      { orientation: "west", facadeGrammar },
    );

    expect(eastFacade.geometrySource).toBe("explicit_side_walls");
    expect(eastFacade.projectedOpenings.length).toBeGreaterThan(1);
    expect(eastFacade.rhythmCount).toBeGreaterThan(0);
    expect(eastFacade.features.some((entry) => entry.type === "balcony")).toBe(
      true,
    );
    expect(westFacade.features.some((entry) => entry.type === "dormer")).toBe(
      true,
    );
    expect(eastFacade.status).not.toBe("block");
    expect(westFacade.status).not.toBe("block");
  });

  test("renders richer east elevation from explicit side facade geometry", () => {
    const result = renderElevationSvg(
      createGeometry(),
      {
        roof_language: "pitched gable",
        materials: [
          { role: "primary", name: "Brick", color: "#B55D4C" },
          { role: "secondary", name: "Timber", color: "#9A6A3A" },
          { role: "roof", name: "Slate", color: "#5F6670" },
        ],
      },
      {
        orientation: "east",
        facadeGrammar: createFacadeGrammar(),
      },
    );

    expect(result.svg).toContain("Elevation - EAST");
    expect(result.technical_quality_metadata.geometry_source).toBe(
      "explicit_side_walls",
    );
    expect(result.technical_quality_metadata.side_facade_status).not.toBe(
      "block",
    );
    expect(
      result.technical_quality_metadata.facade_richness_score,
    ).toBeGreaterThan(0.62);
  });

  test("ranks section candidates with semantic quality metadata", () => {
    const candidates = selectSectionCandidates(createGeometry());

    expect(candidates.version).toBe("phase9-section-cut-planner-v1");
    expect(candidates.candidates.length).toBeGreaterThan(2);
    expect(candidates.candidates[0].sectionCandidateQuality).toBeDefined();
    expect(candidates.candidates[0].categoryScores).toBeTruthy();
    expect(candidates.candidates[0].score).toBeGreaterThanOrEqual(
      candidates.candidates[1].score,
    );
  });

  test("final sheet regression blocks missing technical credibility and text safety", () => {
    const regression = runA1FinalSheetRegression({
      drawings: {
        elevation: [
          {
            orientation: "south",
            svg: "<svg><text>South</text></svg>",
            technical_quality_metadata: {
              facade_richness_score: 0.72,
              geometry_source: "explicit_side_walls",
            },
          },
        ],
      },
      fontReadiness: {
        readyForEmbedding: false,
        fullEmbeddingReady: false,
      },
      sheetSvg:
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Sheet Title</text></svg>',
      expectedLabels: ["SOUTH ELEVATION"],
    });

    expect(regression.finalSheetRegressionReady).toBe(false);
    expect(
      regression.blockers.some((entry) => entry.includes("Elevation east")),
    ).toBe(true);
    expect(regression.blockers.some((entry) => entry.includes("font"))).toBe(
      true,
    );
    expect(regression.textZoneSanity.status).toBe("block");
  });

  test("compose blocking includes phase 9 final sheet regression blockers", () => {
    const blocking = buildA1ComposeBlockingState({
      projectGeometry: createGeometry(),
      validationReport: { status: "valid_with_warnings" },
      freshness: { missingAssets: [], stalePanels: [] },
      technicalPanelGate: { technicalReady: true, blockingReasons: [] },
      consistencyGuard: { consistencyReady: true, blockingReasons: [] },
      fontReadiness: { readyForEmbedding: true, fullEmbeddingReady: true },
      finalSheetRegression: {
        finalSheetRegressionReady: false,
        blockers: [
          "Elevation east failed the Phase 9 side-facade credibility gate.",
        ],
      },
    });

    expect(blocking.composeReady).toBe(false);
    expect(blocking.blockingReasons).toContain(
      "Elevation east failed the Phase 9 side-facade credibility gate.",
    );
  });

  test("compose readiness exposes phase 9 regression and fragment status", () => {
    const geometry = createGeometry();
    const facadeGrammar = createFacadeGrammar();
    setFeatureFlag("useSectionSemanticSelectionPhase9", true);

    const eastElevation = renderElevationSvg(
      geometry,
      { roof_language: "pitched gable" },
      { orientation: "east", facadeGrammar },
    );
    const westElevation = renderElevationSvg(
      geometry,
      { roof_language: "pitched gable" },
      { orientation: "west", facadeGrammar },
    );

    const readiness = assessA1ComposeReadiness({
      projectGeometry: geometry,
      drawings: {
        plan: [],
        elevation: [eastElevation, westElevation],
        section: [],
      },
      facadeGrammar,
      validationReport: { status: "valid_with_warnings" },
    });

    expect(readiness.finalSheetRegression).toBeTruthy();
    expect(
      readiness.finalSheetRegression.perSideElevationStatus.east,
    ).toBeTruthy();
    expect(
      Array.isArray(readiness.finalSheetRegression.technicalFragmentScores),
    ).toBe(true);
  });
});
