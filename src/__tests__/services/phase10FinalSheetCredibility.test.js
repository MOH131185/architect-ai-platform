import sharp from "sharp";

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { extractSideFacade } from "../../services/facade/sideFacadeExtractor.js";
import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { buildSectionGraphic } from "../../services/drawing/sectionGraphicsService.js";
import { selectSectionCandidates } from "../../services/drawing/sectionCutPlanner.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { runA1FinalSheetRegression } from "../../services/a1/a1FinalSheetRegressionService.js";
import { runA1PostComposeVerification } from "../../services/a1/a1PostComposeVerificationService.js";
import { buildA1ComposeBlockingState } from "../../services/a1/a1ComposeBlockingService.js";
import { compareRenderedSheetAgainstFixture } from "../../services/a1/a1RenderedSheetComparator.js";
import { resolveA1RegressionFixture } from "../../services/a1/a1RegressionFixtureService.js";
import { verifyRenderedTextZonesSync } from "../../services/a1/a1RenderedTextVerificationService.js";

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
    project_id: "phase10-tech-sheet",
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
      { id: "ground", level_number: 0, name: "Ground Floor", height_m: 3.2 },
      { id: "first", level_number: 1, name: "First Floor", height_m: 3.1 },
    ],
    slabs: [
      {
        id: "ground-slab",
        level_id: "ground",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
      {
        id: "first-slab",
        level_id: "first",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        polygon: rectangle(0, 0, 7, 4.5),
        bbox: { min_x: 0, min_y: 0, max_x: 7, max_y: 4.5 },
      },
      {
        id: "kitchen",
        name: "Kitchen",
        level_id: "ground",
        actual_area: 18,
        polygon: rectangle(7, 0, 12, 4.5),
        bbox: { min_x: 7, min_y: 0, max_x: 12, max_y: 4.5 },
      },
      {
        id: "bedroom",
        name: "Bedroom 1",
        level_id: "first",
        actual_area: 16,
        polygon: rectangle(0, 0, 6, 4.5),
        bbox: { min_x: 0, min_y: 0, max_x: 6, max_y: 4.5 },
      },
    ],
    walls: [
      {
        id: "wall-east-ground",
        level_id: "ground",
        exterior: true,
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east", features: ["porch", "chimney"] },
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
        id: "wall-west-ground",
        level_id: "ground",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west", features: ["dormer"] },
      },
      {
        id: "wall-west-first",
        level_id: "first",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west", features: ["projection"] },
      },
      {
        id: "wall-core-ground",
        level_id: "ground",
        exterior: false,
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        metadata: { side: "core", features: ["section-anchor"] },
      },
    ],
    windows: [
      {
        id: "window-east-ground",
        wall_id: "wall-east-ground",
        level_id: "ground",
        position_m: { x: 12, y: 2.8 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-east-first",
        wall_id: "wall-east-first",
        level_id: "first",
        position_m: { x: 12, y: 6.2 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-west-ground",
        wall_id: "wall-west-ground",
        level_id: "ground",
        position_m: { x: 0, y: 2.6 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-core-ground",
        wall_id: "wall-core-ground",
        level_id: "ground",
        position_m: { x: 6, y: 4.4 },
        width_m: 1.3,
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
      {
        id: "door-core-ground",
        wall_id: "wall-core-ground",
        level_id: "ground",
        position_m: { x: 6, y: 7.2 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: rectangle(5.2, 1.5, 6.8, 7.8),
        bbox: { min_x: 5.2, min_y: 1.5, max_x: 6.8, max_y: 7.8 },
      },
    ],
    entrances: [{ id: "main-entry", position_m: { x: 11.7, y: 7.8 } }],
    circulation: [
      {
        id: "main-circulation",
        polyline: [
          { x: 1.5, y: 7.8 },
          { x: 6, y: 7.8 },
          { x: 10.5, y: 7.8 },
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
          { material: "primary facade", start_m: 0, end_m: 5 },
          { material: "timber accent", start_m: 5, end_m: 10 },
        ],
        opening_rhythm: { opening_count: 3 },
        components: {
          bays: [{ id: "bay-east-1" }, { id: "bay-east-2" }],
          balconies: [{ id: "balcony-east-1" }],
        },
      },
      {
        side: "west",
        material_zones: [{ material: "primary facade", start_m: 0, end_m: 10 }],
        opening_rhythm: { opening_count: 2 },
        components: {
          bays: [{ id: "bay-west-1" }],
          feature_frames: [{ id: "frame-west-1" }],
        },
      },
    ],
  };
}

function createStyleDNA() {
  return {
    roof_language: "pitched gable",
    materials: [
      { role: "primary", name: "Brick", color: "#B55D4C" },
      { role: "secondary", name: "Timber", color: "#9A6A3A" },
      { role: "roof", name: "Slate", color: "#5F6670" },
    ],
  };
}

function buildFinalSheetSvg(
  coordinates,
  panelLabelMap,
  includeTitleBlock = true,
) {
  const textMarkup = Object.entries(coordinates)
    .map(
      ([key, coordinate]) => `
      <text x="${coordinate.x + coordinate.width / 2}" y="${coordinate.y + coordinate.height - 18}" font-family="ArchiAISans" font-size="18" text-anchor="middle">${panelLabelMap[key]}</text>
      <rect x="${coordinate.x + 20}" y="${coordinate.y + 20}" width="${coordinate.width - 40}" height="${coordinate.height - 70}" fill="none" stroke="#111" stroke-width="2" />
    `,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
    <style>
      @font-face {
        font-family: "ArchiAISans";
        src: url("data:font/ttf;base64,AAEAAA") format("truetype");
        font-weight: 400;
      }
    </style>
    <rect width="1000" height="700" fill="#ffffff" />
    ${textMarkup}
    ${
      includeTitleBlock
        ? `
      <text x="780" y="620" font-family="ArchiAISans" font-size="18">PROJECT ARCHITECT AI</text>
      <text x="780" y="642" font-family="ArchiAISans" font-size="15">SCALE 1:100</text>
      <text x="780" y="664" font-family="ArchiAISans" font-size="15">DATE 2026-04-19</text>
      <text x="930" y="620" font-family="ArchiAISans" font-size="15">A1</text>
      <text x="760" y="380" font-family="ArchiAISans" font-size="15">MATERIAL PALETTE</text>
      <text x="760" y="410" font-family="ArchiAISans" font-size="13">PRIMARY FACADE</text>
      <text x="760" y="492" font-family="ArchiAISans" font-size="15">SPEC NOTES</text>
      <text x="760" y="520" font-family="ArchiAISans" font-size="13">CHECKED</text>
      <text x="40" y="520" font-family="ArchiAISans" font-size="15">LEGEND</text>
      <text x="40" y="548" font-family="ArchiAISans" font-size="13">NORTH</text>
    `
        : ""
    }
    <text x="86" y="84" font-family="ArchiAISans" font-size="14">PLAN</text>
    <text x="86" y="108" font-family="ArchiAISans" font-size="14">ELEVATION</text>
    <text x="86" y="132" font-family="ArchiAISans" font-size="14">SECTION</text>
    <text x="120" y="110" font-family="ArchiAISans" font-size="13">LEVEL</text>
    <text x="420" y="110" font-family="ArchiAISans" font-size="13">MATERIAL</text>
    <text x="120" y="390" font-family="ArchiAISans" font-size="13">FFL</text>
    <text x="160" y="390" font-family="ArchiAISans" font-size="13">ROOM</text>
  </svg>`;
}

describe("Phase 10 final sheet credibility", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("side facade extraction exposes richer phase 10 semantics", () => {
    const facade = extractSideFacade(createGeometry(), createStyleDNA(), {
      orientation: "east",
      facadeGrammar: createFacadeGrammar(),
    });

    expect(facade.openingGroups.length).toBeGreaterThan(0);
    expect(facade.wallZones.length).toBeGreaterThan(1);
    expect(facade.roofEdges.length).toBeGreaterThan(0);
    expect(
      facade.featureFamilies.some((entry) => entry.family === "roof-family"),
    ).toBe(true);
    expect(facade.sideSummary.openingGroupCount).toBeGreaterThan(0);
  });

  test("side facade extraction normalizes orientation aliases and grammar feature families", () => {
    const geometry = createGeometry();
    geometry.walls = geometry.walls.map((wall) => ({
      ...wall,
      metadata:
        wall.metadata?.side === "west"
          ? { ...wall.metadata, side: "W" }
          : wall.metadata,
    }));

    const facade = extractSideFacade(geometry, createStyleDNA(), {
      side: "WEST_ELEVATION",
      facadeGrammar: {
        orientations: [
          {
            orientation: "W",
            components: {
              dormers: [{ id: "dormer-west-1" }],
              chimneys: [{ id: "chimney-west-1" }],
              porches: [{ id: "porch-west-1" }],
            },
          },
        ],
      },
    });

    expect(facade.side).toBe("west");
    expect(facade.features.some((entry) => entry.type === "dormer")).toBe(true);
    expect(facade.features.some((entry) => entry.type === "chimney")).toBe(
      true,
    );
    expect(
      facade.featureFamilies.some((entry) => entry.family === "roof-family"),
    ).toBe(true);
  });

  test("section planner uses specialized strategies and exposes rejected alternatives", () => {
    const result = selectSectionCandidates(createGeometry());

    expect([
      "phase13-section-cut-planner-v1",
      "phase17-section-cut-planner-v1",
    ]).toContain(result.version);
    expect(result.chosenStrategy).toBeTruthy();
    expect(result.candidates[0].chosenStrategy.name).toBeTruthy();
    expect(result.candidates[0].rejectedAlternatives.length).toBeGreaterThan(0);
    expect(result.candidates[0].rejectedAlternatives[0].reason).toBeTruthy();
    expect(
      result.candidates[0].rationale.some((entry) =>
        entry.includes("strategy"),
      ),
    ).toBe(true);
  });

  test("section evidence is cut-specific and captures direct room stair and opening hits", () => {
    const candidates = selectSectionCandidates(createGeometry()).candidates;
    const stairCandidate =
      candidates.find((entry) => entry.strategyId === "stair-communication") ||
      candidates[0];
    const facadeDepthCandidate =
      candidates.find((entry) => entry.strategyId === "facade-depth") ||
      candidates[0];
    const stairEvidence = buildSectionEvidence(
      createGeometry(),
      stairCandidate,
    );
    const facadeEvidence = buildSectionEvidence(
      createGeometry(),
      facadeDepthCandidate,
    );

    expect(stairEvidence.summary.cutRoomCount).toBeGreaterThan(0);
    expect(stairEvidence.summary.cutStairCount).toBeGreaterThan(0);
    expect(stairEvidence.summary.directEvidenceCount).toBeGreaterThan(2);
    expect(facadeEvidence.summary.cutOpeningCount).toBeGreaterThan(0);
    expect(["pass", "warning"]).toContain(
      stairEvidence.summary.evidenceQuality,
    );
  });

  test("section evidence distinguishes direct cut openings from inferred near-cut openings", () => {
    const geometry = createGeometry();
    geometry.windows = [
      {
        id: "window-near-cut",
        wall_id: "wall-east-ground",
        level_id: "ground",
        position_m: { x: 12, y: 4.9 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ];
    geometry.doors = [];
    geometry.stairs = [];
    geometry.rooms = [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        bbox: { min_x: 0, min_y: 0, max_x: 10.4, max_y: 4.5 },
      },
    ];

    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: {
        from: { x: 9.8, y: 0 },
        to: { x: 9.8, y: 10 },
      },
      focusEntityIds: [],
    });

    expect(evidence.summary.cutOpeningCount).toBe(0);
    expect(evidence.summary.inferredOpeningCount).toBeGreaterThan(0);
    expect(evidence.intersections.inferredWindows).toHaveLength(1);
    expect(evidence.warnings.length).toBeGreaterThan(0);
  });

  test("final sheet regression stays provisional before rendered proof is available", () => {
    const geometry = createGeometry();
    const facadeGrammar = createFacadeGrammar();
    const east = renderElevationSvg(geometry, createStyleDNA(), {
      orientation: "east",
      facadeGrammar,
    });
    const west = renderElevationSvg(geometry, createStyleDNA(), {
      orientation: "west",
      facadeGrammar,
    });
    const section = buildSectionGraphic(geometry, createStyleDNA(), {
      sectionType: "longitudinal",
    });
    const coordinates = {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      elevation_west: { x: 340, y: 20, width: 300, height: 250 },
      section_longitudinal: { x: 20, y: 300, width: 620, height: 260 },
    };
    const panelLabelMap = {
      elevation_east: "EAST ELEVATION",
      elevation_west: "WEST ELEVATION",
      section_longitudinal: "LONGITUDINAL SECTION",
    };
    const sheetSvg = buildFinalSheetSvg(coordinates, panelLabelMap, true);

    const regression = runA1FinalSheetRegression({
      drawings: {
        elevation: [east, west],
        section: [section],
      },
      sheetSvg,
      fontReadiness: {
        readyForEmbedding: true,
        fullEmbeddingReady: true,
      },
      expectedLabels: Object.values(panelLabelMap),
      coordinates,
      panelLabelMap,
      width: 1000,
      height: 700,
    });

    expect(regression.finalSheetRegressionReady).toBe(false);
    expect(regression.renderedTextZoneStatus).not.toBe("block");
    expect(regression.fixtureComparison.status).toBe("block");
  });

  test("final sheet regression blocks weak title-block and header evidence", () => {
    const coordinates = {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      elevation_west: { x: 340, y: 20, width: 300, height: 250 },
    };
    const panelLabelMap = {
      elevation_east: "EAST ELEVATION",
      elevation_west: "WEST ELEVATION",
    };
    const displayedLabels = {
      elevation_east: "WRONG LABEL",
      elevation_west: "WRONG LABEL 2",
    };

    const regression = runA1FinalSheetRegression({
      drawings: { elevation: [] },
      sheetSvg: buildFinalSheetSvg(coordinates, displayedLabels, false),
      fontReadiness: {
        readyForEmbedding: true,
        fullEmbeddingReady: true,
      },
      expectedLabels: Object.values(panelLabelMap),
      coordinates,
      panelLabelMap,
      width: 1000,
      height: 700,
    });

    expect(regression.finalSheetRegressionReady).toBe(false);
    expect(regression.renderedTextZoneStatus).toBe("block");
  });

  test("post-compose verification classifies a strong board as publishable", async () => {
    const geometry = createGeometry();
    const facadeGrammar = createFacadeGrammar();
    const east = renderElevationSvg(geometry, createStyleDNA(), {
      orientation: "east",
      facadeGrammar,
    });
    const west = renderElevationSvg(geometry, createStyleDNA(), {
      orientation: "west",
      facadeGrammar,
    });
    const section = buildSectionGraphic(geometry, createStyleDNA(), {
      sectionType: "longitudinal",
    });
    const coordinates = {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      elevation_west: { x: 340, y: 20, width: 300, height: 250 },
      section_longitudinal: { x: 20, y: 300, width: 620, height: 260 },
    };
    const panelLabelMap = {
      elevation_east: "EAST ELEVATION",
      elevation_west: "WEST ELEVATION",
      section_longitudinal: "LONGITUDINAL SECTION",
    };
    const sheetSvg = buildFinalSheetSvg(coordinates, panelLabelMap, true);
    const renderedBuffer = await sharp(Buffer.from(sheetSvg)).png().toBuffer();

    const verification = await runA1PostComposeVerification({
      drawings: {
        elevation: [east, west],
        section: [section],
      },
      sheetSvg,
      renderedBuffer,
      fontReadiness: {
        readyForEmbedding: true,
        fullEmbeddingReady: true,
      },
      expectedLabels: Object.values(panelLabelMap),
      coordinates,
      panelLabelMap,
      width: 1000,
      height: 700,
    });

    expect(verification.renderedTextZone.status).toBe("pass");
    expect(verification.publishability.status).toBe("publishable");
    expect(verification.publishability.verificationPhase).toBe("post_compose");
    expect(verification.publishability.decisive).toBe(true);
    expect(verification.publishability.finalDecision).toBe("publishable");
    expect(verification.verificationState.postComposeVerified).toBe(true);
    expect(verification.verificationState.decisive).toBe(true);
    expect(verification.verificationState.overallDecision).toBe("publishable");
    expect(verification.verificationState.publishability.verified).toBe(true);
  });

  test("compose blocking consumes phase 10 publishability blockers", () => {
    setFeatureFlag("useA1PublishabilityGatePhase10", true);

    const blocking = buildA1ComposeBlockingState({
      projectGeometry: createGeometry(),
      validationReport: { status: "valid_with_warnings" },
      freshness: { missingAssets: [], stalePanels: [] },
      technicalPanelGate: { technicalReady: true, blockingReasons: [] },
      consistencyGuard: { consistencyReady: true, blockingReasons: [] },
      fontReadiness: { readyForEmbedding: true, fullEmbeddingReady: true },
      finalSheetRegression: {
        finalSheetRegressionReady: false,
        blockers: ["Rendered panel header evidence is missing."],
      },
      technicalCredibility: {
        status: "block",
        blockers: ["Section communication remains too weak."],
      },
      publishability: {
        status: "blocked",
        verificationPhase: "post_compose",
        blockers: ["Board is not publishable until rendered text zones pass."],
      },
    });

    expect(blocking.composeReady).toBe(false);
    expect(blocking.blockingReasons).toContain(
      "Board is not publishable until rendered text zones pass.",
    );
  });

  test("nonrequired title-block zones stay warning when expected labels are missing", () => {
    const renderedText = verifyRenderedTextZonesSync({
      sheetSvg: `<?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
          <rect width="1000" height="700" fill="#fff" />
          <text x="805" y="628" font-family="ArchiAISans" font-size="16">SHEET NOTES</text>
          <text x="812" y="648" font-family="ArchiAISans" font-size="14">REV A</text>
          <text x="818" y="668" font-family="ArchiAISans" font-size="14">CHECKED</text>
        </svg>`,
      width: 1000,
      height: 700,
    });

    const titleBlockZone = renderedText.zones.find(
      (zone) => zone.id === "title-block",
    );
    expect(titleBlockZone).toBeTruthy();
    expect(titleBlockZone.matchedLabels).toEqual([]);
    expect(titleBlockZone.status).toBe("warning");
  });

  test("required panel header zones do not pass from off-zone label matches alone", () => {
    const coordinates = {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
    };
    const panelLabelMap = {
      elevation_east: "EAST ELEVATION",
    };
    const sheetSvg = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
        <style>
          @font-face {
            font-family: "ArchiAISans";
            src: url("data:font/ttf;base64,AAEAAA") format("truetype");
            font-weight: 400;
          }
        </style>
        <rect width="1000" height="700" fill="#fff" />
        <text x="820" y="120" font-family="ArchiAISans" font-size="22">EAST ELEVATION</text>
        <text x="120" y="250" font-family="ArchiAISans" font-size="12">DIMENSION 01</text>
        <text x="160" y="268" font-family="ArchiAISans" font-size="12">DIMENSION 02</text>
      </svg>`;

    const regression = runA1FinalSheetRegression({
      drawings: { elevation: [] },
      sheetSvg,
      fontReadiness: {
        readyForEmbedding: true,
        fullEmbeddingReady: true,
      },
      expectedLabels: Object.values(panelLabelMap),
      coordinates,
      panelLabelMap,
      width: 1000,
      height: 700,
    });

    expect(regression.renderedTextZoneStatus).toBe("block");
    expect(
      regression.textZoneSanity.renderedTextZone.zones[1].matchedLabels,
    ).toEqual([]);
  });

  test("compose blocking treats pre-compose publishability as provisional instead of final truth", () => {
    setFeatureFlag("useA1PublishabilityGatePhase10", true);

    const blocking = buildA1ComposeBlockingState({
      projectGeometry: createGeometry(),
      validationReport: { status: "valid_with_warnings" },
      freshness: { missingAssets: [], stalePanels: [] },
      technicalPanelGate: { technicalReady: true, blockingReasons: [] },
      consistencyGuard: { consistencyReady: true, blockingReasons: [] },
      fontReadiness: { readyForEmbedding: true, fullEmbeddingReady: true },
      publishability: {
        status: "blocked",
        verificationPhase: "pre_compose",
        blockers: ["Rendered title block evidence is currently too weak."],
      },
    });

    expect(blocking.composeBlocked).toBe(false);
    expect(blocking.blockingReasons).not.toContain(
      "Rendered title block evidence is currently too weak.",
    );
    expect(blocking.recoverableIssues).toContain(
      "Phase 10 publishability is currently provisional because only pre-compose evidence is available.",
    );
  });

  test("post-compose regression fixture comparison does not trust raw svg label fallback", () => {
    const fixture = resolveA1RegressionFixture({
      drawings: {
        elevation: [{ side: "east" }, { side: "west" }],
        section: [{ sectionType: "longitudinal" }],
      },
    });
    const coordinates = {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      elevation_west: { x: 340, y: 20, width: 300, height: 250 },
      section_longitudinal: { x: 20, y: 300, width: 620, height: 260 },
    };
    const comparison = compareRenderedSheetAgainstFixture({
      fixture,
      renderedTextZone: {
        verificationPhase: "post_compose",
        textNodeCount: 12,
        zones: [
          {
            id: "panel-header:elevation_east",
            type: "panel_header",
            status: "warning",
            matchedLabels: [],
          },
          {
            id: "panel-header:elevation_west",
            type: "panel_header",
            status: "warning",
            matchedLabels: [],
          },
          {
            id: "panel-header:section_longitudinal",
            type: "panel_header",
            status: "warning",
            matchedLabels: [],
          },
        ],
      },
      technicalPanelRegression: {
        perSideElevationStatus: { east: "pass", west: "pass" },
        sectionCandidateQuality: [{ sectionType: "longitudinal" }],
        technicalFragmentScores: [],
      },
      coordinates,
      sheetSvg:
        "<svg><text>EAST ELEVATION</text><text>WEST ELEVATION</text><text>LONGITUDINAL SECTION</text></svg>",
    });

    expect(comparison.checks.labelPassCount).toBe(0);
    expect(
      comparison.warnings.some((entry) =>
        entry.includes("regression label pattern"),
      ),
    ).toBe(true);
  });
});
