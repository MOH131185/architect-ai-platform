import sharp from "sharp";

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { verifyRenderedTextZones } from "../../services/a1/a1RenderedTextVerificationService.js";
import { extractSideFacade } from "../../services/facade/sideFacadeExtractor.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";
import { classifyA1Publishability } from "../../services/a1/a1PublishabilityService.js";

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
    project_id: "phase11-evidence",
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
    roof: { type: "pitched gable" },
    levels: [
      { id: "ground", level_number: 0, name: "Ground Floor", height_m: 3.2 },
      { id: "first", level_number: 1, name: "First Floor", height_m: 3.1 },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        bbox: { min_x: 4, min_y: 0, max_x: 8.4, max_y: 5.8 },
      },
      {
        id: "gallery",
        name: "Gallery",
        level_id: "first",
        actual_area: 14,
        bbox: { min_x: 4.3, min_y: 0, max_x: 7.8, max_y: 5.4 },
      },
    ],
    walls: [
      {
        id: "wall-direct",
        exterior: false,
        level_id: "ground",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
      },
      {
        id: "wall-near",
        exterior: false,
        level_id: "ground",
        start: { x: 6.62, y: 0 },
        end: { x: 6.62, y: 10 },
      },
      {
        id: "wall-east",
        exterior: true,
        level_id: "ground",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "E", features: ["porch", "projection"] },
      },
    ],
    windows: [
      {
        id: "window-direct",
        wall_id: "wall-direct",
        level_id: "ground",
        position_m: { x: 6, y: 2.8 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-near",
        wall_id: "wall-near",
        level_id: "ground",
        position_m: { x: 6.62, y: 4.9 },
        width_m: 1.1,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-east",
        wall_id: "wall-east",
        level_id: "ground",
        position_m: { x: 12, y: 4.2 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-east",
        wall_id: "wall-east",
        level_id: "ground",
        position_m: { x: 12, y: 7.8 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        bbox: { min_x: 5.4, min_y: 1.8, max_x: 6.6, max_y: 7.4 },
      },
    ],
    entrances: [{ id: "main-entry", position_m: { x: 11.8, y: 7.8 } }],
    circulation: [
      {
        id: "main-circulation",
        polyline: [
          { x: 2, y: 7.5 },
          { x: 6, y: 7.5 },
          { x: 10, y: 7.5 },
        ],
      },
    ],
    metadata: {
      facade_features: {
        east: [{ type: "chimney" }, { type: "recess" }],
      },
    },
  };
}

function createFacadeGrammar() {
  return {
    orientations: [
      {
        orientation: "EAST_ELEVATION",
        material_zones: [
          { material: "primary facade", start_m: 0, end_m: 6 },
          { material: "timber accent", start_m: 6, end_m: 10 },
        ],
        components: {
          bays: [{ id: "bay-1" }, { id: "bay-2" }],
          balconies: [{ id: "balcony-1" }],
          dormers: [{ id: "dormer-1" }],
        },
      },
    ],
  };
}

async function buildRenderedBuffer() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
      <rect width="1000" height="700" fill="#fff" />
      <text x="170" y="230" font-family="ArchiAISans" font-size="18">EAST ELEVATION</text>
      <text x="780" y="620" font-family="ArchiAISans" font-size="18">PROJECT ARCHITECT AI</text>
      <text x="780" y="642" font-family="ArchiAISans" font-size="15">SCALE 1:100</text>
      <text x="780" y="664" font-family="ArchiAISans" font-size="15">DATE 2026-04-20</text>
    </svg>`;
  return {
    svg,
    buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
  };
}

describe("Phase 11 evidence-driven verification", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("true section evidence distinguishes direct, near-cut, and inferred evidence", () => {
    const evidence = buildSectionEvidence(createGeometry(), {
      sectionType: "longitudinal",
      cutLine: {
        from: { x: 6, y: 0 },
        to: { x: 6, y: 10 },
      },
      focusEntityIds: ["entity:stair:main-stair"],
    });

    expect(evidence.summary.cutRoomCount).toBeGreaterThan(0);
    expect(evidence.summary.cutStairCount).toBeGreaterThan(0);
    expect(evidence.summary.nearOpeningCount).toBeGreaterThan(0);
    expect(evidence.summary.directSlabCount).toBeGreaterThan(0);
    expect(evidence.intersections.nearOpenings).toHaveLength(1);
    expect(evidence.sectionIntersections.version).toBe(
      "phase12-section-geometry-intersection-v1",
    );
  });

  test("section ranking prefers stronger direct cut evidence over near-cut context", () => {
    const candidates = rankSectionCandidates(createGeometry(), [
      {
        id: "candidate-direct",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "direct-core",
        strategyName: "Direct Core Cut",
        expectedCommunicationValue: 0.82,
      },
      {
        id: "candidate-near",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6.62, y: 0 }, to: { x: 6.62, y: 10 } },
        strategyId: "near-offset",
        strategyName: "Near Offset Cut",
        expectedCommunicationValue: 0.74,
      },
    ]);

    expect(candidates[0].id).toBe("candidate-direct");
    expect(candidates[0].categoryScores.stairAlignment).toBeGreaterThan(
      candidates[1].categoryScores.stairAlignment,
    );
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
  });

  test("section ranking blocks cuts with no direct spatial evidence even when slabs are derivable", () => {
    const geometry = createGeometry();
    geometry.rooms = [
      {
        id: "isolated-room",
        name: "Isolated Room",
        level_id: "ground",
        actual_area: 18,
        bbox: { min_x: 9.2, min_y: 0, max_x: 11.5, max_y: 4.2 },
      },
    ];
    geometry.stairs = [];

    const [candidate] = rankSectionCandidates(geometry, [
      {
        id: "candidate-empty",
        sectionType: "longitudinal",
        cutLine: { from: { x: 2.1, y: 0 }, to: { x: 2.1, y: 10 } },
        strategyId: "empty-cut",
        strategyName: "Empty Cut",
        expectedCommunicationValue: 0.8,
      },
    ]);

    expect(candidate.sectionEvidence.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "does not cut a named room or stair/core element",
        ),
      ]),
    );
    expect(candidate.sectionCandidateQuality).toBe("block");
  });

  test("OCR-backed rendered text verification upgrades evidence when OCR confirms labels", async () => {
    const { svg, buffer } = await buildRenderedBuffer();

    const verification = await verifyRenderedTextZones({
      sheetSvg: svg,
      renderedBuffer: buffer,
      expectedLabels: ["EAST ELEVATION"],
      coordinates: {
        elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      },
      panelLabelMap: {
        elevation_east: "EAST ELEVATION",
      },
      width: 1000,
      height: 700,
      ocrAdapter: {
        async recognize(_zoneBuffer, { zone }) {
          return {
            text:
              zone.id === "panel-header:elevation_east"
                ? "EAST ELEVATION"
                : "PROJECT ARCHITECT AI SCALE 1:100 DATE 2026-04-20",
            confidence: 0.91,
          };
        },
      },
    });

    const panelHeader = verification.zones.find(
      (zone) => zone.id === "panel-header:elevation_east",
    );
    expect(panelHeader.ocrMatchedLabels).toContain("EAST ELEVATION");
    expect(panelHeader.evidenceState).toBe("verified");
    expect(verification.ocr.available).toBe(true);
    expect(verification.ocrEvidenceQuality).toBe("verified");
  });

  test("low-confidence OCR falls back honestly without blocking strong SVG evidence", async () => {
    const { svg, buffer } = await buildRenderedBuffer();

    const verification = await verifyRenderedTextZones({
      sheetSvg: svg,
      renderedBuffer: buffer,
      expectedLabels: ["EAST ELEVATION"],
      coordinates: {
        elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      },
      panelLabelMap: {
        elevation_east: "EAST ELEVATION",
      },
      width: 1000,
      height: 700,
      ocrAdapter: {
        async recognize() {
          return {
            text: "UNCLEAR HEADER",
            confidence: 0.22,
          };
        },
      },
    });

    expect(verification.status).not.toBe("block");
    expect(verification.ocrEvidenceQuality).toBe("weak");
  });

  test("OCR confidence values expressed as percentages are normalized honestly", async () => {
    const { svg, buffer } = await buildRenderedBuffer();

    const verification = await verifyRenderedTextZones({
      sheetSvg: svg,
      renderedBuffer: buffer,
      expectedLabels: ["EAST ELEVATION"],
      coordinates: {
        elevation_east: { x: 20, y: 20, width: 300, height: 250 },
      },
      panelLabelMap: {
        elevation_east: "EAST ELEVATION",
      },
      width: 1000,
      height: 700,
      ocrAdapter: {
        async recognize() {
          return {
            text: "EAST ELEVATION",
            confidence: 91,
          };
        },
      },
    });

    const panelHeader = verification.zones.find(
      (zone) => zone.id === "panel-header:elevation_east",
    );
    expect(panelHeader.ocrConfidence).toBe(0.91);
    expect(verification.ocrEvidenceQuality).toBe("verified");
  });

  test("side facade extraction exposes richer Phase 11 schema evidence", () => {
    const facade = extractSideFacade(
      createGeometry(),
      { roof_language: "pitched gable" },
      {
        orientation: "east",
        facadeGrammar: createFacadeGrammar(),
      },
    );

    expect(facade.sideFacadeSchema).toBeTruthy();
    expect(facade.sideFacadeSchema.featureFamilies.length).toBeGreaterThan(0);
    expect(
      facade.sideFacadeSchema.featureGroupings.projections.length,
    ).toBeGreaterThan(0);
    expect(facade.sideFacadeSchema.orientationAliases).toContain(
      "EAST_ELEVATION",
    );
    expect(
      facade.sideFacadeSchema.evidenceSummary.schemaCredibilityQuality,
    ).toMatch(/pass|warning/);
    expect(facade.version).toBe("phase12-side-facade-extractor-v1");
  });

  test("unified verification bundle preserves provisional vs verified evidence separation", () => {
    const provisionalBundle = buildA1VerificationBundle({
      renderedTextZone: {
        verificationPhase: "pre_compose",
        status: "warning",
        blockers: [],
        warnings: ["Text evidence is provisional."],
        confidence: 0.48,
      },
      publishability: {
        verificationPhase: "pre_compose",
        status: "reviewable",
        blockers: [],
        warnings: ["Provisional review state."],
      },
    });
    const verifiedBundle = buildA1VerificationBundle({
      renderedTextZone: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        confidence: 0.9,
        ocrEvidenceQuality: "verified",
      },
      finalSheetRegression: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        sectionEvidenceQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
      },
      publishability: {
        verificationPhase: "post_compose",
        status: "publishable",
        blockers: [],
        warnings: [],
        finalDecision: "publishable",
      },
    });

    expect(provisionalBundle.provisional).toBe(true);
    expect(provisionalBundle.overallDecision).toBe("provisional");
    expect(provisionalBundle.verification.version).toBe(
      "phase12-a1-verification-v1",
    );
    expect(verifiedBundle.decisive).toBe(true);
    expect(verifiedBundle.renderedTextEvidenceQuality).toBe("verified");
    expect(verifiedBundle.publishabilityDecision).toBe("publishable");
    expect(verifiedBundle.verification.publishabilityDecision).toBe(
      "publishable",
    );
  });

  test("publishability exposes reviewable_with_warnings as the decisive Phase 11 decision", () => {
    const publishability = classifyA1Publishability({
      verificationPhase: "post_compose",
      finalSheetRegression: {
        blockers: [],
        warnings: ["Rendered text evidence is only weakly verified."],
      },
      technicalCredibility: {
        blockers: [],
        warnings: [],
      },
    });

    expect(publishability.status).toBe("reviewable");
    expect(publishability.decision).toBe("reviewable_with_warnings");
    expect(publishability.finalDecision).toBe("reviewable_with_warnings");
  });
});
